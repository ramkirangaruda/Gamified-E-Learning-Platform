# Tessera Quest

A gamified, fully offline coding platform for kids 8–13. A child produces a program one
of two ways — moving physical printed cards on a desk, read by a camera, or dragging the
same blocks in a browser — and both compile to the same JSON program representation,
which runs on a deterministic executor. A small local LLM (no cloud, no API key)
rephrases pre-verified hint text in the voice of an in-game pet companion, Pip. Every
child's entire progress — levels, points, the pet's state — lives in one SQLite file on
a USB drive: no accounts, no server, no internet, ever.

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

**Dev mode** (two processes, hot-reloading):

```
go run ./cmd/server            # API + serves whatever's already built in app/
cd web && npm run dev          # Vite dev server with a proxy to the Go API
```

`go run ./cmd/server` accepts `-addr` (default `:8080`), `-open=false` (skip
auto-opening a browser tab — useful on a headless hub), `-lite` (disable decorative
animation), `-prewarm-hints=false`, and `-hint-timeout`.

**Assembled drive** (what actually ships): `scripts/build-launchers.{ps1,sh}`
cross-compiles the launcher for both drive targets, `cd web && npm run build` builds the
frontend into `../app`, then double-click `drive-root/Start Tessera Quest.bat` (Windows)
or run `drive-root/start-tessera-quest.sh` (the Raspberry Pi hub). Both just `cd` to the
drive root and start the launcher, so everything resolves relative to wherever the drive
is mounted — no hardcoded path. Full script-by-script detail in
[`scripts/README.md`](scripts/README.md).

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
- 88 Go tests across 10 packages, 58 TypeScript tests (`npm test`, vitest), a separate
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
