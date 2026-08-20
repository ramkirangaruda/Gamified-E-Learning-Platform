Reproduces the binaries under `bin/` (gitignored — see DECISIONS.md). `.ps1` and `.sh`
versions do the same thing; use whichever matches the machine. The Pi 5 hub is Linux
with no PowerShell, so the `.sh` versions exist for it (and any Linux dev machine).

- **`build-launchers.{ps1,sh}`** — cross-compiles the Go launcher for both drive targets:
  `bin/win/launcher.exe` (`windows/amd64`) and `bin/linux/launcher` (`linux/arm64` — the
  Pi 5 hub, the only Linux target this project has). Only needs the Go toolchain; works
  offline once modules are already in the local module cache.
- **`fetch-llama-server.{ps1,sh}`** — downloads the prebuilt Windows CPU x64
  `llama-server.exe` + DLLs from a pinned `ggml-org/llama.cpp` GitHub release.
- **`pi-setup.sh`** — run on the Pi 5 itself (aarch64 Raspberry Pi OS only, checked at
  startup): verifies the drive layout, builds `bin/linux/llama-server` from source if it
  isn't already staged (the one step here that needs internet — see the script's own
  header comment for exactly what to pre-stage if it won't have any), then starts the
  hub. No Windows equivalent — this script only ever runs on the Pi.
- **`pi-benchmark.sh <url>`** — hits an already-running hub's real `/api/hint` endpoint
  20 times with distinct synthetic signatures (forcing 20 genuine cache misses, i.e. 20
  real model generations, not 20 cache hits) and reports p50/p95/max latency in ms.
  Flags if `max` reached `internal/api.DefaultHintTimeout` (8s).

**`fetch-llama-server` and `pi-setup.sh`'s build-from-source path both need internet.**
That's fine during prep (Aug 14–18, real internet available) but is a real contradiction
of the project's offline-at-the-event premise if run at the venue — the brief's own
router-unplugged assumption (§13) means neither script can be the thing standing between
a working demo and a broken one.

The actual source of truth for what ships on stage is an **offline copy of every
platform binary (including `bin/linux/llama-server`) kept on a spare drive**, not a
script that hits GitHub or builds from source. Re-run these scripts during prep to
refresh that spare drive (`pi-setup.sh` specifically: run it once on any Pi 5 with
internet, then copy the `bin/linux/llama-server` it produces onto every other drive);
don't run them, or expect them to work, at the event itself.

**Previously flagged as a known gap, now fixed:** `build-launchers` used to target
`linux/amd64` for `bin/linux/launcher`, which wouldn't run on the actual Pi 5 hub
(`arm64`). Fixed as part of the pre-M4 verification/hardening queue — see
`DECISIONS.md`'s 2026-08-15 "ARM cross-compile + Pi bring-up" entry.
