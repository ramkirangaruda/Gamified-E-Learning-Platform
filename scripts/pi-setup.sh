#!/usr/bin/env bash
# Brings a fresh Raspberry Pi 5 (64-bit Raspberry Pi OS) up as the Tessera Quest hub.
# Run this FROM the root of an already-assembled drive layout (brief §7): the launcher,
# content/, profiles.json, and models/*.gguf are all expected to already be present --
# they're either committed (content/) or cross-compiled/downloaded on a dev machine
# during prep (launcher, models), never something this script builds. The one piece
# that genuinely can't be prepared anywhere except arm64 Linux is llama-server, which is
# this script's actual job.
#
# CONNECTIVITY: exactly one step below needs it -- building llama-server from source
# (step 3) when bin/linux/llama-server isn't already on the drive. Everything else
# (the launcher binary, content/, profiles.json, models/*.gguf) is expected to already
# be staged and needs zero connectivity at the event, matching brief §13's
# router-unplugged assumption and this repo's existing scripts/README.md policy: run
# prep-time scripts during prep week when internet is real, not at the venue.
#
# WHAT TO PRE-STAGE ON THE DRIVE IF THIS PI WON'T HAVE INTERNET:
#   The single most reliable option is to run this exact script once, ahead of time,
#   on any Raspberry Pi 5 (or other aarch64 Linux box) that DOES have internet, then
#   copy the resulting bin/linux/llama-server binary onto every spare drive -- it's then
#   just a file, no different from bin/win/llama-server.exe, which is already fetched
#   once during prep and copied from then on (see scripts/fetch-llama-server.sh /
#   scripts/README.md). A cross-compiled binary isn't used instead, deliberately: prebuilt
#   generic Linux ARM64 releases don't exist for the pinned llama.cpp tag as of this
#   writing (checked the actual GitHub release assets, not assumed), and even where they
#   do exist elsewhere, a locally-built binary is safer against glibc/NEON mismatches
#   than a binary built on a different distro image.
set -euo pipefail

LLAMA_CPP_TAG="b10430"  # same pinned tag scripts/fetch-llama-server.sh uses for Windows, so
                        # the binary's provenance matches across platforms.

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "== Tessera Quest Pi 5 bring-up =="
echo "drive root: $root"

# --- Step 1: sanity check this is actually a Pi 5 / arm64 Linux -----------------------
arch="$(uname -m)"
if [[ "$arch" != "aarch64" ]]; then
    echo "ERROR: this script targets 64-bit Raspberry Pi OS (aarch64), found '$arch'." >&2
    echo "If you're setting up a different platform, use build-launchers.{sh,ps1} +" >&2
    echo "fetch-llama-server.{sh,ps1} directly instead." >&2
    exit 1
fi

# --- Step 2: the launcher binary must already be on the drive -------------------------
# Pure Go + CGO_ENABLED=0 (modernc.org/sqlite) makes this trivial to cross-compile from
# any dev machine ahead of time -- there is no reason to ever build it ON the Pi, and
# doing so here would just make this script slower and need the Go toolchain installed
# on hardware that doesn't need it for anything else.
if [[ ! -f "$root/bin/linux/launcher" ]]; then
    echo "ERROR: $root/bin/linux/launcher not found." >&2
    echo "Build it on a dev machine first: scripts/build-launchers.sh (targets linux/arm64)," >&2
    echo "then copy the whole drive layout here -- this script doesn't build the launcher." >&2
    exit 1
fi
chmod +x "$root/bin/linux/launcher"
echo "[1/4] launcher binary present"

# --- Step 3: llama-server for arm64, fetch-or-build -----------------------------------
llama_bin="$root/bin/linux/llama-server"
if [[ -f "$llama_bin" ]]; then
    chmod +x "$llama_bin"
    echo "[2/4] llama-server already staged on this drive, skipping build"
else
    echo "[2/4] llama-server not found on this drive -- attempting to build from source"
    echo "      (this is the only step in this script that needs internet)"

    if ! curl -fsS --connect-timeout 5 -o /dev/null https://github.com 2>/dev/null; then
        echo "ERROR: no internet reachable, and no bin/linux/llama-server on this drive." >&2
        echo "" >&2
        echo "Nothing more this script can safely do offline. Pre-stage one of:" >&2
        echo "  (a) a bin/linux/llama-server binary already built on a Pi 5 during prep" >&2
        echo "      (the recommended path -- see this script's header comment), or" >&2
        echo "  (b) a full local clone of https://github.com/ggml-org/llama.cpp at tag" >&2
        echo "      $LLAMA_CPP_TAG, plus build-essential/cmake already installed, so a" >&2
        echo "      fully offline build is possible next time." >&2
        exit 1
    fi

    missing_pkgs=()
    for pkg in build-essential cmake git; do
        dpkg -s "$pkg" >/dev/null 2>&1 || missing_pkgs+=("$pkg")
    done
    if [[ ${#missing_pkgs[@]} -gt 0 ]]; then
        echo "installing build dependencies: ${missing_pkgs[*]}"
        sudo apt-get update -qq
        sudo apt-get install -y "${missing_pkgs[@]}"
    fi

    build_dir="$(mktemp -d)"
    trap 'rm -rf "$build_dir"' EXIT
    echo "cloning llama.cpp @ $LLAMA_CPP_TAG"
    git clone --branch "$LLAMA_CPP_TAG" --depth 1 https://github.com/ggml-org/llama.cpp "$build_dir/llama.cpp"

    echo "building (native arm64/NEON optimizations, CPU only -- no GPU on a Pi 5)"
    cmake -B "$build_dir/llama.cpp/build" -S "$build_dir/llama.cpp" \
        -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=ON -DLLAMA_CURL=OFF
    cmake --build "$build_dir/llama.cpp/build" --config Release -j"$(nproc)" --target llama-server

    mkdir -p "$root/bin/linux"
    cp "$build_dir/llama.cpp/build/bin/llama-server" "$llama_bin"
    chmod +x "$llama_bin"
    echo "built $llama_bin -- copy this file onto other drives so they don't need to rebuild"
fi

# --- Step 4: verify the rest of the drive layout is complete (warn, don't hard-fail) --
echo "[3/4] checking drive layout completeness"
check() {
    if [[ -e "$root/$1" ]]; then
        echo "  ok   $1"
    else
        echo "  MISSING  $1 -- $2"
    fi
}
check "profiles.json" "tier selection will fail without it (falls back to no rephrasing, still playable)"
check "content/levels" "the game has no levels without this"
check "content/hints" "hints will always be the generic fallback without this"
check "models/qwen3-0.6b-q4_k_m.gguf" "low tier (the Pi's expected tier) needs this"
check "app" "the frontend won't load without a built bundle here (npm run build on a dev machine, drive layout brief §7)"

# --- Step 5: start the hub -------------------------------------------------------------
echo "[4/4] starting the hub (Ctrl-C to stop)"
cd "$root"
exec ./bin/linux/launcher -addr :8080
