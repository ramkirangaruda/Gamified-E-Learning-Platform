package api

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
	"net"
	"net/http"
	"sort"
	"time"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/classroom"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/store"
)

// classroomSyncTimeout bounds a single outbound call to the Hub (sync or restore). The
// whole point of this feature is that it must never block ordinary play: a classroom
// WiFi hiccup, or simply not being in the room the Hub is in, has to fail fast and
// silently rather than hang a button click.
const classroomSyncTimeout = 5 * time.Second

// --- Hub side: only active when SetClassroomHub was called (cmd/server's -classroom-hub
// flag). classroomStore is nil otherwise, and every handler below checks that first. ---

func (s *Server) handleClassroomSync(w http.ResponseWriter, r *http.Request) {
	if s.classroomStore == nil {
		writeError(w, http.StatusNotFound, "this server is not running as a classroom hub")
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "reading request body: "+err.Error())
		return
	}
	if !s.verifyClassroomSignature(r, body) {
		writeError(w, http.StatusUnauthorized, "missing or invalid signature")
		return
	}
	var snap classroom.Snapshot
	if err := json.Unmarshal(body, &snap); err != nil {
		writeError(w, http.StatusBadRequest, "decoding snapshot: "+err.Error())
		return
	}
	if snap.LearnerID == "" {
		writeError(w, http.StatusBadRequest, "snapshot has no learner_id")
		return
	}
	// The Hub's own clock, not whatever the syncing laptop claims -- a wrong local clock
	// on a student machine must not corrupt "most recently synced" ordering for
	// FindByDisplayName's collision handling.
	snap.LastSyncedAt = time.Now().Unix()
	if err := s.classroomStore.UpsertSnapshot(snap); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// isLoopback reports whether a request arrived from this same machine.
//
// This is the access control on every TEACHER-facing endpoint, and it is deliberately not
// a password. The Hub has to listen on the classroom LAN -- that is the entire point, it
// is where student drives sync to -- so "who may read the roster" cannot be answered by
// the listen address alone. Splitting by handler instead: students reach sync/restore over
// the network, while the roster and the dashboard are readable only from the Pi itself.
//
// A teacher who wants the dashboard on their own laptop should SSH-tunnel to the Pi
// (`ssh -L 8080:localhost:8080 pi@<ip>`) rather than this growing a credential: a shared
// classroom password on plain HTTP is a worse answer than no remote access at all, and
// every child's first name and progress is on the other side of it.
//
// RemoteAddr is the kernel's view of the peer, not a header, so unlike X-Forwarded-For it
// cannot be spoofed by the client. There is no reverse proxy anywhere in this project's
// deployment story; if one is ever added, this check has to be revisited.
func isLoopback(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (s *Server) handleClassroomRoster(w http.ResponseWriter, r *http.Request) {
	if s.classroomStore == nil {
		writeError(w, http.StatusNotFound, "this server is not running as a classroom hub")
		return
	}
	if !isLoopback(r) {
		writeError(w, http.StatusForbidden, "the roster is readable only from the hub machine itself")
		return
	}
	roster, err := s.classroomStore.Roster()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, roster)
}

// handleClassroomRestore is the lost-USB recovery lookup: a fresh drive asks "does the
// Hub know a student by this name", by name because that's the only identifier a child
// can be expected to type themselves -- there are no accounts, no logins, anywhere in
// this project, and this doesn't add one.
func (s *Server) handleClassroomRestore(w http.ResponseWriter, r *http.Request) {
	if s.classroomStore == nil {
		writeError(w, http.StatusNotFound, "this server is not running as a classroom hub")
		return
	}
	name := r.URL.Query().Get("name")
	if name == "" {
		writeError(w, http.StatusBadRequest, "missing ?name=")
		return
	}
	// Signed over the NAME being asked for, not an empty body. This endpoint hands out a
	// child's whole snapshot to anyone who can name them, so it has to be authenticated
	// exactly like sync is -- it was not, until this check was added, despite
	// signClassroomRequest's own comment claiming it was. Signing the name rather than
	// nothing also stops one captured signature from being replayed to read a DIFFERENT
	// student: a signature for "Priya" is not a signature for "Sam".
	if !s.verifyClassroomSignature(r, []byte(name)) {
		writeError(w, http.StatusUnauthorized, "missing or invalid signature")
		return
	}
	snap, ok, err := s.classroomStore.FindByDisplayName(name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, fmt.Sprintf("no record found for %q", name))
		return
	}
	writeJSON(w, http.StatusOK, snap)
}

var classroomDashboardTmpl = template.Must(template.New("classroom").Parse(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Tessera Quest — Classroom</title>
<style>
body { font-family: system-ui, sans-serif; margin: 2rem; background: #fdf6e9; color: #3d3328; }
h1 { margin-bottom: 0.25rem; }
p.sub { color: #6b5d4d; margin-top: 0; }
table { border-collapse: collapse; width: 100%; max-width: 900px; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
th, td { text-align: left; padding: 0.6rem 1rem; border-bottom: 1px solid #eee; }
th { background: #ffc93c; }
tr:last-child td { border-bottom: none; }
.empty { color: #6b5d4d; font-style: italic; margin-top: 2rem; }
</style></head>
<body>
<h1>Classroom roster</h1>
<p class="sub">{{len .Rows}} student{{if ne (len .Rows) 1}}s{{end}} synced. Refresh this page any time -- it reads straight from the Hub's own record, not a cache.</p>
{{if .Rows}}
<table>
<tr><th>Name</th><th>Points</th><th>Total XP</th><th>Coding levels</th><th>Evolution stage</th><th>Last synced</th></tr>
{{range .Rows}}
<tr>
  <td>{{.DisplayName}}</td>
  <td>{{.Points}}</td>
  <td>{{.TotalXP}}</td>
  <td>{{len .SolvedLevels}} / {{$.TotalLevels}}</td>
  <td>{{.EvolutionStage}}</td>
  <td>{{.LastSyncedRelative}}</td>
</tr>
{{end}}
</table>
<p class="empty">"Total XP" counts every subject -- Coding, Chemistry, Physics, and Math all feed the same points economy. "Coding levels" only counts the original 25-level trail, so a student who has only played Chemistry or Physics will show 0 there even with real XP.</p>
{{else}}
<p class="empty">Nobody has synced yet. Once a student presses "Sync to classroom" on their own machine, they'll show up here.</p>
{{end}}
</body></html>`))

// dashboardData is what the template renders against: the roster rows plus the one piece
// of server-side context (how many Coding levels exist) the template can't compute itself.
type dashboardData struct {
	Rows        []dashboardRow
	TotalLevels int
}

// dashboardRow adds a human-readable relative sync time and a display-name fallback on
// top of classroom.Snapshot -- template concerns, not something the store needs to know.
type dashboardRow struct {
	classroom.Snapshot
	DisplayName        string
	LastSyncedRelative string
}

func (s *Server) handleClassroomDashboard(w http.ResponseWriter, r *http.Request) {
	if s.classroomStore == nil {
		http.Error(w, "this server is not running as a classroom hub", http.StatusNotFound)
		return
	}
	// Same loopback rule as the roster JSON this page is a rendering of -- see isLoopback.
	// A browser cannot send an HMAC header, so the dashboard could never have used the
	// signing mechanism the sync endpoints use; being local-only is what protects it.
	if !isLoopback(r) {
		http.Error(w, "the classroom dashboard is viewable only from the hub machine itself.\n\n"+
			"To read it from another computer, forward the port over SSH:\n"+
			"    ssh -L 8080:localhost:8080 <user>@<hub-ip>\n"+
			"then open http://localhost:8080/classroom on your own machine.",
			http.StatusForbidden)
		return
	}
	roster, err := s.classroomStore.Roster()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	rows := make([]dashboardRow, 0, len(roster))
	now := time.Now()
	for _, snap := range roster {
		rows = append(rows, dashboardRow{
			Snapshot:           snap,
			DisplayName:        classroom.DisplayNameOrFallback(snap),
			LastSyncedRelative: relativeTime(now, snap.LastSyncedAt),
		})
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].DisplayName < rows[j].DisplayName })

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	data := dashboardData{Rows: rows, TotalLevels: len(s.levelOrder)}
	if err := classroomDashboardTmpl.Execute(w, data); err != nil {
		log.Printf("api: rendering classroom dashboard: %v", err)
	}
}

func relativeTime(now time.Time, unixSeconds int64) string {
	if unixSeconds == 0 {
		return "never"
	}
	d := now.Sub(time.Unix(unixSeconds, 0))
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd ago", int(d.Hours()/24))
	}
}

// --- Student side: only active when SetClassroomAddr was called (cmd/server's
// -classroom-addr flag). classroomAddr is empty otherwise, and every handler below
// checks that first. ---

func (s *Server) currentSnapshot() (classroom.Snapshot, error) {
	state, err := s.store.GetState()
	if err != nil {
		return classroom.Snapshot{}, err
	}
	solved, err := s.store.GetSolvedLevelIDs()
	if err != nil {
		return classroom.Snapshot{}, err
	}
	stars, err := s.store.GetStarsByLevel()
	if err != nil {
		return classroom.Snapshot{}, err
	}
	items := make([]classroom.SnapshotItem, 0, len(state.Inventory))
	for _, it := range state.Inventory {
		items = append(items, classroom.SnapshotItem{ItemID: it.ItemID, Qty: it.Qty, Equipped: it.Equipped})
	}
	return classroom.Snapshot{
		LearnerID: state.Learner.ID, DisplayName: state.Learner.DisplayName,
		Points: state.Learner.Points, TotalXP: state.Learner.TotalXP, HighestLevel: state.Learner.HighestLevel,
		SolvedLevels: solved, StarsByLevel: stars, EvolutionStage: state.Pet.EvolutionStage,
		Inventory: items,
	}, nil
}

type syncResult struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

// handleSyncToClassroom pushes this drive's current progress to the configured Hub. A
// Hub that isn't reachable (wrong room, WiFi off, Hub not running) is a completely
// ordinary outcome here, not a server error -- always 200, with ok:false and a message
// the UI can show without alarming a child mid-game.
func (s *Server) handleSyncToClassroom(w http.ResponseWriter, r *http.Request) {
	if s.classroomAddr == "" {
		writeJSON(w, http.StatusOK, syncResult{OK: false, Error: "classroom sync is not set up on this machine"})
		return
	}
	snap, err := s.currentSnapshot()
	if err != nil {
		writeJSON(w, http.StatusOK, syncResult{OK: false, Error: "could not read local progress: " + err.Error()})
		return
	}
	body, err := json.Marshal(snap)
	if err != nil {
		writeJSON(w, http.StatusOK, syncResult{OK: false, Error: err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), classroomSyncTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.classroomAddr+"/api/classroom/sync", bytes.NewReader(body))
	if err != nil {
		writeJSON(w, http.StatusOK, syncResult{OK: false, Error: err.Error()})
		return
	}
	req.Header.Set("Content-Type", "application/json")
	s.signClassroomRequest(req, body)

	resp, err := s.classroomHTTPClient().Do(req)
	if err != nil {
		writeJSON(w, http.StatusOK, syncResult{OK: false, Error: "could not reach the classroom hub: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		writeJSON(w, http.StatusOK, syncResult{OK: false, Error: fmt.Sprintf("hub returned %d: %s", resp.StatusCode, respBody)})
		return
	}
	writeJSON(w, http.StatusOK, syncResult{OK: true})
}

type restoreRequest struct {
	DisplayName string `json:"display_name"`
}

// handleRestoreFromClassroom is the lost-USB recovery flow's other half: a fresh drive
// asks the Hub for a name, and if found, seeds local state from it (store.RestoreFromSnapshot
// -- never-regress, see that function's own comment).
func (s *Server) handleRestoreFromClassroom(w http.ResponseWriter, r *http.Request) {
	if s.classroomAddr == "" {
		writeJSON(w, http.StatusOK, syncResult{OK: false, Error: "classroom sync is not set up on this machine"})
		return
	}
	var req restoreRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.DisplayName == "" {
		writeJSON(w, http.StatusOK, syncResult{OK: false, Error: "missing display_name"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), classroomSyncTimeout)
	defer cancel()
	url := fmt.Sprintf("%s/api/classroom/restore?name=%s", s.classroomAddr, template.URLQueryEscaper(req.DisplayName))
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		writeJSON(w, http.StatusOK, syncResult{OK: false, Error: err.Error()})
		return
	}
	// Sign the name being requested -- must match what the Hub verifies against (see
	// handleClassroomRestore). A GET has no body to sign, so the name IS the payload.
	s.signClassroomRequest(httpReq, []byte(req.DisplayName))

	resp, err := s.classroomHTTPClient().Do(httpReq)
	if err != nil {
		writeJSON(w, http.StatusOK, syncResult{OK: false, Error: "could not reach the classroom hub: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		writeJSON(w, http.StatusOK, syncResult{OK: false, Error: fmt.Sprintf("no record found for %q -- check the spelling, or ask your teacher", req.DisplayName)})
		return
	}
	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		writeJSON(w, http.StatusOK, syncResult{OK: false, Error: fmt.Sprintf("hub returned %d: %s", resp.StatusCode, respBody)})
		return
	}
	var snap classroom.Snapshot
	if err := json.NewDecoder(resp.Body).Decode(&snap); err != nil {
		writeJSON(w, http.StatusOK, syncResult{OK: false, Error: err.Error()})
		return
	}

	restored := make([]store.InventoryItem, 0, len(snap.Inventory))
	for _, it := range snap.Inventory {
		restored = append(restored, store.InventoryItem{ItemID: it.ItemID, Qty: it.Qty, Equipped: it.Equipped})
	}
	err = s.store.RestoreFromSnapshot(snap.DisplayName, snap.Points, snap.TotalXP, snap.HighestLevel,
		snap.SolvedLevels, snap.StarsByLevel, snap.EvolutionStage, restored, time.Now().Unix())
	if err != nil {
		writeJSON(w, http.StatusOK, syncResult{OK: false, Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, syncResult{OK: true})
}

// --- Shared signing (handoff item: sync payload integrity) ---

// signClassroomRequest adds an HMAC-SHA256 signature over the request body, keyed by
// the shared classroom secret -- so a rogue device on the same classroom LAN can't post
// a forged snapshot claiming to be another student, or scrape another student's
// progress via the restore endpoint. Deliberately NOT full transport encryption (no new
// TLS/cert story for a LAN-only, four-days-out feature): this defends against spoofing
// and tampering, not eavesdropping, which is the more realistic threat on a closed
// classroom network than passive sniffing of low-stakes game progress. A no-op
// (adds no header) if no secret is configured.
func (s *Server) signClassroomRequest(req *http.Request, body []byte) {
	if s.classroomSecret == "" {
		return
	}
	mac := hmac.New(sha256.New, []byte(s.classroomSecret))
	mac.Write(body)
	req.Header.Set("X-Classroom-Signature", hex.EncodeToString(mac.Sum(nil)))
}

// verifyClassroomSignature checks an inbound sync's signature. If no secret is
// configured on the Hub, every request is accepted (the pre-task-10 behavior, and still
// the right default for a teacher who hasn't set one) -- signing only becomes mandatory
// once a secret is actually configured on the Hub, matching "secure by configuration,
// not a flag nobody remembers to flip."
func (s *Server) verifyClassroomSignature(r *http.Request, body []byte) bool {
	if s.classroomSecret == "" {
		return true
	}
	got := r.Header.Get("X-Classroom-Signature")
	if got == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(s.classroomSecret))
	mac.Write(body)
	want := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(got), []byte(want))
}

func (s *Server) classroomHTTPClient() *http.Client {
	if s.classroomHTTP == nil {
		s.classroomHTTP = &http.Client{Timeout: classroomSyncTimeout}
	}
	return s.classroomHTTP
}
