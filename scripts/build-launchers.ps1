# Cross-compiles the Tessera Quest launcher for both drive targets (brief §7 drive
# layout: bin/win/launcher.exe, bin/linux/launcher). CGO_ENABLED=0 is not a safety
# margin here, it's the point: modernc.org/sqlite (brief §4) being pure Go is what makes
# this cross-compile trivially from any dev machine, Windows included, with no C
# toolchain involved on either side.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

New-Item -ItemType Directory -Force -Path "$root\bin\win" | Out-Null
New-Item -ItemType Directory -Force -Path "$root\bin\linux" | Out-Null

Push-Location $root
try {
    $env:CGO_ENABLED = "0"

    $env:GOOS = "windows"; $env:GOARCH = "amd64"
    go build -o "bin\win\launcher.exe" ./cmd/server
    Write-Output "built bin\win\launcher.exe"

    $env:GOOS = "linux"; $env:GOARCH = "amd64"
    go build -o "bin\linux\launcher" ./cmd/server
    Write-Output "built bin\linux\launcher"
} finally {
    Remove-Item Env:\GOOS -ErrorAction SilentlyContinue
    Remove-Item Env:\GOARCH -ErrorAction SilentlyContinue
    Remove-Item Env:\CGO_ENABLED -ErrorAction SilentlyContinue
    Pop-Location
}
