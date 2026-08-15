// Package api is the HTTP boundary. It's the one place allowed to see both an AST (from
// whichever input surface produced it) and a Grid — the executor itself never knows
// where either came from (brief §3's "AST is the only thing that crosses" rule).
package api

import (
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

type Server struct {
	store      *store.Store
	levels     map[string]levels.Level
	levelOrder []string
	hintsDir   string
	engine     tutor.Engine // nil-able: tests and any hint-free path work without one
	hintCache  *hints.Cache
	mux        *http.ServeMux
}

// New loads every level under levelsDir once at startup — content/levels/ is prep-time
// authored content, not something that changes while the server is running, so there's
// no need to re-read it per request. engine may be nil (e.g. in tests, or if the tutor
// failed to start) — hint requests still work in that case, just without LLM rephrasing
// (see handleHint).
func New(st *store.Store, levelsDir, hintsDir string, engine tutor.Engine) (*Server, error) {
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

	s := &Server{
		store: st, levels: byID, levelOrder: order,
		hintsDir: hintsDir, engine: engine, hintCache: hints.NewCache(),
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
	LatencyMs      int64  `json:"latency_ms,omitempty"`
	Cached         bool   `json:"cached"`
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

	finalText := hintText
	var latencyMs int64
	if s.engine != nil {
		prompt := hints.BuildHintPrompt(hintText, priorCount)
		// Perspective-drift layer 3 (layers 1/2 are BuildHintPrompt's instruction +
		// few-shot examples): validate the completion and retry once before falling
		// back. A drifting completion (Pip narrating the child's mistake as its own,
		// e.g. "I forgot to close my repeat block...") must never reach a child even
		// after the prompt-level fixes, since a 0.6B model can still roll one. Two
		// attempts total, then the verified hint text verbatim -- the same fallback
		// path already used for a hard engine error, per brief §11's rule that a
		// generation failure (of any kind) is never a reason to show nothing or let
		// anything free-generate.
		for attempt := 1; attempt <= 2; attempt++ {
			result, err := s.engine.Complete(r.Context(), tutor.CompletionRequest{Task: "hint", Prompt: prompt, MaxTokens: 60})
			if err != nil {
				log.Printf("api: hint completion failed (attempt %d), using verified text verbatim: %v", attempt, err)
				break
			}
			latencyMs += result.LatencyMs
			if hints.HasFirstPersonAuthorDrift(result.Text) {
				log.Printf("api: hint completion rejected for first-person perspective drift (attempt %d): %q", attempt, result.Text)
				continue
			}
			finalText = result.Text
			break
		}
	}

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

func (s *Server) handleGetState(w http.ResponseWriter, r *http.Request) {
	state, err := s.store.GetState()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, state)
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
	writeJSON(w, http.StatusOK, state)
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
