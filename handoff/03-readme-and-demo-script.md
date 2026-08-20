# Handoff: README and an honest demo script (a judge's first contact)

**Paste this whole file into Claude Code on your machine.** It is written to be run
independently, in parallel, without touching anything the other workstream is editing.

## Why this one

This repo is public and being judged, and **it has no README at all.** A judge's first
contact with a hackathon repo is the README — right now there is nothing there. This
task has zero collision risk (it only touches new/root-level docs) and is the highest
value-per-hour item available: no code, no merge risk, and it forces whoever presents to
actually rehearse the demo rather than discover a broken beat on stage.

## What already exists (read these first, don't re-derive their contents)

- **`PLAN.md`** — the original architecture writeup and M1 milestone scoping. Section 1
  ("Architecture, restated in my own words") is close to README-ready prose already.
- **`AUDIT.md`** — the pre-hackathon audit. Section 7, "Test coverage on the §13
  demo-critical path," contains the authoritative, verified table of what's actually
  built vs. not. Quoted in full below so you don't have to go hunting for it:

  | §13 step | Built? | Automated coverage |
  |---|---|---|
  | 1. Router unplugged / offline | Yes | Manual audit only (bundle grep + live network capture) — no automated regression test |
  | 2. Pip appears, level 4, orange, wearing a hat | No — evolution art/cosmetics not built | n/a |
  | 3. Camera reads cards | No — Hub Mode not built | n/a |
  | 4. `off_by_one_repeat` mistake → hint citing prior history → fix → solve | Yes — core demo beat | Partial — classification is tested; nothing end-to-end proves the hint prompt actually carries the "made this mistake N times before" clause |
  | 5. Buy a cake, pet evolves | Half — the cake is buyable and eating it plays a real animation, but buying it does **not** trigger evolution (evolution is still solely driven by levels solved) | n/a |
  | 6. Key A out / key B in | No — hot-swap not built (see `handoff/02-key-hot-swap.md`) | n/a |
  | 7. Tier pill resizes on a bigger machine | Yes | Yes |
  | 8. Closing numbers | n/a | n/a |

  **By the time you write this, steps 2, 3, 5, or 6 may have merged** (parallel tasks
  01/02/05 target exactly those gaps). Before you write the demo script, check
  `handoff/README.md`'s task table and `git log` for merged branches, and re-verify each
  step's status yourself rather than trusting this table blindly — it was accurate as of
  when this file was written, not as of when you read it.
- **`DECISIONS.md`** — every non-obvious call made, chronological, append-only. You don't
  need to read all of it, but skim the most recent third for anything that changes the
  picture above.
- **`QUESTIONS.md`** — open items awaiting sign-off. Worth skimming for anything that
  affects what you can honestly claim in the README.
- **`scripts/README.md`** — already documents the build/run scripts accurately
  (`build-launchers`, `fetch-llama-server`, `pi-setup.sh`, `pi-benchmark.sh`). Link to it
  rather than duplicating it.
- **`go.mod`**: module `github.com/ramkirangaruda/Gamified-E-Learning-Platform`, Go
  1.26. **`web/package.json`**: Vite + React + TypeScript, `npm run dev` / `npm run
  build` / `npm test` (vitest) / `npm run lint` (oxlint).
- Root layout to describe accurately: `cmd/server` (the Go binary), `internal/` (executor,
  store, api, tutor, paths, levels), `packages/ast` (the shared contract), `web/` (the
  React/Blockly frontend), `content/` (levels + hints, JSON), `print/` (the 14 physical
  cards + PDF), `scripts/` (build/prep tooling), `profiles.json` (RAM-tier config),
  `drive-root/` (the assembled USB layout).

## The job

Two deliverables:

### 1. `README.md` at the repo root

Not a wall of marketing copy — a judge should be able to read it in two minutes and know
exactly what this is, how it works, and how to see it running. At minimum:

- **What it is, in two or three sentences.** A gamified offline coding platform for kids
  8–13: physical ArUco-marker cards read by a camera, or a Blockly web UI, both compiling
  to the same program representation and running on a deterministic executor. Progress
  lives entirely on a USB drive — no accounts, no cloud, works fully offline.
- **Architecture, briefly**, pointing at `PLAN.md` for the full writeup rather than
  reproducing it — a diagram or short bullet list of AST → executor → SQLite → local LLM
  tutor is enough here.
- **How to run it** — the actual dev-mode commands (`go run ./cmd/server`, `npm run dev`
  in `web/`, whatever the real current entrypoint is — verify this against `cmd/server`'s
  flags rather than guessing) and how to build/run the assembled drive
  (`scripts/build-launchers`, then `drive-root/Start Tessera Quest.bat`/`.sh`).
- **Hardware/software this was built and measured against**: Raspberry Pi 5 (4GB tier),
  Qwen3 0.6B/1.7B via llama.cpp, the 14-card print set — link to `print/` and
  `scripts/test-detect-cards.py`.
- **What's real vs. what's a known gap**, i.e. an honest, short version of the table
  above — do not oversell. A judge who tries step 6 and finds it doesn't exist yet is a
  worse outcome than a README that said so upfront.
- License/attribution if applicable (check if one exists at the repo root — it doesn't as
  of this writing; flag in `QUESTIONS.md` if you think it needs one rather than picking
  one yourself).

### 2. A rehearsed, honest demo script

A short, separate document (`DEMO.md` at the root, or a section in the README — your
call, log which) that a presenter can actually follow on stage. For each of the 8 steps
in `AUDIT.md`'s table:

- State plainly whether it's real or not, **as of when you check, not as of this file's
  table above.**
- For real steps: the exact sequence of clicks/actions that trigger it, and roughly how
  long it takes (step 4's hint latency, for instance, is benchmarkable via
  `scripts/pi-benchmark.sh`).
- For unbuilt steps: either cut them from the script outright, or note a fallback (e.g.
  "camera reads cards" could become "we'll walk through the Blockly equivalent" if Hub
  Mode isn't ready).
- Call out anything fragile discovered while rehearsing — a level that's slow to load, a
  hint that took longer than expected, anything that would surprise a presenter live.

**Actually run through it** against a real built binary if you can (`go build
./cmd/server`, or the assembled drive) rather than writing the script from documentation
alone — the whole point of this task is catching what documentation doesn't.

## Hard constraints

- **Do not change any code.** This is a documentation task. If you find something you
  believe is actually broken (not just undocumented), log it in `QUESTIONS.md` rather
  than fixing it — that's someone else's task to pick up.
- **No copyrighted or brand assets, no invented claims.** Every capability claim in the
  README should be traceable to something in the repo (a test, a script, a working
  feature) — don't describe aspirational behavior as if it exists.

## Do not touch these files — they are being actively edited

`web/src/pet/*`, `web/src/App.tsx`, `web/src/PlayPage.tsx`, `web/src/HomePage.tsx`,
`web/src/index.css`, `web/src/tokens.css`, `cmd/server/main.go`, `internal/paths/*`,
`internal/store/*`.

You shouldn't need to edit any of these for this task anyway.

## Working rules for this repo

- Log open questions in `QUESTIONS.md`, appending to the end.
- **Work on a branch** (`readme-and-demo-script`) and open a PR rather than pushing to
  master.
- **Never add yourself or Claude as a commit co-author.**

## Acceptance — you are done when

1. `README.md` exists at the repo root, is accurate against the current state of the
   repo (not against this brief's snapshot of it), and a person who has never seen this
   project could read it and know what it is, how to run it, and what's real.
2. A demo script exists, has actually been walked through against a real running
   instance, and every step in it is labeled real/cut/fallback honestly.
3. Nothing in either document overclaims — cross-check every "this works" statement
   against an actual test, script, or your own live run, not against a comment claiming
   it works.
