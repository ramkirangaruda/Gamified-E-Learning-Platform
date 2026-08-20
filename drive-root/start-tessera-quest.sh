#!/usr/bin/env sh
# The Linux/Raspberry Pi equivalent of "Start Tessera Quest.bat", at the drive root for
# the same reason: one obvious thing to run.
#
# On the Pi this is what an autostart entry or a desktop shortcut should point at, rather
# than the launcher directly, so the working directory is always the drive root -- the
# launcher resolves content/, app/ and models/ relative to its own location, and starting
# it from somewhere else finds none of them.
#
# Pass -open=false when running headless or as a service; everything else is forwarded
# through as-is.
cd "$(dirname "$0")" || exit 1
exec ./bin/linux/launcher "$@"
