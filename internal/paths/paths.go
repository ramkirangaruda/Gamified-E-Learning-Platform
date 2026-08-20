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

// ExeDir returns the directory containing the running binary. On the Tessera key this is
// the drive root's bin/win or bin/linux — everything else (data/, app/, models/) is
// resolved relative to it, never to an absolute path or the current working directory.
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
