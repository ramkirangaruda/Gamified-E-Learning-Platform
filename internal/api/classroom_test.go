package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/classroom"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/store"
)

// newHubServer starts a real HTTP server acting as the classroom Hub -- the one machine
// in the room, per handoff. secret may be empty (signing off).
func newHubServer(t *testing.T, secret string) (*httptest.Server, *classroom.Store) {
	t.Helper()
	cdbPath := filepath.Join(t.TempDir(), "classroom.db")
	cstore, err := classroom.Open(cdbPath)
	if err != nil {
		t.Fatalf("classroom.Open: %v", err)
	}
	t.Cleanup(func() { cstore.Close() })

	dbPath := filepath.Join(t.TempDir(), "pet.db")
	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { st.Close() })

	srv, err := New(st, "../../content/levels", "../../content/hints", nil, 0)
	if err != nil {
		t.Fatalf("api.New: %v", err)
	}
	srv.SetClassroomHub(cstore, secret)
	ts := httptest.NewServer(srv.Mux())
	t.Cleanup(ts.Close)
	return ts, cstore
}

// newStudentServer is a real HTTP server for a single child's own drive, configured to
// sync to hubAddr -- exactly cmd/server's -classroom-addr flag.
func newStudentServer(t *testing.T, hubAddr, secret string) *httptest.Server {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { st.Close() })

	srv, err := New(st, "../../content/levels", "../../content/hints", nil, 0)
	if err != nil {
		t.Fatalf("api.New: %v", err)
	}
	srv.SetClassroomAddr(hubAddr, secret)
	ts := httptest.NewServer(srv.Mux())
	t.Cleanup(ts.Close)
	return ts
}

// The whole point, end to end: a student solves a level on their own machine, syncs to
// the Hub over what stands in for the classroom LAN, and shows up on the teacher's
// roster -- two real Go HTTP servers, real handlers, no mocking.
func TestIntegration_ClassroomSync_StudentAppearsOnHubRoster(t *testing.T) {
	hub, _ := newHubServer(t, "")
	student := newStudentServer(t, hub.URL, "")

	// Give the student a name (the only identifier this project has -- no accounts) and
	// solve a level for real, so there's something worth syncing.
	setDisplayName(t, student, "Priya")
	solveLevel1(t, student)

	resp, err := http.Post(student.URL+"/api/sync-to-classroom", "application/json", nil)
	if err != nil {
		t.Fatalf("POST /api/sync-to-classroom: %v", err)
	}
	defer resp.Body.Close()
	var result syncResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if !result.OK {
		t.Fatalf("sync failed: %+v", result)
	}

	rosterResp, err := http.Get(hub.URL + "/api/classroom/roster")
	if err != nil {
		t.Fatal(err)
	}
	defer rosterResp.Body.Close()
	var roster []classroom.Snapshot
	if err := json.NewDecoder(rosterResp.Body).Decode(&roster); err != nil {
		t.Fatal(err)
	}
	if len(roster) != 1 {
		t.Fatalf("hub roster = %v, want exactly 1 student", roster)
	}
	if roster[0].DisplayName != "Priya" || len(roster[0].SolvedLevels) != 1 {
		t.Fatalf("roster[0] = %+v, want Priya with 1 solved level", roster[0])
	}
}

// The lost-USB scenario, end to end: a student's progress is on the Hub (synced from
// their now-lost drive), and a brand-new drive recovers it by typing the same name.
func TestIntegration_ClassroomRestore_LostUSBRecovery(t *testing.T) {
	hub, _ := newHubServer(t, "")
	oldDrive := newStudentServer(t, hub.URL, "")

	setDisplayName(t, oldDrive, "Sam")
	solveLevel1(t, oldDrive)
	resp, err := http.Post(oldDrive.URL+"/api/sync-to-classroom", "application/json", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	// A brand-new drive -- a fresh store, nothing solved, no name yet -- pointed at the
	// same Hub.
	newDrive := newStudentServer(t, hub.URL, "")
	body, _ := json.Marshal(restoreRequest{DisplayName: "Sam"})
	restoreResp, err := http.Post(newDrive.URL+"/api/restore-from-classroom", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer restoreResp.Body.Close()
	var result syncResult
	if err := json.NewDecoder(restoreResp.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if !result.OK {
		t.Fatalf("restore failed: %+v", result)
	}

	stateResp, err := http.Get(newDrive.URL + "/api/state")
	if err != nil {
		t.Fatal(err)
	}
	defer stateResp.Body.Close()
	var state struct {
		Learner struct {
			DisplayName string `json:"display_name"`
		} `json:"learner"`
		SolvedLevels []string `json:"solved_levels"`
	}
	if err := json.NewDecoder(stateResp.Body).Decode(&state); err != nil {
		t.Fatal(err)
	}
	if state.Learner.DisplayName != "Sam" || len(state.SolvedLevels) != 1 {
		t.Fatalf("new drive after restore = %+v, want Sam with 1 solved level", state)
	}
}

// Restoring a name that was never synced must fail cleanly, with a message a child can
// act on -- not a crash, not a silently empty success.
func TestIntegration_ClassroomRestore_UnknownNameFailsCleanly(t *testing.T) {
	hub, _ := newHubServer(t, "")
	student := newStudentServer(t, hub.URL, "")

	body, _ := json.Marshal(restoreRequest{DisplayName: "NobodyEver"})
	resp, err := http.Post(student.URL+"/api/restore-from-classroom", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var result syncResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result.OK {
		t.Fatal("restore reported OK for a name that was never synced")
	}
	if result.Error == "" {
		t.Fatal("restore failure had no message for the child to act on")
	}
}

// Sync must never hang or 500 the caller just because the Hub is unreachable -- a
// classroom WiFi hiccup, or simply not being near the Hub, is an everyday outcome here.
func TestIntegration_ClassroomSync_UnreachableHubFailsGracefully(t *testing.T) {
	student := newStudentServer(t, "http://127.0.0.1:1", "") // a port nothing listens on
	resp, err := http.Post(student.URL+"/api/sync-to-classroom", "application/json", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200 even when the hub is unreachable", resp.StatusCode)
	}
	var result syncResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result.OK {
		t.Fatal("sync reported OK against an unreachable hub")
	}
}

// A student server with no -classroom-addr configured at all (the default -- almost
// every drive, almost all the time) must say so plainly rather than error confusingly.
func TestIntegration_ClassroomSync_NotConfiguredIsAPlainMessage(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	srv, err := New(st, "../../content/levels", "../../content/hints", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(srv.Mux())
	defer ts.Close()

	resp, err := http.Post(ts.URL+"/api/sync-to-classroom", "application/json", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var result syncResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result.OK || result.Error == "" {
		t.Fatalf("got %+v, want ok:false with a plain explanation", result)
	}
}

// handoff item: sync payload integrity. A Hub with a configured secret must reject an
// unsigned (or wrongly signed) sync -- a rogue device on the same LAN cannot post a
// forged snapshot claiming to be another student.
func TestIntegration_ClassroomSync_RejectsUnsignedWhenSecretConfigured(t *testing.T) {
	hub, _ := newHubServer(t, "shared-secret")

	body, _ := json.Marshal(classroom.Snapshot{LearnerID: "forged-id", DisplayName: "Evil"})
	resp, err := http.Post(hub.URL+"/api/classroom/sync", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 for an unsigned sync against a secured hub", resp.StatusCode)
	}
}

// The matching positive case: a student configured with the correct shared secret
// syncs successfully end to end.
func TestIntegration_ClassroomSync_SignedRequestSucceeds(t *testing.T) {
	hub, _ := newHubServer(t, "shared-secret")
	student := newStudentServer(t, hub.URL, "shared-secret")
	setDisplayName(t, student, "Signed")

	resp, err := http.Post(student.URL+"/api/sync-to-classroom", "application/json", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var result syncResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if !result.OK {
		t.Fatalf("signed sync failed: %+v", result)
	}
}

// A student with the WRONG secret must be rejected just as an unsigned one is -- the
// signature has to actually be checked, not just "present".
func TestIntegration_ClassroomSync_WrongSecretRejected(t *testing.T) {
	hub, _ := newHubServer(t, "shared-secret")
	student := newStudentServer(t, hub.URL, "wrong-secret")
	setDisplayName(t, student, "Mismatched")

	resp, err := http.Post(student.URL+"/api/sync-to-classroom", "application/json", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var result syncResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result.OK {
		t.Fatal("sync with the wrong shared secret was accepted")
	}
}

func TestIntegration_ClassroomDashboard_RendersRealRoster(t *testing.T) {
	hub, _ := newHubServer(t, "")
	student := newStudentServer(t, hub.URL, "")
	setDisplayName(t, student, "Dashboard Kid")
	resp, err := http.Post(student.URL+"/api/sync-to-classroom", "application/json", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	dashResp, err := http.Get(hub.URL + "/classroom")
	if err != nil {
		t.Fatal(err)
	}
	defer dashResp.Body.Close()
	body, err := io.ReadAll(dashResp.Body)
	if err != nil {
		t.Fatal(err)
	}
	html := string(body)
	if !strings.Contains(html, "Dashboard Kid") {
		t.Fatalf("dashboard HTML did not contain the synced student's name:\n%s", html)
	}
}

// --- test helpers ---

func setDisplayName(t *testing.T, ts *httptest.Server, name string) {
	t.Helper()
	stateResp, err := http.Get(ts.URL + "/api/state")
	if err != nil {
		t.Fatal(err)
	}
	defer stateResp.Body.Close()
	var state map[string]any
	if err := json.NewDecoder(stateResp.Body).Decode(&state); err != nil {
		t.Fatal(err)
	}
	learner := state["learner"].(map[string]any)
	learner["display_name"] = name
	body, err := json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := http.Post(ts.URL+"/api/state", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
}

func solveLevel1(t *testing.T, ts *httptest.Server) {
	t.Helper()
	programJSON := `{"ast":{"version":1,"source":"blocks","program":[
		{"op":"move","steps":1},{"op":"move","steps":1},{"op":"move","steps":1},
		{"op":"move","steps":1},{"op":"move","steps":1}
	]},"client_problems":[]}`
	resp, err := http.Post(ts.URL+"/api/program?level_id=level-1", "application/json", strings.NewReader(programJSON))
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
}
