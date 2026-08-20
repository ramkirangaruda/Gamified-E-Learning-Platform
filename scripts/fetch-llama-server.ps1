# Fetches the prebuilt llama.cpp Windows CPU x64 release and drops llama-server.exe plus
# its DLLs into bin/win/, per brief §4 ("llama.cpp llama-server, prebuilt per platform").
# Pinned to a specific release tag rather than "latest" — a re-run of this script six
# months from now should reproduce the exact same binary, not silently drift onto
# whatever's newest (and possibly incompatible with the models/ GGUF files already on a
# drive). CPU-only build deliberately: brief §14 flags "demo machine unknown," so this
# assumes no GPU rather than gambling on one being present and configured on the day.
#
# Bundles every DLL from the release archive rather than hand-picking llama-server.exe's
# actual dependency chain — simpler and safer against a missing-DLL failure discovered
# on stage; trim it later (M4 polish) if drive space becomes a real constraint.
#
# Only fetches the Windows binary. bin/linux/llama-server (for the Pi 5 hub) is not yet
# wired up here — pull the matching linux-cpu (or an ARM64 build for the Pi) asset the
# same way when that's next.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$tag = "b10430"
$asset = "llama-$tag-bin-win-cpu-x64.zip"
$url = "https://github.com/ggml-org/llama.cpp/releases/download/$tag/$asset"

$tmpZip = New-TemporaryFile
$tmpZip = Rename-Item -Path $tmpZip -NewName ($tmpZip.Name + ".zip") -PassThru
$tmpExtract = Join-Path $env:TEMP "llama-fetch-$tag"
Remove-Item -Recurse -Force $tmpExtract -ErrorAction SilentlyContinue

Write-Output "downloading $url"
Invoke-WebRequest -Uri $url -OutFile $tmpZip -UseBasicParsing

Write-Output "extracting"
Expand-Archive -Path $tmpZip -DestinationPath $tmpExtract -Force

$dest = "$root\bin\win"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Path "$tmpExtract\llama-server.exe" -Destination $dest -Force
Copy-Item -Path "$tmpExtract\*.dll" -Destination $dest -Force

Remove-Item $tmpZip -Force
Remove-Item -Recurse -Force $tmpExtract

Write-Output "llama-server.exe + DLLs placed in $dest"
& "$dest\llama-server.exe" --version
