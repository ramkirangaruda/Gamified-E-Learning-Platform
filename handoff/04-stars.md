# Handoff: Stars, end to end (a dead schema column)

**Paste this whole file into Claude Code on your machine.** It is written to be run
independently, in parallel, without touching anything the other workstream is editing.

## Why this one

`level_progress.stars` has existed in the schema since M1 (`internal/store/store.go:213`
— `CREATE TABLE IF NOT EXISTS level_progress (... stars INTEGER DEFAULT 0 ...)`) and has
never once been written by anything. The frontend knows this and compensates: `HomePage.tsx:36`
hardcodes `starsByLevel[id] = 1` for every solved level, and `PetBar.tsx:69` does
`solved ? 1 : 0`. The trail visibly under-reports on purpose — every solved level shows
exactly one star, never two or three, because the real per-level quality signal
(efficient solution, first-try) is computed nowhere server-side and never persisted.

There is already a correct, tested definition of what a star *should* mean — it's just
never called:

```ts
// web/src/trail/concepts.ts:45
export function starsFor(solved: boolean, blocksUsed?: number, parBlocks?: number, firstTry?: boolean): number {
  if (!solved) return 0;
  let stars = 1;
  if (blocksUsed !== undefined && parBlocks !== undefined && blocksUsed <= parBlocks) stars++;
  if (firstTry) stars++;
  return stars;
}
```

Nothing in the codebase calls `starsFor`. This task wires it up for real.

## What already exists (do not rebuild any of it)

- **`level_progress` schema and its writer.** `store.RecordLevelAttempt` (`store.go:506`)
  already upserts `attempts_count` and `first_solved_at` on every attempt, with the exact
  "never overwrite a real first-solve timestamp" `COALESCE` pattern you'll want to mirror
  for stars (stars must only ever go up — §10's "progress never regresses" — so any write
  you add should be `MAX(stars, ?)`, same idea).
- **`handleProgram`** (`internal/api/api.go:204`–`278`) is where a solve is actually
  detected server-side today: it runs the executor, then calls `RecordAttempt` and
  `RecordLevelAttempt` (`api.go:262`–`269`). This is the right place to also compute and
  persist stars — everything you need is already in scope there:
  - `result.Outcome == "solved"` — whether it solved
  - `lvl.ParBlocks` — the level's par, already loaded as `lvl` (`internal/levels`,
    field `ParBlocks int` — note the JSON tag is `parBlocks`, camelCase)
  - the program's actual "physical card" count — **do not invent a new way to count
    this.** `internal/levels/levels_test.go:219`'s `countCards(nodes []ast.Node) int` is
    the existing, calibrated definition (it's literally what `parBlocks` was set against
    when the levels were authored — see its comment: "what parBlocks is compared
    against"). It counts `repeat`/`while` as 2 + body (opener + closer card),
    `if`/`else` similarly. It's currently private to a `_test.go` file — promote it to a
    real, exported function (a good home is `packages/ast`, since it operates on
    `[]ast.Node` and both the test and the API need it) rather than duplicating the logic.
- **`stateResponse`** (`api.go:406`) already has the pattern for "derived, order-independent
  truth, not something the client round-trips" — `SolvedLevels` is computed fresh from
  `GetSolvedLevelIDs()` on every response rather than trusted from a POST body. Follow the
  same shape for stars: a `GetStarsByLevel() (map[string]int, error)` store method,
  surfaced as a new field on `stateResponse`, not folded into `store.State` (which is the
  learner/pet blob the client *does* round-trip via `SaveState`).

## Two inconsistencies to resolve, not silently pick one of

1. **Under-par comparison operator.** `starsFor` (concepts.ts) uses `blocksUsed <=
   parBlocks` for the bonus star. `reward.ts`'s point bonus (`computeAttemptReward`,
   `web/src/pet/reward.ts`) uses `blocksUsed < parBlocks` (strict) for the equivalent
   points bonus. These currently disagree on whether landing *exactly* at par earns the
   bonus. Pick one and make both consistent, or deliberately keep them different — either
   way, log the decision in `DECISIONS.md` rather than letting it be an accident.
2. **What "first try" means.** The client's existing `firstTry` (`PlayPage.tsx:84`,
   `attemptCounts` state) is session-local and resets on page reload — a known, logged gap
   (see `AUDIT.md`'s notes on `firstTry` being client-side only). Since you're now writing
   stars server-side and `level_progress.attempts_count` already persists real
   cross-session attempt history, you have the option to compute `firstTry` correctly
   here (`attempts_count == 0` *before* this attempt increments it) instead of inheriting
   the client's buggy version. Recommended, since it's a small correctness win directly on
   this task's surface — but it does mean reading `attempts_count` before
   `RecordLevelAttempt`'s upsert runs, not after. If you decide not to do this, say why in
   `DECISIONS.md` rather than leaving it ambiguous which definition stars actually used.

## The job

1. Promote `countCards` out of `levels_test.go` into a real exported function (e.g.
   `ast.CountCards` in `packages/ast`), with its own unit test. Keep `levels_test.go`
   using the promoted version rather than a copy.
2. Compute stars in `handleProgram`, resolving the two questions above deliberately.
3. Add a `Store` method to persist them without regressing (`MAX`-style upsert, mirroring
   `RecordLevelAttempt`'s `COALESCE` pattern), and a `GetStarsByLevel` reader.
4. Wire it into `stateResponse` / `withSolvedLevels` (`api.go:401`–`418`).
5. Update the frontend to consume real data instead of hardcoding 1 star per solve:
   `web/src/HomePage.tsx:35`–`36`, `web/src/pet/PetBar.tsx:69`, and anywhere else
   `starsByLevel` is currently synthesized rather than read from `state`.

## Hard constraints — these are not negotiable

- **Do not change the AST contract (`packages/ast/`) or the key protocol (§7 schema).**
  The `stars` column already exists in the schema — you're writing to it, not adding to
  the schema. `CountCards` is a new *function*, not a new AST node or field.
- **No new runtime dependencies.**
- **Every fix needs a test.** At minimum: `CountCards` against known ASTs (reuse the
  existing per-level fixtures if useful), the stars calculation against a solved/unsolved/
  under-par/over-par/first-try/repeat-try matrix, and the "never regresses" property
  (solve a level well, then badly — stars must not drop).
- **This task touches `internal/store/*` and `internal/api/*`.** Per
  `handoff/README.md`'s sequencing note, task 02 (key hot-swap) also touches
  `internal/store/*` and is meant to run *before* this one — check whether it has merged,
  and if not, coordinate directly rather than both guessing at how the changes combine.

## Do not touch these files — they are being actively edited

`web/src/pet/*` (except `PetBar.tsx`'s specific `starsByLevel` line — that edit is
explicitly part of this task, keep it minimal and don't touch anything else in that
directory), `web/src/App.tsx`, `web/src/PlayPage.tsx`, `web/src/index.css`,
`web/src/tokens.css`, `cmd/server/main.go`, `internal/paths/*`.

If task 02 hasn't merged yet, coordinate on `internal/store/store.go` directly rather
than working blind.

## Working rules for this repo

- Log decisions in `DECISIONS.md` and open questions in `QUESTIONS.md`, appending to the
  end.
- **Work on a branch** (`stars`) and open a PR rather than pushing to master.
- Commit per milestone with a real message explaining *why*.
- **Never add yourself or Claude as a commit co-author.**

## Acceptance — you are done when

1. Solving a level under par, on the first try, earns 3 stars; solving it over par on a
   later attempt earns 1; not solving it earns 0 — verified by a test, not just eyeballed.
2. Stars persist across a server restart and never decrease on a worse re-solve.
3. The trail, grid, and pet bar all show real per-level star counts instead of the
   hardcoded 1.
4. `go test ./...` and `npm test` are both green, including new tests for `CountCards`
   and the stars calculation.
