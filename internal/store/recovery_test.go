package store

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// AUDIT P0-3. A corrupt or truncated pet.db used to make store.Open return an error,
// which cmd/server turned into log.Fatalf -- the app refused to start at all and the
// child's key was a brick. §13 step 6 yanks a live key out on stage, and a yank during a
// write is exactly how a malformed SQLite file gets produced, so this is on the demo
// path, not a theoretical concern.

func writeCorrupt(t *testing.T, path string) {
	t.Helper()
	if err := os.WriteFile(path, []byte("this is definitely not a sqlite file"), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestOpen_CorruptDBRecoversInsteadOfFailing(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "pet.db")
	writeCorrupt(t, dbPath)

	s, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open on a corrupt pet.db returned an error (app would refuse to start): %v", err)
	}
	defer s.Close()

	// Must be usable, not just non-nil.
	state, err := s.GetState()
	if err != nil {
		t.Fatalf("GetState after corruption recovery: %v", err)
	}
	if state.Pet.Name == "" {
		t.Fatal("recovered store did not produce a usable default pet")
	}

	// The corrupt bytes must be preserved for forensics, never silently deleted.
	entries, _ := os.ReadDir(dir)
	var quarantined string
	for _, e := range entries {
		if strings.Contains(e.Name(), "corrupt") {
			quarantined = e.Name()
		}
	}
	if quarantined == "" {
		t.Fatalf("corrupt file was not quarantined; dir contains %v", names(entries))
	}
	data, err := os.ReadFile(filepath.Join(dir, quarantined))
	if err != nil || !strings.Contains(string(data), "not a sqlite file") {
		t.Fatalf("quarantined file does not contain the original bytes (err=%v)", err)
	}
}

func TestOpen_TruncatedDBRecovers(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "pet.db")

	// Build a real db, then truncate it the way a mid-write yank would.
	s, err := Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.RecordLevelAttempt("level-1", true, 1); err != nil {
		t.Fatal(err)
	}
	s.Close()
	good, _ := os.ReadFile(dbPath)
	if len(good) < 400 {
		t.Fatalf("baseline db unexpectedly small (%d bytes)", len(good))
	}
	if err := os.WriteFile(dbPath, good[:len(good)/2], 0o644); err != nil {
		t.Fatal(err)
	}

	s2, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open on a truncated pet.db returned an error: %v", err)
	}
	defer s2.Close()
	if _, err := s2.GetState(); err != nil {
		t.Fatalf("GetState after truncation recovery: %v", err)
	}
}

// The whole point of keeping a backup is that recovery preserves real progress rather
// than silently resetting the child to zero.
func TestOpen_RestoresRealProgressFromBackup(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "pet.db")

	s, err := Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.RecordLevelAttempt("level-7", true, 42); err != nil {
		t.Fatal(err)
	}
	s.Close()

	// A second clean open snapshots the (now non-empty) db to backup.db.
	s2, err := Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	s2.Close()
	if _, err := os.Stat(filepath.Join(dir, "backup.db")); err != nil {
		t.Fatalf("expected a backup.db snapshot after a clean open: %v", err)
	}

	// Now corrupt the live db. Recovery should come back with level-7 still solved.
	writeCorrupt(t, dbPath)
	s3, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open after corruption: %v", err)
	}
	defer s3.Close()

	solved, err := s3.GetSolvedLevelIDs()
	if err != nil {
		t.Fatal(err)
	}
	if len(solved) != 1 || solved[0] != "level-7" {
		t.Fatalf("solved levels after backup restore = %v, want [level-7] -- progress was lost", solved)
	}
}

// A failure that is NOT corruption (e.g. a directory where the db should be) must still
// surface as an error rather than being silently "recovered" past.
func TestOpen_NonCorruptionFailureStillErrors(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "pet.db")
	if err := os.Mkdir(dbPath, 0o755); err != nil {
		t.Fatal(err)
	}
	if s, err := Open(dbPath); err == nil {
		s.Close()
		t.Fatal("Open succeeded on a path that is a directory; expected an error")
	}
}

// handoff/02-key-hot-swap.md's exact gap: before this fix, backup.db only refreshed once,
// at Open -- so progress made LATER in the same live session (no restart in between) was
// invisible to the recovery snapshot until the process happened to restart again. A yank
// right after solving something, mid-session, lost that solve even though recovery
// "worked" (it just restored a stale snapshot).
func TestOpen_ProgressAfterLastOpenSurvivesAYank(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "pet.db")

	// Session 1: create the db and solve level-1.
	s, err := Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.RecordLevelAttempt("level-1", true, 1); err != nil {
		t.Fatal(err)
	}
	s.Close()

	// Session 2: Open's own snapshotBackup fires once here, capturing level-1. Level-2 is
	// then solved *within this same live session* -- no restart, so the old code never
	// touched backup.db again after this point.
	s2, err := Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := s2.RecordLevelAttempt("level-2", true, 2); err != nil {
		t.Fatal(err)
	}
	s2.Close()

	// Simulate the yank: pet.db is corrupted: whatever backup.db was last refreshed to
	// is all that's recoverable.
	writeCorrupt(t, dbPath)

	s3, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open after corruption: %v", err)
	}
	defer s3.Close()

	solved, err := s3.GetSolvedLevelIDs()
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, id := range solved {
		got[id] = true
	}
	if !got["level-1"] || !got["level-2"] {
		t.Fatalf("solved levels after recovery = %v, want both level-1 and level-2 -- "+
			"level-2 was solved after the session's last Open-time backup refresh, and is "+
			"lost if backup.db only ever refreshes at Open rather than after every write",
			solved)
	}
}

// Direct proof of the mechanism, not just its effect: backup.db's contents actually
// change across a write, not only across an Open.
func TestRecordLevelAttempt_RefreshesBackupImmediately(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "pet.db")
	backupPath := filepath.Join(dir, "backup.db")

	s, err := Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	if err := s.RecordLevelAttempt("level-1", true, 1); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(backupPath)
	if err != nil {
		t.Fatalf("expected backup.db to exist after a write: %v", err)
	}

	if err := s.RecordLevelAttempt("level-2", true, 2); err != nil {
		t.Fatal(err)
	}
	after, err := os.ReadFile(backupPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) == string(after) {
		t.Fatal("backup.db did not change after a second write -- it must refresh on every progress-bearing write, not just at Open")
	}
}

// SaveState is the other write path this fix covers (points/hunger/evolution stage,
// as opposed to RecordLevelAttempt's level_progress rows) -- proven independently so a
// regression in one path isn't masked by the other still working.
func TestSaveState_RefreshesBackupImmediately(t *testing.T) {
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "pet.db")
	backupPath := filepath.Join(dir, "backup.db")

	s, err := Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	state, err := s.GetState()
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SaveState(state); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(backupPath)
	if err != nil {
		t.Fatalf("expected backup.db to exist after SaveState: %v", err)
	}

	state.Learner.Points = 999
	if err := s.SaveState(state); err != nil {
		t.Fatal(err)
	}
	after, err := os.ReadFile(backupPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) == string(after) {
		t.Fatal("backup.db did not change after SaveState changed a real value -- it must refresh on every SaveState call")
	}
}

func names(entries []os.DirEntry) []string {
	var out []string
	for _, e := range entries {
		out = append(out, e.Name())
	}
	return out
}
