#!/usr/bin/env bash
# Removes the tessera-hub systemd service. Stops it first, so the launcher gets its
# normal SIGTERM and closes the roster database cleanly rather than being torn out.
#
# Leaves the drive layout and every database completely alone -- this only undoes what
# install-hub-service.sh added to the system. Running the hub by hand afterwards still
# works exactly as before.
set -euo pipefail

echo "== removing tessera-hub.service =="

if systemctl list-unit-files 2>/dev/null | grep -q '^tessera-hub\.service'; then
    # stop before disable: disable only removes the boot symlink, it does not stop a
    # running service, and leaving one running with no unit file on disk is a confusing
    # state to hand back to someone.
    sudo systemctl stop tessera-hub.service || true
    sudo systemctl disable tessera-hub.service >/dev/null 2>&1 || true
    echo "stopped and disabled"
else
    echo "service was not installed -- nothing to stop"
fi

sudo rm -f /etc/systemd/system/tessera-hub.service
sudo rm -f /etc/tessera-hub.env
sudo systemctl daemon-reload
sudo systemctl reset-failed tessera-hub.service 2>/dev/null || true

echo "removed. The drive layout, classroom.db and every pet.db are untouched."
