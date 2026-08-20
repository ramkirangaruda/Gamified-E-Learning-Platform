//go:build linux

package tutor

import (
	"os/exec"
	"syscall"
)

// AUDIT P0-1. On Linux the kernel can kill a child automatically when its parent dies,
// which is the only reliable defence against the confirmed orphan case: the launcher is
// hard-killed (crash, power-button hold, `kill -9`) and llama-server keeps running with
// the model resident. On a 4 GB Pi 5 that orphan both holds the RAM the next launch needs
// and keeps port 8090 bound, so the *second* failure is worse than the first -- every
// subsequent launch fails too.
//
// Pdeathsig is set on the parent *thread*, and Go can migrate a goroutine between OS
// threads, so this is only dependable because exec.Cmd.Start locks the calling goroutine
// to its thread for the fork/exec. That is exactly the supported use of this field.
//
// Deliberately Linux-only: the Pi is the memory-constrained machine that makes this a P0.
// Windows has no equivalent one-liner (it needs a Job Object) -- see AUDIT.md for the
// residual gap there, which the main.go changes narrow but do not close.
func configureChildLifetime(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Pdeathsig = syscall.SIGKILL
}

// attachChildLifetime is a no-op on Linux: Pdeathsig above already does the whole job,
// pre-Start. It exists so callers (llamaengine.go) can call the same post-Start hook
// unconditionally on every platform -- see childlifetime_windows.go for why Windows
// needs a second, post-Start hook at all (a Job Object needs a process handle, which
// only exists once Start() has actually succeeded).
func attachChildLifetime(cmd *exec.Cmd) error { return nil }
