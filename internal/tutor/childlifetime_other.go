//go:build !linux && !windows

package tutor

import "os/exec"

// No-op everywhere except Linux (Pdeathsig, childlifetime_linux.go) and Windows (a Job
// Object, childlifetime_windows.go). Neither platform this actually ships on (Pi/Linux,
// Windows laptops) lands here -- this file covers dev machines this project was never
// built to run the hub on (macOS, *BSD), where the residual exposure documented in
// AUDIT.md/handoff/06-windows-orphan.md simply doesn't apply.
func configureChildLifetime(cmd *exec.Cmd) {}

// attachChildLifetime mirrors configureChildLifetime's no-op here -- see
// childlifetime_windows.go for why this is a second, post-Start hook at all.
func attachChildLifetime(cmd *exec.Cmd) error { return nil }
