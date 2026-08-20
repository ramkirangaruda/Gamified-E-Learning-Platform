package tutor

import (
	"os"
	"os/exec"
	"runtime"
	"testing"
	"time"
)

// AUDIT P0-1. The confirmed failure was llama-server surviving its parent. These tests
// use a stand-in long-running child rather than the real llama-server (which needs a
// 484 MB model file), because what is being verified is process lifetime handling, not
// inference.

// sleeperCmd returns a command that runs for a long time without producing output,
// available on both platforms this project targets.
func sleeperCmd() *exec.Cmd {
	if runtime.GOOS == "windows" {
		// -n 300 -> ~300 seconds of pinging localhost; no external network involved.
		return exec.Command("ping", "-n", "300", "127.0.0.1")
	}
	return exec.Command("sleep", "300")
}

func processAlive(pid int) bool {
	if runtime.GOOS == "windows" {
		// On Windows a killed process's handle still resolves via FindProcess, so ask
		// tasklist instead -- it reports only live processes.
		out, err := exec.Command("tasklist", "/FI", "PID eq "+itoa(pid), "/NH").Output()
		if err != nil {
			return false
		}
		return len(out) > 0 && containsDigits(string(out), pid)
	}
	p, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return p.Signal(os.Signal(nil)) == nil
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

func containsDigits(hay string, pid int) bool {
	needle := itoa(pid)
	for i := 0; i+len(needle) <= len(hay); i++ {
		if hay[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}

// Close must actually terminate the child, not just signal it and return.
func TestClose_TerminatesTheChildProcess(t *testing.T) {
	cmd := sleeperCmd()
	configureChildLifetime(cmd)
	if err := cmd.Start(); err != nil {
		t.Skipf("could not start stand-in child on this machine: %v", err)
	}
	pid := cmd.Process.Pid

	e := &LlamaEngine{cmd: cmd}
	if err := e.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	// Close waits for the process, so it must be gone immediately afterwards.
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if !processAlive(pid) {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("child pid %d still alive after Close()", pid)
}

// Close must be safe to call on an engine that never started a process, and safe to call
// twice -- both happen on the shutdown paths in cmd/server.
func TestClose_IsSafeWhenThereIsNoProcess(t *testing.T) {
	e := &LlamaEngine{}
	if err := e.Close(); err != nil {
		t.Fatalf("Close on an engine with no process: %v", err)
	}

	cmd := sleeperCmd()
	if err := cmd.Start(); err != nil {
		t.Skipf("could not start stand-in child: %v", err)
	}
	e2 := &LlamaEngine{cmd: cmd}
	if err := e2.Close(); err != nil {
		t.Fatalf("first Close: %v", err)
	}
	// Second Close must not panic or hang; an already-dead process erroring is fine.
	done := make(chan struct{})
	go func() { _ = e2.Close(); close(done) }()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("second Close() hung")
	}
}

// On Linux the kernel-level guarantee is what actually closes the confirmed orphan hole.
// This runs on the Pi during bring-up; it is a no-op assertion elsewhere.
func TestConfigureChildLifetime_SetsPdeathsigOnLinux(t *testing.T) {
	cmd := exec.Command("true")
	configureChildLifetime(cmd)

	if runtime.GOOS != "linux" {
		if cmd.SysProcAttr != nil {
			t.Fatalf("expected no SysProcAttr changes on %s, got %+v", runtime.GOOS, cmd.SysProcAttr)
		}
		t.Skipf("Pdeathsig is Linux-only; nothing to assert on %s", runtime.GOOS)
	}
	if cmd.SysProcAttr == nil {
		t.Fatal("SysProcAttr was not set on linux -- child would survive a parent crash")
	}
	assertPdeathsig(t, cmd)
}
