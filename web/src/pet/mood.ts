// The pet's mood vocabulary and the rules that pick one. Pure, no React, no timers, no
// DOM -- so the whole state machine is testable without rendering anything.
//
// Two kinds of mood, and the difference is the whole design:
//
//   * SUSTAINED moods are a function of the world right now. "The program is running",
//     "hunger is low", "nobody has touched anything for a while". They are recomputed on
//     every resolve and need no cleanup, because they stop being true on their own.
//   * TRANSIENT moods are a reaction to a thing that just happened. "It bumped a wall",
//     "it reached the goal", "a block was just dragged". They carry an expiry and fall
//     back to whatever the sustained answer is once it passes.
//
// Priority is what makes interruption clean. A higher-priority event always replaces
// whatever is showing; a lower-priority one is dropped rather than queued. Nothing is
// ever half-applied, because `resolveMood` returns exactly one mood and the SVG renders
// entirely from that one value (see Pet.tsx) -- there is no per-part state to get out of
// sync with itself.

export type PetMood =
  | "idle"
  | "curious"
  | "thinking"
  | "happy"
  | "celebrating"
  | "hungry"
  | "sleepy"
  | "confused";

export const ALL_MOODS: PetMood[] = [
  "idle",
  "curious",
  "thinking",
  "happy",
  "celebrating",
  "hungry",
  "sleepy",
  "confused",
];

/** Higher wins. Gaps left between values so a mood can be slotted in without renumbering. */
export const MOOD_PRIORITY: Record<PetMood, number> = {
  celebrating: 60, // reaching the goal outranks everything -- it is the point of the game
  confused: 50, // a bump is the teaching moment; never let it be swallowed
  happy: 40, // the settle-down after celebrating, and after being fed
  thinking: 30, // program running / hint on its way
  curious: 20, // a block was just moved
  hungry: 10, // sustained, but must not mask any of the above
  sleepy: 5, // lowest real mood -- only when genuinely nothing is happening
  idle: 0,
};

/** How long each transient mood holds before falling back. Milliseconds. */
export const MOOD_DURATION_MS: Partial<Record<PetMood, number>> = {
  celebrating: 1800,
  happy: 2600,
  confused: 2400,
  curious: 1100,
};

/** Below this, the pet is visibly hungry and starts asking for something. */
export const HUNGRY_THRESHOLD = 25;

/** No pointer/key interaction for this long and the pet dozes off. A mood, not a timer
 *  that depletes anything -- nothing is lost by being sleepy and one click ends it. */
export const SLEEPY_AFTER_MS = 45_000;

export interface Transient {
  mood: PetMood;
  /** Timestamp (ms) after which this transient no longer applies. */
  expiresAt: number;
}

export interface MoodInputs {
  transient: Transient | null;
  /** A program is executing, or a hint request is in flight. */
  busy: boolean;
  hunger: number;
  /** Timestamp (ms) of the last pointer/key interaction anywhere in the app. */
  lastInteractionAt: number;
  now: number;
}

/** The mood implied by the world as it stands, ignoring anything that just happened. */
export function sustainedMood(i: Pick<MoodInputs, "busy" | "hunger" | "lastInteractionAt" | "now">): PetMood {
  if (i.busy) return "thinking";
  if (i.hunger < HUNGRY_THRESHOLD) return "hungry";
  if (i.now - i.lastInteractionAt >= SLEEPY_AFTER_MS) return "sleepy";
  return "idle";
}

export function resolveMood(i: MoodInputs): PetMood {
  const sustained = sustainedMood(i);
  if (!i.transient || i.transient.expiresAt <= i.now) return sustained;
  // A live transient only shows if it actually outranks the sustained answer. This is
  // what stops a stale `curious` from sitting on top of a program that has since started
  // running, without needing to cancel the transient at the call site.
  return MOOD_PRIORITY[i.transient.mood] >= MOOD_PRIORITY[sustained] ? i.transient.mood : sustained;
}

/**
 * Whether an incoming transient should replace the one currently showing.
 *
 * Equal priority replaces (re-firing `curious` on every block drag should restart its
 * window, not be ignored); lower priority is dropped outright rather than queued, so a
 * bump can never be overwritten a frame later by the block move that followed it.
 */
export function shouldReplaceTransient(current: Transient | null, incoming: PetMood, now: number): boolean {
  if (!current || current.expiresAt <= now) return true;
  return MOOD_PRIORITY[incoming] >= MOOD_PRIORITY[current.mood];
}

/** Builds a transient for `mood`, or null if that mood isn't transient (sustained ones
 *  are derived, never pushed). */
export function makeTransient(mood: PetMood, now: number): Transient | null {
  const ms = MOOD_DURATION_MS[mood];
  return ms === undefined ? null : { mood, expiresAt: now + ms };
}
