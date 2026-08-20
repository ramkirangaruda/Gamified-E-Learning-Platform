// Package paths is the one place that answers "where am I on disk" — every other
// package resolves locations through it instead of calling os.Executable() itself, so
// there is exactly one implementation of brief §7's "never hardcode a drive letter" rule
// to get right.
package paths

import (
	"fmt"
	"os"
	"path/filepath"
)

// ExeDir returns the directory containing the running binary.
//
// This is NOT where content/, app/, models/ and data/ live on a real key — see
// DriveRoot. On the drive the binary sits in bin/win or bin/linux, one level down.
func ExeDir() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("paths: resolving executable: %w", err)
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	return filepath.Dir(exe), nil
}

// DriveRoot returns the root of the Tessera key: the directory holding content/, app/,
// models/, profiles.json and data/.
//
// This exists because resolving those relative to the binary is wrong on the layout the
// project actually ships. Brief §7 puts the launcher at bin/win/launcher.exe and
// bin/linux/launcher, with content/ and the rest at the root beside bin/ -- so joining
// "content" onto the executable's own directory looks for bin/win/content, which does not
// exist. Every dev-machine test passed anyway because the staging directory keeps the
// binary at the root, where exe dir and drive root happen to be the same folder. The
// first assembly of a real §7 drive failed immediately, and pi-setup.sh's
// `exec ./bin/linux/launcher` would have failed the same way on the Pi.
//
// Walking up rather than assuming a fixed "one level down" keeps both layouts working:
// the shipped drive (binary in bin/<os>/) and the flat dev/dist directory.
//
// `go run`/`go test` are a third case this comment used to (wrongly) claim the exe-dir
// walk already covered: `go run` compiles to a temp build cache directory (e.g.
// %TEMP%\go-buildNNNN\b001\exe on Windows) that shares no ancestor with the repo at all,
// so no bound on the exe-dir walk can ever find content/ from there -- confirmed by
// hub/tests/test_integration.py failing outright (server: "reading
// ...\go-build...\exe\content\levels: the system cannot find the path specified")
// the first time that test was actually run with a Go toolchain present. If the exe-dir
// walk finds nothing, fall back to the same bounded walk from the process's working
// directory: `go run ./cmd/server` is conventionally invoked from the repo root (every
// caller in this repo already does this -- scripts/, this package's own tests via `go
// test`, and hub/tests/test_integration.py), so cwd is the right second guess. The
// shipped binary's behavior is unchanged: a real drive's cwd is unpredictable (whatever
// launched it), so the exe-dir result is still tried first and wins whenever it finds a
// real drive root.
func DriveRoot() (string, error) {
	exeDir, err := ExeDir()
	if err != nil {
		return "", err
	}
	if found := findDriveRoot(exeDir); looksLikeDriveRoot(found) {
		return found, nil
	}
	if wd, err := os.Getwd(); err == nil {
		if found := findDriveRoot(wd); looksLikeDriveRoot(found) {
			return found, nil
		}
	}
	// Nothing recognisable anywhere: return the exe-dir walk's result, same as before --
	// the caller then fails with a path naming the binary's own directory, the most
	// useful thing to print when someone has run the launcher outside a drive layout.
	return findDriveRoot(exeDir), nil
}

// findDriveRoot is the searchable half, split out so the layout rules can be tested
// against real directory trees without needing to relocate a compiled binary.
func findDriveRoot(startDir string) string {
	dir := startDir
	// bin/win is one level down; the bound is deliberately small so that a launcher run
	// from a machine with no drive layout at all cannot wander up to the filesystem root
	// and adopt some unrelated directory that happens to contain a "content" folder.
	for i := 0; i < 3; i++ {
		if looksLikeDriveRoot(dir) {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	// Nothing recognisable. Return where we started: the caller then fails with a path
	// that names the binary's own directory, which is the most useful thing to print
	// when someone has run the launcher outside a drive layout.
	return startDir
}

// looksLikeDriveRoot tests for content/, the one directory the game genuinely cannot run
// without. app/ is deliberately not required: a drive whose frontend has not been built
// yet still has to boot far enough to say so, rather than silently resolving its data
// directory somewhere else.
func looksLikeDriveRoot(dir string) bool {
	fi, err := os.Stat(filepath.Join(dir, "content"))
	return err == nil && fi.IsDir()
}
