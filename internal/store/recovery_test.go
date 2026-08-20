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

func names(entries []os.DirEntry) []string {
	var out []string
	for _, e := range entries {
		out = append(out, e.Name())
	}
	return out
}
