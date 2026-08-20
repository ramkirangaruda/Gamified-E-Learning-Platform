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

// content/hints/level-{1..8}.json currently define 3+6+5+3+6+5+4+4 = 36 total
// (level_id, error_signature) entries -- see content/hints/README.md's coverage table.
// This test intentionally hardcodes that count rather than computing it dynamically, so
// a bank edit that silently changes the total is caught here as a test failure, not
// missed entirely.
const totalBankHintEntries = 36

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
	if _, ok := srv.hintCache.Get("level-2", "unbalanced_block", hints.HistoryBucket(0)); !ok {
		t.Fatal("level-2/unbalanced_block not found in cache after prewarm")
	}
	if _, ok := srv.hintCache.Get("level-3", "missing_turn", hints.HistoryBucket(0)); !ok {
		t.Fatal("level-3/missing_turn not found in cache after prewarm")
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
	const verifiedText = "Your workspace is empty! Drag a 'move forward' card from the Movement toolbox onto the canvas to get started."
	if got.Hint != verifiedText {
		t.Fatalf("hint = %q, want verified text verbatim after timeout", got.Hint)
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
	level3Solution := `{"ast":{"version":1,"source":"blocks","program":[
		{"op":"move","steps":1},{"op":"move","steps":1},{"op":"move","steps":1},
		{"op":"if","cond":{"check":"wall_ahead"},"then":[{"op":"turn","dir":"right"}]},
		{"op":"move","steps":1},{"op":"move","steps":1},{"op":"move","steps":1}
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
		t.Fatalf("engine.calls = %d, want 2 (both rejected, no third attempt)", engine.calls)
	}
	const verifiedText = "It looks like you opened a repeat block but forgot the 'end repeat' card that closes it. Every repeat needs its own end repeat right after the cards you want repeated."
	if got.Hint != verifiedText {
		t.Fatalf("hint = %q, want verified bank text verbatim %q", got.Hint, verifiedText)
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
	if len(got) != 8 {
		t.Fatalf("got %d levels, want 8", len(got))
	}
	if got[0].ID != "level-1" || got[7].ID != "level-8" {
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
