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

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

echo "downloading $url"
curl -fL --progress-bar -o "$tmp_dir/$asset" "$url"

echo "extracting"
unzip -q "$tmp_dir/$asset" -d "$tmp_dir/extract"

dest="$root/bin/win"
mkdir -p "$dest"
cp "$tmp_dir/extract/llama-server.exe" "$dest/"
cp "$tmp_dir"/extract/*.dll "$dest/"

echo "llama-server.exe + DLLs placed in $dest"
