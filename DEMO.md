# Demo script — honest, as of 2026-08-20

Eight steps, matched to the original brief's §13 demo script. Each is labeled **real**,
**half**, or **cut**, based on what's actually merged to `master` today — not on any
earlier planning document. Rehearse this yourself before presenting; see the note at the
bottom on what this pass could and couldn't verify live.

> **Corrected 2026-08-20.** The first version of this file was written on 2026-08-18
> and went stale within a day: steps 2 and 6 were both graded **cut** against handoff
> tasks that have since merged, and the companion was renamed and then grew into a
> roster of seven selectable characters. Confirmed with `git merge-base` — the
> evolution-art commit is *not* an ancestor of this file's last edit — rather than by
> re-reading the old text and trusting it. Steps 2 and 6 are re-graded below; step 5
> was re-checked against `internal/api/api.go` and its original grade still holds.

## 1. Router unplugged / offline — **real, unpolished proof**

**What to do:** before the demo starts, unplug the network cable / turn off Wi-Fi (or
just say so — nothing in the app checks for a live connection). Play normally.

**Why it's true:** verified by a bundle grep for outbound calls plus a live network
capture taken *during* an actual in-flight hint request — the only established
connection was loopback, both ends `127.0.0.1` (`DECISIONS.md`). There is no automated
regression test for this, so if anything changes upstream (a new dependency that phones
home, say) it wouldn't be caught by CI. Worth a manual sanity check the morning of the
event, not just trusting this document.

## 2. Pet appears, level 4, wearing a hat — **real** (re-graded 2026-08-20, was "cut")

**What to do:** solve enough levels to cross an evolution threshold and let the pet's
stage art appear on screen.

**Why it changed:** evolution art landed *after* this script was first written.
`handoff/05-pet-evolution-art.md` merged on 2026-08-19 (commit `13e8f0e`, "Give the pet
real evolution stage art and a real stage writer") and was verified live in a real
browser — see `DECISIONS.md`. The evolution *stage* is no longer only tracked
internally; it renders as an additive hat/badge/aura layer over the character's sprite.
The original "cut this beat entirely" instruction is obsolete — play it.

**Two things in the original wording are now wrong, though.** The companion is not
"Pip" any more, and there is no one colour to promise. The roster is **seven** selectable
characters (`web/src/pet/characters.ts`), picked on the settings screen, and the
evolution layer is the same additive art over whichever one the child chose. Say "your
pet" and name whichever character is actually on screen — don't script a specific name
or a specific colour into the line.

**What still isn't claimable:** evolution is driven *solely* by levels solved
(`internal/api/api.go`, `AdvanceEvolutionStage(evolutionStageFor(len(solvedIDs)))`).
See step 5 — feeding the pet does not cause it.


## 3. Camera reads the cards — **real, but rehearse this one specifically before trusting it on stage**

**What to do:** lay out a row of the printed cards, point a laptop webcam at them, run
`python -m hub.hub --level-id <id>` from `hub/`. It detects the ArUco markers, builds the
program, and posts it to the running server — same as clicking Run in the browser.

**Why the caveat:** this merged on 2026-08-18 (`hub-mode` branch, PR #1). Two of the three
gaps flagged at merge time are now closed, verified on a machine with a Go toolchain and
the real card set (see `DECISIONS.md`'s "Verified `hub-mode` after merge" entry):

- ~~The integration test had never actually been run~~ — **run for real now**: a live
  `go run ./cmd/server`, a camera-derived program posted to the real `/api/program`,
  `level-1` actually solves. (Getting this far required fixing an unrelated pre-existing
  bug in `internal/paths.DriveRoot()` that broke `go run` outright — also in
  `DECISIONS.md`.)
- ~~Detection was only tested against synthetic placeholder cards~~ — **all 14 real,
  printed `print/composited/*.png` cards now confirmed detecting to their correct ids.**
- **Still open:** nobody has pointed a real, physical webcam at the real printed cards
  yet — every check so far has been against still images, not a live camera feed.
  **As of 2026-08-20 there is no camera hardware on hand to close this with**, so plan on
  this staying open unless one is sourced before the event. Budget for the fallback below
  rather than assuming a rehearsal slot will fix it.

None of this means it's broken — the ArUco detection and AST-building logic is real and
directly reused from the already-verified print pipeline — but this is the one step
where "code exists and is tested" and "has been seen working with a camera and paper on
a desk" are still two different claims. If you can't get a clean run in rehearsal, the
honest fallback is: "here's the same program on the physical cards" shown side by side
with the Blockly equivalent already running, rather than pretending the camera path is
proven.

## 4. `off_by_one_repeat` → hint citing prior history → fix → solve — **real, the strongest beat**

**What to do:** on a repeat-teaching level, submit a program with the classic off-by-one
mistake (one too many or too few iterations) twice in a row, then request a hint the
second time. The hint should acknowledge the repeat mistake specifically, and should open
with something like *"This one's caught you before!"* before the actual hint text. Fix
it and solve.

**Why it's trustworthy:** this is the one step with genuine end-to-end automated
coverage (`internal/api/api_test.go`, asserting the literal string `"made this mistake 1
time(s) before"` reaches the model prompt after two real attempts through the real HTTP
path) *and* multiple logged live runs against real model weights (`DECISIONS.md`,
2026-08-15/16/17 entries) — most recently returning the hint in ~860ms–1060ms on the
0.6B tier, cached on immediate repeat. The history-acknowledgement clause is prepended
deterministically to fixed, human-written text rather than left to the small model to
remember to say (five consecutive real generations dropped it when it *was* left to the
model — logged in `AUDIT.md` P1-5 and fixed).

**Timing:** benchmark real hint latency on your actual hardware beforehand with
`scripts/pi-benchmark.sh <url>` — it hits `/api/hint` 20 times with forced cache misses
and reports p50/p95/max, and flags if anything approaches the 8s hard timeout.

## 5. Buy a cake, pet evolves — **half; don't claim the second half**

**What to do (if you use it at all):** earn 25+ points, open the treat shop, buy and
feed the cake. A real eating animation plays and hunger updates.

**What not to claim:** buying or feeding the cake does not trigger pet evolution —
evolution stage is still driven solely by levels solved, wired independently of the
shop. If the script needs "buy a cake, pet evolves" as a single visible beat, it isn't
built yet; either cut the shop moment entirely or reframe it honestly as "here's the
economy" without promising evolution follows from it.

## 6. Key A out, key B in — **half** (re-graded 2026-08-20, was "cut")

**Why it changed:** `handoff/02-key-hot-swap.md` merged on 2026-08-19 (commit `30a95f0`).
`backup.db` now re-snapshots after **every** progress-bearing write — `SaveState` and
`RecordLevelAttempt` — instead of only once at `Open`. That was the real gap: a level
solved mid-session had no recovery snapshot until the process happened to restart, so a
yank right after a solve rolled that solve back even though the recovery machinery
itself "worked". Proven three ways, including a test confirmed to *fail* on the pre-fix
code before being confirmed to pass after (`TestOpen_ProgressAfterLastOpenSurvivesAYank`,
plus two asserting `backup.db`'s bytes actually change across a second write). Full
writeup in `DECISIONS.md` 2026-08-19.

**What is still not proven, and why this is "half" and not "real":** nobody has
physically pulled a drive mid-session and plugged a second one in. The durability
mechanism is tested under *simulated* corruption, not under a real yank on real
hardware — `DECISIONS.md` says so in as many words.

**Still do not pull the drive on stage** unless you have rehearsed exactly that first.
The difference from the old grade is that this is now "built and tested, unrehearsed on
hardware" rather than "not built" — a much shorter distance to close, but not zero. If
you get one rehearsal slot before the event, spend it here or on step 3.


## 7. Tier pill resizes on a bigger machine — **real, but check your Pi's RAM tier first**

**What to do:** run the same key on the Pi hub, note the tier pill (e.g. "Pi mode ·
0.6B"), then plug it into a laptop and note it change (e.g. "Laptop mode · 1.7B").

**One thing to check before the event:** RAM-based tier selection is a hard 6144MB
threshold with no per-device override baked in. An 8GB Pi 5 will select the *high* tier
on its own, which would make the Pi run the slow model and undercut the entire contrast
this step exists to show (logged as `AUDIT.md` P1-4, deliberately not code-fixed).
`profiles.json` already gives you the lever: if your Pi has 8GB, raise
`tiers.high.trigger.min_ram_mb` in *that copy* of `profiles.json` so it's pinned to low.
Confirm which Pi you're actually bringing before the event, not on stage.

## 8. Closing numbers — n/a

Whatever the presenter wants to say to close — nothing in the codebase to verify here.

---

## What this pass could and couldn't verify live

This script was written by reading the code, the existing test suites, and every
relevant entry in `DECISIONS.md`/`AUDIT.md`/`QUESTIONS.md` — including several already-
logged live runs against real model weights and a real built binary, which is where
step 4's and step 7's confidence comes from. The TypeScript side was run for real —
`npm test` (58/58 passing) and `npm run build` (clean, builds into `app/` as
`cmd/server` expects). The Go side and the camera pipeline's live behavior were *not*
available in the sandbox this document was originally written in (no route to the Go
module proxy) — but have since been run for real on a machine with both toolchains, at
merge time: `go build ./...`/`go vet ./...`/`go test ./...` all clean, and step 3's
camera pipeline actually posted a real program to a live server and solved level-1 (see
`DECISIONS.md`). The one thing still genuinely unwalked end-to-end is a live webcam
pointed at real printed cards, and a full presenter run-through of all eight steps back
to back. Treat this document as a strong starting point for rehearsal, not a substitute
for it.
