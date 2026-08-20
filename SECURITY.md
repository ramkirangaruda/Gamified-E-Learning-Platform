# Security

Tessera Quest runs on children's machines, carries children's data between them, and is
handed out on USB drives that get plugged into computers nobody involved controls. This
document states what that actually exposes, what the project does about it, and — the part
most such documents skip — what it deliberately does *not* protect against.

Everything below describes behaviour that exists in the code, not intentions. Where a
protection is partial, it says so.

## Who this defends against

**In scope, because it will actually happen:**

- **Opportunistic malware** on a home or lab machine that infects files on any writable
  drive it sees.
- **Other students on the same network** — the single most motivated group in the room,
  with physical access to a machine and a reason to want a higher score or a look at
  someone else's.
- **Accidental exposure**: a teacher's dashboard full of children's names sitting on an
  open school WiFi because nothing stopped it.

**Out of scope, stated honestly:** an attacker who specifically targets this project, has
write access to a drive during prep, or controls the classroom network infrastructure. A
school-issued laptop is already fully trusted by everything else on it; this app cannot be
the thing that saves a machine that is already compromised.

## The USB drive is the biggest risk, and it is structural

This is the honest headline. The project's central promise — *plug this drive into any
computer and play, no install, no account* — is also a description of how anything that
infects the drive would travel. A drive is mounted **read-write** on every machine it
touches, and one infected machine can write to it.

**What is done about it.** `launcher -write-manifest`, run at the end of drive prep,
records a SHA-256 of every file under `app/`, `content/` and `bin/` into
`manifest.sha256` (standard `sha256sum` format, so it can be checked with ordinary tools
rather than by trusting this binary). Every subsequent launch re-hashes the drive and
**refuses to start** if anything was modified, added, or removed, printing the full list.
`-skip-integrity-check` overrides it deliberately; `-write-manifest` re-baselines after an
intentional rebuild. A drive with no manifest skips the check with a log line, so a dev
checkout is unaffected.

**What this genuinely does not cover — read this part:**

- **`Start Tessera Quest.bat` is unprotected, and it is the weakest point in the whole
  project.** It is plain text, trivially editable by anything with write access, it runs
  *before* any of this code does, and it is the file a child is specifically taught to
  double-click. Nothing here defends it.
- **The running launcher cannot verify itself.** Code cannot vouch for its own integrity —
  an already-infected launcher can just report success. A Windows launcher checking
  `bin/linux/` is meaningful; checking its own bytes is not.
- **It is trust-on-first-use.** It proves the drive matches prep time. It cannot prove prep
  time was clean.

So the manifest is a **tripwire for the common case**, not a defence against a targeted
attacker. That is still worth having: the common case is the one that happens.

**The stronger fixes, which are deployment choices rather than code:**

1. **USB drives with a hardware write-protect switch.** Flip it after prep and the
   propagation path closes completely for everything except `data/`. This is the single
   most effective option and it costs a few rupees more per drive.
2. **Make the drive data-only on managed machines.** Install the app locally on school lab
   PCs — the highest-exposure, most-shared machines — and let the USB carry only
   `data/pet.db`, which is read as data and never executed. Keep the fully portable drive
   for home use. This removes the most dangerous machines from the chain without giving up
   the portability story everywhere.
3. **Re-image drives from the hub between terms.** The Pi never travels; it is the only
   consistently trustworthy machine in the room.

There is no `autorun.inf` anywhere in this project and there must never be one.

## The classroom hub

The hub (a Raspberry Pi, `-classroom-hub`) is the one machine that listens on the class
network, so it is the one place where network access control matters.

**Teacher-facing endpoints are loopback-only.** `GET /classroom` (the dashboard) and
`GET /api/classroom/roster` refuse any request that did not come from the hub itself.
These hold every child's first name and progress, and a browser cannot send an HMAC
header, so being local-only is what protects them. To read the dashboard from elsewhere,
forward the port over SSH rather than exposing it:

```bash
ssh -L 8080:localhost:8080 <user>@<hub-ip>
```

This is checked against `RemoteAddr` — the kernel's view of the peer, not a spoofable
header. There is no reverse proxy in this project's deployment; adding one would require
revisiting that check.

**Student-facing endpoints are HMAC-signed.** `POST /api/classroom/sync` and
`GET /api/classroom/restore` both require an HMAC-SHA256 signature keyed on a shared
`-classroom-secret`. Restore signs *the requested name*, so a signature captured for one
child cannot be replayed to read another. **A hub started without a secret now refuses to
boot** — an optional protection that defaults to off is an insecure default with extra
steps. `scripts/pi-setup.sh --classroom-hub` generates one and prints it.

**Known limitation:** signing gives integrity and authentication, not confidentiality.
Traffic is plain HTTP on the LAN, so anyone positioned to sniff it can read progress in
transit. Adding TLS would mean a certificate story for an offline Pi with no CA and no
clock — judged not worth it for low-stakes game progress on a closed network. Revisit if
this ever carries anything more sensitive than points and first names.

## Student machines

A student's own launcher serves `GET`/`POST /api/state` with **no authentication at all**,
on the assumption that only the child at that machine can reach it. That assumption is only
true if the server is not listening to the network — so **the default listen address is
`127.0.0.1:8080`**, not every interface. `-classroom-hub` opts back in to all interfaces
because a hub that nothing can reach is useless; an explicit `-addr` always wins.

Before this default, any device on school WiFi could read a child's name and points, or
overwrite their save, by addressing their laptop directly.

## Things that are deliberately not defended

Naming these is more useful than pretending they are solved.

- **A child can give themselves unlimited points.** `POST /api/state` writes what it is
  given. It is their own save file on their own machine, so this is cheating at a
  single-player game, and the cost of stopping it (server-authoritative everything) is not
  worth paying. **The consequence worth knowing:** the teacher's dashboard mirrors what
  each drive reports, so it is a record of what students *claim*, not an audited one. Do
  not use it for grading.
- **Level and chemistry answers are server-checked** (`/api/program`, `/api/chemistry/guess`
  never trust a client's claim of success, and the samples endpoint never sends
  `answer_id`), so the *content* cannot be trivially spoiled even though the points can.
- **No encryption at rest.** `pet.db` is a plain SQLite file. Anyone holding the drive can
  read a first name and a score. Given the drive is the child's own and the data is
  low-value, a key-management story for eight-year-olds would cost more than it protects.
- **Physical loss of a drive** is handled as a recovery problem (hub restore), not a
  confidentiality one.

## Data collected

A first name (or a chosen display name), points, levels solved, and pet state. **No
accounts, no passwords, no email addresses, no date of birth, no analytics, no telemetry,
and no network requests to anything outside the classroom.** The offline claim is verified
by manual audit — a bundle grep for network calls plus a live capture during a hint
request — not yet by an automated test (see `AUDIT.md`).

Because this is children's data, deletion is trivial and total by design: delete
`data/pet.db` on the drive, and `data/classroom.db` on the hub.

## Supply chain

`scripts/fetch-llama-server.{sh,ps1}` pin both a release tag **and** a SHA-256 of the
downloaded archive, and refuse to install on a mismatch — a tag alone is not integrity,
since a release asset can be replaced upstream. Frontend dependencies are locked with
integrity hashes in `package-lock.json`. Model weights (`models/*.gguf`) are **not**
currently hash-pinned; that is a known gap.

The Go server has exactly one non-stdlib runtime dependency, `modernc.org/sqlite` (pure
Go, no CGO).

## For a teacher setting up a room

1. Run `scripts/pi-setup.sh --classroom-hub` on the Pi. **Write down the secret it
   prints** — every student machine needs the same value.
2. Read the dashboard on the Pi itself, or over an SSH tunnel. If it is reachable from a
   student's laptop, something is misconfigured.
3. Prefer drives with a hardware write-protect switch, and flip it after prep.
4. If a drive ever refuses to start with an integrity error and nobody rebuilt it, do not
   hand it to another child. Re-image it.

## Reporting

This is a student project without a security team. Open an issue, or contact the
maintainers directly for anything involving children's data.
