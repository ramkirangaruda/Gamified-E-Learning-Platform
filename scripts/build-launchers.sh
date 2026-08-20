#!/usr/bin/env bash
# Cross-compiles the Tessera Quest launcher for both drive targets (brief §7 drive
# layout: bin/win/launcher.exe, bin/linux/launcher). CGO_ENABLED=0 is not a safety
# margin here, it's the point: modernc.org/sqlite (brief §4) being pure Go is what makes
# this cross-compile trivially from any dev machine, Linux included, with no C
# toolchain involved on either side. Bash equivalent of build-launchers.ps1 for the same
# reason as fetch-llama-server.sh — the Pi 5 hub is Linux and has no PowerShell.
#
# bin/linux/launcher targets linux/arm64, not linux/amd64: the only Linux target this
# project has is the Pi 5 hub, which is arm64. (Previously built amd64 here — a known
# gap flagged in DECISIONS.md/scripts/README.md, fixed once the Pi bring-up work needed
# it. CGO_ENABLED=0 makes this a one-line GOARCH change, no cross-toolchain needed.)
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$root/bin/win" "$root/bin/linux"

cd "$root"
export CGO_ENABLED=0

GOOS=windows GOARCH=amd64 go build -o bin/win/launcher.exe ./cmd/server
echo "built bin/win/launcher.exe"

GOOS=linux GOARCH=arm64 go build -o bin/linux/launcher ./cmd/server
echo "built bin/linux/launcher (arm64, for the Pi 5 hub)"
