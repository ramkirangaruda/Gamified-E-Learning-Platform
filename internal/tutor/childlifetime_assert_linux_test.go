//go:build linux

package tutor

import (
	"os/exec"
	"syscall"
	"testing"
)

func assertPdeathsig(t *testing.T, cmd *exec.Cmd) {
	t.Helper()
	if cmd.SysProcAttr.Pdeathsig != syscall.SIGKILL {
		t.Fatalf("Pdeathsig = %v, want SIGKILL -- llama-server would survive a parent crash", cmd.SysProcAttr.Pdeathsig)
	}
}
