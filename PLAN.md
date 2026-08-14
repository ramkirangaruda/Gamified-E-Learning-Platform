# PLAN.md — Tessera Quest

Produced per build-brief §0. Nothing beyond this file has been written. Waiting for approval before starting Milestone 1.

## 1. Architecture, restated in my own words

The product is three different ways for a child to *produce a program* — camera-read
physical cards on the Pi (Hub Mode), mouse-dragged Blockly blocks on any laptop (Home
Mode), and a read-only teacher view (Teacher Mode) — that all collapse into one shared
JSON structure, the **AST**. Nothing downstream of the AST is allowed to know or care
which of the three produced it. That's the one rule everything else serves, and it's why
the AST package is the first thing to build, not an early nice-to-have.

Once an AST exists, four things consume it, all living behind a single Go binary:

- **Executor** — a deterministic interpreter. Given a grid, a starting position/facing,
  and an AST, it produces a flat list of timestamped events (move, turn, bump, goal…).
  It is the *only* place "is this program correct" is decided. Nothing else — not the
  tutor, not the frontend — re-implements movement rules.
- **Quest engine** — turns executor outcomes into XP/points/level state.
- **Pet** — a mood state machine driven by attempts (not just successes), scoped to the
  current session only, monotonically non-decreasing in progress.
- **Tessera engine** — a locally-run LLM (llama-server + a Qwen3 GGUF) that turns a
  pre-verified, human-written hint string into something Pip-the-pet would say. It never
  sees the child's code and never generates a claim about correctness; it only rephrases.
  Which model size loads is decided once at launch from detected RAM.

All persistent state — the child's entire identity — lives in one SQLite file that
travels with them on a USB drive: no accounts, no server-side database, no network. The
Go binary is both the web server (serving the built React/Blockly frontend and a small
JSON API) and the owner of that SQLite file. The vision system is a deliberately
separate Python/OpenCV process that only runs on the Pi; it POSTs the AST it read off
the desk to the Go server over localhost and is otherwise invisible to the rest of the
system — nothing imports it, nothing depends on it existing.

The thing that makes the USB drive work as "the account" is discipline, not cleverness:
every path the binary touches is resolved relative to its own executable (never a
hardcoded drive letter), every state write is fsync'd, and `pet.db` is written via a
write-then-rename with a `backup.db` fallback, because the realistic failure mode is a
child yanking the drive mid-write.

## 2. Milestone 1 task breakdown

M1 acceptance test (brief §12): *POST a fixture AST → receive a correct event trace. All
executor tests green. State persists across a server restart.* Everything below is scoped
to make that true and nothing more — no frontend, no vision, no LLM in M1.

1. **Repo scaffolding**
   - `git init` in `tessera-quest/` (separate repo from the existing `tessera/` — see
     Assumption A1), `.gitignore` (Go build artifacts, `node_modules`, `*.db`, `dist/`)
   - `go.mod` — module path TBD, see Assumption A6
   - Directory layout: `packages/ast/`, `cmd/server/`, `internal/executor/`,
     `internal/store/` (SQLite layer), `internal/api/` (HTTP handlers)

2. **AST contract — `packages/ast/`** (brief §5)
   - `schema.json` — JSON Schema for the AST envelope, all 9 node ops, all 4 condition
     forms
   - `ast.go` — Go structs for the AST (`Program`, `Node`, `Cond`) with JSON tags
   - `validate.go` — hand-written Go validator (not schema-library-driven, see
     Assumption A2): rejects unknown `op`, enforces max nesting depth 4, checks
     `repeat`/`if`/`while`/`define` structural well-formedness, returns a friendly
     error rather than panicking
   - `types.ts` — hand-mirrored TypeScript types for the same contract (unused until
     M2, but it's an explicit M1 deliverable so the two surfaces can't drift silently)
   - `fixtures/` — 20 programs: a spread of valid programs (one per node type, one
     nested to exactly depth 4, one using `define`/`call`) and invalid ones (depth 5,
     unknown op, malformed `if`/`repeat`, empty program) — this is the shared corpus
     both the Go validator and (later) the executor tests run against
   - `validate_test.go` — runs every fixture through the validator, asserts valid ones
     pass and invalid ones fail with the expected error

3. **Executor — `internal/executor/`** (brief §9)
   - `executor.go` — `Run(grid, startPos, startDir, ast) (events []Event, outcome
     string, ticksUsed int, errorSignature string)`
   - Hard tick budget of 500; exceeding it returns `outcome: "failed"`,
     `error_signature: "infinite_loop"` — never hangs, never panics on a malformed AST
     (relies on the validator having already run at the API boundary, but the executor
     itself does not trust that blindly for `repeat`/`while` bounds)
   - Event types: `move`, `turn`, `bump`, `goal` per brief §9 examples
   - `executor_test.go` — table-driven tests against `packages/ast/fixtures/`, plus a
     handful of executor-specific fixtures (grid + expected trace) for movement,
     bumping into walls, hitting the tick budget

4. **SQLite layer — `internal/store/`** (brief §7)
   - Schema exactly as specified: `learner`, `pet`, `inventory`, `attempts`,
     `level_progress`, applied via an embedded migration run on startup (idempotent —
     `CREATE TABLE IF NOT EXISTS`, no migration framework needed at this scale)
   - Every write wrapped in a helper that fsyncs after commit (`PRAGMA synchronous =
     FULL` plus an explicit fsync of the DB file, since PRAGMA alone doesn't guarantee
     durability against a yank on all filesystems)
   - `data/` directory resolved relative to `os.Executable()`, created if absent
   - Full write-then-rename / `backup.db` / corruption-recovery logic is an M4
     deliverable (brief explicitly scopes hot-yank testing to M4), but the write path
     is built the fsync-safe way from the start so M4 doesn't require touching this
     layer's write semantics

5. **Go server — `cmd/server/`**
   - Static file serving from `app/` (the future built frontend — serves whatever's
     there for now; empty in M1, brief doesn't require a placeholder page)
   - `POST /api/program` — body is a raw AST JSON; validate via `packages/ast`, run
     through the executor, return `{events, outcome, ticks_used, error_signature?}`;
     validation failure returns 400 with the friendly error, never a 500
   - `GET /api/state` / `POST /api/state` — minimal learner+pet read/write against the
     SQLite layer (exact shape is Assumption A4 below, since the brief doesn't pin one)
   - Uses Go 1.22's stdlib `net/http.ServeMux` (method+path patterns) — no router
     dependency needed

6. **Acceptance check**
   - A scripted check (small `_test.go` or a documented `curl`/`Invoke-WebRequest`
     sequence) that: starts the server, POSTs a known-valid fixture, asserts the
     returned trace matches an expected trace, writes learner/pet state, restarts the
     process, and asserts the state is still there
   - `go test ./...` green across `packages/ast` and `internal/executor`

## 3. Assumptions (this brief doesn't settle these — flag if any is wrong)

- **A1 — New project lives in a sibling directory, not inside the existing `tessera/`
  repo.** `C:\Users\ramki\Desktop\here\tessera\` already exists and is its own git repo
  — but it's a *different project* (see A7 below, this is the one I most want you to
  check). I've created `tessera-quest/` alongside it as the new repo root and put this
  file there. If you intended the game to live inside/alongside the existing repo
  differently, say so before I `git init`.
- **A2 — AST validation is a hand-written Go validator, not a JSON-Schema-library-driven
  one.** The brief's M1 deliverable list says "the schema, **a Go validator**, a
  TypeScript type" — read as two separate artifacts (a schema file for documentation/
  future JS-side use, and separately hand-rolled Go logic), not "the Go validator is
  implemented by feeding schema.json to a validation library." This keeps M1 at zero new
  dependencies. If you'd rather the Go side actually validate against `schema.json` at
  runtime via a library, that's a dependency to discuss (A-dep list below has none for
  this reason).
- **A3 — Go module path is a placeholder** (`tessera-quest`, no GitHub org prefix) until
  you confirm whether/where this repo gets pushed. Cosmetic, trivially changed later.
- **A4 — `/api/state` request/response shape isn't specified in the brief.** For M1 I'm
  building the smallest thing that proves persistence: `GET /api/state` returns the
  current `learner` + `pet` + `inventory` rows (or a fresh-learner default if the DB is
  empty), `POST /api/state` upserts learner/pet fields. This will very likely grow once
  M2's UI defines what it actually needs — treating M1's version as provisional.
- **A5 — No placeholder frontend page in M1.** Brief's M1 scope list doesn't mention
  React at all (that's M2); `app/` will just be an empty directory the static file
  server points at.
- **A6 — "Full unit tests" for the executor means the fixture corpus plus
  executor-specific grid/trace fixtures, run via `go test`, not a specific coverage
  threshold.** No coverage tooling added unless you want one.
- **A7 — Biggest one: what "reuse the repo" (brief §8) actually means, scoped narrowly
  for now.** The existing `tessera/` repo at this path is a *different hackathon
  project* — a portable, precision-adaptive local-LLM hardware key: RP2040/ESP32-S3
  firmware, an ATECC608A secure element, an ECDH handshake protocol, a custom nested
  bit-plane weight format (`.tsra`) with a per-tensor sensitivity-sweep allocator, and a
  Python daemon + React dashboard — built to demo *general-purpose offline LLM
  portability*, not children's coding education. It is **not** Tessera Quest's codebase
  with a different UI; it's a different product that happens to share the project name
  and, usefully, has already made (and stress-tested) the exact "Qwen3 dense +
  llama.cpp/GGUF, tiered by device RAM" decision that brief §8 asks for.

  For M1 this doesn't matter (no LLM work yet). But since §8's `profiles.json` design
  is due in M3, I want to flag now how I plan to read "reuse": **take the validated
  ideas — Qwen3-0.6B/1.7B as the model pair, llama.cpp/GGUF as the inference backend,
  RAM-triggered tier selection — and reimplement the small, literal `profiles.json`
  scheme in brief §8 in Go.** I do *not* plan to pull in that repo's firmware, secure
  element, custom crypto handshake, or `.tsra`/allocator pipeline — Tessera Quest's key
  is a plain exFAT drive with no custom hardware (brief §7), so the dongle-specific
  machinery in that repo doesn't have anywhere to attach, and brief §8 itself describes
  something much simpler (a static `profiles.json` + `tensor_overrides` left empty is
  explicitly fine) than that repo's per-tensor allocator. If you actually want the
  heavier machinery (the secure element, the bit-plane format, real per-tensor
  allocation) pulled into this project, that's a large scope change from what's written
  in the brief and I'd want to talk about it before M3, not discover it there.

## 4. Dependencies

**M1 needs exactly one dependency, and it's already named in brief §4:**

| Dependency | Justification |
|---|---|
| `modernc.org/sqlite` | Pure-Go SQLite driver, no cgo — required per brief §4 so the binary keeps cross-compiling cleanly to Windows; `mattn/go-sqlite3` is explicitly disallowed |

No other module — Go stdlib (`net/http`, `encoding/json`, `os`, `testing`) covers
everything else M1 needs. Nothing from `packages/ast`'s JSON Schema requires a runtime
schema library given Assumption A2. React/Vite/Tailwind/Blockly/OpenCV/llama.cpp are all
M2+ and already pre-approved in brief §4 when their milestones arrive — I'll still flag
each concretely when I actually add it, per your instruction.

---

Waiting for your go-ahead (and any correction to §3) before starting Milestone 1.
