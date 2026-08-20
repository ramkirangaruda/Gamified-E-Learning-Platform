package levels

import (
	"os"
	"path/filepath"
	"testing"
)

// AUDIT P0-4 / P1-3. LoadAll used to fail the whole directory if any single .json failed
// to parse, so one truncated file on a yanked USB drive took all eight levels down and
// (via api.New -> log.Fatalf) killed the app. It also used to return zero levels with no
// error for an empty directory, which showed up as a dashboard stuck on "Loading..."
// forever with nothing explaining why.

func copyRealLevels(t *testing.T, dest string) {
	t.Helper()
	srcs, err := filepath.Glob("../../content/levels/*.json")
	if err != nil || len(srcs) == 0 {
		t.Fatalf("no real level files found to copy: %v", err)
	}
	for _, src := range srcs {
		data, err := os.ReadFile(src)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dest, filepath.Base(src)), data, 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestLoadAll_SkipsOneBadFileAndKeepsTheRest(t *testing.T) {
	dir := t.TempDir()
	copyRealLevels(t, dir)
	if err := os.WriteFile(filepath.Join(dir, "level-9.json"), []byte(`{"id":"level-9","truncat`), 0o644); err != nil {
		t.Fatal(err)
	}

	lvls, err := LoadAll(dir)
	if err != nil {
		t.Fatalf("one truncated level file took down the whole directory: %v", err)
	}
	if len(lvls) != 8 {
		t.Fatalf("got %d levels, want the 8 good ones (bad file skipped)", len(lvls))
	}
	for _, l := range lvls {
		if l.ID == "level-9" {
			t.Fatal("the malformed level was loaded anyway")
		}
	}
}

func TestLoadAll_SkipsFileWithInvalidStartDir(t *testing.T) {
	dir := t.TempDir()
	copyRealLevels(t, dir)
	bad := `{"id":"level-9","name":"Bad","teaches":"move","parBlocks":1,
	         "startPos":[0,0],"startDir":"sideways",
	         "grid":{"width":2,"height":1,"walls":[[false,false]],"goal":[1,0]}}`
	if err := os.WriteFile(filepath.Join(dir, "level-9.json"), []byte(bad), 0o644); err != nil {
		t.Fatal(err)
	}

	lvls, err := LoadAll(dir)
	if err != nil {
		t.Fatalf("an invalid startDir took down the whole directory: %v", err)
	}
	if len(lvls) != 8 {
		t.Fatalf("got %d levels, want 8", len(lvls))
	}
}

// Zero usable levels is genuinely unrecoverable -- the game has nothing to show. That
// must be a loud, explained failure, not a silently blank dashboard.
func TestLoadAll_EmptyDirectoryIsAnError(t *testing.T) {
	lvls, err := LoadAll(t.TempDir())
	if err == nil {
		t.Fatalf("empty levels dir returned %d levels and no error; expected an explained failure", len(lvls))
	}
}

func TestLoadAll_AllFilesBadIsAnError(t *testing.T) {
	dir := t.TempDir()
	for _, n := range []string{"level-1.json", "level-2.json"} {
		if err := os.WriteFile(filepath.Join(dir, n), []byte("{{{"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := LoadAll(dir); err == nil {
		t.Fatal("a directory where every file is malformed should be an error")
	}
}

func TestLoadAll_MissingDirectoryStillErrors(t *testing.T) {
	if _, err := LoadAll(filepath.Join(t.TempDir(), "nope")); err == nil {
		t.Fatal("a missing levels directory should still be an error")
	}
}
