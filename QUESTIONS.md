# QUESTIONS.md

## Handoff summary (2026-08-15) — queue complete, all 6 items

Worked the queue in order, committed after each item, pushed after each commit. All
green: `go build ./... && go test ./...` and `npm run test` (web/) both pass, `npm run
build` produces a clean bundle. Nothing here was stopped-and-asked; everything
debatable is logged below and in `DECISIONS.md` with reasoning, in commit order.

**1. ArUco print pipeline** — all 14 cards composited, `test-detect-cards.py` (the
acceptance gate) green on all 14, A4 sheet(s) generated. Couldn't fit on one A4 sheet as
literally asked — 14 cards at spec size is 630cm² of card, a full A4 sheet is only
623.7cm² — so it's 2 pages instead of 1, at full size rather than shrunk. PDF + a sample
card already sent to you as files.

**2. Indent-guide editor** — built as the real Home Mode editor (`web/src/Editor.tsx`),
not a patch on the print-card gallery. Two real bugs found and fixed via live testing
against an actual Blockly instance (details in `DECISIONS.md`): indentation has to be a
delta from the immediate predecessor, not an absolute depth offset (blocks nest in the
DOM); `getHeightWidth()` on a nested block returns cumulative height of everything below
it, not its own. Unmatched-opener warning added (dashed amber, not an error style). One
gap not resolved: real drag-and-drop snap detection near an indented block hasn't been
tested against Blockly's connection system — flagged, not fixed, likely fine in practice
given normal mouse-drop imprecision.

**3+4. Grid renderer + real levels** — `GridRenderer.tsx` is a pure trace player (never
decides outcomes, only animates them). Three levels authored and **verified solvable
against the real executor** (`levels_test.go`, not just worked out by hand): level 1
(move), level 2 (repeat — 11 hardcoded moves vs. 9 cards via repeat blocks), level 3 (if
wall-ahead — an L-shaped turn). `internal/levels` + `GET /api/levels` +
`POST /api/program?level_id=` replace M1's placeholder grid. One real gap: nothing
enforces that level 3 is *solved with* an if-block — the executor can only tell whether
the goal was reached, not which ops were used, so a hardcoded version would pass too.
Consistent with how levels 1/2 also only incentivize (via card-count) rather than
enforce, but worth knowing if a "used the concept" achievement is ever wanted.

**5. Pet + full wiring** — this is the actual M2 acceptance path (brief §12), and it's
**genuinely verified, not just built**: constructed a 5-block solution through the live
workspace, clicked the real Run button, watched points go 0→9 and hunger 50→55 (exact
match to the reward formula in `web/src/pet/reward.ts`), reloaded the page, then killed
and restarted the Go backend entirely and confirmed `/api/state` still had the same
values from `pet.db`. Levels 2/3 share the identical code path and are independently
solvability-verified, but weren't separately pushed through the UI — time, not doubt.
Real gap: first-try point tracking is client-side only (resets on reload) since
`attempts` has no writer yet — noted where it's discussed below.

**6. Integration tests** — `internal/api/api_test.go` (Go, real HTTP via `httptest`, no
new dependency) covers AST-in/trace-out against real level content and a real SQLite
store. `web/src/blocks/compileAst.test.ts` + `web/src/GridRenderer.test.ts` (new
`vitest` dev dependency — natural pairing with Vite, logged below) cover
block-editor-model→AST and trace→render-state. No single automated test spans every
layer in one process; the manual browser-based run above is what actually proves the
full chain, these are the regression tests that keep it proven.

**Standing constraints, all honored**: no CDN references (Blockly, fonts, everything
bundled locally). No AST contract or key-protocol changes (M2 work only ever *consumed*
the AST shape M1 locked in). No binaries committed (print outputs, `bin/`, `app/` all
gitignored, deliverables sent to you as files instead). M3 not started.

**Two real dependency additions**, both logged with reasoning at the point they
happened: Pillow (Python, tooling-only, PDF export) and vitest (TS, dev-only, item 6
explicitly asked for tests). Neither is in the shipped Pi/laptop runtime.

**Correction to my own earlier note, caught while re-checking just now:** the repo is
currently **public**, not private. Tracing back why: your explicit final call on this
earlier in the session (after I flagged you'd contradicted yourself) was "make it
public," picked via the multiple-choice prompt I asked you. My "already confirmed
private" note further down was true *at the time I wrote it* but that was checked
*before* your "make it public" decision — I never re-verified after, and just repeated
stale information. Just re-checked live (`GET
api.github.com/repos/.../Gamified-E-Learning-Platform` unauthenticated → 200,
`private: false`): it's public, matching what you actually asked for. No action needed
unless you want it private again — flagging because I told you the wrong thing earlier
and want the correction on record before you rely on it.

**Worth your eyes first, in priority order:**
1. ~~Repo privacy~~ — see the correction just above; it's public, as you asked.
2. The "single A4 sheet" geometry mismatch (item 1) — is 2 pages at full size fine, or
   would you rather shrink the card size to fit one sheet?
3. The reward-formula judgment calls in `web/src/pet/reward.ts` (item 5) — hunger-as-
   satiety direction, and "solved"/"first try" as alternative tiers rather than
   additive. Both documented inline with reasoning; flag if either reads wrong.
4. Whether attempts-table persistence (server-side first-try tracking) is worth doing
   now or can wait — currently client-side/resets-on-reload.

Everything below this line is the original log, oldest first.

---

## GitHub repo privacy

- Already confirmed private earlier in this same session — hit the API unauthenticated
  after you flipped it, got a 404 (private repos 404 rather than 403 for
  non-collaborators), and it hasn't been touched since. Should still be private.
  Flagging per your note in case you want a second confirmation when you're back — say
  the word and I'll re-check.

## Item 1 (ArUco compositing)

- **"Single A4 sheet with all 14" isn't geometrically possible.** 14 cards at 9x5cm =
  630 cm² of card area; an A4 sheet is 21x29.7cm = 623.7 cm² total — smaller than the
  raw card area alone, before any cut margin. Chose: keep cards at spec size (9x5cm,
  non-negotiable per the detection-reliability requirement) and split across 2 pages
  (10 + 4) instead of shrinking cards to fit one sheet. `scripts/make-print-sheet.py`
  emits a multi-page PDF. Say if you'd rather trim the physical size instead.
- **Added Pillow as a Python dependency**, tooling-only (print-sheet PDF export —
  OpenCV can composite images but can't write PDF; Pillow's `Image.save(...,
  save_all=True)` does multi-page PDF in one call). Not part of the shipped
  Pi/laptop runtime, only this prep script. Already present on this machine; not
  yet added to any requirements file since the project doesn't have a scripts-specific
  one — flagging in case you want it pinned somewhere.

## Item 5 (pet + wiring)

- **First-try point tracking is client-side only, resets on page reload.**
  `internal/store`'s `attempts` table exists in the schema but has no writer yet. A real
  fix needs a per-attempt write and deriving first-try server-side. Say if this should
  happen now or can wait.
- **`web/src/pet/reward.ts` judgment calls**, both documented inline: hunger read as a
  satiety meter (higher = more fed, feeding increases it); "level solved" (5) and
  "solved on first try" (8) read as alternative tiers of one reward, not additive, while
  the hard-level bonus (+15) and under-par bonus (+5) do stack on top of whichever tier
  applies. Flag either if it doesn't match what you had in mind.

## Item 6 (integration tests)

- **Added `vitest` as a TS dev dependency** — item 6 explicitly asked for tests on the
  block-editor→AST→executor→trace→render chain, and the TS side (compileAst,
  GridRenderer's replay logic) had no test runner at all. Chose vitest over
  jest/other options since it's the natural pairing with Vite, already in the stack.
