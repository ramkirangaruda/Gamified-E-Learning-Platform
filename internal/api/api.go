// Package api is the HTTP boundary. It's the one place allowed to see both an AST (from
// whichever input surface produced it) and a Grid — the executor itself never knows
// where either came from (brief §3's "AST is the only thing that crosses" rule).
package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/executor"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/hints"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/levels"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/store"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/tutor"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/packages/ast"
)

// DefaultHintTimeout bounds how long a single /api/hint request waits on the model
// before falling back to the verified hint text verbatim (queue item 5: "a hard timeout
// on hint generation ... serve the verified hint text directly rather than leaving the
// speech bubble empty"). Chosen from real measurements, not guessed: x64 generations
// during M3 verification measured ~0.6-1.2s; the Pi 5 is CPU-only ARM with no GPU, and
// the queue's own framing ("several seconds versus the ~1.1s you measured on x64")
// expects several times slower. 8s covers a genuinely slow single generation with real
// headroom while still keeping a demo from stalling for an uncomfortably long time if
// something's gone wrong -- a bounded wait followed by the verified text is always a
// better outcome for a child mid-game than an unbounded one. Applies to the whole
// retry sequence (up to 2 attempts, see hints.GenerateVerifiedHint), not per attempt --
// a slow first attempt should eat into the retry's budget, not double the total wait.
const DefaultHintTimeout = 8 * time.Second

type Server struct {
	store       *store.Store
	levels      map[string]levels.Level
	levelOrder  []string
	hintsDir    string
	engine      tutor.Engine // nil-able: tests and any hint-free path work without one
	hintCache   *hints.Cache
	hintTimeout time.Duration
	mux         *http.ServeMux
}

// New loads every level under levelsDir once at startup — content/levels/ is prep-time
// authored content, not something that changes while the server is running, so there's
// no need to re-read it per request. engine may be nil (e.g. in tests, or if the tutor
// failed to start) — hint requests still work in that case, just without LLM rephrasing
// (see handleHint). hintTimeout of 0 uses DefaultHintTimeout.
func New(st *store.Store, levelsDir, hintsDir string, engine tutor.Engine, hintTimeout time.Duration) (*Server, error) {
	loaded, err := levels.LoadAll(levelsDir)
	if err != nil {
		return nil, fmt.Errorf("api: loading levels: %w", err)
	}

	byID := make(map[string]levels.Level, len(loaded))
	order := make([]string, 0, len(loaded))
	for _, lvl := range loaded {
		byID[lvl.ID] = lvl
		order = append(order, lvl.ID)
	}

	if hintTimeout <= 0 {
		hintTimeout = DefaultHintTimeout
	}

	s := &Server{
		store: st, levels: byID, levelOrder: order,
		hintsDir: hintsDir, engine: engine, hintCache: hints.NewCache(),
		hintTimeout: hintTimeout,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/levels", s.handleGetLevels)
	mux.HandleFunc("POST /api/program", s.handleProgram)
	mux.HandleFunc("POST /api/hint", s.handleHint)
	mux.HandleFunc("GET /api/tier", s.handleTierInfo)
	mux.HandleFunc("GET /api/compare", s.handleCompare)
	mux.HandleFunc("GET /api/state", s.handleGetState)
	mux.HandleFunc("POST /api/state", s.handlePostState)
	s.mux = mux
	return s, nil
}

func (s *Server) Mux() *http.ServeMux { return s.mux }

// SetEngine attaches the tutor engine after construction. AUDIT P0-2: cmd/server now
// loads levels (which can fail and call log.Fatalf) *before* spawning llama-server, so
// that a content failure can never exit the process with a child already running and
// unkillable. That ordering means the engine isn't available at api.New time. Called once
// during startup, before the HTTP server begins serving, so there is no concurrent
// reader to race with.
func (s *Server) SetEngine(engine tutor.Engine) { s.engine = engine }

// PrewarmHints implements queue item 5's startup pre-warm routine: generate and cache
// every (level_id, error_signature) pair in the hint bank at history bucket 0 -- the
// bucket a first-time attempt always lands in, which is also the overwhelmingly common
// case for a short demo where a child hasn't repeated the same mistake yet. Later
// buckets (1, 2, 3+) aren't pre-warmed: they only matter once a specific child has
// already made a specific mistake that many times, which can't be known ahead of time
// and isn't the case this routine is protecting against -- it exists so the *first*
// hint a child ever sees isn't the one that stalls.
//
// A no-op if there's no engine to warm (nothing to cache ahead of time -- handleHint
// already returns the verified text instantly with no engine). Safe to call from a
// goroutine: reuses the exact same hintCache and generation path a real request would
// (hints.GenerateVerifiedHint), so a request racing the warm-up just regenerates that
// one entry itself rather than seeing anything inconsistent.
func (s *Server) PrewarmHints(ctx context.Context) {
	if s.engine == nil {
		return
	}
	start := time.Now()
	warmed, skipped := 0, 0
	info := s.engine.TierInfo()
	tierName, model := info.Tier, info.Model
	for _, levelID := range s.levelOrder {
		bank, err := hints.LoadBank(s.hintsDir, levelID)
		if err != nil {
			log.Printf("api: prewarm: loading bank for %s: %v", levelID, err)
			continue
		}
		for signature := range bank {
			bucket := hints.HistoryBucket(0)
			if _, ok := s.hintCache.Get(levelID, signature, bucket); ok {
				skipped++
				continue
			}
			gen := hints.GenerateVerifiedHint(ctx, s.engine, bank.Lookup(signature), 0)
			s.hintCache.Set(levelID, signature, bucket, gen.Text)
			// AUDIT P1-1: record these too. Pre-warming means a child's first mistake
			// always hits the cache, and the cache-hit path returns before
			// RecordTierHint -- so without this, tier_hint_history stayed empty and
			// ?compare=1 (brief §8's judge-facing asset) showed "Not demoed yet" for both
			// tiers all demo. These are real generations with real latencies, so
			// recording them is honest, and it means the compare view has something to
			// show the moment startup finishes rather than only after a repeat mistake.
			if gen.FromModel {
				rec := store.TierHintRecord{
					Tier: tierName, Model: model, HintText: gen.Text,
					LevelID: levelID, ErrorSignature: signature,
					LatencyMs: gen.LatencyMs, Ts: time.Now().Unix(),
				}
				if err := s.store.RecordTierHint(rec); err != nil {
					log.Printf("api: prewarm: recording tier hint history: %v", err)
				}
			}
			warmed++
		}
	}
	log.Printf("api: prewarm: cached %d hints (%d already warm) in %s", warmed, skipped, time.Since(start))
}

// fallbackGrid is used only when a request doesn't name a level_id (quick manual
// testing, e.g. curl without query params) — spacious and wall-free so any valid AST
// fixture runs without incident. Real gameplay always passes level_id.
func fallbackGrid() executor.Grid {
	w, h := 8, 8
	walls := make([][]bool, h)
	for y := range walls {
		walls[y] = make([]bool, w)
	}
	return executor.Grid{Width: w, Height: h, Walls: walls, Goal: executor.Pos{X: w - 1, Y: h - 1}}
}

type programResponse struct {
	Events         []executor.Event `json:"events"`
	Outcome        string           `json:"outcome"`
	TicksUsed      int              `json:"ticks_used"`
	ErrorSignature string           `json:"error_signature,omitempty"`
}

func (s *Server) handleGetLevels(w http.ResponseWriter, r *http.Request) {
	ordered := make([]levels.Level, 0, len(s.levelOrder))
	for _, id := range s.levelOrder {
		ordered = append(ordered, s.levels[id])
	}
	writeJSON(w, http.StatusOK, ordered)
}

// programRequestWrapper is POST /api/program's request shape: {"ast": <AST envelope>,
// "client_problems": [...]}. This changed from M1/M2's "body is a raw AST JSON" verbatim
// to this wrapper when M3 needed a place to carry client_problems -- a change to the
// *HTTP envelope*, not to the AST contract itself (packages/ast's node shapes are
// untouched). The legacy raw-AST shape (accepted for backward compatibility through the
// end of M3) has been dropped: web/src/api.ts is and always has been the only real
// caller, it has sent this wrapper since the day it was introduced, and no other
// consumer of this endpoint exists yet (the camera/Hub Mode pipeline isn't wired to call
// this endpoint at all so far). Keeping dual-shape detection alive to protect a caller
// that doesn't exist was limbo, not compatibility -- see DECISIONS.md.
type programRequestWrapper struct {
	AST            json.RawMessage `json:"ast"`
	ClientProblems []string        `json:"client_problems"`
}

func (s *Server) handleProgram(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "reading request body: "+err.Error())
		return
	}

	var wrapper programRequestWrapper
	if err := json.Unmarshal(body, &wrapper); err != nil || len(wrapper.AST) == 0 {
		writeError(w, http.StatusBadRequest, `expected body shape {"ast": <AST envelope>, "client_problems": [...]}`)
		return
	}
	astBytes := wrapper.AST
	clientProblems := wrapper.ClientProblems

	program, err := ast.Validate(astBytes)
	if err != nil {
		// Validation failure is a 400 with a friendly message, never a 500 — brief §5:
		// "Unknown op → validation error, never a crash."
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	grid := fallbackGrid()
	startPos := executor.Pos{X: 0, Y: 0}
	startDir := executor.DirRight
	levelID := r.URL.Query().Get("level_id")
	var lvl levels.Level
	var haveLevel bool

	if levelID != "" {
		l, ok := s.levels[levelID]
		if !ok {
			writeError(w, http.StatusNotFound, fmt.Sprintf("unknown level_id %q", levelID))
			return
		}
		dir, err := l.StartExecDir()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		grid, startPos, startDir, lvl, haveLevel = l.Grid, l.StartExecPos(), dir, l, true
	}

	result := executor.Run(grid, startPos, startDir, program.Program)

	signature := ""
	if haveLevel {
		signature = hints.Classify(hints.ClassifyInput{
			Level:          hints.LevelFor(lvl),
			Program:        program.Program,
			Result:         result,
			ClientProblems: clientProblems,
		})
		attempt := store.Attempt{
			LevelID: levelID, ASTJSON: string(astBytes), Outcome: result.Outcome,
			ErrorSignature: signature, TicksUsed: result.TicksUsed, Ts: time.Now().Unix(),
		}
		if err := s.store.RecordAttempt(attempt); err != nil {
			// Best-effort: a failed attempt-log write shouldn't stop the child from
			// seeing their result, but it's worth knowing about.
			log.Printf("api: recording attempt: %v", err)
		}
		if err := s.store.RecordLevelAttempt(levelID, result.Outcome == "solved", time.Now().Unix()); err != nil {
			log.Printf("api: recording level progress: %v", err)
		}
	}

	writeJSON(w, http.StatusOK, programResponse{
		Events:         result.Events,
		Outcome:        result.Outcome,
		TicksUsed:      result.TicksUsed,
		ErrorSignature: signature,
	})
}

type hintRequest struct {
	LevelID        string `json:"level_id"`
	ErrorSignature string `json:"error_signature"`
}

type hintResponse struct {
	Hint           string `json:"hint"`
	ErrorSignature string `json:"error_signature,omitempty"`
	Tier           string `json:"tier,omitempty"`
	Model          string `json:"model,omitempty"`
	// AUDIT P1-1: deliberately NOT omitempty. A cache hit has a genuine latency of ~0,
	// and omitempty made the field vanish entirely, so the frontend's `latency_ms ?? null`
	// blanked the tier HUD's latency readout on every pre-warmed (i.e. every first) hint.
	// Sending an explicit 0 lets the HUD say "instant" rather than say nothing.
	LatencyMs int64 `json:"latency_ms"`
	Cached    bool  `json:"cached"`
}

// handleHint implements brief §11's pipeline: look up the verified hint for the
// signature POST /api/program already computed and recorded, count this child's history
// with it, rephrase via the model in Pip's voice, cache by (level, signature, history
// bucket). It does NOT re-run the executor or re-classify — /api/program already did
// both and is the one place attempts get recorded, so this only reads what's already
// there.
func (s *Server) handleHint(w http.ResponseWriter, r *http.Request) {
	var req hintRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "decoding request body: "+err.Error())
		return
	}
	if _, ok := s.levels[req.LevelID]; !ok {
		writeError(w, http.StatusNotFound, fmt.Sprintf("unknown level_id %q", req.LevelID))
		return
	}

	hintText := hints.GenericFallback
	if bank, err := hints.LoadBank(s.hintsDir, req.LevelID); err == nil {
		hintText = bank.Lookup(req.ErrorSignature)
	}
	// A missing/unloadable bank falls back to the generic line too (hints.Bank.Lookup's
	// nil-map behavior handles the "err != nil" case identically) — brief §11's absolute
	// rule applies to a bank failure exactly the same as an unrecognized signature.

	priorCount := 0
	if req.ErrorSignature != "" {
		if n, err := s.store.CountAttemptsWithSignature(req.LevelID, req.ErrorSignature); err == nil && n > 0 {
			priorCount = n - 1 // exclude the attempt that triggered this request; /api/program already recorded it
		}
	}
	bucket := hints.HistoryBucket(priorCount)

	tierName, model := "", ""
	if s.engine != nil {
		info := s.engine.TierInfo()
		tierName, model = info.Tier, info.Model
	}

	if cached, ok := s.hintCache.Get(req.LevelID, req.ErrorSignature, bucket); ok {
		writeJSON(w, http.StatusOK, hintResponse{Hint: cached, ErrorSignature: req.ErrorSignature, Tier: tierName, Model: model, Cached: true})
		return
	}

	hintCtx, cancel := context.WithTimeout(r.Context(), s.hintTimeout)
	defer cancel()
	gen := hints.GenerateVerifiedHint(hintCtx, s.engine, hintText, priorCount)
	// AUDIT P1-5: prepend the repeat acknowledgement deterministically rather than hoping
	// the model does it. Verified against the real 0.6B during Phase 3 regression: the
	// prompt does carry "this child has made this mistake N times before", but 5/5
	// generations dropped it, and that acknowledgement is §13 step 4's visible payoff.
	// Human-written fixed text, so this stays inside §11's rule -- the model is still
	// never the source of truth about the child's code.
	finalText, latencyMs := hints.HistoryPrefix(priorCount)+gen.Text, gen.LatencyMs

	s.hintCache.Set(req.LevelID, req.ErrorSignature, bucket, finalText)

	if s.engine != nil {
		rec := store.TierHintRecord{
			Tier: tierName, Model: model, HintText: finalText,
			LevelID: req.LevelID, ErrorSignature: req.ErrorSignature,
			LatencyMs: latencyMs, Ts: time.Now().Unix(),
		}
		if err := s.store.RecordTierHint(rec); err != nil {
			log.Printf("api: recording tier hint history: %v", err)
		}
	}

	writeJSON(w, http.StatusOK, hintResponse{
		Hint: finalText, ErrorSignature: req.ErrorSignature, Tier: tierName, Model: model, LatencyMs: latencyMs,
	})
}

// handleTierInfo backs the HUD (queue item 5): selected tier, model, RAM, last latency.
func (s *Server) handleTierInfo(w http.ResponseWriter, r *http.Request) {
	if s.engine == nil {
		writeJSON(w, http.StatusOK, tutor.TierInfo{})
		return
	}
	writeJSON(w, http.StatusOK, s.engine.TierInfo())
}

// handleCompare backs the ?compare=1 debug/demo view (queue item 6): the last hint
// generated at each tier, wherever and whenever it was generated — see
// tier_hint_history's comment for why this is read from the drive, not from this
// process's live state.
func (s *Server) handleCompare(w http.ResponseWriter, r *http.Request) {
	records, err := s.store.GetTierHints()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, records)
}

// stateResponse adds solved_levels (from level_progress -- see
// store.RecordLevelAttempt) on top of store.State's own persisted fields. Computed
// fresh on every response rather than stored on State itself: it's derived,
// order-independent truth about which levels have ever been solved, not something a
// caller should be trusted to round-trip back unmodified the way learner/pet fields are.
type stateResponse struct {
	store.State
	SolvedLevels []string `json:"solved_levels"`
}

func (s *Server) withSolvedLevels(w http.ResponseWriter, state *store.State) {
	solved, err := s.store.GetSolvedLevelIDs()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, stateResponse{State: *state, SolvedLevels: solved})
}

func (s *Server) handleGetState(w http.ResponseWriter, r *http.Request) {
	state, err := s.store.GetState()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.withSolvedLevels(w, state)
}

func (s *Server) handlePostState(w http.ResponseWriter, r *http.Request) {
	var state store.State
	if err := json.NewDecoder(r.Body).Decode(&state); err != nil {
		writeError(w, http.StatusBadRequest, "decoding request body: "+err.Error())
		return
	}
	if err := s.store.SaveState(&state); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.withSolvedLevels(w, &state)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

type errorResponse struct {
	Error string `json:"error"`
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, errorResponse{Error: msg})
}
