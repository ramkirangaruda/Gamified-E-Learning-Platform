package paths

import (
	"os"
	"path/filepath"
	"testing"
)

// The bug this pins shipped in every build until a real §7 drive was assembled by hand:
// content/, app/, models/ and data/ were resolved relative to the BINARY, but the drive
// layout puts the binary in bin/win or bin/linux with everything else at the root beside
// bin/. On the dev/dist directory the binary sits at the root, so exe dir and drive root
// were the same folder and nothing ever noticed. On a real drive the launcher died at
// startup looking for bin/win/content/levels, and pi-setup.sh's
// `exec ./bin/linux/launcher` would have done exactly the same on the Pi.
func TestFindDriveRoot(t *testing.T) {
	t.Run("shipped layout: binary in bin/win, content at the root", func(t *testing.T) {
		root := t.TempDir()
		mkdirs(t, root, "content/levels", "content/hints", "app", "models", "bin/win", "bin/linux")

		for _, binDir := range []string{"bin/win", "bin/linux"} {
			start := filepath.Join(root, filepath.FromSlash(binDir))
			if got := findDriveRoot(start); got != root {
				t.Errorf("from %s: got %q, want drive root %q", binDir, got, root)
			}
		}
	})

	t.Run("flat dev layout: binary beside content", func(t *testing.T) {
		root := t.TempDir()
		mkdirs(t, root, "content/levels", "app")

		if got := findDriveRoot(root); got != root {
			t.Errorf("got %q, want %q", got, root)
		}
	})

	t.Run("no drive layout anywhere: returns where it started", func(t *testing.T) {
		// Running the launcher from a random directory has to produce an error naming
		// that directory, not silently adopt some unrelated folder further up.
		empty := t.TempDir()
		start := filepath.Join(empty, "somewhere", "else")
		mkdirs(t, empty, "somewhere/else")

		if got := findDriveRoot(start); got != start {
			t.Errorf("got %q, want the starting dir %q", got, start)
		}
	})

	t.Run("does not walk up indefinitely", func(t *testing.T) {
		// A "content" directory far above the binary must not be mistaken for the drive
		// root -- on a real machine that could be any unrelated folder.
		root := t.TempDir()
		mkdirs(t, root, "content", "a/b/c/d/e")
		deep := filepath.Join(root, "a", "b", "c", "d", "e")

		if got := findDriveRoot(deep); got == root {
			t.Errorf("walked %q up to an unrelated content/ at %q", deep, root)
		}
	})

	t.Run("a content FILE is not a drive root", func(t *testing.T) {
		root := t.TempDir()
		mkdirs(t, root, "bin/win")
		if err := os.WriteFile(filepath.Join(root, "content"), []byte("not a dir"), 0o644); err != nil {
			t.Fatal(err)
		}
		start := filepath.Join(root, "bin", "win")

		if got := findDriveRoot(start); got == root {
			t.Error("a file named content must not satisfy the drive-root test")
		}
	})
}

func mkdirs(t *testing.T, root string, rel ...string) {
	t.Helper()
	for _, r := range rel {
		if err := os.MkdirAll(filepath.Join(root, filepath.FromSlash(r)), 0o755); err != nil {
			t.Fatal(err)
		}
	}
}
