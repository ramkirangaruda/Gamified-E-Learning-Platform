# AUDIT.md — pre-hackathon audit

## Summary

**Found:** 5 P0, 6 P1 (4 from reading, 2 more surfaced only in Phase 3 against the real
model), 8 P2, 5 P3. **Fixed:** all 11 P0s and P1s, each with a test written first that
reproduced the failure. **Left:** every P2 and P3, documented and untouched.

Four of the five P0s were reproduced, not inferred. The one that mattered most was
confirmed by hard-killing a live launcher and watching `llama-server` (PID 34684) keep
running with the model resident.

**What was fixed**

| ID | Finding | Fix |
|---|---|---|
| P0-1 | `llama-server` survives a parent crash — **reproduced live** | Linux `Pdeathsig=SIGKILL`; `Close()` now also `Wait`s, bounded |
| P0-2 | `log.Fatalf` after engine start skips `defer`, orphaning the model | Levels load *before* the engine spawns; `ListenAndServe` failure closes the engine explicitly instead of `Fatalf` |
| P0-3 | Corrupt/truncated `pet.db` bricks the app — **reproduced** | `Open` restores from a `backup.db` snapshot, else quarantines and starts fresh; non-corruption errors still fail loudly |
| P0-4 | One malformed level file kills all eight — **reproduced** | Skip-and-log bad files; error only when zero levels are usable |
| P0-5 | Raw technical errors rendered to the child | `friendlyError()` — one short sentence on screen, real error to `console.error` |
| P1-1 | Pre-warm silently emptied `?compare=1` and blanked the latency HUD — **reproduced** | Pre-warm records its (real-latency) generations; `latency_ms` always sent; HUD shows "instant" for 0 |
| P1-2 | "I'll have real hints for you soon — M3 territory" on screen every level load | Real in-character idle line, guarded by a test that rejects milestone language generally |
| P1-3 | Empty levels dir started silently with zero levels | Now an explained startup error |
| P1-5 | §13 step 4's "points out you've done this before" **never actually appeared** — 5/5 real generations dropped it | Acknowledgement prepended deterministically (`HistoryPrefix`) rather than trusted to a 0.6B |
| P1-6 | Real model emitted "Keep **the child** learning" — talking about the child to an adult | Extended the existing drift validator + retry/fallback to reject third person |
| — | §13 step 4 had no end-to-end coverage | Two tests walking the real two-mistakes-then-hint path |

P1-4 (an 8 GB Pi 5 selects the *high* tier, undercutting §13 step 7) was deliberately
**not** code-fixed: `profiles.json` ships on the drive and already controls this. Raise
`tiers.high.trigger.min_ram_mb` on the Pi's copy. It is a pre-event checklist item, not a
code change.

**Phase 3 regression result: everything green, nothing broken.** 72 Go tests, 26 TS tests,
production bundle rebuilt, `linux/arm64` + `windows/amd64` cross-compiles clean (including
`vet` over the Linux-only files). The full drive layout was assembled and the real binary
run against the real 0.6B model — not the dev server. §13 step 4 was walked end to end
five times: correct `off_by_one_repeat` classification, no acknowledgement on the first
mistake, "This one's caught you before!" on the second and third, "We keep meeting this
one, don't we?" on the fourth and fifth, 1.2–1.8 s real generations and 0 ms on cache
hits, then the fix-and-solve landing `solved_levels: ["level-2"]`. The 370-generation
drift benchmark came back **0/370 rejected** under the stricter validator, so it does not
over-reject. The offline audit still passes: every request localhost, zero external, zero
console errors, and the stale placeholder is confirmed absent from the shipped bundle.

**Biggest remaining risk — and it is not a bug.**

**Only two of §13's eight demo steps exist.** Steps 4 and 7 are built and now well
covered. Steps 2, 3, 5, and 6 — the pet's evolution art and hat, the camera reading
physical cards, buying a cake, and pulling key A out for key B — are M4/M5 and are not
written. The codebase is in good shape for what it does; the risk is that the *demo as
scripted cannot currently be performed*, and four days is not much runway for a camera
pipeline (§14 already flags ArUco under venue lighting as the top risk) plus hot-swap
plus an economy.

Everything I fixed makes the built parts hard to break. None of it moves that line. If
one thing gets decided tomorrow, it should be which of steps 2/3/5/6 actually ship and
which get cut from the script — deciding that late is what turns a working demo into a
missed beat on stage.

Second, much smaller: the `llama-server` parent-crash guarantee is **kernel-enforced on
Linux only**. Windows would need a Job Object; that was judged more startup-failure risk
than the residual exposure warrants this close to the event. The Pi — the machine where
an orphan actually hurts — is covered, and the Linux path is cross-compiled and vetted
but runtime-unverified until Pi bring-up.

---

> Phase 1 findings follow, exactly as written before anything was fixed.

Audit date: 2026-08-15. Scope: entire repo at commit `8228d3c`+ (post-dashboard work).
Method: full read of all 33 Go files / 25 TS files / 8 level + 8 hint content files, plus
**empirical probes** — throwaway tests run against the real store, real API handlers, and
a real live launcher process. Where a finding says "CONFIRMED" it was reproduced, not
inferred from reading.

---

## P0 — will break the demo

### P0-1. `llama-server` survives a parent crash as an orphan — CONFIRMED live
Hard-killed the running `launcher.exe` (PID 37780, `taskkill /F` — simulating a crash,
a power-button hold, or a Task Manager kill). `llama-server.exe` (PID 34684) **was still
running afterwards**, holding its model in RAM.

`internal/tutor.LlamaEngine.Close()` is only reached through `defer` in `main()`. Windows
and Linux both keep child processes alive independently of the parent unless something
explicitly kills them. On a 4 GB Pi 5 an orphan holding the model is exactly the P0 the
brief's §14 risk table worries about, and the *second* failure is worse than the first:
the orphan still holds port 8090, so the next launch's `llama-server` spawn also fails.

### P0-2. `log.Fatalf` after engine start orphans `llama-server` — certain from Go semantics
`cmd/server/main.go` starts the engine at line 54 (`defer engine.Close()` at 56) but then
calls `log.Fatalf` at **line 63** (`api.New` failed) and **line 113** (`ListenAndServe`
failed). `log.Fatalf` calls `os.Exit(1)`, and **deferred functions do not run on
`os.Exit`** — so both paths leak the engine, and `defer st.Close()` is skipped too.

The realistic trigger is line 113 with *port 8080 already in use*: someone double-clicks
the launcher twice, or restarts it after a crash that left the old one bound. Result: a
cascade — orphan #1 holds 8090, launch #2 fails on 8080, orphans nothing new but leaves
the first orphan resident, and every subsequent launch fails the same way.

### P0-3. A corrupt or truncated `pet.db` bricks the app completely — CONFIRMED
Probe results against the real `store.Open`:

```
Open(garbage file)   -> err = store: setting synchronous=FULL: file is not a database (26)
Open(truncated db)   -> err = store: setting synchronous=FULL: database disk image is malformed (11)
```

`main.go:50` turns that into `log.Fatalf("opening store: %v", err)` — **the app does not
start at all**. There is no backup, no restore, no quarantine. The child's key is a brick
and the only visible output is a raw SQLite error in a terminal.

This is not hypothetical for this demo specifically: **§13 step 6 yanks a live key out on
stage.** A yank during a write is precisely how you produce a malformed SQLite file, and
§13 step 7 then plugs that same key into a laptop. `PLAN.md` §1 promised "`pet.db` is
written via a write-then-rename with a `backup.db` fallback"; that has never been built
(it was scoped to M4).

### P0-4. One malformed level file takes down all eight levels — CONFIRMED
`levels.LoadAll` returns an error for the whole directory if any single `.json` fails to
parse. Probe: a directory with the 8 good level files plus one truncated `level-9.json`:

```
New(8 good + 1 truncated level file) -> err = api: loading levels: levels: parsing level-9.json: unexpected end of JSON input
```

That propagates to `api.New` → `log.Fatalf` → dead app (and, per P0-2, an orphan). A
partially-written content file on a yanked USB drive is a plausible way to reach this.

### P0-5. Raw technical errors are rendered directly to the child
`web/src/PlayPage.tsx` (3 sites), `Dashboard.tsx`, and `CompareView.tsx` all do
`.catch((e) => setError(String(e)))` and render that string. A failing request puts e.g.
`Error: 500 Internal Server Error: {"error":"store: reading learner: ..."}` on screen in
front of an 8-year-old. Classified P0 per this audit's own rule ("anything that … shows a
raw error to a child is P0"), though it degrades rather than crashes.

---

## P1 — will visibly degrade the demo

### P1-1. Pre-warming silently disables the latency HUD *and* `?compare=1` — CONFIRMED
`-prewarm-hints` defaults to **true**, so at startup every `(level, signature)` pair is
generated and cached at history bucket 0. A child's *first* mistake therefore always hits
the cache, and `handleHint`'s cache-hit branch returns early — before
`RecordTierHint`. Probe, simulating the real launcher (prewarm on, then one hint):

```
FIRST hint response: map[cached:true error_signature:off_by_one_repeat hint:... model:fake.gguf tier:low]
  -> latency_ms ABSENT from cached response
tier_hint_history rows after a cached hint: 0
GET /api/compare -> 0 records []
```

Two consequences, both demo-facing:
- The tier HUD shows **no latency figure at all** on the first hint. Brief §8 explicitly
  asks for per-request latency on the game screen.
- `tier_hint_history` is never written, so **`?compare=1` renders "Not demoed yet" for
  both tiers** — the judge-facing "same key, better hardware" asset shows nothing.

(It self-corrects on the *second* occurrence of the same mistake, which lands in bucket 1
and is not pre-warmed. But §13 step 4's first hint is the one on camera.)

### P1-2. Stale M2 placeholder text is on screen for every level
`web/src/pet/SpeechBubble.tsx`:

```ts
const PLACEHOLDER = "Hi! I'm Pip. I'll have real hints for you soon — M3 territory.";
```

This is the default speech-bubble text shown on **every level load**, before the first
hint. M3 shipped days ago. A judge reads "I'll have real hints for you soon" on the main
game screen.

### P1-3. An empty `content/levels/` starts the server with zero levels, silently
Probe: `New(empty levels dir) -> srv=true err=<nil>`. `/api/levels` returns `[]`, and the
dashboard renders four section cards each stuck on "Loading…" forever with no error. A
drive assembled with a missing/empty content dir looks like a hung app rather than a
misconfigured one.

### P1-4. An 8 GB Pi 5 will select the **high** tier and undercut §13 step 7
`SelectTier` is RAM-only: `availableMB >= high.trigger.min_ram_mb` (6144). A Pi 5 8 GB
model reporting >6144 MB available picks the 1.7B model. Two problems: the Pi runs the
slow model, and §13 step 7's whole beat ("plug key A into a laptop — the model just
resized itself for the bigger machine") has nothing to show because the Pi already chose
high.

**No code fix needed** — `profiles.json` ships on the drive and is the intended control
surface. Raising `tiers.high.trigger.min_ram_mb` on the Pi's copy (e.g. to `999999`) pins
it to low with zero code change. Recorded here so it is a deliberate pre-event checklist
item rather than a surprise on stage.

---

## P2 — real but survivable (documented, not fixed)

- **No explicit `fsync` beyond `PRAGMA synchronous=FULL`.** `PLAN.md` §2 promised "PRAGMA
  synchronous = FULL **plus an explicit fsync of the DB file**". Only the PRAGMA exists.
  Probe confirms the PRAGMA is genuinely applied and *stays* applied
  (`PRAGMA synchronous = 2`, still 2 after 50 writes; `journal_mode = delete`), so
  SQLite is fsyncing the journal and DB at each commit and the durability property
  actually holds. The extra fsync was belt-and-braces; its absence is a doc/plan
  divergence, not a live durability hole.
- **No `backup.db` / write-then-rename.** Brief §7 and `PLAN.md` both call for it; scoped
  to M4 and never built. P0-3's fix adds a minimal safety net, not the full scheme.
- **Hunger is cumulative-forever, not session-scoped.** Brief §10 says session-scoped.
  `pet.session_started_at` is written once at pet creation and **never updated**; nothing
  resets hunger per session. Because `hungerDelta >= 0` always and it clamps at 100, a
  well-used key sits permanently at 100 and the stat stops meaning anything. Note the
  requirement "no cross-day decay" *is* satisfied (trivially — it never decays) and "never
  regresses" is satisfied, so the two hard rules hold; only the "session-scoped" framing
  diverges.
- **§13 step 6's "level 1, hungry" pet will not render as hungry.** `moodFromHunger`
  returns `"hungry"` only below 25; a fresh key defaults to hunger 50 → `"idle"`. Fixing
  it is a one-value economy decision (default 50→20, or threshold 25→55), not a bug fix,
  so it is left alone deliberately.
- **`firstTry` is client-side only and resets on page reload** (`PlayPage.tsx`
  `attemptCounts`). Reloading and re-solving a level re-awards the first-try tier (8)
  instead of the plain solve tier (5). Bounded by the `alreadySolved` gate added earlier,
  so it only mis-scores a level's genuine first solve after a refresh.
- **`profiles.json`'s `tasks{}` block is parsed but never consulted.** `tier_pref` and
  `max_tokens` are dead config; `MaxTokens: 60` is hardcoded in
  `internal/hints/generate.go:38`. Brief §8 asks for the schema to exist, so the block
  stays — but nothing honours it.
- **`SelectTier` zero-value landmine.** `LoadProfiles` validates that `tiers.low` and
  `tiers.high` exist but not that `high.trigger.min_ram_mb` is set. If it were missing,
  `availableMB >= 0` is always true → always high tier. The shipped `profiles.json` sets
  it correctly, so this is latent, not live.
- **`Close()` calls `Kill()` without `Wait()`** (`llamaengine.go:175`). On Linux the
  killed child stays a zombie until the parent exits. Harmless in practice (the parent is
  exiting anyway, and zombies hold a PID-table slot, not RAM) but it is why `Close()`
  cannot be relied on as a general-purpose "stop the engine and keep running" call.

## P3 — cosmetic / stylistic (documented, not fixed)

- Stale comment in `PlayPage.tsx:47` claims "No backend attempts log yet (M1/M2
  deferred…)" — the `attempts` table has had a real writer since M3.
- `writeJSON` ignores the `json.Encoder.Encode` error return (`api.go:394`).
- `executor.ErrUnknownCall` ("unknown_call") is reachable in the executor but has no hint
  bank entry and no `Classify` mapping. Unreachable from the UI in practice — the Blockly
  card set has no `define`/`call` cards — so it can only surface via hand-crafted JSON.
- `wrong_order` and `never_picked_up` from brief §11's taxonomy still have no detector.
  Already documented as deliberate gaps in `content/hints/README.md`; no level currently
  places an item, so `never_picked_up` is not merely undetected but inapplicable.
- `fallbackGrid()` exists only for `level_id`-less manual curl testing; real gameplay
  always passes `level_id`. Harmless testing affordance, slightly confusing on first read.

---

## Area-by-area findings against the requested checklist

### 1. Error handling on the hot path
| Hot-path event | Behaviour today | Verdict |
|---|---|---|
| Malformed AST | `ast.Validate` → 400 + friendly message, never a panic. Scalars bounded (`steps`/`ticks`/`times` must be ≥1). | ✅ correct |
| Runaway loop | 500-tick budget through a single `tick()` choke point; `repeat`/`while`/`move` all charge through it. Cannot hang. | ✅ correct |
| Dead `llama-server` | `GenerateVerifiedHint` catches the error and serves the verified bank text verbatim; `handleHint` never 500s. | ✅ correct |
| Slow `llama-server` | 8 s `DefaultHintTimeout` over the whole retry sequence → falls back to verified text. | ✅ correct |
| Hint bank lookup miss | `Bank.Lookup` returns `GenericFallback` for both an unknown signature and a missing bank file. | ✅ correct |
| Empty workspace | `empty_program` signature → real bank hint. | ✅ correct |
| Corrupt `pet.db` | **App refuses to start.** | ❌ P0-3 |
| Missing/bad level file | **App refuses to start / all levels lost.** | ❌ P0-4 |
| Any API failure | **Raw error string rendered to the child.** | ❌ P0-5 |

### 2. Drive-relative path resolution
Every filesystem access traces back to `paths.ExeDir()` (which resolves `os.Executable()`
and follows symlinks) — `store.DataDir()`, and in `main.go` the `content/levels`,
`content/hints`, `app/`, `profiles.json`, `bin/<os>/llama-server`, and model paths. No
hardcoded drive letters, no reliance on the working directory, anywhere in the Go tree.
**No findings.** The only absolute paths in the repo are inside `//go:build manual` test
files and `scripts/`, neither of which ships on the drive.

### 3. Crash safety of `pet.db`
- `fsync`-on-write: **verified genuinely active.** `PRAGMA synchronous` reads back as `2`
  (FULL) on the connection the app actually uses, and is still `2` after 50 writes — the
  `SetMaxOpenConns(1)` pool never silently re-opens a connection and loses it. Journal
  mode is `delete` (rollback journal) as documented.
- Backup/restore path: **does not exist.** Nothing to test. See P0-3 / P2.
- Hard-kill mid-write: not separately simulated, because the more fundamental finding
  landed first — the file formats that a mid-write kill produces (garbage / truncated)
  were both fed to `store.Open` directly and both brick the app (P0-3). Recovery from
  those is the thing that needs to exist before a mid-write test means anything.

### 4. Spec compliance
- **§5 (AST):** compliant. 9 ops, 4 condition forms, max depth 4 enforced at the moment an
  over-deep array would be constructed, unknown op → validation error not a crash.
  `MaxDepth` semantics documented in `fixtures/README.md`. No divergence found.
- **§7 (key protocol/schema):** schema tables all present (`learner`, `pet`, `inventory`,
  `attempts`, `level_progress`) plus `tier_hint_history` (documented addition for §8's
  compare view). Drive-relative paths ✅. `attempts` never pruned ✅. **Diverges on the
  write-then-rename + `backup.db` requirement** (P0-3/P2).
- **§10 (pet and economy):** attempts feed the pet regardless of outcome ✅
  (`HUNGER_BASE_ATTEMPT` is unconditional). Pet never regresses ✅ (`hungerDelta` is always
  ≥ 0; `highest_level` only ever `Math.max`'d). No cross-day decay ✅. "a hard problem
  attempted and failed feeds the pet more than an easy one solved" ✅ — 13 vs 5, now
  asserted by an automated test. **Diverges on "session-scoped"** (P2): hunger is
  cumulative for the life of the key, and `session_started_at` is vestigial.
- **§11 (tutor guardrails):** **fully compliant, verified by exhaustive call-site check.**
  There are exactly two `engine.Complete` call sites in the tree
  (`internal/hints/generate.go:38` and the pre-warm dummy in `llamaengine.go:83`). The
  only prompt ever built is `BuildHintPrompt(hintText, priorCount)`, where `hintText` is
  always either a human-written bank string or `GenericFallback`. Grepping every prompt
  construction for AST/program/code references returns nothing — **no representation of
  the child's program reaches the model on any path.** The model cannot be the source of
  truth about code because it is never shown any. Failure, timeout, and perspective-drift
  rejection all fall back to the verified string.

### 5. Orphaned processes
| Shutdown path | Engine killed? |
|---|---|
| Normal exit (`main` returns) | ✅ via `defer engine.Close()` |
| Ctrl-C / SIGTERM | ✅ `signal.NotifyContext` → `Shutdown` → `ListenAndServe` returns → defers run |
| `log.Fatalf` after engine start | ❌ **P0-2** — `os.Exit` skips defers |
| Parent crash / `kill -9` / Task Manager | ❌ **P0-1** — confirmed live |

### 6. Dead code and stale artifacts
Report only, per instructions: `profiles.json` `tasks{}` block (parsed, never read);
`TensorOverrides` (intentionally retained per brief §8); `executor.ErrUnknownCall`
(unreachable from the UI); `Learner.HighestLevel` (still written, no longer displayed
anywhere after `solved_levels` replaced it); `fallbackGrid()` (manual-testing affordance);
the stale `PlayPage.tsx:47` comment. None of these are harmful; none were touched.

### 7. Test coverage on the §13 demo-critical path
Current totals: Go 56 tests across 7 packages, TS 19 tests. Mapped against §13:

| §13 step | Built? | Automated coverage |
|---|---|---|
| 1. Router unplugged / offline | ✅ | ⚠️ manual audit only (bundle grep + live network capture, documented in `DECISIONS.md`) — no automated regression test |
| 2. Pip appears, level 4, orange, wearing a hat | ❌ evolution art/cosmetics not built (M4/M5) | n/a |
| 3. Camera reads cards | ❌ Hub Mode not built (M5) | n/a |
| 4. `off_by_one_repeat` → hint citing prior history → fix → solve | ✅ **core demo beat, built** | ⚠️ **partial** — `TestClassify_OffByOneRepeat` covers classification, but **nothing tests end-to-end that a repeated mistake actually produces a hint whose prompt carries the "made this mistake N times before" clause.** Biggest coverage gap on the demo path. |
| 5. Buy a cake, pet evolves | ❌ shop/spend not built (M4/M5) | n/a |
| 6. Key A out / key B in | ❌ hot-swap not built (M4) | n/a |
| 7. Tier pill resizes on a bigger machine | ✅ | ✅ `sysmem` + `profiles.SelectTier` + `/api/tier` covered |
| 8. Closing numbers | n/a | n/a |

The honest headline: **only steps 4 and 7 of the eight-step demo script are implemented
today.** Everything else is M4/M5 and explicitly out of this pass's scope — but it means
the demo as scripted cannot be run end to end yet, and step 4 is carrying almost all of
the live-demo weight.

### 8. `TODO` / `FIXME` / provisional markers
No `TODO`, `FIXME`, `XXX`, or `HACK` markers exist anywhere in the Go or TS source. The
"provisional" language that does exist is in prose (`DECISIONS.md`, `QUESTIONS.md`) and
maps to items already classified above: the `unbalanced_block` client-trust boundary
(resolved, hardened to a closed enum), the `wrong_order`/`never_picked_up` detector gaps
(P3), the missing `backup.db` scheme (P0-3/P2), the client-side `firstTry` tracking (P2),
and the unverified-on-real-hardware Pi benchmark numbers (out of scope here — needs a Pi).
