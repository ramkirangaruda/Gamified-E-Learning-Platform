//go:build !linux

package tutor

import "os/exec"

// No-op everywhere except Linux -- see childlifetime_linux.go for why the Pi is the
// platform this matters on. On Windows the equivalent would be a Job Object with
// JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE; that is deliberately not built here (more code and
// more startup-failure risk than the residual gap warrants four days out), and the
// remaining exposure is documented in AUDIT.md.
func configureChildLifetime(cmd *exec.Cmd) {}
