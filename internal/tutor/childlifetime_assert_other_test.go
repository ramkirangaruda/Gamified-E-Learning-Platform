//go:build !linux

package tutor

import (
	"os/exec"
	"testing"
)

// Pdeathsig does not exist outside Linux; the Linux-only test skips before reaching this.
func assertPdeathsig(t *testing.T, cmd *exec.Cmd) { t.Helper() }
