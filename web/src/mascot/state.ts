// The mascot's state vocabulary and the rules that pick one. Pure, no React, no timers,
// no DOM -- structurally identical to pet/mood.ts (which this supersedes), extended from
// 8 moods to the 14 states the Hub Mode mascot brief calls for (the 13 named states plus
// `hungry`, which is an existing, working, orthogonal sustained state from the hunger/
// feed system and must not silently disappear). `curious` (existing, block-drag-only) is
// folded into `playful` -- dragging a block is exactly "the pet notices something small
// and playful happened".
//
// Two kinds of state, same distinction pet/mood.ts drew:
//
//   * SUSTAINED states are a function of the world right now (busy, hunger, how long since
//     the last interaction, whether a next level is worth pointing at). Recomputed on every
//     resolve, need no cleanup.
//   * TRANSIENT states are a reaction to a thing that just happened, carry an expiry, and
//     fall back to the sustained answer once they pass. `pointing` is the one exception --
//     see makeTransient's comment.
//
// Priority is what makes interruption clean: a higher-priority event always replaces
// what's showing, a lower-priority one is dropped rather than queued.

export type MascotState =
  | "idle"
  | "welcome"
  | "happy"
  | "excited"
  | "thinking"
  | "encouraging"
  | "confused"
  | "pointing"
  | "celebrating"
  | "streak"
  | "milestone"
  | "playful"
  | "sleepy"
  | "hungry";

export const ALL_MASCOT_STATES: MascotState[] = [
  "idle",
  "welcome",
  "happy",
  "excited",
  "thinking",
  "encouraging",
  "confused",
  "pointing",
  "celebrating",
  "streak",
  "milestone",
  "playful",
  "sleepy",
  "hungry",
];

/** Higher wins. Gaps left between values so a state can be slotted in without renumbering.
 *
 *  celebrating/milestone/streak form a "how big was the win" ladder mirroring
 *  pet/reward.ts's point tiers (first-try solve 8 > solved 5 > attempt 1). confused stays
 *  high per the same reasoning pet/mood.ts documented for its own priority table: a wrong
 *  answer is a teaching moment and must never be silently swallowed by something lower-
 *  stakes. encouraging sits just under confused because it's usually paired with a
 *  confused/locked-level event (the confused/gentle reaction wins the display; encouraging
 *  still drives the speech-bubble text independently, see speech.ts). welcome is
 *  deliberately mid-low (30) so a child who clicks a level within the first second isn't
 *  stuck watching an onboarding reaction outrank their actual action. */
export const STATE_PRIORITY: Record<MascotState, number> = {
  celebrating: 120,
  milestone: 100,
  streak: 90,
  confused: 80,
  excited: 70,
  encouraging: 60,
  happy: 50,
  thinking: 40,
  pointing: 35,
  welcome: 30,
  playful: 25,
  hungry: 10,
  sleepy: 5,
  idle: 0,
};

/** How long each transient state holds before falling back. Milliseconds.
 *
 *  `pointing` DOES have a duration here, for the hover/unlock-triggered pulse
 *  (levelHovered/levelUnlocked push it as an ordinary transient reaction) -- that's a
 *  separate thing from the SUSTAINED pointing branch in sustainedMascotState, which is
 *  genuinely durationless and persists until the child acts or falls asleep. Both resolve
 *  to the same "pointing" value; makeTransient/resolveMascotState don't need to know which
 *  produced it. Earlier draft of this file left pointing out of this table entirely on the
 *  (wrong) assumption that "sustained-like" meant "never transient" -- that made
 *  react("pointing") a silent no-op, since makeTransient returns null for anything absent
 *  here. Caught via manual browser verification (hovering an available level produced no
 *  visible reaction), not by the type system. */
export const STATE_DURATION_MS: Partial<Record<MascotState, number>> = {
  celebrating: 1800,
  milestone: 2600,
  streak: 1800,
  confused: 2400,
  excited: 1800,
  encouraging: 2000,
  happy: 2600,
  pointing: 1600,
  welcome: 2400,
  playful: 1100,
};

/** Below this, the mascot is visibly hungry and starts asking for something. Unchanged
 *  from pet/mood.ts's HUNGRY_THRESHOLD. */
export const HUNGRY_THRESHOLD = 25;

/** No pointer/key interaction for this long and the mascot dozes off. A state, not a timer
 *  that depletes anything. Unchanged from pet/mood.ts's SLEEPY_AFTER_MS. */
export const SLEEPY_AFTER_MS = 45_000;

/** After this long idle (and before SLEEPY_AFTER_MS), if there's an obvious next level, the
 *  mascot starts gently pointing toward it rather than just sitting idle. */
export const POINTING_AFTER_MS = 12_000;

export interface Transient {
  state: MascotState;
  /** Timestamp (ms) after which this transient no longer applies. */
  expiresAt: number;
}

export interface StateInputs {
  transient: Transient | null;
  /** A program is executing, or a hint request is in flight. */
  busy: boolean;
  hunger: number;
  /** Timestamp (ms) of the last pointer/key interaction anywhere in the app. */
  lastInteractionAt: number;
  /** Whether there's an obvious next level to nudge the child toward. */
  hasRecommendedLevel: boolean;
  now: number;
}

/** The state implied by the world as it stands, ignoring anything that just happened. */
export function sustainedMascotState(
  i: Pick<StateInputs, "busy" | "hunger" | "lastInteractionAt" | "hasRecommendedLevel" | "now">,
): MascotState {
  if (i.busy) return "thinking";
  if (i.hunger < HUNGRY_THRESHOLD) return "hungry";
  if (i.now - i.lastInteractionAt >= SLEEPY_AFTER_MS) return "sleepy";
  if (i.hasRecommendedLevel && i.now - i.lastInteractionAt >= POINTING_AFTER_MS) return "pointing";
  return "idle";
}

export function resolveMascotState(i: StateInputs): MascotState {
  const sustained = sustainedMascotState(i);
  if (!i.transient || i.transient.expiresAt <= i.now) return sustained;
  // A live transient only shows if it actually outranks the sustained answer -- stops a
  // stale `playful` from sitting on top of a program that has since started running,
  // without needing to cancel the transient at the call site.
  return STATE_PRIORITY[i.transient.state] >= STATE_PRIORITY[sustained] ? i.transient.state : sustained;
}

/**
 * Whether an incoming transient should replace the one currently showing.
 *
 * Equal priority replaces (re-firing `playful` on every block drag should restart its
 * window, not be ignored); lower priority is dropped outright rather than queued, so a
 * wrong answer can never be overwritten a frame later by whatever followed it.
 */
export function shouldReplaceTransient(current: Transient | null, incoming: MascotState, now: number): boolean {
  if (!current || current.expiresAt <= now) return true;
  return STATE_PRIORITY[incoming] >= STATE_PRIORITY[current.state];
}

/** Builds a transient for `state`, or null if that state isn't transient (sustained ones,
 *  including `pointing`, are derived, never pushed). */
export function makeTransient(state: MascotState, now: number): Transient | null {
  const ms = STATE_DURATION_MS[state];
  return ms === undefined ? null : { state, expiresAt: now + ms };
}

// Pet.tsx's data-mood CSS only knows the original 8-value vocabulary -- this maps the
// wider MascotState set down onto it. Used by MascotCanvas.tsx's fallback path, and (while
// the Rive mascot is visually parked pending review, see PetBar.tsx) by PetBar.tsx to drive
// Pet.tsx directly as the primary renderer. One mapping, shared, so the two call sites can
// never quietly disagree about which legacy mood a given MascotState should look like.
export type LegacyPetMood = "idle" | "curious" | "thinking" | "happy" | "celebrating" | "hungry" | "sleepy" | "confused";

export function mascotStateToLegacyMood(state: MascotState): LegacyPetMood {
  switch (state) {
    case "welcome":
    case "excited":
    case "streak":
    case "milestone":
      return "happy";
    case "encouraging":
    case "pointing":
    case "playful":
      return "curious";
    case "celebrating":
      return "celebrating";
    case "confused":
      return "confused";
    case "thinking":
      return "thinking";
    case "hungry":
      return "hungry";
    case "sleepy":
      return "sleepy";
    case "happy":
      return "happy";
    case "idle":
    default:
      return "idle";
  }
}
