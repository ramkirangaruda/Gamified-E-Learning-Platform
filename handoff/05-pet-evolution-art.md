# Handoff: Pet evolution art (§13 step 2)

**Paste this whole file into Claude Code on your machine.** It is written to be run
independently, in parallel — **but check `handoff/README.md` before starting: this task
is scoped to wait until task 01 (Hub Mode) has merged**, specifically because it lives
entirely in `web/src/pet/*`, which the main workstream rewrote most recently and nobody
wants two people editing at once.

## Why this one

§13 step 2 of the demo script is: "Pip appears, level 4, orange, wearing a hat." Visible
growth is what sells the companion idea — a pet that just sits there being the same
color and shape regardless of how much the child has done doesn't read as alive. Per
`AUDIT.md`'s demo-coverage table, this step is **not built.**

The wiring for this actually half-exists already, which is exactly why it's a good task:
nothing here requires inventing an approach, it requires finishing one that's visibly
stubbed out.

## What already exists (do not rebuild any of it)

- **`pet.evolution_stage`** is a real, persisted, round-tripped integer — schema
  (`internal/store/store.go:195`), Go struct field, `SaveState`/`getPet` read/write it,
  it survives a restart (`store_test.go:76`–`103` proves this), and it flows all the way
  to the frontend: `web/src/api.ts:34` → `HomePage.tsx:90`
  (`petStage={state?.pet.evolution_stage ?? 0}`) → `Trail.tsx:118` → `Pet.tsx`'s
  `evolutionStage` prop → rendered as `data-stage={evolutionStage}` on the pet's SVG root
  (`Pet.tsx:52`).
- **CSS stand-ins already exist**, keyed off `data-stage` (`web/src/index.css:89`–`90`,
  `134`–`135`, `146`–`161`): a dashed gold ring appears at stage 1+, a small gold crown at
  stage 2+. `Pet.tsx:87`–`90`'s own comment says exactly what these are: *"Cheap
  stand-ins until real stage art exists."*
- **Thresholds already exist.** `web/src/trail/concepts.ts:37`–`41`:
  ```ts
  export const EVOLUTION_MARKERS: { afterSolved: number; label: string }[] = [
    { afterSolved: 5, label: "Pip grew!" },
    { afterSolved: 13, label: "Pip grew again!" },
    { afterSolved: 22, label: "Pip is fully grown!" },
  ];
  ```
  Three thresholds → stages 1, 2, 3 (stage 0 is the base form). Nothing currently reads
  this array to decide what `evolution_stage` should be — it's used elsewhere on the
  trail to place a label, not to drive the pet's own stage.
- **The nearest real gap you can point at without any investigation:** stage 2 and stage 3
  currently render *identically* — both get the ring and both get the crown
  (`index.css:146`–`161` both check `data-stage="2"` and `data-stage="3"` together). "Pip
  is fully grown" has no visual distinction from "Pip grew again" today.

## The actual gap

Two separate things are missing, and both are needed for the step to actually happen on
stage:

1. **Nothing ever advances `evolution_stage` past 0.** Grep the whole tree —
   `EvolutionStage = 2` only appears in test files (`store_test.go`). No API handler, no
   frontend code, computes a real stage from solved-level count and persists it. The pet
   could solve every level in the curriculum and never visibly change.
2. **The art itself is a placeholder.** A ring and a crown are legible as "something
   changed" but don't match the demo script's actual language ("orange, wearing a hat") —
   and stage 3 doesn't read as different from stage 2 at all.

## The job

### 1. Wire up the stage computation

Somewhere server-side, compare the learner's solved-level count against
`EVOLUTION_MARKERS`'s thresholds and persist the resulting stage. Two constraints worth
weighing (make a call, log it in `DECISIONS.md`):

- `EVOLUTION_MARKERS` currently lives in TypeScript (`web/src/trail/concepts.ts`) and
  drives a UI label. If the real source of truth for stage becomes a Go-side computation,
  either mirror the three thresholds server-side (simplest — three numbers, unlikely to
  drift, same principle as the 14 cards being a fixed, final set) or find another way to
  keep them from silently diverging. Don't leave two different threshold lists that can
  disagree about when the pet grows.
- Follow the pattern task 04 (stars) uses for the same kind of problem: `stateResponse`
  already treats `SolvedLevels` as *derived on every response*, not something the client
  is trusted to round-trip (see `api.go:401`–`418`'s comment). `evolution_stage` fits the
  same shape — compute it fresh from solved-count each time, write it via a
  never-regress upsert (`UPDATE pet SET evolution_stage = MAX(evolution_stage, ?)`,
  mirroring the `COALESCE`/`MAX` pattern already used for `first_solved_at` and (if task
  04 has landed) `stars`), rather than trusting whatever the client last POSTed via
  `SaveState`.
- Natural call site: alongside `RecordLevelAttempt` in `handleProgram`
  (`internal/api/api.go:267`), since that's exactly where a solve is detected and
  `GetSolvedLevelIDs()`'s count is already one query away.

### 2. Real stage art

Replace (or substantially extend) the ring/crown stand-ins with something that actually
reads as growth — color shift and a hat are the demo script's own language, and are
achievable within the existing SVG structure without new files: `Pet.tsx` already has a
`pet-body`/`pet-belly` (fill color, easy to shift per stage the same way mood already
shifts other fills) and plenty of precedent for a new accent group (`pet-accent-*`
groups already exist for mood — a `pet-hat` group at stage 2+, hidden by default and
shown via the same `data-stage` CSS pattern the ring uses, fits the existing convention
exactly).

Concretely:
- Give stage 3 something stage 2 doesn't have — right now they're visually identical,
  which undersells "fully grown" as a milestone.
- Reuse the SVG's existing conventions: everything already in the DOM, visibility done in
  CSS via data attributes (`Pet.tsx`'s own top-of-file comment explains why — mount/unmount
  races, cheap compositing). Don't introduce a second image or a conditional-render
  approach; it would contradict the documented reason the component is built this way.
- Check `idleAnimation.test.ts` (`web/src/pet/`) before you're done — it parses the
  stylesheet and fails the build if the existing performance-budgeted animation
  conventions erode. If your new stage art adds any animation, it needs to follow the
  same composited/stepped discipline documented in `Pet.tsx`'s comments (an eased SVG
  transform animation was measured at +53 CPU points vs. +0 for a stepped, composited
  one — don't reintroduce that regression for a hat).

### 3. Optional, if you want to close it: the cake question

`QUESTIONS.md` has an open item: buying the cake (`web/src/pet/treats.ts`, `TreatShop.tsx`)
plays a real eat animation but does **not** trigger evolution — evolution is solely
driven by levels solved, and the original queue explicitly declined to invent that link
silently. If you want to resolve it, it's a small addition once stage computation exists;
if you're not sure the demo wants it, leave the question open rather than guessing.

## Hard constraints — these are not negotiable

- **No new AST operations, no new card types, no changes to `packages/ast/`.** This task
  never needs to touch it.
- **No new runtime dependencies.**
- **Every fix needs a test.** At minimum: stage advances at the right solved-counts and
  never regresses (mirror `store_test.go:268`–`302`'s existing "evolution stage ... never
  regresses" pattern), and stage 2 vs. stage 3 are provably visually distinct (parse the
  stylesheet the way `idleAnimation.test.ts` does, rather than eyeballing it).
- **Offline, no copyrighted or brand assets.** All art is original SVG, same as the rest
  of the pet.

## Do not touch these files — they are being actively edited

`web/src/App.tsx`, `web/src/PlayPage.tsx`, `web/src/HomePage.tsx` (except the one
`petStage` line, which is already correct and shouldn't need to change), `cmd/server/main.go`,
`internal/paths/*`, `internal/store/*` (except the specific evolution-stage write you're
adding — coordinate with task 02/04 if either is still in flight, since both also touch
`internal/store/store.go`).

`web/src/pet/*` and `web/src/index.css`/`web/src/tokens.css` are this task's own
territory — that's the whole point of waiting for task 01 to merge first.

## Working rules for this repo

- Log decisions in `DECISIONS.md` and open questions in `QUESTIONS.md`, appending to the
  end.
- **Work on a branch** (`pet-evolution-art`) and open a PR rather than pushing to master.
- Commit per milestone with a real message explaining *why*.
- **Never add yourself or Claude as a commit co-author.**

## Acceptance — you are done when

1. A pet that starts at stage 0 and crosses 5/13/22 solved levels visibly, persistently
   advances through stages 1/2/3 — verified by a test that drives solved-count up and
   checks the persisted stage, not just a visual check.
2. Stage 2 and stage 3 are visually distinguishable from each other, not just from stage
   0/1.
3. The idle-animation performance budget test still passes untouched.
4. `go test ./...` and `npm test` are both green.
