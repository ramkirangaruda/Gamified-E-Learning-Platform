package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

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

// Integration test for the AST -> executor -> trace path, exercised the same way the
// frontend actually calls it: real HTTP, real level content from content/levels/, a
// real (temp-file) SQLite store. Blockly workspace -> AST compilation is covered
// separately on the TS side (web/src/blocks/compileAst.test.ts) since it needs a DOM;
// this test picks up exactly where that leaves off -- a compiled AST going in, a trace
// coming out -- which is the cross-language seam neither side's unit tests alone cover.
func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { st.Close() })

	srv, err := New(st, "../../content/levels", "../../content/hints", fakeEngine{tier: tutor.TierInfo{Tier: "low", Model: "fake-model.gguf", AvailableMB: 4000}})
	if err != nil {
		t.Fatalf("api.New: %v", err)
	}
	ts := httptest.NewServer(srv.Mux())
	t.Cleanup(ts.Close)
	return ts
}

func TestIntegration_SolveLevel1OverHTTP(t *testing.T) {
	ts := newTestServer(t)

	programJSON := `{"version":1,"source":"blocks","program":[
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]},
		{"op":"move","steps":1}
	]}`

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

func TestIntegration_UnknownLevelIs404(t *testing.T) {
	ts := newTestServer(t)

	resp, err := http.Post(ts.URL+"/api/program?level_id=nope", "application/json", strings.NewReader(`{"version":1,"source":"blocks","program":[]}`))
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

	resp, err := http.Post(ts.URL+"/api/program?level_id=level-1", "application/json", strings.NewReader(`{"version":1,"source":"blocks","program":[{"op":"not_a_real_op"}]}`))
	if err != nil {
		t.Fatalf("POST /api/program: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (unknown op must be a friendly error, never a crash)", resp.StatusCode)
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
	if len(got) != 3 {
		t.Fatalf("got %d levels, want 3", len(got))
	}
	if got[0].ID != "level-1" || got[2].ID != "level-3" {
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
