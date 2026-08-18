# Handoff: Windows parent-crash orphan

**Paste this whole file into Claude Code on your machine.** It is written to be run
independently, in parallel, without touching anything the other workstream is editing.
**Needs a Windows machine** to actually verify the fix — you can write it anywhere, but
you cannot prove it works without one.

## Why this one

Invisible to judges, real for users. If the launcher process is hard-killed — a crash, a
forced power-off, `taskkill /F`, Task Manager "End task" — `llama-server` (its child
process, holding the model resident in RAM and port 8090 bound) can be left running as an
orphan. On the next launch, the port is already taken and/or the RAM the new instance
needs is still held by the old one, so the *second* launch fails too. This is exactly
what happened on the Pi and was fixed there (AUDIT P0-1) — Windows was deliberately left
as a documented, un-closed gap because building it properly looked like more code and
more startup-failure risk than four days out warranted. That calculus may be worth
revisiting now; if it still isn't, this task at least gets you most of the way there.

## What already exists (do not rebuild any of it, read it before writing anything)

The whole child-lifetime story lives in `internal/tutor/`, split by build tag — read all
three files, they're short:

- **`internal/tutor/childlifetime_linux.go`**: on Linux, `configureChildLifetime(cmd
  *exec.Cmd)` sets `cmd.SysProcAttr.Pdeathsig = syscall.SIGKILL` *before* `cmd.Start()`
  is called. The kernel then kills the child automatically if the parent dies — no
  polling, no watchdog, a genuine kernel guarantee. Its comment explains a real subtlety:
  this only works because `exec.Cmd.Start` locks the calling goroutine to its OS thread
  for the fork/exec, since `Pdeathsig` is set on the parent *thread*, not the process.
- **`internal/tutor/childlifetime_other.go`** (`//go:build !linux`): currently a
  no-op, with a comment explicitly naming the Windows gap:

  > "On Windows the equivalent would be a Job Object with
  > `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`; that is deliberately not built here... the
  > remaining exposure is documented in AUDIT.md."

  This is the file (or its replacement) you're changing.
- **The call site**: `internal/tutor/llamaengine.go:60`–`70`. `configureChildLifetime(cmd)`
  is called immediately before `cmd.Start()`, inside `StartLlamaEngine`. This is a
  pre-start hook by design (it has to be, on Linux — `SysProcAttr` only takes effect at
  `Start`).
- **The existing test scaffold is already cross-platform and already exercises real
  process lifetime, not just the Linux path**: `internal/tutor/childlifetime_test.go`.
  It spawns a real long-running stand-in child (`ping -n 300 127.0.0.1` on Windows,
  `sleep 300` elsewhere — not the real `llama-server`, since that needs a 484 MB model
  file, and what's being tested is process lifetime handling, not inference), and has a
  working `processAlive(pid)` helper that already special-cases Windows correctly (a
  killed process's handle still resolves via `os.FindProcess` on Windows, so it shells
  out to `tasklist` instead). `TestConfigureChildLifetime_SetsPdeathsigOnLinux`
  (`childlifetime_test.go:118`) currently only asserts something on Linux and no-ops
  elsewhere via `assertPdeathsig` (`childlifetime_assert_other_test.go`, a deliberate
  build-tag seam for exactly this kind of platform-specific assertion) — that's the seam
  you extend for Windows, not replace.

## The real design problem: Job Objects need the process handle, `Pdeathsig` doesn't

This is the one non-obvious thing worth understanding before you write code. `Pdeathsig`
is set in `SysProcAttr` *before* `Start()` — it configures the fork/exec itself. A
Windows Job Object is different: you create the job, set
`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` on it, and then call `AssignProcessToJobObject`,
which needs a **process handle** — something that only exists *after* `cmd.Start()`
succeeds (`cmd.Process`).

So `configureChildLifetime(cmd)`'s current signature (called once, pre-`Start`) doesn't
fit Windows cleanly. The two honest options:

1. **Add a second hook, called post-`Start`.** e.g. `attachChildLifetime(cmd *exec.Cmd)
   error`, called right after `cmd.Start()` succeeds in `llamaengine.go`. Linux's version
   no-ops (it already did its work pre-start). Windows creates the Job Object, sets the
   kill-on-close limit, and assigns `cmd.Process`'s handle to it. This is the simpler,
   recommended option — it doesn't touch the pre-start hook's contract at all.
2. **Start the process suspended** (`CREATE_SUSPENDED` in `SysProcAttr.CreationFlags`),
   assign it to the job before it runs any code, then resume it. This closes a narrower
   race (a child that spawns grandchildren before being assigned to the job could
   escape) but is meaningfully more code, and Go's `os/exec` doesn't expose the thread
   handle needed to resume cleanly — you'd need to enumerate threads via a toolhelp
   snapshot. **`llama-server` doesn't spawn its own children**, so this race doesn't
   apply here in practice. Recommend option 1; if you disagree, log why in
   `DECISIONS.md` rather than silently building the more complex version.

## The job

1. Implement option 1 above: a post-start hook, Windows-only real implementation,
   no-op on other platforms (matching the existing `childlifetime_linux.go` /
   `childlifetime_other.go` split — add `childlifetime_windows.go`, and update
   `childlifetime_other.go`'s build tag to exclude Windows too, or add the no-op
   alongside the existing one, whichever keeps the file organization cleanest).
2. Wire the new hook into `llamaengine.go`, called right after `cmd.Start()` succeeds
   (`llamaengine.go:68`–`70`). If the Job Object creation fails, **do not fail startup
   over it** — log and continue, matching this codebase's established pattern of "a
   missing safety net is not worth refusing to start over" (see `store.Open`'s
   corruption recovery, or `StartLlamaEngine`'s own pre-warm failure handling a few lines
   below the call site).
3. Use `golang.org/x/sys/windows` for the Job Object syscalls (`CreateJobObject`,
   `SetInformationJobObject`, `AssignProcessToJobObject`) rather than hand-rolling raw
   `syscall.NewLazyDLL` calls — **check `go.mod` before assuming this is a new
   dependency: `golang.org/x/sys v0.47.0` is already there as an indirect dependency**
   (pulled in transitively). Importing `golang.org/x/sys/windows` directly promotes an
   already-vendored module to direct use; it does not add a new one to the module graph.
   Run `go mod tidy` afterward and confirm `go.sum` doesn't gain any new module, only a
   changed `// indirect` annotation — if it does pull in something new, stop and flag it
   rather than assuming it's fine.
4. Extend `assertPdeathsig`'s sibling seam (or add a parallel one) so
   `childlifetime_test.go` actually asserts something real on Windows, not just
   skip. The existing `TestClose_TerminatesTheChildProcess` already proves `Close()` kills
   the direct child on every platform — what's missing is a test that proves the **kernel
   itself** kills the child if the *parent process dies without calling Close at all*
   (the actual failure mode this task exists to fix). That's harder to test in-process
   (you can't kill your own test binary mid-test and then keep asserting from it) — the
   standard pattern is a small helper subprocess: spawn a second process whose whole job
   is "start the stand-in child with your new lifetime binding, then exit without
   cleanup," then from the outer test assert the grandchild is gone shortly after.
   `os.Executable()` + a test-only re-exec flag (a common Go testing pattern, e.g. `if
   os.Getenv("HELPER_PROCESS") == "1" { ...; os.Exit(0) }` at the top of `TestMain`) is
   the usual way to do this without a second binary.

## Hard constraints — these are not negotiable

- **No new runtime dependencies** — see the `golang.org/x/sys/windows` note above; this
  is the one case where "already indirect in go.sum" makes an import legitimate rather
  than a violation. If your implementation needs anything beyond `x/sys/windows` and
  stdlib, stop and flag it rather than adding it.
- **A Job Object failure must never block startup.** The whole point of this fix is
  robustness; making the app *less* likely to start over a Job Object API failing on some
  odd Windows configuration would be a net loss.
- **Every fix needs a test**, including the harder cross-process one described above —
  this is exactly the kind of fix that looks done from reading the code but isn't proven
  without actually killing a parent and checking the child dies too.
- **Do not weaken or remove `configureChildLifetime`'s existing Linux behavior or its
  test.** This task adds a second, Windows-specific mechanism; it does not touch what
  already works on the Pi.

## Do not touch these files — they are being actively edited

`web/src/pet/*`, `web/src/App.tsx`, `web/src/PlayPage.tsx`, `web/src/HomePage.tsx`,
`web/src/index.css`, `web/src/tokens.css`, `cmd/server/main.go`, `internal/paths/*`,
`internal/store/*`.

This task's territory is `internal/tutor/*` and `go.mod`/`go.sum` — nothing else on the
collision map claims either.

## Working rules for this repo

- Log decisions in `DECISIONS.md` and open questions in `QUESTIONS.md`, appending to the
  end.
- **Work on a branch** (`windows-orphan`) and open a PR rather than pushing to master.
- Commit per milestone with a real message explaining *why*.
- **Never add yourself or Claude as a commit co-author.**

## Acceptance — you are done when

1. On a real Windows machine: start the launcher, note `llama-server.exe`'s PID (Task
   Manager or `tasklist`), forcibly kill the launcher process (not a graceful `Close()` —
   `taskkill /F /PID <launcher pid>` or the Task Manager "End task" equivalent), and
   confirm `llama-server.exe` is also gone shortly after, not left running.
2. A test proves this automatically (the cross-process test described above), not just a
   manual check you did once.
3. `go test ./...` is green on both platforms you can reach, and `go vet` and the
   `windows/amd64` cross-compile (`scripts/build-launchers.ps1` or `.sh`) both stay clean.
4. `go.sum` shows no genuinely new module pulled in — only, at most, an existing indirect
   dependency's annotation changing.
