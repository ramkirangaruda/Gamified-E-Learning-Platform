Reproduces the binaries under `bin/` (gitignored — see DECISIONS.md). `.ps1` and `.sh`
versions do the same thing; use whichever matches the machine. The Pi 5 hub is Linux
with no PowerShell, so the `.sh` versions exist for it (and any Linux dev machine).

- **`build-launchers.{ps1,sh}`** — cross-compiles the Go launcher for both drive targets.
  Only needs the Go toolchain; works offline once modules are already in the local
  module cache.
- **`fetch-llama-server.{ps1,sh}`** — downloads the prebuilt Windows CPU x64
  `llama-server.exe` + DLLs from a pinned `ggml-org/llama.cpp` GitHub release.

**`fetch-llama-server` needs internet.** That's fine during prep (Aug 14–18, real
internet available) but is a real contradiction of the project's offline-at-the-event
premise if run at the venue — the brief's own router-unplugged assumption (§13) means
this script cannot be the thing standing between a working demo and a broken one.

The actual source of truth for what ships on stage is an **offline copy of both
platform binaries kept on a spare drive**, not a script that hits GitHub. Re-run these
scripts during prep to refresh that spare drive; don't run them, or expect them to work,
at the event itself.

**Known gap, not yet built:** `build-launchers` currently only targets `linux/amd64` for
`bin/linux/launcher`. The Pi 5 hub is `arm64` — that binary won't run on the actual hub
hardware yet. Not fixed here because it wasn't in scope for this pass (bash equivalents
of the existing scripts); flagging it so it's a known gap, not a surprise at M5.
