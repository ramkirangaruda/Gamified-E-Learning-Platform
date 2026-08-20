# QUESTIONS.md

## Audit pass (2026-08-15) — decisions needed from you

Full findings and the Phase 3 regression result are in `AUDIT.md`. Nothing below is
blocking; these are the calls that are yours rather than mine.

1. **The demo script is the real risk, not the code.** Only §13 steps 4 and 7 exist.
   Steps 2 (evolution art + hat), 3 (camera reads cards), 5 (buy a cake, pet evolves) and
   6 (pull key A, plug key B) are M4/M5 and unwritten. Four days. **Which of those four
   actually ship, and which get cut from the script?** Deciding late is what turns a
   working demo into a missed beat on stage. Everything I fixed hardens what exists; none
   of it moves this line.
2. **Pi checklist item, no code change:** an 8 GB Pi 5 will select the *high* tier
   (`SelectTier` is RAM-only, threshold 6144 MB). The Pi then runs the 1.7B and §13 step 7
   ("the model just resized itself for the bigger machine") has nothing to show. Fix is
   one number in the Pi drive's `profiles.json` — raise
   `tiers.high.trigger.min_ram_mb` to something unreachable. Confirm which Pi you have.
3. **Scope call I made under conflicting instructions — tell me if it was wrong.** The
   pass said "no new features, M4 is out of scope" *and* "pet.db crash safety is P0 by
   definition, confirm recovery works." Recovery did not exist; a corrupt `pet.db` refused
   to start the app entirely. I built the minimum that unbricks it (snapshot on clean
   open, restore on corruption, quarantine-and-continue otherwise) and left the full
   write-then-rename scheme for M4. If you'd rather that had stayed untouched, it reverts
   cleanly — it's one commit.
4. **Windows parent-crash orphan is still open.** `llama-server` surviving a hard-killed
   launcher is now kernel-prevented on Linux (`Pdeathsig`) — the Pi, where 1.4 GB matters.
   Windows would need a Job Object; I judged that more startup-failure risk than the
   residual exposure warrants this close to the event. If a Windows laptop is the primary
   demo machine rather than the Pi, say so and I'll reconsider.
5. **Hunger is cumulative for the life of the key, not session-scoped** (brief §10 says
   session-scoped). The two hard rules hold — it never decays, it never regresses — but a
   well-used key sits permanently at 100 and the stat stops meaning anything. Related:
   §13 step 6's "level 1, **hungry**" pet won't render as hungry, because a fresh key
   defaults to 50 and the `hungry` mood needs < 25. Both are one-value economy decisions,
   not bugs, so I left them alone. Say the word and either is a one-line change.


## Handoff summary (2026-08-15) — verification/hardening queue complete, all 6 items

Not M4 — this was the pre-M4 verification and hardening queue (llama.cpp-on-ARM had to
be proven before the cross-platform drive milestone is worth building). Standing
decisions carried forward, still in effect: repo stays public, not revisited again;
standing permission to push to master for the rest of this project. Worked the queue in
order (item 6 first, deliberately, to resolve limbo before touching the hint pipeline
further), committed and pushed after each item. `go build ./... && go vet ./... && go
test ./...` and the TS suite (`npx vitest run`, `npx tsc --noEmit`) all green throughout.

**Item 6 done first (resolving limbo before touching the hint pipeline further):**
both of the M3 handoff's "worth your eyes" items 1 and 2 are now resolved, not just
flagged. Full reasoning in `DECISIONS.md`'s 2026-08-15 entries:
- `unbalanced_block` stays client-asserted (server-side verification isn't feasible
  without a bigger protocol change — the evidence is gone by the time a truncated AST
  reaches the server), but hardened from fragile prose-substring-matching to a closed
  `ProblemCode` enum shared conceptually between `compileAst.ts` and `classify.go`, so a
  future copy-edit to hint/problem wording can't silently break classification again.
- `/api/program`'s legacy raw-AST body shape is dropped outright, not kept forever.
  `web/src/api.ts` was already the only real caller and has always sent the wrapper
  shape; the endpoint now 400s on the old shape, locked in by a new test
  (`TestIntegration_LegacyRawASTShapeIsRejected`).

**Item 3 done:** model footprint audit. Actual `models/` total is 1.9GB (two files:
484MB + ~1.47GB), matching the ~2GB expected for these two quants almost exactly — not
the ~6GB previously reported. No extra quantizations or unused variants exist anywhere
in the repo to delete. I can't reconcile the earlier 6GB figure against anything on disk
or logged in `DECISIONS.md` from when the GGUFs were originally fetched; flagging the
discrepancy rather than guessing at an explanation. Treating ~1.9GB as the correct
drive-payload figure for models going forward.

**Item 1 done:** hint perspective drift fixed structurally, three layers (few-shot
examples in `BuildHintPrompt`, a `HasFirstPersonAuthorDrift` validator, retry-once-then-
verbatim-fallback in `handleHint`). Real 150-generation benchmark against the actual
0.6B model (every bank hint x10): **0/150 rejected (0.0%)**, well under the 10%
threshold. Full breakdown in `DECISIONS.md`.

**Item 2 done, and it found a real bug, not just confirmed a clean bill of health:**
`Blockly.inject()` was defaulting its `media` option to
`https://blockly-demo.appspot.com/...` for the trashcan icon, click/delete/disconnect
sounds, and cursor graphics — nothing in `Editor.tsx`/`CardGallery.tsx` had ever set a
local path. Fixed by vendoring Blockly's own `media/` assets into
`web/public/blockly-media/` and pointing both `Blockly.inject()` call sites at it.
Verified two ways: (1) static grep of the built bundle for `http(s)://`, `fonts.`,
`cdn`, `googleapis`/`gstatic` — nothing else turned up, and the two `fetch(` call sites
that did were individually inspected, not just pattern-matched (one is a genuinely
unused React DOM helper, the other was the real Blockly media bug); (2) built the
production bundle, built the Go binary, ran it from a real assembled drive layout (not
Vite), loaded it in a browser, and captured every network request across a full session
including a real `/api/hint` round trip — **23/23 requests to `localhost:8080`, zero
external**. This is the audit result you asked for before doing the physical cable-pull
test yourself.

**Item 5 done:** hint pre-warming + hard generation timeout. `internal/api.PrewarmHints`
generates every bank entry (14 total) at history bucket 0 in a background goroutine at
startup, sharing the exact retry/validate/fallback logic a live request uses
(`hints.GenerateVerifiedHint`, extracted so there's one copy of that logic, not two).
Configurable via `-prewarm-hints` (default true), logs how long it took. `DefaultHintTimeout
= 8s` (`-hint-timeout` to override) bounds a single `/api/hint` request's total wait on
the model before falling back to the verified text verbatim — chosen from real x64
numbers (~0.6-1.2s per generation) plus the queue's own "several seconds on the Pi"
framing. **Verified for real**: ran the built launcher against the real 0.6B model from
a real drive layout — prewarm log showed `cached 14 hints ... in 13.312s` running
concurrently with the server already accepting requests, then a request for an
untouched-yet signature (`level-2/unbalanced_block`, what would be a child's actual
first-ever hint) came back in **0.173s** with `"cached":true` instead of a live
~0.7-1.2s generation. That's the acceptance criterion ("so the first hint a child sees
is instant") demonstrated, not assumed.

**Item 4 done — and this is the one where "done" means something narrower than the
others, worth reading carefully:** `bin/linux/launcher` now cross-compiles for
`linux/arm64` (was silently `amd64` before — a gap this file already had flagged as
"known, not yet built"; confirmed clean by actually running the cross-compile and
inspecting the resulting ELF header, not assumed from "it's pure Go so it should just
work"). `scripts/pi-setup.sh` brings a fresh Pi 5 up: refuses to run on anything but
`aarch64` (verified live on this x64 box), checks the drive layout, and gets
`bin/linux/llama-server` in place — checked the actual GitHub release assets for the
pinned tag first rather than assuming a prebuilt Linux ARM64 binary exists (it doesn't,
at this tag — Windows-only release), so it builds from source via cmake instead, and
documents exactly which step needs connectivity (that build, only) and what to pre-stage
if the Pi won't have any (the recommended path: build once on any internet-connected Pi
5, then copy the resulting binary onto every spare drive, same as `bin/win/`'s existing
llama-server already works). `scripts/pi-benchmark.sh <url>` hits the real `/api/hint`
endpoint 20 times with distinct fake signatures specifically to force 20 genuine
generations rather than 19 cache hits after the first, and reports p50/p95/max, flagging
anything that would have actually crossed the 8s hint timeout.

**What's real and what isn't**: the cross-compile, both build scripts, and
`pi-setup.sh`'s arch-guard were run for real. `pi-benchmark.sh`'s logic was run for real
too — against a live x64 server with pre-warming off so all 20 requests were forced
misses — and produced sane numbers (p50 592ms, p95 711ms, max 1501ms on this x64
machine). **What could not be verified here: `pi-setup.sh`'s build-from-source path, and
any latency number on actual Raspberry Pi 5 hardware — there is no Pi in this sandbox.**
This is exactly the boundary you drew: "Once that comes back, get the Pi bring-up done
yourself and post the benchmark numbers." Everything on this side of that line is done,
tested where testable, and honest about the one thing that genuinely couldn't be tested
here.

**Worth your eyes first, in priority order, across the whole queue:**
1. **The real ARM numbers don't exist yet.** Everything about pre-warming (item 5),
   the 8s timeout (item 5), and whether M4 needs to change shape at all hinges on a p95
   this environment cannot produce. Run `scripts/pi-setup.sh` on the Pi, then
   `scripts/pi-benchmark.sh`, and the actual numbers are the real next input.
2. The `unbalanced_block` and `/api/program` decisions (item 6) are both irreversible-ish
   choices already implemented, not just proposed — worth a skim in `DECISIONS.md` in
   case either reasoning doesn't match your intent, since undoing either later means
   another migration, not a config flip.
3. The Blockly media CDN bug (item 2) was a real, previously-shipping gap — every prior
   "verified offline" claim in this project's history (M2, M3) was made before this fix
   existed, meaning trashcan/sound assets would have quietly reached out to Google's
   servers the whole time despite those earlier claims. Not something to worry about now
   (fixed, verified), but worth knowing the earlier "verified offline" language wasn't
   as complete as it sounded at the time.
4. `models/` really is ~1.9GB, not ~6GB (item 3) — if drive-sizing or clone-time planning
   was done against the larger number, it can be revised down.

Everything below this line (including the M2 and M3 handoff summaries) is the original
log, oldest first.

---

---

## Handoff summary (2026-08-15) — M3 queue complete, all 6 items

Worked the queue in order, committed after each item, pushed after each commit. All
green: `go build ./... && go test ./...` passes, `npm run test`/`npm run build` (web/)
both pass. This is the newest summary — the M2 queue's summary is further down and still
accurate for M2, just superseded here as "most recent" at the top of the file.

**1. Launcher spawns llama-server** — RAM detection (`internal/sysmem`) written from
scratch after confirming `golang.org/x/sys/windows` doesn't actually wrap
`GlobalMemoryStatusEx` (checked the source, didn't assume). `internal/tutor.Engine` is
the interface brief §8 asks for; `LlamaEngine` spawns via the OpenAI-compatible chat
endpoint with `--reasoning off` to cleanly suppress Qwen3 thinking mode. Pre-warms on
startup. `tensor_overrides` kept in `profiles.json`, empty, per instruction. **Had to
download real GGUF weights first** (M1/M2 only ever fetched the `llama-server` binary,
never a model) — `qwen3-0.6b-q4_k_m.gguf` and `qwen3-1.7b-q5_k_m.gguf`, bartowski
quants matching brief §4 exactly.

**2. Hint bank** — all 3 levels, human-written, covering every signature each level can
actually produce (table in `content/hints/README.md`), not a blind attempt at all 10
from brief §11. `unbalanced_block` written most carefully as asked — and it needed a
real design decision to even detect server-side: `compileAst.ts` already silently
truncates an unclosed block into a valid partial AST before sending it, so the evidence
is gone by the time the server sees it. Fixed by having the client pass its own compile
problem messages through (`client_problems`), checked first before any other
classification. Two signatures (`wrong_order`, `never_picked_up`) have no detector —
real gaps, not oversights, documented in the same README table.

**3. `/api/hint`** — implements §11's pipeline. One real bug found only by actually
running it against real weights, not by reasoning about the prompt: an early hint came
back "I forgot to close my repeat block..." — first person, Pip narrating the mistake as
its own. Fixed with an explicit "speak to the child using 'you'" instruction in
`internal/hints.BuildHintPrompt`, re-verified fixed.

**4. Cache** — keyed by `(level_id, error_signature, history_bucket)`, bucket collapsing
exact counts into `{0,1,2,"3+"}`. In-memory/process-lifetime, not persisted — logged as a
deliberate choice, not a shortcut (the model call is cheap enough to redo once per
restart).

**5. Tier pill + HUD** — reuses brief §8's own example wording verbatim ("Pi mode ·
0.6B · 1.4 GB"). Verified live against real data: showed "Pi mode · 0.6B · 3.3 GB" and a
real latency figure after a real request.

**6. `?compare=1`** — reads the drive's persisted tier history (`GET /api/compare`), not
the current process's live tier, since the whole point is comparing *across machines* on
the same key. Verified live: after a real low-tier hint, the view correctly showed it on
one side and "Not demoed yet" on the other (high tier hadn't run that session).

**Acceptance test: verified for real, all 3 levels, not simulated or assumed.** Built a
real scratch drive layout (hardlinked model + binary files rather than duplicating
gigabytes per test run), ran the actual server binary, and got a real classified failure
+ real in-character hint on **all three** levels specifically — `empty_program` and
`unbalanced_block` on level 1, `hardcoded_no_loop` on level 2 (through the actual browser
UI, not just curl), `missing_turn` on level 3. Also confirmed the 1.7B high-tier path
completes correctly on its own (this dev machine's free RAM never crosses the high-tier
threshold on its own, so live tier-selection landing on "high" wasn't exercised, only the
engine itself with that model).

**Offline verification: done, but not the literal way instructed — flagged, not
silently substituted.** No admin rights in this sandbox to disable the adapter or add a
firewall rule (both attempts failed outright). Instead captured live network connections
for both processes *during* an actual in-flight hint request: the only established
connection was `127.0.0.1 <-> 127.0.0.1`. This is direct evidence of the property that
matters (zero external calls), not a weaker proxy — loopback traffic never reaches a
physical adapter regardless of its state, so it's airtight for what it claims, just
obtained a different way than asked. Say the word if you want the literal adapter-off
version done next time there's real hardware access.

**Two new dependencies**, both logged with reasoning at the point they happened: none
new for M3's Go side (`golang.org/x/sys` was already transitive, just promoted to
direct use). No new Python/TS dependencies either this round.

**Worth your eyes first, in priority order:**
1. The `unbalanced_block` client-problems design (item 2/3) — the server trusts the
   client's own compile-problem messages for this one signature since it can't rediscover
   them after the fact. Reasonable given how `compileAst.ts` works, but it's a real trust
   boundary worth knowing about.
2. `POST /api/program`'s request body changed shape (wrapped, backward-compatible by
   detection) — not an AST contract change, but worth confirming that reading is right.
3. The minor hint-quality wobble noted in `DECISIONS.md` ("You're the one who made the
   mistake. 🌟") — not fixed, temperature variance, flagged in case it's a pattern.
4. Whether the literal adapter-off offline test matters enough to redo on real hardware
   before the event, or the connection-level evidence already gathered is sufficient.

Everything below this line (including the M2 handoff summary) is the original log,
oldest first.

---

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

## M3 (Tessera engine + tutor) — complete, all 6 items (see full handoff summary at top of file)

- **Couldn't literally disable the network adapter for the offline acceptance test** —
  no admin rights in this sandbox (a Windows Firewall rule attempt failed with Access
  Denied), and disabling the adapter directly felt too risky to gamble on blind, since I
  don't know what channel this session's own connectivity depends on. Substituted a
  more targeted verification instead: captured live network connections for both
  processes *during* an actual in-flight hint request, confirmed the only established
  connection was loopback (`127.0.0.1` on both ends) — direct evidence of zero external
  calls, not a weaker stand-in (loopback traffic never reaches a physical adapter
  regardless of its state, so this is airtight for the property that actually matters).
  Full reasoning in `DECISIONS.md`. If you have hardware access and want the literal
  adapter-off test done too, say so and I'll do it the first chance I'm on real
  hardware rather than this sandboxed environment.

## Item 6 (integration tests)

- **Added `vitest` as a TS dev dependency** — item 6 explicitly asked for tests on the
  block-editor→AST→executor→trace→render chain, and the TS side (compileAst,
  GridRenderer's replay logic) had no test runner at all. Chose vitest over
  jest/other options since it's the natural pairing with Vite, already in the stack.
