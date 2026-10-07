#!/usr/bin/env bash
# Fetches the prebuilt llama.cpp Windows CPU x64 release and drops llama-server.exe plus
# its DLLs into bin/win/, per brief §4 ("llama.cpp llama-server, prebuilt per platform").
# Bash equivalent of fetch-llama-server.ps1 — same asset, same pinned tag, just runnable
# from a Linux box (the Pi 5 hub, or a Linux dev machine) without PowerShell.
#
# See scripts/README.md: this script needs internet (it hits GitHub), which the actual
# demo cannot assume. It's a prep-time/dev-time convenience only.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

tag="b10430"
asset="llama-${tag}-bin-win-cpu-x64.zip"
url="https://github.com/ggml-org/llama.cpp/releases/download/${tag}/${asset}"

# SHA256 of the pinned asset, recorded by downloading it and hashing it -- this exact
# archive, not a version range. The pinned TAG alone is not integrity: a tag can be moved
# or a release asset replaced upstream, and HTTPS only proves we reached GitHub, not that
# GitHub is still serving the bytes this project was tested against.
#
# Honest about what this does and does not buy: it is trust-on-first-use. It cannot tell
# us the archive was clean on the day it was first hashed -- only that what arrives today
# is byte-identical to what was verified then. That is still the property worth having,
# because it is what turns a silent future substitution into a loud failure. Re-pin
# deliberately (bump the tag AND the hash together, never the tag alone).
asset_sha256="63988c0e4a2527cf9a90c229de0199201f7ba5957c06c92dacc1c96e4c0851d7"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

echo "downloading $url"
curl -fL --progress-bar -o "$tmp_dir/$asset" "$url"

echo "verifying checksum"
got_sha256="$(sha256sum "$tmp_dir/$asset" | awk '{print $1}')"
if [[ "$got_sha256" != "$asset_sha256" ]]; then
    echo "" >&2
    echo "ERROR: checksum mismatch -- refusing to install this binary." >&2
    echo "  expected: $asset_sha256" >&2
    echo "  got:      $got_sha256" >&2
    echo "" >&2
    echo "Either the upstream release asset changed, or the download was tampered with." >&2
    echo "Do not work around this by editing the hash unless you have independently" >&2
    echo "confirmed why it changed -- this binary runs on every machine in a classroom." >&2
    exit 1
fi

echo "extracting"
unzip -q "$tmp_dir/$asset" -d "$tmp_dir/extract"

dest="$root/bin/win"
mkdir -p "$dest"
cp "$tmp_dir/extract/llama-server.exe" "$dest/"
cp "$tmp_dir"/extract/*.dll "$dest/"

echo "llama-server.exe + DLLs placed in $dest"
