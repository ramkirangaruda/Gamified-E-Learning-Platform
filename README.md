# Tessera Quest

**The problem this solves: a school with computers and no working internet.** A shared
Raspberry Pi and a stack of USB drives turn a room like that into a computer lab —
every child's entire identity is their own drive, not an account, so there's no
password for a nine-year-old to forget and no server anyone has to keep running. A
child produces a program one of two ways — moving physical printed cards on a desk,
read by the Pi's camera, or dragging the same blocks in a browser on whatever laptop is
in front of them — and both compile to the same JSON program representation, run by a
deterministic executor. Every child's entire progress — levels, points, the pet's
state — lives in that one SQLite file on their drive: no accounts, no cloud, no
internet, ever.

A small LLM (Qwen3, via llama.cpp, running entirely on-device) rephrases pre-verified,
human-written hint text in the voice of an in-game pet companion, Pip — it only sets
tone, it never decides whether a child's code is correct, which is what makes a model
small enough to fit a donated school laptop's RAM safe to put in front of a kid. That
constraint is also why this isn't just a web app talking to a cloud API: a cloud tutor
means a child's work and a per-request bill leaving the building on every hint, for
every child, for as long as the school runs it. This one doesn't, ever — see the
[classroom hub](#the-classroom-hub) below for the other half, recovering a lost drive
without anyone's data having left the room in the first place.

## Architecture, briefly

```
physical cards (camera)  ─┐
                           ├─► AST (packages/ast, one shared contract) ─► executor (internal/executor)
Blockly blocks (browser) ─┘                                                    │
                                                                                 ▼
                                                              SQLite on the USB drive (internal/store)
                                                                                 │
                                                                                 ▼
                                                     local LLM tutor, Qwen3 via llama.cpp (internal/tutor)
```

One Go binary (`cmd/server`) is both the web server — serving the built React/Blockly
frontend and a small JSON API — and the owner of the SQLite file. A separate Python/
OpenCV process (`hub/`) is the only thing that touches the camera; it POSTs the program
it read off the desk to the same `/api/program` endpoint the browser UI uses, so nothing
downstream needs to know or care which input method produced a program. Full writeup,
including every non-obvious design call, in [`PLAN.md`](PLAN.md) and
[`DECISIONS.md`](DECISIONS.md).

## Running it

**Simplest path — one process, no hot-reload** (this is what a clean `git clone` needs;
verified end to end against a fresh clone with no prior build artifacts):

```
cd web && npm install && npm run build   # builds the frontend into ../app
cd ..
go run ./cmd/server                      # serves the API and app/ on 127.0.0.1:8080
```

Then open <http://localhost:8080>. `go run ./cmd/server` accepts `-addr` (default
`127.0.0.1:8080` — loopback, so a child's save file isn't served to the school network;
see [`SECURITY.md`](SECURITY.md)), `-open=false` (skip auto-opening a browser tab — useful
on a headless hub), `-write-manifest` (record a checksum of the drive at the end of prep)
and `-skip-integrity-check` (start despite a mismatch),
`-lite` (disable decorative animation), `-prewarm-hints=false`, `-hint-timeout`, and
`-tutor=false` (skip `llama-server` entirely; hints fall back to their verified text,
which is what the classroom hub below runs with, and what a machine with no
`models/*.gguf` weights on it falls back to automatically either way).

**Dev mode** (two processes, hot-reloading — for active frontend work, not for a
first-time run): the Go server and the Vite dev server must agree on a port, since
`web/vite.config.ts`'s dev proxy is hardcoded to `http://localhost:8099`, not the Go
server's own `:8080` default. Running both commands with no flags, as a first instinct
might, silently breaks the proxy (Vite serves the page, then every `/api` call fails).

```
go run ./cmd/server -addr :8099   # API only, port matches the proxy below
cd web && npm run dev             # Vite dev server + hot reload, proxies /api to :8099
```

Then open the URL Vite prints (`http://localhost:5173` by default) — not `:8099`, which
only serves the API in this mode, not the page.

**Assembled drive** (what actually ships): `scripts/build-launchers.{ps1,sh}`
cross-compiles the launcher for both drive targets, `cd web && npm run build` builds the
frontend into `../app`, then double-click `drive-root/Start Tessera Quest.bat` (Windows)
or run `drive-root/start-tessera-quest.sh` (the Raspberry Pi hub). Both just `cd` to the
drive root and start the launcher, so everything resolves relative to wherever the drive
is mounted — no hardcoded path. Full script-by-script detail in
[`scripts/README.md`](scripts/README.md).

As the **last** step of drive prep, once `app/`, `content/` and `bin/` are all in place,
run `launcher -write-manifest` at the drive root. That records a checksum of the drive so
a later launch can tell whether its contents changed on some machine it was plugged into —
a USB drive that travels between unmanaged computers is this project's largest security
exposure, and [`SECURITY.md`](SECURITY.md) is honest about what the check does and doesn't
prove.

## The classroom Hub

Ordinary play is unchanged by any of this and needs none of it: no accounts, no server,
no network. The Hub is opt-in, and it exists for one problem a USB drive structurally
cannot solve — there is no always-on machine in the room, so there is nowhere for a
teacher to see the class at a glance, and nowhere for a child who lost their drive to
recover from.

One machine in the room (a Raspberry Pi 5 is the intended one) runs as the aggregator:

```
./bin/linux/launcher -classroom-hub -classroom-secret <value> -open=false      # the Pi
./bin/linux/launcher -classroom-addr http://<pi-ip>:8080 -classroom-secret <value>  # students
```

`scripts/pi-setup.sh --classroom-hub` does the Pi side end to end, generating the secret,
printing it, and printing the exact command for the student machines.

`-classroom-secret` is **required** on a hub — it HMAC-signs sync and restore so another
device on the room's LAN can't forge or read a child's progress, and a hub without one
refuses to start rather than coming up silently unauthenticated. The teacher dashboard is
**readable only from the Pi itself**; to see it from your own laptop, forward the port
(`ssh -L 8080:localhost:8080 <user>@<pi-ip>`). Full reasoning in
[`SECURITY.md`](SECURITY.md).

Students still play on their own laptop or lab machine off their own drive — the Pi is
only the aggregator, and it **mirrors** what each drive already decided rather than
owning progress. `RestoreFromSnapshot` composes entirely from the existing never-regress
writers, so recovering onto a fresh drive can only ever raise what's locally there,
never lower it. The roster lives in its own `classroom.db`, separate from any child's
`pet.db`.

**The hub needs no model and no `llama-server`.** It never generates a hint — every
student machine rephrases locally against its own drive, which is the whole offline
premise — so `-classroom-hub` turns the tutor off by default (pass `-tutor` explicitly to
override on a dev box that is playing both roles). On a 4 GB Pi that is the difference
between the aggregator idling and it holding a language model in RAM for no reason, and
it means `pi-setup.sh --classroom-hub` skips the one step in Pi bring-up that needs
internet. A hub can therefore be brought up on a Pi that has never been online.

## Running the camera pipeline

The camera pipeline (`hub/`) is a separate Python process: `pip install -r
hub/requirements.txt`, then `python -m hub.hub --level-id <id>` with a webcam attached,
or `--image photo.png --dry-run` to try it without one. See [`hub/README.md`](hub/README.md).

## Built and measured against

- Raspberry Pi 5, 4 GB RAM tier (the Pi hub `models/qwen3-0.6b-q4_k_m.gguf`,
  `llama.cpp`/`llama-server`, CPU-only build). An 8 GB Pi 5 or a laptop instead selects
  the 1.7B tier — `profiles.json` controls the RAM thresholds for both.
- The 14-card physical print set, ArUco `DICT_4X4_50` markers — see
  [`print/`](print/), `scripts/test-detect-cards.py` (the detection acceptance gate),
  and `scripts/make-print-sheet.py` (the print layout).
- 25 levels across 6 concept groups (move, repeat, nested repeat, if/else, while,
  composition), each independently solvability-verified against the real executor.
- Go 1.26, `net/http` stdlib server, `modernc.org/sqlite` (pure Go, no CGO — the one
  runtime dependency that isn't stdlib, chosen so the binary cross-compiles cleanly to
  both the Pi and Windows). React + TypeScript + Vite + Blockly on the frontend.
- 138 Go tests across 11 packages, 141 TypeScript tests (`npm test`, vitest), a separate
  Python test suite for the camera pipeline (`python -m pytest hub/tests`).

## What's real, and what isn't yet

Everything in `packages/ast`, `internal/executor`, `internal/store`, and the core play
loop (solve a level with the mouse or a row of physical cards, get a hint, watch the pet
react, close the app and reopen it with everything still there) is built, tested, and has
been run end to end against the real binary and real model weights — not just unit
tested in isolation.

Known gaps, honestly:

- **The pet doesn't visually evolve or grow cosmetics.** Its evolution *stage* (an
  internal number) advances with levels solved, but there's no art that changes with it
  yet, and buying the shop's cake plays an animation without triggering evolution.
- **Yanking the USB key mid-session and swapping to a different one isn't crash-safe
  yet.** A `pet.db` that's already corrupt when the app *starts* recovers cleanly; a live
  yank mid-write is a narrower, unsolved case.
- **The level trail shows one star per solved level regardless of how well it was
  solved.** `level_progress.stars` exists in the schema and is never written — a known,
  intentional under-report rather than a bug, until it's wired up.
- **The offline claim is verified by manual audit (a bundle grep for network calls, plus
  a live network capture during a real hint request), not an automated regression test.**
- No license file exists at the repo root yet.

See [`AUDIT.md`](AUDIT.md) for the full pre-hackathon audit this list is drawn from, and
[`DEMO.md`](DEMO.md) for an honest, step-by-step account of what a live demo can
currently show.

## Credits

- **Cursor set**: "Strawberry Pochacco" by [Britichi6](http://www.rw-designer.com/user/110962)
  ([source](http://www.rw-designer.com/cursor-set/strawberry-pochacco)), licensed
  Creative Commons Attribution-NonCommercial. `web/public/cursors/`.
- **Font**: Baloo 2 (SIL Open Font License), `web/public/fonts/`.
