#!/usr/bin/env bash
# Installs the Tessera Quest classroom hub as a systemd service, so it starts on boot,
# restarts if it crashes, and stops cleanly on reboot/poweroff instead of being killed
# mid-write.
#
# Run it FROM the drive root on the Pi, the same as every other script here:
#
#   ./pi/install-hub-service.sh                       # no sync secret
#   ./pi/install-hub-service.sh --secret hunter2       # with one
#   ./pi/install-hub-service.sh --addr :9090           # different port
#
# Idempotent: running it again just rewrites the unit and restarts the service, which is
# how you change the port or rotate the secret.
#
# WHAT THIS DOES NOT DO: it never builds, downloads or modifies the game itself. If the
# hub is misbehaving, this script is not where the problem is -- check `journalctl -u
# tessera-hub` first.
set -euo pipefail

addr=":8080"
secret=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --addr)   addr="$2";   shift 2 ;;
        --secret) secret="$2"; shift 2 ;;
        -h|--help) sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'; exit 0 ;;
        *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
    esac
done

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
unit_src="$root/pi/tessera-hub.service"
unit_dst="/etc/systemd/system/tessera-hub.service"
env_file="/etc/tessera-hub.env"

echo "== installing tessera-hub.service =="
echo "drive root: $root"

# --- Preflight. Fail here, with a sentence a human can act on, rather than letting
# --- systemd fail later with "status=203/EXEC" and no explanation. -------------------
[[ -f "$unit_src" ]] || { echo "ERROR: $unit_src not found -- run this from the drive root." >&2; exit 1; }
[[ -x "$root/bin/linux/launcher" ]] || {
    echo "ERROR: $root/bin/linux/launcher missing or not executable." >&2
    echo "  Build it on a dev machine (scripts/build-launchers.sh) and copy the drive" >&2
    echo "  layout here, then: chmod +x bin/linux/launcher" >&2
    exit 1
}
[[ -f "$root/start-tessera-quest.sh" ]] || { echo "ERROR: $root/start-tessera-quest.sh not found." >&2; exit 1; }
chmod +x "$root/start-tessera-quest.sh"

command -v systemctl >/dev/null 2>&1 || {
    echo "ERROR: no systemctl on this machine -- this script is for systemd Linux (Raspberry Pi OS)." >&2
    exit 1
}

# The service runs as whoever installed it, not root: the hub needs no privilege beyond
# writing its own data/ directory and binding an unprivileged port.
run_user="${SUDO_USER:-$USER}"
run_group="$(id -gn "$run_user")"
echo "will run as: $run_user:$run_group"

# --- The secret is MANDATORY, and goes to a root-only file, not into the unit --------
# cmd/server refuses to start a hub without -classroom-secret: an unsigned hub lets any
# device on the school LAN forge or read a child's progress. Rather than let the service
# fail at boot and sit in a restart loop, generate one here when the operator did not
# supply it -- the same thing scripts/pi-setup.sh does, for the same reason.
generated=0
if [[ -z "$secret" ]]; then
    if command -v openssl >/dev/null 2>&1; then
        secret="$(openssl rand -hex 16)"
    else
        # No openssl on a minimal Lite image; the kernel's entropy source is fine.
        secret="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    fi
    generated=1
fi

printf 'TESSERA_CLASSROOM_SECRET=%s\n' "$secret" | sudo tee "$env_file" >/dev/null
sudo chown root:root "$env_file"
sudo chmod 600 "$env_file"
echo "wrote $env_file (root-only)"

# --- Render and install the unit -----------------------------------------------------
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
sed -e "s|@USER@|$run_user|g" \
    -e "s|@GROUP@|$run_group|g" \
    -e "s|@DRIVEROOT@|$root|g" \
    -e "s|@ADDR@|$addr|g" \
    "$unit_src" > "$tmp"

# The secret is always appended: a hub without one refuses to start, so there is no
# no-secret case left to guard. ${VAR} is expanded by systemd from the EnvironmentFile,
# which keeps the value itself out of the unit.
sed -i 's|^ExecStart=\(.*\)$|ExecStart=\1 -classroom-secret ${TESSERA_CLASSROOM_SECRET}|' "$tmp"

sudo cp "$tmp" "$unit_dst"
sudo chmod 644 "$unit_dst"
sudo systemctl daemon-reload
sudo systemctl enable tessera-hub.service >/dev/null
sudo systemctl restart tessera-hub.service

echo ""
echo "== installed =="
sleep 2
sudo systemctl --no-pager --lines=0 status tessera-hub.service || true

ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
host="$(hostname 2>/dev/null || echo tessera)"
port="${addr##*:}"
me="$(whoami)"

if [[ "$generated" == "1" ]]; then
    echo ""
    echo "  =============== CLASSROOM SECRET ==============="
    echo "     $secret"
    echo "  Write this down. Every student machine needs the"
    echo "  SAME value. Stored root-only at $env_file."
    echo "  ================================================"
fi

echo ""
echo "  TEACHER DASHBOARD -- readable only from the Pi itself, by design."
echo "  The roster and dashboard check the PEER address, not the listen address, so a"
echo "  browser on a student laptop is refused even though that laptop can sync fine."
echo "  From your own machine, tunnel in:"
echo ""
echo "    ssh -L 8081:localhost:${port} ${me}@${host}.local"
echo "    then open  http://localhost:8081/classroom"
echo ""
echo "  Note the 8081 on the LEFT: that is a port on YOUR machine, and it must not be"
echo "  ${port}, because that is the port Tessera Quest itself binds. A tunnel on ${port}"
echo "  silently takes the game's port and the launcher then refuses to start."
echo ""
echo "  STUDENT MACHINES -- these DO reach the hub across the LAN:"
echo "    -classroom-addr http://${host}.local:${port} -classroom-secret <the secret>"
echo "    (use http://${ip}:${port} instead if mDNS is unreliable on your network)"
echo ""
echo "  Logs:     journalctl -u tessera-hub -f"
echo "  Stop:     sudo systemctl stop tessera-hub"
echo "  Power off safely:  sudo systemctl poweroff"
