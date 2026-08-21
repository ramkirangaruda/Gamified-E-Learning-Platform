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
./pi/install-hub-service.sh --secret <your-secret>
```

Omit `--secret` to accept any client on the LAN. `--addr :9090` changes the port. Re-run
it any time to change the port or rotate the secret — it's idempotent.

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
visible in `ps` to any local user on the Pi. That matches the threat model the flag's own
help text describes — a low-stakes classroom LAN — and is not a substitute for a trusted
network if you ever need one.
