package tutor

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"
)

// TestMain exists to support TestOrphan_ChildDoesNotSurviveAHardKilledParent below via a
// self-re-exec: a `go test` binary run with HELPER_ORPHAN_TEST=1 acts as a stand-in
// launcher process instead of running the test suite, so the real test can hard-kill it
// as a genuinely separate OS process and observe what happens to ITS child -- you cannot
// meaningfully "hard-kill" your own test binary mid-test and keep asserting from it.
// Every other test in this package runs through m.Run() exactly as before; this only
// intercepts when that one env var is explicitly set.
func TestMain(m *testing.M) {
	if os.Getenv("HELPER_ORPHAN_TEST") == "1" {
		runOrphanTestHelper()
		return
	}
	os.Exit(m.Run())
}

// runOrphanTestHelper stands in for cmd/server: start a child with the real
// configureChildLifetime/attachChildLifetime pair applied (the same two calls
// llamaengine.go makes around a real cmd.Start()), print its PID, then block for a long
// time doing nothing else. It is killed from outside by the real test, never exits on
// its own -- the whole point is that nothing in its own shutdown path ever runs, the
// same as a real crash or a forced power-off.
func runOrphanTestHelper() {
	cmd := sleeperCmd()
	configureChildLifetime(cmd)
	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "helper: starting child: %v\n", err)
		os.Exit(1)
	}
	if err := attachChildLifetime(cmd); err != nil {
		fmt.Fprintf(os.Stderr, "helper: attachChildLifetime: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("CHILD_PID %d\n", cmd.Process.Pid)
	time.Sleep(10 * time.Minute) // outlives any sane test timeout; killed from outside
}

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

// The actual failure mode AUDIT P0-1 (Linux) and handoff/06-windows-orphan.md (Windows)
// exist to close: the launcher is hard-killed (crash, forced power-off, `kill -9`,
// `taskkill /F`) and llama-server keeps running, holding the model resident and the port
// bound. TestClose_TerminatesTheChildProcess above only proves Close() cleans up when it
// gets the chance to run -- a hard kill means it never does. This spawns a real second OS
// process (via TestMain's re-exec) as a stand-in launcher, hard-kills THAT process (never
// the grandchild directly, and never through any of this process's own code -- a real
// crash runs no cleanup either), and asserts the grandchild dies too. That is what
// actually proves the kernel-level guarantee (Pdeathsig / Job Object) rather than a
// graceful-shutdown path.
func TestOrphan_ChildDoesNotSurviveAHardKilledParent(t *testing.T) {
	if runtime.GOOS != "linux" && runtime.GOOS != "windows" {
		t.Skip("orphan protection is only implemented on linux and windows; see childlifetime_other.go")
	}

	exe, err := os.Executable()
	if err != nil {
		t.Fatalf("os.Executable: %v", err)
	}
	helper := exec.Command(exe)
	helper.Env = append(os.Environ(), "HELPER_ORPHAN_TEST=1")
	stdout, err := helper.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := helper.Start(); err != nil {
		t.Skipf("could not start helper process on this machine: %v", err)
	}
	// Best-effort: if the test fails before reaching the deliberate kill below, don't
	// leave the helper (and its own child) running past this test.
	cleanup := true
	defer func() {
		if cleanup {
			_ = helper.Process.Kill()
		}
	}()

	scanner := bufio.NewScanner(stdout)
	var grandchildPID int
	readDone := make(chan struct{})
	go func() {
		defer close(readDone)
		for scanner.Scan() {
			if n, ok := strings.CutPrefix(scanner.Text(), "CHILD_PID "); ok {
				grandchildPID, _ = strconv.Atoi(n)
				return
			}
		}
	}()
	select {
	case <-readDone:
	case <-time.After(10 * time.Second):
		t.Fatal("timed out waiting for CHILD_PID from the helper process")
	}
	if grandchildPID == 0 {
		t.Fatal("did not see a valid CHILD_PID from the helper process")
	}
	if !processAlive(grandchildPID) {
		t.Fatalf("grandchild pid %d was not even alive to begin with", grandchildPID)
	}

	// The actual test: hard-kill the parent (the helper process standing in for
	// cmd/server), not the grandchild, and not via Close() or any other code path that
	// would run cleanup. Wait/os.Process.Kill() is the closest a Go test can get to an
	// external `taskkill /F` or `kill -9` -- it terminates the process without giving it
	// any further chance to run its own code.
	cleanup = false
	if err := helper.Process.Kill(); err != nil {
		t.Fatalf("hard-killing the helper process: %v", err)
	}
	_ = helper.Wait()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if !processAlive(grandchildPID) {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("grandchild pid %d still alive 5s after its parent was hard-killed -- orphan protection did not fire", grandchildPID)
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
