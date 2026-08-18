# Demo script — honest, as of 2026-08-18

Eight steps, matched to the original brief's §13 demo script. Each is labeled **real**,
**half**, or **cut**, based on what's actually merged to `master` today — not on any
earlier planning document. Rehearse this yourself before presenting; see the note at the
bottom on what this pass could and couldn't verify live.

## 1. Router unplugged / offline — **real, unpolished proof**

**What to do:** before the demo starts, unplug the network cable / turn off Wi-Fi (or
just say so — nothing in the app checks for a live connection). Play normally.

**Why it's true:** verified by a bundle grep for outbound calls plus a live network
capture taken *during* an actual in-flight hint request — the only established
connection was loopback, both ends `127.0.0.1` (`DECISIONS.md`). There is no automated
regression test for this, so if anything changes upstream (a new dependency that phones
home, say) it wouldn't be caught by CI. Worth a manual sanity check the morning of the
event, not just trusting this document.

## 2. "Pip appears, level 4, orange, wearing a hat" — **cut**

Evolution art and cosmetics were never built — the pet's evolution *stage* is tracked
internally as levels are solved, but there's no art asset that changes with it, and no
hat. Cut this beat entirely rather than gesture at something that isn't visible. If it
lands before the event (`handoff/05-pet-evolution-art.md` is the open task for it),
re-add it.

## 3. Camera reads the cards — **real, but rehearse this one specifically before trusting it on stage**

**What to do:** lay out a row of the printed cards, point a laptop webcam at them, run
`python -m hub.hub --level-id <id>` from `hub/`. It detects the ArUco markers, builds the
program, and posts it to the running server — same as clicking Run in the browser.

**Why the caveat:** this merged on 2026-08-18 (`hub-mode` branch, PR #1) and is
code-complete with a full test suite, but three specific things are flagged in
`DECISIONS.md` as not yet proven for real:

- The integration test that starts a real server and solves a real level via a posted
  camera program has never actually been run — the machine it was written on had no Go
  toolchain, so it `pytest.skip`s rather than faking a pass. Run
  `python -m pytest hub/tests/test_integration.py -v` yourself (needs `go` on `PATH`)
  before trusting acceptance on this one.
- Detection was tested against synthetic composited cards generated in-test, not the
  actual printed-and-laminated `print/composited/*.png` set.
- Nobody has pointed a real, physical webcam at the real printed cards yet — only
  synthetic in-memory photos.

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

## 6. Key A out, key B in — **cut**

Hot-swap and crash-safe writes during a live session were never built (scoped to M4 in
`PLAN.md`, still open — `handoff/02-key-hot-swap.md`). What exists is narrower: a
`pet.db` that's *already* corrupt when the app starts recovers instead of refusing to
boot. That is not the same as surviving a yank mid-session. **Do not physically pull the
drive on stage** — the failure mode this step is supposed to demonstrate resilience
against is exactly the one that isn't handled yet. Cut this beat until it's built.

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
step 4's and step 7's confidence comes from. What it does *not* include is a fresh live
run of the full Go server performed as part of writing this document: the environment
used to write this had no access to the Go module proxy (a sandboxing restriction, not a
repo problem), so `go build`/`go run` couldn't be exercised here. The TypeScript side
was run for real — `npm test` (58/58 passing) and `npm run build` (clean, builds into
`app/` as `cmd/server` expects) — but the Go-side and the camera pipeline's live behavior
still need a real walkthrough on a machine with both toolchains before this script goes
on stage. Treat this document as a strong starting point for rehearsal, not a substitute
for it.
