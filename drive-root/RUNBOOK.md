# Tessera Quest — shutdown and startup

## Shutting down (in this order)

Order matters: the game holds a child's save file open, so it closes first.

**1. The laptop / student machine**
Close the "Tessera Quest" console window, or press Ctrl-C in it. The launcher catches
that, drains in-flight requests, closes `pet.db` cleanly, and kills its `llama-server`
child. Wait for the window to actually disappear before the next step.

**2. Eject the pendrive**
Use "Safely Remove Hardware". Pulling it while the game is still running is the one
failure mode the drive's `backup.db` exists to survive -- don't rely on it routinely.

**3. Close the SSH tunnel** (if you opened one)
Ctrl-C, or close the terminal.

**4. The Pi -- last**

    sudo systemctl poweroff

systemd stops `tessera-hub` first, waits for it to shut down cleanly (up to 30s), and
only then cuts power. **Never just pull the Pi's power cable** -- that risks the SD card
and the roster database.

Wait for the green activity LED to stop blinking before unplugging power.

---

## Starting up again

**1. Power on the Pi. That's it.**
The hub is a systemd service and is enabled at boot, so it starts on its own. Nothing to
SSH into, nothing to run. Give it ~30 seconds.

Check it if you want, from any machine on the network:

    curl -s http://tessera.local:8080/api/levels

**2. Plug the pendrive into the laptop, double-click `Start Tessera Quest.bat`.**
The classroom flags are already baked into that file. The browser opens by itself.

**3. To see the teacher dashboard** (optional):

    ssh -L 8081:localhost:8080 teacher@tessera.local

then open <http://localhost:8081/classroom>.

The **left-hand port must not be 8080** -- that is a port on your own machine, and 8080
is what the game itself binds. A tunnel there takes the game's port and the launcher
refuses to start.

Or skip the tunnel entirely and read the roster from the Pi over SSH:

    curl -s localhost:8080/api/classroom/roster

---

## Things that will bite you

- **`/classroom` on the laptop returns "this server is not running as a classroom hub".**
  That is correct. The laptop is a *student*; only the Pi is the hub.
- **"Only one usage of each socket address"** on launch means something already holds
  port 8080 -- usually a leftover launcher, or an SSH tunnel opened on 8080 locally.
- **The classroom secret must match exactly** on the hub and every drive. It lives in
  `Start Tessera Quest.bat` on each drive, and root-only in `/etc/tessera-hub.env` on
  the Pi. Rotate with `./pi/install-hub-service.sh --secret <new>` and update every .bat.
- **Before cloning this drive for another student, delete `data/`.** It holds one child's
  save; copying it gives two children the same save file.

## Pi service commands

    systemctl status tessera-hub        # is it up
    journalctl -u tessera-hub -f        # live logs
    sudo systemctl restart tessera-hub
    sudo systemctl stop tessera-hub
