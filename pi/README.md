# `pi/` — running the classroom hub as a real appliance

The launcher already shuts down gracefully on its own: `cmd/server` installs a signal
handler for `SIGTERM`/Ctrl-C, drains in-flight HTTP requests with a 5-second timeout,
closes the SQLite store, and kills the `llama-server` child so it can't be orphaned.

What this folder adds is the *system* half — the part that makes those handlers actually
fire at the right moments:

| Without a service | With it |
|---|---|
| Hub dies when the SSH session closes | Survives logout; runs headless |
| Power cut comes back to nothing running | Starts on boot, before anyone asks |
| A crash means someone must notice and SSH in | Restarts automatically after 5s |
| `sudo reboot` may SIGKILL mid-write | systemd sends SIGTERM and waits up to 30s |

## Install

From the drive root on the Pi:

```bash
./pi/install-hub-service.sh
```

**A hub refuses to start without a shared secret** — `cmd/server` enforces this, because
an unsigned hub lets any device on the school LAN forge or read a child's progress. If
you don't pass `--secret`, the installer generates one and prints it; write it down,
every student machine needs the same value. `--addr :9090` changes the port. Re-run any
time to rotate the secret or change the port — it's idempotent.

## Reaching the teacher dashboard

The roster and dashboard are **loopback-only**, and that is deliberate: they check the
*peer* address, not the listen address, so a browser on a student laptop is refused even
though that same laptop syncs fine. A browser can't send an HMAC header, so SSH is the
documented way in:

```bash
ssh -L 8081:localhost:8080 <user>@tessera.local
# then open http://localhost:8081/classroom on your own machine
```

**The left-hand port must not be 8080.** That number is a port on *your* machine, and
8080 is what Tessera Quest itself binds — a tunnel there quietly takes the game's port,
and the launcher then refuses to start on that machine. Use 8081 (or anything free) on
the left; the right-hand 8080 is the Pi's and stays as it is.

Student machines point at the hub over the LAN as normal:

```
-classroom-addr http://tessera.local:8080 -classroom-secret <the secret>
```

## Day to day

```bash
journalctl -u tessera-hub -f      # live logs
sudo systemctl stop tessera-hub   # graceful stop (SIGTERM, clean DB close)
sudo systemctl start tessera-hub
sudo systemctl status tessera-hub
```

## Powering the Pi off

**Always:**

```bash
sudo systemctl poweroff
```

systemd stops `tessera-hub` first and waits for the clean shutdown before cutting power.
Pulling the plug instead risks corrupting the SD card and the roster database — the store
has recovery machinery for exactly that (`backup.db`), but it is a safety net, not a
routine you should lean on twice a day.

## Removing it

```bash
./pi/uninstall-hub-service.sh
```

Stops the service cleanly, removes the unit and the secret file, and leaves the drive
layout, `classroom.db` and every `pet.db` completely untouched.

## The secret, honestly

It's written to `/etc/tessera-hub.env`, root-owned and mode 600, so it isn't sitting in a
world-readable unit file. But the launcher takes it as a command-line flag, so it remains
visible in `ps` to any local user on the Pi. On a single-purpose appliance that only you
have shell on, that's an acceptable residual — it's written down here rather than left
for someone to discover.
