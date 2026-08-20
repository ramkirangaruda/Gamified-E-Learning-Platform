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
	"path/filepath"
	"time"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/chemistry"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/classroom"
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
	chemistry   map[string]chemistry.Sample
	chemOrder   []string
	hintsDir    string
	engine      tutor.Engine // nil-able: tests and any hint-free path work without one
	hintCache   *hints.Cache
	hintTimeout time.Duration
	lite        bool
	mux         *http.ServeMux

	// Classroom Hub (handoff item): both nil/empty unless explicitly configured via
	// SetClassroomHub/SetClassroomAddr, matching the engine's own nil-by-default pattern
	// -- ordinary single-drive play must work identically whether or not either is set.
	classroomStore  *classroom.Store // non-nil only on the one machine acting as the Hub
	classroomAddr   string           // non-empty only on a machine that syncs TO a Hub
	classroomSecret string           // shared HMAC secret; empty means signing is off
	classroomHTTP   *http.Client
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

	// content/chemistry sits alongside content/levels -- derived from levelsDir rather
	// than taking a third directory argument, so this stays a drop-in addition and every
	// existing api.New call site (cmd/server, a dozen-plus tests) needs no change.
	chemDir := filepath.Join(filepath.Dir(levelsDir), "chemistry")
	loadedChem, err := chemistry.LoadAll(chemDir)
	if err != nil {
		return nil, fmt.Errorf("api: loading chemistry samples: %w", err)
	}
	chemByID := make(map[string]chemistry.Sample, len(loadedChem))
	chemOrder := make([]string, 0, len(loadedChem))
	for _, sample := range loadedChem {
		chemByID[sample.ID] = sample
		chemOrder = append(chemOrder, sample.ID)
	}

	if hintTimeout <= 0 {
		hintTimeout = DefaultHintTimeout
	}

	s := &Server{
		store: st, levels: byID, levelOrder: order,
		chemistry: chemByID, chemOrder: chemOrder,
		hintsDir: hintsDir, engine: engine, hintCache: hints.NewCache(),
		hintTimeout: hintTimeout,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/levels", s.handleGetLevels)
	mux.HandleFunc("GET /api/suggestion", s.handleSuggestion)
	mux.HandleFunc("POST /api/program", s.handleProgram)
	mux.HandleFunc("POST /api/sandbox", s.handleSandbox)
	mux.HandleFunc("POST /api/hint", s.handleHint)
	mux.HandleFunc("GET /api/tier", s.handleTierInfo)
	mux.HandleFunc("GET /api/compare", s.handleCompare)
	mux.HandleFunc("GET /api/state", s.handleGetState)
	mux.HandleFunc("POST /api/state", s.handlePostState)
	mux.HandleFunc("GET /api/chemistry/samples", s.handleChemistrySamples)
	mux.HandleFunc("POST /api/chemistry/guess", s.handleChemistryGuess)

	// Classroom Hub routes. Registered unconditionally (like every other route above),
	// gated inside each handler by whether SetClassroomHub/SetClassroomAddr was ever
	// called -- same reasoning as handleHint tolerating a nil engine: the mux shape
	// doesn't change based on configuration, only the behavior does.
	mux.HandleFunc("POST /api/classroom/sync", s.handleClassroomSync)
	mux.HandleFunc("GET /api/classroom/roster", s.handleClassroomRoster)
	mux.HandleFunc("GET /api/classroom/restore", s.handleClassroomRestore)
	mux.HandleFunc("GET /classroom", s.handleClassroomDashboard)
	mux.HandleFunc("POST /api/sync-to-classroom", s.handleSyncToClassroom)
	mux.HandleFunc("POST /api/restore-from-classroom", s.handleRestoreFromClassroom)

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

// SetLiteMode records whether decorative animation should be off. Set once during
// startup (before serving), read by the frontend via GET /api/tier so the Pi comes up in
// lite mode without the child or the operator having to toggle anything.
func (s *Server) SetLiteMode(v bool) { s.lite = v }

// SetClassroomHub turns this server into the classroom's aggregator (cmd/server's
// -classroom-hub flag) -- the one machine in the room, not every student's own laptop.
// secret may be empty (signing off, accept any sync); see classroom.go's
// verifyClassroomSignature for why that's an acceptable default rather than a hole.
func (s *Server) SetClassroomHub(store *classroom.Store, secret string) {
	s.classroomStore = store
	s.classroomSecret = secret
}

// SetClassroomAddr points this (student's own) server at a Hub to sync to (cmd/server's
// -classroom-addr flag) -- e.g. "http://192.168.1.50:8080". Empty (the default) means
// classroom sync is simply not offered; nothing about ordinary offline play changes.
func (s *Server) SetClassroomAddr(addr, secret string) {
	s.classroomAddr = addr
	s.classroomSecret = secret
}

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

// computeStars mirrors web/src/trail/concepts.ts's starsFor: 1 point for solving
// (implied here -- only ever called when the outcome is "solved"), +1 for landing
// strictly under par, +1 for a first try.
//
// handoff/04-stars.md flagged a real inconsistency to resolve, not silently pick a side
// of: concepts.ts's starsFor used `blocksUsed <= parBlocks` for its bonus star, while
// web/src/pet/reward.ts's already-shipped, already-tested points bonus used the stricter
// `blocksUsed < parBlocks`. Landing exactly at par is common (par is often the intended
// solution's exact card count), so the two would disagree on the single most frequent
// case. Standardized on `<`, matching reward.ts, since that's the rule already live and
// tested in the points economy -- concepts.ts's starsFor is updated to match rather than
// left to quietly disagree with the server's own calculation (see DECISIONS.md).
func computeStars(blocksUsed, parBlocks int, firstTry bool) int {
	stars := 1
	if blocksUsed < parBlocks {
		stars++
	}
	if firstTry {
		stars++
	}
	return stars
}

// evolutionThresholds mirrors web/src/trail/concepts.ts's EVOLUTION_MARKERS -- three
// fixed solved-count thresholds, kept in sync by hand across the Go/TS boundary rather
// than through shared config, the same way the 14 physical cards are a fixed, final,
// hand-verified set independently defined on both sides. handoff/05-pet-evolution-art.md
// flagged this as the call to make and log rather than build cross-language config
// sharing for three integers four days out.
var evolutionThresholds = []int{5, 13, 22}

// evolutionStageFor derives the pet's evolution stage fresh from a solved-level count,
// rather than incrementing by 1 per solve -- so re-solving an already-solved level, or
// solving levels out of order (the dashboard allows both), always lands on the correct
// stage instead of drifting from double-counting or under-counting.
func evolutionStageFor(solvedCount int) int {
	stage := 0
	for _, threshold := range evolutionThresholds {
		if solvedCount >= threshold {
			stage++
		}
	}
	return stage
}

func (s *Server) handleGetLevels(w http.ResponseWriter, r *http.Request) {
	ordered := make([]levels.Level, 0, len(s.levelOrder))
	for _, id := range s.levelOrder {
		ordered = append(ordered, s.levels[id])
	}
	writeJSON(w, http.StatusOK, ordered)
}

// chemistrySampleResponse is the client-facing shape of a chemistry.Sample -- everything
// except AnswerID. The correct choice is never sent to the browser; handleChemistryGuess
// is the only thing that ever learns it, the same "server is authoritative" rule
// /api/program already applies to whether a coding level is solved.
type chemistrySampleResponse struct {
	ID          string             `json:"id"`
	Name        string             `json:"name"`
	Formula     string             `json:"formula"`
	Description string             `json:"description"`
	Tags        []string           `json:"tags"`
	Clues       []chemistry.Clue   `json:"clues"`
	Choices     []chemistry.Choice `json:"choices"`
}

func (s *Server) handleChemistrySamples(w http.ResponseWriter, r *http.Request) {
	ordered := make([]chemistrySampleResponse, 0, len(s.chemOrder))
	for _, id := range s.chemOrder {
		sample := s.chemistry[id]
		ordered = append(ordered, chemistrySampleResponse{
			ID: sample.ID, Name: sample.Name, Formula: sample.Formula,
			Description: sample.Description, Tags: sample.Tags,
			Clues: sample.Clues, Choices: sample.Choices,
		})
	}
	writeJSON(w, http.StatusOK, ordered)
}

type chemistryGuessRequest struct {
	SampleID string `json:"sample_id"`
	ChoiceID string `json:"choice_id"`
}

type chemistryGuessResponse struct {
	Correct bool             `json:"correct"`
	Answer  chemistry.Choice `json:"answer"`
}

func (s *Server) handleChemistryGuess(w http.ResponseWriter, r *http.Request) {
	var req chemistryGuessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "decoding request body: "+err.Error())
		return
	}
	sample, ok := s.chemistry[req.SampleID]
	if !ok {
		writeError(w, http.StatusNotFound, "unknown sample_id: "+req.SampleID)
		return
	}
	correct, answer := sample.CheckGuess(req.ChoiceID)
	writeJSON(w, http.StatusOK, chemistryGuessResponse{Correct: correct, Answer: answer})
}

type suggestionResponse struct {
	LevelID  string `json:"level_id"`
	Category string `json:"category"`
	Message  string `json:"message"`
}

// handleSuggestion is "Pip suggests" (dynamic level suggestion, handoff item):
// RecommendNextLevel over data the store already has, phrased with the same fixed,
// human-written Pip-voice text the hint bank uses -- see suggestion.go for why this is
// deliberately not model-generated.
func (s *Server) handleSuggestion(w http.ResponseWriter, r *http.Request) {
	ordered := make([]levels.Level, 0, len(s.levelOrder))
	for _, id := range s.levelOrder {
		ordered = append(ordered, s.levels[id])
	}
	progress, err := s.store.GetAllLevelProgress()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	levelID, category := RecommendNextLevel(ordered, progress)
	writeJSON(w, http.StatusOK, suggestionResponse{LevelID: levelID, Category: category, Message: suggestionText[category]})
}

// sandboxGrid is a fixed, open, wall-free grid for the "just fiddle around" surface --
// large enough that a child dragging cards has real room to move without hitting the
// edge on every second card. There is no real goal here (the sandbox never reports
// solved/failed to the child, see handleSandbox), so Goal is placed in the far corner
// purely because Grid requires a value, not because it means anything.
var sandboxGrid = executor.Grid{
	Width: 10, Height: 10,
	Walls: make([][]bool, 10),
	Goal:  executor.Pos{X: 9, Y: 9},
}

func init() {
	for y := range sandboxGrid.Walls {
		sandboxGrid.Walls[y] = make([]bool, sandboxGrid.Width)
	}
}

type sandboxRequest struct {
	AST json.RawMessage `json:"ast"`
}

type sandboxResponse struct {
	Events    []executor.Event `json:"events"`
	Outcome   string           `json:"outcome"`
	TicksUsed int              `json:"ticks_used"`
	Grid      executor.Grid    `json:"grid"`
	StartPos  executor.Pos     `json:"start_pos"`
	StartDir  string           `json:"start_dir"`
}

// handleSandbox is the free-play surface: validate and run whatever's on the workspace
// against sandboxGrid, and return the trace for GridRenderer to animate. Deliberately
// has NONE of handleProgram's side effects -- no RecordAttempt, no level_progress, no
// stars, no evolution stage, no hint classification. This is "what does this code do",
// not an attempt at a level, and treating it as one would let a child inflate their
// economy for free by running the same trivial program in the sandbox on a loop.
func (s *Server) handleSandbox(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "reading request body: "+err.Error())
		return
	}
	var req sandboxRequest
	if err := json.Unmarshal(body, &req); err != nil || len(req.AST) == 0 {
		writeError(w, http.StatusBadRequest, `expected body shape {"ast": <AST envelope>}`)
		return
	}

	program, err := ast.Validate(req.AST)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	result := executor.Run(sandboxGrid, executor.Pos{X: 0, Y: 0}, executor.DirRight, program.Program)
	writeJSON(w, http.StatusOK, sandboxResponse{
		Events: result.Events, Outcome: result.Outcome, TicksUsed: result.TicksUsed,
		Grid: sandboxGrid, StartPos: executor.Pos{X: 0, Y: 0}, StartDir: "right",
	})
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
		// handoff/04-stars.md: read the attempts-so-far count BEFORE RecordLevelAttempt's
		// upsert increments it, so "was this a first try" is answered from real,
		// cross-session persisted history rather than PlayPage's client-side counter
		// (which resets on every page reload -- a known, separately-logged gap).
		priorAttempts, err := s.store.GetLevelAttemptsCount(levelID)
		if err != nil {
			log.Printf("api: reading attempts count: %v", err)
		}
		firstTry := priorAttempts == 0

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
		if result.Outcome == "solved" {
			stars := computeStars(ast.CountCards(program.Program), lvl.ParBlocks, firstTry)
			if err := s.store.RecordStars(levelID, stars); err != nil {
				log.Printf("api: recording stars: %v", err)
			}

			// handoff/05-pet-evolution-art.md: evolution_stage was fully plumbed
			// end to end but nothing ever advanced it. Re-derived from the
			// authoritative solved-level count on every solve (not incremented by
			// 1, so re-solving an already-solved level or solving levels out of
			// order both land on the correct stage) and persisted with the same
			// never-regress upsert stars uses.
			if solvedIDs, err := s.store.GetSolvedLevelIDs(); err != nil {
				log.Printf("api: reading solved levels for evolution stage: %v", err)
			} else if err := s.store.AdvanceEvolutionStage(evolutionStageFor(len(solvedIDs))); err != nil {
				log.Printf("api: advancing evolution stage: %v", err)
			}
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

// tierResponse is TierInfo plus the lite-mode decision, which the frontend needs at the
// same moment and from the same place -- both answer "what kind of machine is this".
type tierResponse struct {
	tutor.TierInfo
	Lite bool `json:"lite"`
}

// handleTierInfo backs the HUD: selected tier, model, RAM, last latency, and whether
// decorative animation should be suppressed.
func (s *Server) handleTierInfo(w http.ResponseWriter, r *http.Request) {
	info := tutor.TierInfo{}
	if s.engine != nil {
		info = s.engine.TierInfo()
	}
	writeJSON(w, http.StatusOK, tierResponse{TierInfo: info, Lite: s.lite})
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
// store.RecordLevelAttempt) and stars_by_level (handoff/04-stars.md) on top of
// store.State's own persisted fields. Both computed fresh on every response rather than
// stored on State itself: derived, order-independent truth about progress, not something
// a caller should be trusted to round-trip back unmodified the way learner/pet fields are.
type stateResponse struct {
	store.State
	SolvedLevels []string       `json:"solved_levels"`
	StarsByLevel map[string]int `json:"stars_by_level"`
}

func (s *Server) withSolvedLevels(w http.ResponseWriter, state *store.State) {
	solved, err := s.store.GetSolvedLevelIDs()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	stars, err := s.store.GetStarsByLevel()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, stateResponse{State: *state, SolvedLevels: solved, StarsByLevel: stars})
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
	// Echo what was STORED, not what was sent. This used to hand the caller its own
	// payload straight back, which was harmless while every field was written verbatim.
	// It stopped being harmless when inventory arrived: saveInventory merges rather than
	// overwrites (qty is a lifetime count that may only rise, see its comment), so the
	// stored row and the posted row can legitimately disagree. Echoing the request would
	// have told a browser its collection was smaller than it really is, and the browser
	// would have gone on computing its next purchase from that lower number.
	saved, err := s.store.GetState()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.withSolvedLevels(w, saved)
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
