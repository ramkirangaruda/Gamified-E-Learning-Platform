//go:build windows

package tutor

import (
	"fmt"
	"os/exec"
	"unsafe"

	"golang.org/x/sys/windows"
)

// configureChildLifetime is a no-op on Windows. Unlike Linux's Pdeathsig (set on
// SysProcAttr before Start, childlifetime_linux.go), a Windows Job Object needs a
// process HANDLE, which only exists after Start() has actually succeeded -- see
// attachChildLifetime, the post-Start half of this mechanism.
func configureChildLifetime(cmd *exec.Cmd) {}

// attachChildLifetime is handoff/06-windows-orphan.md's fix for AUDIT P0-1's Windows
// half: a Job Object with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, so llama-server is killed
// by the kernel the instant this process's handle to the job closes -- including a hard
// crash, a forced power-off, or `taskkill /F`, none of which run any Go cleanup code.
// This is the genuine Windows analogue of Pdeathsig, not a lesser substitute: Windows has
// no per-process "die with parent" flag, and a Job Object with this limit is the
// documented way to get the equivalent kernel-level guarantee.
//
// Deliberately narrow, matching the scope AUDIT.md originally flagged as the residual
// gap: this does not use CREATE_SUSPENDED + delayed resume to close the (real, but
// narrower) race where a child could spawn its own children before being assigned to the
// job. llama-server does not itself fork/spawn processes, so that race has nothing to
// escape through here -- the simpler post-Start assignment is a deliberate scope
// decision, not an oversight, and is logged as such in DECISIONS.md.
//
// Best-effort by design, same pattern this codebase already uses elsewhere (store.Open's
// corruption recovery, StartLlamaEngine's own pre-warm failure handling a few lines below
// this function's call site): a Job Object failing to create on some unusual Windows
// configuration must not stop the hint tutor from starting at all. The caller logs the
// error and continues.
func attachChildLifetime(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return fmt.Errorf("tutor: attachChildLifetime called before the process started")
	}

	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return fmt.Errorf("tutor: creating job object: %w", err)
	}
	// job's handle is deliberately never closed here. Closing the process's last handle
	// to the job is exactly the event JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE reacts to, so
	// this handle must stay open for the rest of this process's life -- the OS reclaims
	// it (and, per that limit, kills every process still assigned to the job) whenever
	// this process ends, however it ends. That is the entire mechanism.

	info := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{
		BasicLimitInformation: windows.JOBOBJECT_BASIC_LIMIT_INFORMATION{
			LimitFlags: windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
		},
	}
	if _, err := windows.SetInformationJobObject(
		job, windows.JobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info)),
	); err != nil {
		windows.CloseHandle(job)
		return fmt.Errorf("tutor: setting kill-on-close limit: %w", err)
	}

	// Re-open the child by PID with exactly the access AssignProcessToJobObject
	// documents needing (PROCESS_SET_QUOTA | PROCESS_TERMINATE), rather than reaching
	// into exec.Cmd's Windows handle -- os/exec does not expose it, by design, and
	// re-opening by PID is the same portable approach other Go Job Object callers use.
	procHandle, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, uint32(cmd.Process.Pid))
	if err != nil {
		windows.CloseHandle(job)
		return fmt.Errorf("tutor: opening child process handle: %w", err)
	}
	defer windows.CloseHandle(procHandle)

	if err := windows.AssignProcessToJobObject(job, procHandle); err != nil {
		windows.CloseHandle(job)
		return fmt.Errorf("tutor: assigning process to job object: %w", err)
	}

	return nil
}
