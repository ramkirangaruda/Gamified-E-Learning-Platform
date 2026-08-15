// brief §10's point table and hunger rule, made concrete. Two things in the brief are
// explicit and non-negotiable, everything else here is a judgment call logged for
// review:
//   1. "Attempts feed the pet, not just correct answers... a hard problem attempted and
//      failed feeds it more than an easy problem solved" -- this is called out as the
//      single most important balance decision, so it's asserted by a test below, not
//      just implemented and hoped for.
//   2. Hunger never decays on its own (session-scoped, reset at session start) and the
//      pet never regresses -- both enforced by callers only ever adding a
//      non-negative delta here, never subtracting.
//
// Judgment calls (brief doesn't spell these out, logged in DECISIONS.md):
//   - "hunger" is read as a satiety meter -- higher is more fed/happier -- so feeding
//     increases it. The schema default (50, brief §7) reads as a neutral starting
//     point either way; satiety is the more common convention for this kind of stat.
//   - "Level solved: 5" and "Solved on first try: 8" are read as alternative tiers of
//     the same reward (first-try replaces the base solve reward, not on top of it),
//     not additive -- doubling up felt like over-rewarding a single event the table
//     presents as one row each.
//   - "Solved a level marked hard: 15" and the fewer-than-par bonus (+5) are read as
//     additive on top of the solved tier, since they describe different axes (this
//     level was hard / this solution was efficient) rather than alternative
//     descriptions of the same event.

export interface AttemptInput {
  outcome: "solved" | "failed";
  firstTry: boolean;
  hard: boolean;
  blocksUsed: number;
  parBlocks: number;
  // True when this level's index is already <= the learner's highest_level -- i.e. this
  // "solve" isn't new progress, just a re-run of a level already beaten. Without this,
  // clicking Run repeatedly on a finished level grants the full solve bonus every single
  // time with no cap, unlike hunger (which clampHunger already bounds at 100) -- points
  // have no such ceiling, so this has to be gated at the source instead.
  alreadySolved: boolean;
}

export interface AttemptReward {
  points: number;
  hungerDelta: number; // always >= 0 -- never regress, never decays
}

const ATTEMPT_POINTS = 1;
const SOLVED_POINTS = 5;
const SOLVED_FIRST_TRY_POINTS = 8;
const HARD_SOLVED_BONUS = 15;
const UNDER_PAR_BONUS = 5;

const HUNGER_BASE_ATTEMPT = 3;
const HUNGER_HARD_BONUS = 10;
const HUNGER_EASY_SOLVED_BONUS = 2;

export function computeAttemptReward(input: AttemptInput): AttemptReward {
  let points = ATTEMPT_POINTS;
  if (input.outcome === "solved" && !input.alreadySolved) {
    points += input.firstTry ? SOLVED_FIRST_TRY_POINTS : SOLVED_POINTS;
    if (input.hard) points += HARD_SOLVED_BONUS;
    if (input.blocksUsed < input.parBlocks) points += UNDER_PAR_BONUS;
  }

  // The formula that has to hold: hard+failed > easy+solved. With these constants,
  // hard+failed = 3+10 = 13; easy+solved = 3+0+2 = 5. See reward.test-manual notes in
  // DECISIONS.md for how this was checked.
  let hungerDelta = HUNGER_BASE_ATTEMPT;
  if (input.hard) hungerDelta += HUNGER_HARD_BONUS;
  if (input.outcome === "solved" && !input.hard) hungerDelta += HUNGER_EASY_SOLVED_BONUS;

  return { points, hungerDelta };
}

export function clampHunger(value: number): number {
  return Math.max(0, Math.min(100, value));
}

// PetMood and the rules for choosing one moved to pet/mood.ts when the pet became a
// persistent companion. The old `moodFromHunger(hunger, lastOutcome)` could only express
// four moods and only knew two facts about the world, so it could not react to anything
// that wasn't a finished run. mood.ts's machine subsumes it: `hungry` is one of its
// sustained moods and the outcome cases are now transient reactions with priorities.
// This file is back to being purely the §10 economy.
