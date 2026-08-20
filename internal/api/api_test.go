package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/hints"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/store"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/tutor"
)

// fakeEngine stands in for a real llama-server in tests -- these are HTTP/store
// integration tests for the plumbing around the model, not a way to test the model
// itself (that's internal/tutor's own manual, real-weights test). Deterministically
// echoes the prompt's length so a test can assert *something* changed without needing
// real inference.
type fakeEngine struct{ tier tutor.TierInfo }

func (f fakeEngine) Complete(_ context.Context, req tutor.CompletionRequest) (tutor.CompletionResult, error) {
	return tutor.CompletionResult{Text: "fake rephrased hint", LatencyMs: 1}, nil
}
func (f fakeEngine) TierInfo() tutor.TierInfo { return f.tier }
func (f fakeEngine) Close() error             { return nil }

// driftingEngine simulates the exact real-weights failure mode (internal/hints's
// HasFirstPersonAuthorDrift) so handleHint's retry-then-fallback wiring can be tested
// without spawning a real model. responses is consumed one call at a time; calling past
// the end panics (a test bug -- handleHint should never call more than twice).
type driftingEngine struct {
	tier      tutor.TierInfo
	responses []string
	calls     int
}

func (f *driftingEngine) Complete(_ context.Context, req tutor.CompletionRequest) (tutor.CompletionResult, error) {
	text := f.responses[f.calls]
	f.calls++
	return tutor.CompletionResult{Text: text, LatencyMs: 1}, nil
}
func (f *driftingEngine) TierInfo() tutor.TierInfo { return f.tier }
func (f *driftingEngine) Close() error             { return nil }

// countingEngine records how many times Complete was called, alongside every request's
// prompt -- used to prove PrewarmHints hits the model exactly once per bank entry, not
// zero (silently skipping) and not more (redundant work Pi hardware can't spare).
type countingEngine struct {
	tier  tutor.TierInfo
	calls int
}

func (c *countingEngine) Complete(_ context.Context, req tutor.CompletionRequest) (tutor.CompletionResult, error) {
	c.calls++
	return tutor.CompletionResult{Text: "a correctly rephrased hint, second person throughout", LatencyMs: 5}, nil
}
func (c *countingEngine) TierInfo() tutor.TierInfo { return c.tier }
func (c *countingEngine) Close() error             { return nil }

// content/hints/level-{1..25}.json define 122 total
// (level_id, error_signature) entries -- see content/hints/README.md's coverage table.
// This test intentionally hardcodes that count rather than computing it dynamically, so
// a bank edit that silently changes the total is caught here as a test failure, not
// missed entirely.
const totalBankHintEntries = 122

func TestPrewarmHints_PopulatesCacheExactlyOncePerBankEntry(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	defer st.Close()

	engine := &countingEngine{tier: tutor.TierInfo{Tier: "low", Model: "fake-model.gguf"}}
	srv, err := New(st, "../../content/levels", "../../content/hints", engine, 0)
	if err != nil {
		t.Fatalf("api.New: %v", err)
	}

	srv.PrewarmHints(context.Background())

	if engine.calls != totalBankHintEntries {
		t.Fatalf("engine.calls = %d, want %d (one per bank entry)", engine.calls, totalBankHintEntries)
	}
	// Spot-check a couple of entries actually landed in the cache at bucket 0, and that
	// a would-be request for one wouldn't need to touch the model at all.
	if _, ok := srv.hintCache.Get("level-8", "unbalanced_block", hints.HistoryBucket(0)); !ok {
		t.Fatal("level-8/unbalanced_block not found in cache after prewarm")
	}
	if _, ok := srv.hintCache.Get("level-14", "missing_turn", hints.HistoryBucket(0)); !ok {
		t.Fatal("level-14/missing_turn not found in cache after prewarm")
	}

	// Warming again must not regenerate anything already cached -- a restart-free
	// re-warm (or a request racing the first warm-up) should be free.
	srv.PrewarmHints(context.Background())
	if engine.calls != totalBankHintEntries {
		t.Fatalf("engine.calls after second prewarm = %d, want unchanged %d (already-cached entries must be skipped)", engine.calls, totalBankHintEntries)
	}
}

// slowEngine takes longer than a configured hintTimeout to respond, respecting ctx
// cancellation the way a real HTTP call to llama-server would -- proves handleHint's
// timeout is actually wired to a real context deadline, not just that
// hints.GenerateVerifiedHint honors one in isolation (already covered in
// internal/hints/generate_test.go).
type slowEngine struct {
	tier  tutor.TierInfo
	delay time.Duration
}

func (s slowEngine) Complete(ctx context.Context, _ tutor.CompletionRequest) (tutor.CompletionResult, error) {
	select {
	case <-time.After(s.delay):
		return tutor.CompletionResult{Text: "too slow to matter"}, nil
	case <-ctx.Done():
		return tutor.CompletionResult{}, ctx.Err()
	}
}
func (s slowEngine) TierInfo() tutor.TierInfo { return s.tier }
func (s slowEngine) Close() error             { return nil }

func TestIntegration_HintTimesOutToVerifiedText(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	defer st.Close()

	engine := slowEngine{tier: tutor.TierInfo{Tier: "low"}, delay: 2 * time.Second}
	srv, err := New(st, "../../content/levels", "../../content/hints", engine, 50*time.Millisecond)
	if err != nil {
		t.Fatalf("api.New: %v", err)
	}
	ts := httptest.NewServer(srv.Mux())
	defer ts.Close()

	start := time.Now()
	resp, err := http.Post(ts.URL+"/api/hint", "application/json", strings.NewReader(`{"level_id":"level-1","error_signature":"empty_program"}`))
	if err != nil {
		t.Fatalf("POST /api/hint: %v", err)
	}
	defer resp.Body.Close()
	elapsed := time.Since(start)

	var got struct {
		Hint string `json:"hint"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	// Read the expected text from the bank rather than duplicating the prose here:
	// the property under test is "the verified text was served verbatim", not the
	// wording, and a copy-edit to a hint should not break a timeout test.
	bank, err := hints.LoadBank("../../content/hints", "level-1")
	if err != nil {
		t.Fatalf("LoadBank: %v", err)
	}
	if want := bank.Lookup("empty_program"); got.Hint != want {
		t.Fatalf("hint = %q, want verified text verbatim after timeout (%q)", got.Hint, want)
	}
	if elapsed > time.Second {
		t.Fatalf("request took %s, want it to respect the 50ms hint timeout rather than wait out the 2s slow engine", elapsed)
	}
}

func TestPrewarmHints_NoEngineIsNoop(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	defer st.Close()

	srv, err := New(st, "../../content/levels", "../../content/hints", nil, 0)
	if err != nil {
		t.Fatalf("api.New: %v", err)
	}
	srv.PrewarmHints(context.Background()) // must not panic on a nil engine
}

// Integration test for the AST -> executor -> trace path, exercised the same way the
// frontend actually calls it: real HTTP, real level content from content/levels/, a
// real (temp-file) SQLite store. Blockly workspace -> AST compilation is covered
// separately on the TS side (web/src/blocks/compileAst.test.ts) since it needs a DOM;
// this test picks up exactly where that leaves off -- a compiled AST going in, a trace
// coming out -- which is the cross-language seam neither side's unit tests alone cover.
func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	return newTestServerWithEngine(t, fakeEngine{tier: tutor.TierInfo{Tier: "low", Model: "fake-model.gguf", AvailableMB: 4000}})
}

func newTestServerWithEngine(t *testing.T, engine tutor.Engine) *httptest.Server {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { st.Close() })

	srv, err := New(st, "../../content/levels", "../../content/hints", engine, 0)
	if err != nil {
		t.Fatalf("api.New: %v", err)
	}
	ts := httptest.NewServer(srv.Mux())
	t.Cleanup(ts.Close)
	return ts
}

func TestIntegration_SolveLevel1OverHTTP(t *testing.T) {
	ts := newTestServer(t)

	programJSON := `{"ast":{"version":1,"source":"blocks","program":[
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]},
		{"op":"move","steps":1}
	]},"client_problems":[]}`

	resp, err := http.Post(ts.URL+"/api/program?level_id=level-1", "application/json", strings.NewReader(programJSON))
	if err != nil {
		t.Fatalf("POST /api/program: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	var result struct {
		Events    []map[string]any `json:"events"`
		Outcome   string           `json:"outcome"`
		TicksUsed int              `json:"ticks_used"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decoding response: %v", err)
	}

	if result.Outcome != "solved" {
		t.Fatalf("outcome = %q, want solved", result.Outcome)
	}
	if len(result.Events) == 0 {
		t.Fatal("expected a non-empty event trace")
	}
	last := result.Events[len(result.Events)-1]
	if last["type"] != "goal" {
		t.Fatalf("last event type = %v, want goal", last["type"])
	}
}

// solved_levels (from level_progress, wired up for the dashboard's per-level "already
// beaten" check) must reflect a real solve through the real /api/program -> /api/state
// path, and must not falsely mark an untouched level as solved just because a later
// level was solved first -- the exact bug a single highest_level integer had once
// levels became reachable out of order via the dashboard.
func TestIntegration_SolvedLevelsTracksRealSolvesOutOfOrder(t *testing.T) {
	ts := newTestServer(t)

	getSolvedLevels := func() []string {
		resp, err := http.Get(ts.URL + "/api/state")
		if err != nil {
			t.Fatalf("GET /api/state: %v", err)
		}
		defer resp.Body.Close()
		var got struct {
			SolvedLevels []string `json:"solved_levels"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
			t.Fatalf("decoding response: %v", err)
		}
		return got.SolvedLevels
	}

	if got := getSolvedLevels(); len(got) != 0 {
		t.Fatalf("solved_levels before any attempt = %v, want empty", got)
	}

	// Solve level-3 (a "later" level by filename order) without ever touching level-1
	// or level-2 -- exactly what the dashboard's free section navigation allows.
	// level-3 "Zigzag" -- see internal/levels' solutions map, which is the verified
	// source of truth for what actually solves each level.
	level3Solution := `{"ast":{"version":1,"source":"blocks","program":[
		{"op":"move","steps":1},{"op":"turn","dir":"right"},
		{"op":"move","steps":1},{"op":"turn","dir":"left"},
		{"op":"move","steps":1},{"op":"turn","dir":"right"},
		{"op":"move","steps":1},{"op":"move","steps":1}
	]},"client_problems":[]}`
	resp, err := http.Post(ts.URL+"/api/program?level_id=level-3", "application/json", strings.NewReader(level3Solution))
	if err != nil {
		t.Fatalf("POST /api/program: %v", err)
	}
	resp.Body.Close()

	got := getSolvedLevels()
	if len(got) != 1 || got[0] != "level-3" {
		t.Fatalf("solved_levels after solving only level-3 = %v, want exactly [level-3] -- level-1/level-2 must not appear solved", got)
	}

	// A failed attempt on level-1 must not mark it solved either.
	resp, err = http.Post(ts.URL+"/api/program?level_id=level-1", "application/json", strings.NewReader(`{"ast":{"version":1,"source":"blocks","program":[{"op":"wait","ticks":1}]}}`))
	if err != nil {
		t.Fatalf("POST /api/program: %v", err)
	}
	resp.Body.Close()

	got = getSolvedLevels()
	if len(got) != 1 || got[0] != "level-3" {
		t.Fatalf("solved_levels after a failed level-1 attempt = %v, want still exactly [level-3]", got)
	}
}

// handoff/04-stars.md, end to end over real HTTP: level-1 is par 5 (6-cell straight
// line, move-only). A first-try, under-par solve earns 3 stars (solved + under par +
// first try); a later, worse re-solve on the same level must not erase that.
func TestIntegration_StarsEarnedAndNeverRegress(t *testing.T) {
	ts := newTestServer(t)

	getStars := func() map[string]int {
		resp, err := http.Get(ts.URL + "/api/state")
		if err != nil {
			t.Fatalf("GET /api/state: %v", err)
		}
		defer resp.Body.Close()
		var got struct {
			StarsByLevel map[string]int `json:"stars_by_level"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
			t.Fatalf("decoding response: %v", err)
		}
		return got.StarsByLevel
	}

	if got := getStars(); len(got) != 0 {
		t.Fatalf("stars before any attempt = %v, want empty", got)
	}

	// First attempt: repeat(4){move} + move = 4 cards, strictly under level-1's par of
	// 5, and it's the first attempt on this level -- solved + under par + first try = 3.
	underParFirstTry := `{"ast":{"version":1,"source":"blocks","program":[
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]},
		{"op":"move","steps":1}
	]},"client_problems":[]}`
	resp, err := http.Post(ts.URL+"/api/program?level_id=level-1", "application/json", strings.NewReader(underParFirstTry))
	if err != nil {
		t.Fatalf("POST /api/program: %v", err)
	}
	resp.Body.Close()

	stars := getStars()
	if stars["level-1"] != 3 {
		t.Fatalf("stars[level-1] after an under-par first-try solve = %d, want 3", stars["level-1"])
	}

	// Second attempt, same level: 5 plain moves -- exactly at par (not strictly under),
	// and not a first try anymore. Solved but worse: 1 star. Must not erase the 3
	// already earned (§10: progress never regresses).
	atParSecondTry := `{"ast":{"version":1,"source":"blocks","program":[
		{"op":"move","steps":1},{"op":"move","steps":1},{"op":"move","steps":1},
		{"op":"move","steps":1},{"op":"move","steps":1}
	]},"client_problems":[]}`
	resp, err = http.Post(ts.URL+"/api/program?level_id=level-1", "application/json", strings.NewReader(atParSecondTry))
	if err != nil {
		t.Fatalf("POST /api/program: %v", err)
	}
	resp.Body.Close()

	stars = getStars()
	if stars["level-1"] != 3 {
		t.Fatalf("stars[level-1] after a worse re-solve = %d, want still 3 (must never regress)", stars["level-1"])
	}

	// A failed attempt must not record any stars at all.
	failed := `{"ast":{"version":1,"source":"blocks","program":[{"op":"wait","ticks":1}]},"client_problems":[]}`
	resp, err = http.Post(ts.URL+"/api/program?level_id=level-2", "application/json", strings.NewReader(failed))
	if err != nil {
		t.Fatalf("POST /api/program: %v", err)
	}
	resp.Body.Close()

	stars = getStars()
	if _, ok := stars["level-2"]; ok {
		t.Fatalf("stars = %v, level-2 (never solved) must not appear", stars)
	}
}

func TestComputeStars(t *testing.T) {
	cases := []struct {
		name            string
		blocksUsed, par int
		firstTry        bool
		want            int
	}{
		{"solved, over par, not first try", 10, 5, false, 1},
		{"solved, exactly at par (not strictly under), not first try", 5, 5, false, 1},
		{"solved, under par, not first try", 4, 5, false, 2},
		{"solved, over par, first try", 10, 5, true, 2},
		{"solved, under par, first try", 4, 5, true, 3},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := computeStars(tc.blocksUsed, tc.par, tc.firstTry); got != tc.want {
				t.Errorf("computeStars(%d, %d, %v) = %d, want %d", tc.blocksUsed, tc.par, tc.firstTry, got, tc.want)
			}
		})
	}
}

func TestEvolutionStageFor(t *testing.T) {
	cases := []struct {
		solved int
		want   int
	}{
		{0, 0}, {4, 0}, {5, 1}, {6, 1},
		{12, 1}, {13, 2}, {14, 2},
		{21, 2}, {22, 3}, {25, 3},
	}
	for _, tc := range cases {
		if got := evolutionStageFor(tc.solved); got != tc.want {
			t.Errorf("evolutionStageFor(%d) = %d, want %d", tc.solved, got, tc.want)
		}
	}
}

// handoff/05-pet-evolution-art.md, over real HTTP: below the first threshold (5 solved),
// the pet must stay at stage 0 -- proves the wiring runs without error on the common
// case. The never-regress/threshold-crossing behavior itself is proven directly against
// evolutionStageFor above and against the store in TestAdvanceEvolutionStage_NeverRegresses
// (internal/store) -- solving five distinct real levels just to cross a threshold here
// would re-prove the same arithmetic through much more machinery for no extra confidence.
func TestIntegration_EvolutionStageStaysZeroBelowFirstThreshold(t *testing.T) {
	ts := newTestServer(t)

	programJSON := `{"ast":{"version":1,"source":"blocks","program":[
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]},
		{"op":"move","steps":1}
	]},"client_problems":[]}`
	resp, err := http.Post(ts.URL+"/api/program?level_id=level-1", "application/json", strings.NewReader(programJSON))
	if err != nil {
		t.Fatalf("POST /api/program: %v", err)
	}
	resp.Body.Close()

	resp, err = http.Get(ts.URL + "/api/state")
	if err != nil {
		t.Fatalf("GET /api/state: %v", err)
	}
	defer resp.Body.Close()
	var got struct {
		Pet struct {
			EvolutionStage int `json:"evolution_stage"`
		} `json:"pet"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if got.Pet.EvolutionStage != 0 {
		t.Fatalf("evolution_stage after solving 1 level = %d, want 0 (threshold is 5)", got.Pet.EvolutionStage)
	}
}

func TestIntegration_UnknownLevelIs404(t *testing.T) {
	ts := newTestServer(t)

	resp, err := http.Post(ts.URL+"/api/program?level_id=nope", "application/json", strings.NewReader(`{"ast":{"version":1,"source":"blocks","program":[]}}`))
	if err != nil {
		t.Fatalf("POST /api/program: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.StatusCode)
	}
}

func TestIntegration_InvalidASTIs400NotCrash(t *testing.T) {
	ts := newTestServer(t)

	resp, err := http.Post(ts.URL+"/api/program?level_id=level-1", "application/json", strings.NewReader(`{"ast":{"version":1,"source":"blocks","program":[{"op":"not_a_real_op"}]}}`))
	if err != nil {
		t.Fatalf("POST /api/program: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (unknown op must be a friendly error, never a crash)", resp.StatusCode)
	}
}

// The legacy "body is a raw AST" shape (pre-M3) is deliberately no longer accepted --
// see programRequestWrapper's comment in api.go for why this was resolved rather than
// left as permanent dual-shape support.
func TestIntegration_LegacyRawASTShapeIsRejected(t *testing.T) {
	ts := newTestServer(t)

	resp, err := http.Post(ts.URL+"/api/program?level_id=level-1", "application/json", strings.NewReader(`{"version":1,"source":"blocks","program":[]}`))
	if err != nil {
		t.Fatalf("POST /api/program: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (legacy raw-AST body shape must be rejected, not silently accepted)", resp.StatusCode)
	}
}

// Perspective-drift layer 3, end to end through the real HTTP handler (not just
// internal/hints.HasFirstPersonAuthorDrift in isolation): a rejected first completion
// must be retried once, and a second-attempt success must be what the child sees.
func TestIntegration_HintRetriesOnceAfterPerspectiveDrift(t *testing.T) {
	engine := &driftingEngine{
		tier: tutor.TierInfo{Tier: "low", Model: "fake-model.gguf"},
		responses: []string{
			"I forgot to close my repeat block with an end repeat card.",
			"You forgot to close your repeat block! Add an end repeat card.",
		},
	}
	ts := newTestServerWithEngine(t, engine)

	body := `{"level_id":"level-2","error_signature":"unbalanced_block"}`
	resp, err := http.Post(ts.URL+"/api/hint", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("POST /api/hint: %v", err)
	}
	defer resp.Body.Close()

	var got struct {
		Hint string `json:"hint"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if engine.calls != 2 {
		t.Fatalf("engine.calls = %d, want 2 (one rejected, one retry)", engine.calls)
	}
	if got.Hint != engine.responses[1] {
		t.Fatalf("hint = %q, want the accepted retry text %q", got.Hint, engine.responses[1])
	}
}

// If both attempts drift, the verified hint text must be shown verbatim -- never a
// second rejected completion, and never nothing.
func TestIntegration_HintFallsBackToVerifiedTextAfterTwoRejections(t *testing.T) {
	engine := &driftingEngine{
		tier: tutor.TierInfo{Tier: "low", Model: "fake-model.gguf"},
		responses: []string{
			"I forgot to close my repeat block with an end repeat card.",
			"I opened a repeat block but never closed it, my mistake.",
		},
	}
	ts := newTestServerWithEngine(t, engine)

	body := `{"level_id":"level-8","error_signature":"unbalanced_block"}`
	resp, err := http.Post(ts.URL+"/api/hint", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("POST /api/hint: %v", err)
	}
	defer resp.Body.Close()

	var got struct {
		Hint string `json:"hint"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if engine.calls != 2 {
		t.Fatalf("engine.calls = %d, want 2 (both rejected, no third attempt)", engine.calls)
	}
	bank, err := hints.LoadBank("../../content/hints", "level-8")
	if err != nil {
		t.Fatalf("LoadBank: %v", err)
	}
	if want := bank.Lookup("unbalanced_block"); got.Hint != want {
		t.Fatalf("hint = %q, want verified bank text verbatim %q", got.Hint, want)
	}
}

func TestIntegration_LevelsListMatchesContent(t *testing.T) {
	ts := newTestServer(t)

	resp, err := http.Get(ts.URL + "/api/levels")
	if err != nil {
		t.Fatalf("GET /api/levels: %v", err)
	}
	defer resp.Body.Close()

	var got []struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&got); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(got) != 25 {
		t.Fatalf("got %d levels, want 25", len(got))
	}
	if got[0].ID != "level-1" || got[24].ID != "level-25" {
		t.Fatalf("levels not in expected order: %+v", got)
	}
}

func TestIntegration_StateRoundTripsOverHTTP(t *testing.T) {
	ts := newTestServer(t)

	resp, err := http.Get(ts.URL + "/api/state")
	if err != nil {
		t.Fatalf("GET /api/state: %v", err)
	}
	var state map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&state); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	resp.Body.Close()

	learner := state["learner"].(map[string]any)
	learner["points"] = float64(42)
	body, _ := json.Marshal(state)

	postResp, err := http.Post(ts.URL+"/api/state", "application/json", strings.NewReader(string(body)))
	if err != nil {
		t.Fatalf("POST /api/state: %v", err)
	}
	postResp.Body.Close()

	getResp, err := http.Get(ts.URL + "/api/state")
	if err != nil {
		t.Fatalf("GET /api/state (after save): %v", err)
	}
	defer getResp.Body.Close()
	var after map[string]any
	if err := json.NewDecoder(getResp.Body).Decode(&after); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if after["learner"].(map[string]any)["points"] != float64(42) {
		t.Fatalf("points did not round-trip: got %+v", after["learner"])
	}
}

// AUDIT P0-2. cmd/server now constructs the Server with a nil engine (so a bad
// content/levels dir fails before llama-server is ever spawned) and attaches the engine
// afterwards. If SetEngine did not actually take effect, every hint would silently fall
// back to un-rephrased bank text and the tier HUD would read "Tutor offline" for the
// whole demo -- a failure that looks like "the model is broken" rather than a wiring bug.
func TestSetEngine_AttachesEngineAfterConstruction(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	defer st.Close()

	srv, err := New(st, "../../content/levels", "../../content/hints", nil, 0)
	if err != nil {
		t.Fatalf("api.New: %v", err)
	}
	ts := httptest.NewServer(srv.Mux())
	defer ts.Close()

	// Before attaching: no tier is reported.
	resp, err := http.Get(ts.URL + "/api/tier")
	if err != nil {
		t.Fatalf("GET /api/tier: %v", err)
	}
	var before struct {
		Tier string `json:"tier"`
	}
	json.NewDecoder(resp.Body).Decode(&before)
	resp.Body.Close()
	if before.Tier != "" {
		t.Fatalf("tier before SetEngine = %q, want empty", before.Tier)
	}

	srv.SetEngine(fakeEngine{tier: tutor.TierInfo{Tier: "low", Model: "fake-model.gguf", AvailableMB: 4000}})

	resp2, err := http.Get(ts.URL + "/api/tier")
	if err != nil {
		t.Fatalf("GET /api/tier: %v", err)
	}
	var after struct {
		Tier  string `json:"tier"`
		Model string `json:"model"`
	}
	json.NewDecoder(resp2.Body).Decode(&after)
	resp2.Body.Close()
	if after.Tier != "low" || after.Model != "fake-model.gguf" {
		t.Fatalf("tier after SetEngine = %+v, want low/fake-model.gguf", after)
	}

	// And the hint path must now actually use it (rephrased, not raw bank text).
	hintResp, err := http.Post(ts.URL+"/api/hint", "application/json",
		strings.NewReader(`{"level_id":"level-1","error_signature":"empty_program"}`))
	if err != nil {
		t.Fatalf("POST /api/hint: %v", err)
	}
	var got struct {
		Hint string `json:"hint"`
		Tier string `json:"tier"`
	}
	json.NewDecoder(hintResp.Body).Decode(&got)
	hintResp.Body.Close()
	if got.Tier != "low" {
		t.Fatalf("hint response tier = %q, want low (engine not reaching the hint path)", got.Tier)
	}
	if got.Hint != "fake rephrased hint" {
		t.Fatalf("hint = %q, want the engine's rephrasing", got.Hint)
	}
}

// AUDIT P1-1. -prewarm-hints defaults to true, so every (level, signature) pair is
// cached at history bucket 0 before a child touches anything -- which means a child's
// FIRST mistake always hits the cache. handleHint's cache-hit branch returned early,
// before RecordTierHint, so tier_hint_history stayed empty and ?compare=1 (the
// judge-facing "same key, better hardware" asset, brief §8) rendered "Not demoed yet"
// for both tiers for the whole demo. The cached response also omitted latency_ms, so the
// tier HUD showed no latency figure at all on the first hint.
func TestPrewarmThenFirstHint_StillPopulatesCompareAndLatency(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	defer st.Close()

	engine := &countingEngine{tier: tutor.TierInfo{Tier: "low", Model: "fake-model.gguf"}}
	srv, err := New(st, "../../content/levels", "../../content/hints", engine, 0)
	if err != nil {
		t.Fatalf("api.New: %v", err)
	}
	// Exactly what the launcher does at startup.
	srv.PrewarmHints(context.Background())

	// ?compare=1 must have something to show as soon as prewarm finishes -- those are
	// real generations with real latencies, so recording them is honest.
	recs, err := st.GetTierHints()
	if err != nil {
		t.Fatalf("GetTierHints: %v", err)
	}
	if len(recs) == 0 {
		t.Fatal("tier_hint_history empty after prewarm -- ?compare=1 would show 'Not demoed yet'")
	}
	if recs[0].Tier != "low" || recs[0].HintText == "" {
		t.Fatalf("tier hint record looks wrong: %+v", recs[0])
	}

	ts := httptest.NewServer(srv.Mux())
	defer ts.Close()

	// §13 step 4's first hint: off_by_one_repeat on level-2, served from the warm cache.
	resp, err := http.Post(ts.URL+"/api/hint", "application/json",
		strings.NewReader(`{"level_id":"level-8","error_signature":"off_by_one_repeat"}`))
	if err != nil {
		t.Fatalf("POST /api/hint: %v", err)
	}
	defer resp.Body.Close()

	var raw map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if cached, _ := raw["cached"].(bool); !cached {
		t.Fatalf("expected the first hint to be served from the prewarmed cache, got %+v", raw)
	}
	if _, present := raw["latency_ms"]; !present {
		t.Fatalf("cached hint response has no latency_ms field -- the tier HUD shows no latency: %+v", raw)
	}
}

// promptCapturingEngine records every prompt it is asked to complete, so a test can
// assert what the model was actually told -- the only way to verify brief §11's
// "acknowledge the child has made this mistake before" step end to end.
type promptCapturingEngine struct {
	tier    tutor.TierInfo
	prompts []string
}

func (p *promptCapturingEngine) Complete(_ context.Context, req tutor.CompletionRequest) (tutor.CompletionResult, error) {
	p.prompts = append(p.prompts, req.Prompt)
	return tutor.CompletionResult{Text: "You added one step too many -- try a smaller repeat!", LatencyMs: 7}, nil
}
func (p *promptCapturingEngine) TierInfo() tutor.TierInfo { return p.tier }
func (p *promptCapturingEngine) Close() error             { return nil }

// AUDIT: §13 demo-script step 4 is the single most load-bearing beat that is actually
// built ("deliberately make the classic off_by_one_repeat mistake. Pip ... gives a hint --
// pointing out this child has done it before"). Classification was covered by
// TestClassify_OffByOneRepeat, but nothing tested that a REPEATED mistake actually
// reaches the model with the history clause attached. This walks the real path the demo
// walks: two failing runs through /api/program, then /api/hint.
func TestDemoScript_RepeatedMistakeTellsTheModelAboutTheHistory(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	defer st.Close()

	engine := &promptCapturingEngine{tier: tutor.TierInfo{Tier: "low", Model: "fake-model.gguf"}}
	srv, err := New(st, "../../content/levels", "../../content/hints", engine, 0)
	if err != nil {
		t.Fatalf("api.New: %v", err)
	}
	ts := httptest.NewServer(srv.Mux())
	defer ts.Close()

	// level-8 "Twelve Steps" needs 12 moves; 11 is the classic off-by-one a child
	// actually makes (repeat 4 + repeat 4 + repeat 3).
	offByOne := `{"ast":{"version":1,"source":"blocks","program":[
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]},
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]},
		{"op":"repeat","times":3,"body":[{"op":"move","steps":1}]}
	]},"client_problems":[]}`

	runOnce := func() string {
		resp, err := http.Post(ts.URL+"/api/program?level_id=level-8", "application/json", strings.NewReader(offByOne))
		if err != nil {
			t.Fatalf("POST /api/program: %v", err)
		}
		defer resp.Body.Close()
		var out struct {
			Outcome        string `json:"outcome"`
			ErrorSignature string `json:"error_signature"`
		}
		json.NewDecoder(resp.Body).Decode(&out)
		if out.Outcome != "failed" {
			t.Fatalf("outcome = %q, want failed", out.Outcome)
		}
		return out.ErrorSignature
	}

	askForHint := func() string {
		resp, err := http.Post(ts.URL+"/api/hint", "application/json",
			strings.NewReader(`{"level_id":"level-8","error_signature":"off_by_one_repeat"}`))
		if err != nil {
			t.Fatalf("POST /api/hint: %v", err)
		}
		defer resp.Body.Close()
		var out struct {
			Hint string `json:"hint"`
		}
		json.NewDecoder(resp.Body).Decode(&out)
		return out.Hint
	}

	// First mistake: classified correctly, and the model must NOT be told about history
	// that hasn't happened yet.
	if sig := runOnce(); sig != "off_by_one_repeat" {
		t.Fatalf("first attempt error_signature = %q, want off_by_one_repeat -- the demo's whole step 4 hinges on this", sig)
	}
	if hint := askForHint(); hint == "" {
		t.Fatal("first hint was empty")
	}
	if len(engine.prompts) != 1 {
		t.Fatalf("expected 1 model call, got %d", len(engine.prompts))
	}
	if strings.Contains(engine.prompts[0], "times before") {
		t.Fatalf("first-ever mistake was described to the model as a repeat offence:\n%s", engine.prompts[0])
	}

	// Same mistake again -- this is the beat that is on camera.
	if sig := runOnce(); sig != "off_by_one_repeat" {
		t.Fatalf("second attempt error_signature = %q, want off_by_one_repeat", sig)
	}
	if hint := askForHint(); hint == "" {
		t.Fatal("second hint was empty")
	}
	if len(engine.prompts) != 2 {
		t.Fatalf("expected a fresh generation for the repeat mistake (different history bucket), got %d model calls", len(engine.prompts))
	}
	second := engine.prompts[1]
	if !strings.Contains(second, "made this mistake 1 time(s) before") {
		t.Fatalf("repeat mistake did not tell the model about the child's history:\n%s", second)
	}

	// §11's absolute rule, re-asserted on the demo path specifically: the model is handed
	// the verified hint to rephrase and is never shown the child's program.
	if !strings.Contains(second, "Hint:") {
		t.Fatalf("prompt does not carry the verified hint text to rephrase:\n%s", second)
	}
	for _, leak := range []string{`"op"`, "repeat\",\"times", "move\",\"steps", "version\":1"} {
		if strings.Contains(second, leak) {
			t.Fatalf("the child's program leaked into the model prompt (%q):\n%s", leak, second)
		}
	}
}

// AUDIT P1-5. §13 step 4's visible payoff is Pip acknowledging the child has hit this
// mistake before. Phase 3 regression against the real 0.6B model showed it never surfaces
// that from the prompt instruction alone (5/5 generations at buckets 1-4 omitted it), so
// the acknowledgement is prepended deterministically. This asserts the child-visible hint
// text, not the prompt -- what lands on camera.
func TestDemoScript_RepeatHintVisiblyAcknowledgesTheHistory(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	defer st.Close()

	srv, err := New(st, "../../content/levels", "../../content/hints",
		fakeEngine{tier: tutor.TierInfo{Tier: "low", Model: "fake-model.gguf"}}, 0)
	if err != nil {
		t.Fatalf("api.New: %v", err)
	}
	ts := httptest.NewServer(srv.Mux())
	defer ts.Close()

	offByOne := `{"ast":{"version":1,"source":"blocks","program":[
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]},
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]},
		{"op":"repeat","times":3,"body":[{"op":"move","steps":1}]}
	]},"client_problems":[]}`

	hintAfterAnotherMistake := func() string {
		resp, err := http.Post(ts.URL+"/api/program?level_id=level-8", "application/json", strings.NewReader(offByOne))
		if err != nil {
			t.Fatalf("POST /api/program: %v", err)
		}
		resp.Body.Close()
		hr, err := http.Post(ts.URL+"/api/hint", "application/json",
			strings.NewReader(`{"level_id":"level-8","error_signature":"off_by_one_repeat"}`))
		if err != nil {
			t.Fatalf("POST /api/hint: %v", err)
		}
		defer hr.Body.Close()
		var out struct {
			Hint string `json:"hint"`
		}
		json.NewDecoder(hr.Body).Decode(&out)
		return out.Hint
	}

	first := hintAfterAnotherMistake()
	if strings.Contains(first, hints.HistoryPrefix(1)) {
		t.Fatalf("a first-time mistake was announced as a repeat: %q", first)
	}
	if !strings.Contains(first, "fake rephrased hint") {
		t.Fatalf("first hint lost the rephrased body: %q", first)
	}

	second := hintAfterAnotherMistake()
	if !strings.HasPrefix(second, hints.HistoryPrefix(1)) {
		t.Fatalf("repeat mistake is not visibly acknowledged to the child.\n got: %q\nwant prefix: %q", second, hints.HistoryPrefix(1))
	}
	if !strings.Contains(second, "fake rephrased hint") {
		t.Fatalf("the acknowledgement replaced the hint instead of prefixing it: %q", second)
	}
}
