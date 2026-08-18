# Handoff: Key hot-swap and crash-safe writes (§13 step 6)

**Paste this whole file into Claude Code on your machine.** It is written to be run
independently, in parallel, without touching anything the other workstream is editing.

## Why this one

§13 step 6 of the demo script is: pull a live USB key out of the machine on stage, plug
in a different one, and keep going. It's the single most memorable beat in the script,
and it's the milestone `PLAN.md` §1 scoped to M4 and has been deferred since M1:

> "`pet.db` is written via a write-then-rename with a `backup.db` fallback, because the
> realistic failure mode is a child yanking the drive mid-write."

That full scheme was never built. What exists today is a narrower fix from the
pre-hackathon audit (P0-3): if `pet.db` is already corrupt *when the app starts*, it
recovers instead of refusing to boot. That is not the same thing as surviving a yank
*during a live session* — read on for the exact gap.

## What already exists (do not rebuild any of it)

Read `internal/store/store.go` top to bottom first — it's 240 lines and the comments
explain every decision already made. The short version:

- **`Store.Open(dbPath)`** (`store.go:66`): opens `pet.db`. If the file is corrupt or
  truncated, it quarantines the bad file (renamed, never deleted), tries to restore from
  `backup.db`, and falls back to a fresh save file only if that also fails. Reproduced
  and tested in `internal/store/recovery_test.go`.
- **`snapshotBackup(dbPath)`** (`store.go:128`): copies the just-opened, known-good
  `pet.db` to `backup.db`, via a tmp-file-then-`os.Rename` (`copyFile`, `store.go:139`)
  so a snapshot is never observed half-written. **It is called exactly once per process
  lifetime, immediately after a clean `Open`.**
- Single SQLite connection (`db.SetMaxOpenConns(1)`), `PRAGMA synchronous=FULL`, rollback
  journal (not WAL — deliberately, see the package comment at the top of `store.go`, so
  there are no persistent `-wal`/`-shm` sidecar files to reason about).
- `internal/paths.DriveRoot()` resolves the data directory relative to the running
  executable, not a hardcoded drive letter — already fixed and tested, this is why
  plugging the *same key* into a *different machine* already works today. Hot-swap's
  remaining problem is durability, not path resolution.

## The actual gap

`snapshotBackup` only runs once, at startup. Every write after that — every level solve,
every attempt, every hint recorded — goes straight into `pet.db` via `db.Exec`
(`SaveState` at `store.go:314`, `RecordLevelAttempt` at `store.go:506`, etc.) and
`backup.db` is never refreshed again.

So today: yank the key five minutes into a session, and `Open`'s recovery path restores
`backup.db` — which is whatever `pet.db` looked like at the *start* of that session.
Everything solved since is gone. The recovery machinery works; it just protects the wrong
point in time. This is exactly the failure §13 step 6 would expose live: yank the key
right after solving a level, plug it into a laptop, and the solve doesn't come back.

## The job

1. **Refresh `backup.db` after every write that changes durable state**, not just once at
   `Open`. The natural place is inside the `Store` methods themselves (`SaveState`,
   `RecordLevelAttempt`, and — your call, log it — whether `RecordAttempt` and
   `RecordTierHint` need it too, or whether only progress-bearing writes justify the
   extra file copy). `copyFile`'s tmp-then-rename already makes each individual snapshot
   atomic; you're just calling it more often.
   - `pet.db` is small (a handful of tables, realistically low hundreds of KB even after
     a long session) so a full-file copy per write is cheap. If you find a reason it
     isn't, throttling is a legitimate call — but log why, don't silently skip it.
2. **Prove it with an actual interrupted write**, not just a corrupt-file-at-rest test
   (that's already covered by `recovery_test.go`). Concretely: open a store, perform a
   write, copy `pet.db` to a "known good" reference, perform a *second* write, then
   truncate or corrupt `pet.db` mid-way (simulating the yank) and call `Open` again.
   Assert the state recovered includes the *second* write, not just the first — that's
   the difference between what exists today and what this task adds.
3. **Rehearse an actual hot-swap** if you have two USB sticks: assemble two drives (per
   `drive-root/` and the launcher layout — `paths.DriveRoot()`'s comment explains the
   expected layout), start the app from key A, make progress, physically yank it,
   plug in key B, start the app from key B. Confirm key B behaves like an independent,
   correct save file (it should — each key has its own `data/pet.db`) and that
   re-plugging key A afterward still opens cleanly with its progress intact. This is as
   much a rehearsal as a test; write down what you find in `DECISIONS.md`.

## Hard constraints — these are not negotiable

- **Do not change the AST contract (`packages/ast/`) or the key protocol (§7 schema).**
  The schema itself doesn't need to change — `backup.db` already exists as a concept in
  brief §7. This is a durability fix to *when* it gets refreshed, not a new file format.
- **No new runtime dependencies.** Everything needed here is `os`, `path/filepath`, and
  what `internal/store` already imports.
- **Every fix needs a test**, and per the note above, the corrupt-at-rest tests already in
  `recovery_test.go` don't cover this gap — write the interrupted-write test described
  above, don't just extend coverage of what's already covered.
- **This task owns `internal/store/*`.** Nothing else on the collision map claims it, so
  there's no coordination needed before starting — but if task 04 (stars) is running at
  the same time, expect to both touch `store.go`; coordinate directly rather than both
  guessing at how the other's changes will merge. Per `handoff/README.md`'s sequencing
  note, task 04 is meant to run *after* this one, not concurrently.

## Do not touch these files — they are being actively edited

`web/src/pet/*`, `web/src/App.tsx`, `web/src/PlayPage.tsx`, `web/src/HomePage.tsx`,
`web/src/index.css`, `web/src/tokens.css`, `cmd/server/main.go`, `internal/paths/*`.

(`internal/store/*` is this task's own territory — see above.)

## Working rules for this repo

- Log decisions in `DECISIONS.md` and open questions in `QUESTIONS.md`, appending to the
  end. Both files are append-heavy and shared, so keep to your own section and expect to
  resolve a merge conflict there rather than anywhere else.
- **Work on a branch** (`key-hotswap`) and open a PR rather than pushing to master, so the
  two streams never fight over the same history.
- Commit per milestone with a real message explaining *why*.
- **Never add yourself or Claude as a commit co-author.**

## Acceptance — you are done when

1. A new test reproduces the exact gap described above (progress made *after* the last
   backup refresh survives a simulated yank) and fails against the current code, then
   passes against your fix.
2. `backup.db` is demonstrably refreshed after a write, not just at startup — assert its
   mtime/contents change across a `SaveState` or `RecordLevelAttempt` call in a test.
3. All existing tests in `internal/store` still pass — you are not allowed to weaken or
   delete `recovery_test.go`'s coverage to make this easier.
4. If you rehearsed a real two-key swap, the outcome (what worked, what surprised you) is
   written up in `DECISIONS.md`.
