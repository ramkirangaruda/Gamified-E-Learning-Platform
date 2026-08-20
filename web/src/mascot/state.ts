// The mascot's state vocabulary and the rules that pick one. Pure, no React, no timers,
// no DOM. Fourteen states: the thirteen the Hub Mode mascot brief names, plus `hungry`
// from the hunger/feed system.
//
// This is now the ONLY mood vocabulary in the app. pet/mood.ts used to sit alongside it --
// a near-identical 8-value machine with the same four function names and its own priority
// table -- which this file's header already described as superseded while the renderer
// went on rendering from it through a lossy translation table. Both the duplicate and the
// translation are gone; pet/spriteLayout.ts maps these fourteen states straight to art.
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

import { CLIP_DURATION_MS } from "../pet/spriteLayout";

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

/** How long each transient state holds before falling back, DERIVED FROM ITS ANIMATION
 *  (pet/spriteLayout.ts) rather than typed here.
 *
 *  This used to be a hand-written table of round numbers, and it was the source of the
 *  pet's worst jank: the numbers had no relationship to the art they were gating.
 *  `celebrating` was 1800ms against a 500ms jump, so a celebration played for half a
 *  second, froze on its last frame for 1.3 seconds, then snapped to idle. `happy` was
 *  2600ms against a 500ms wave. Every reaction in the app was play-freeze-snap.
 *
 *  A reaction should last exactly as long as its animation, so there is exactly one number
 *  and the clip table owns it. Tuning how long a state lingers now means saying how many
 *  times it plays, next to the art it plays -- see StateClip's `plays`. */
export const STATE_DURATION_MS: Partial<Record<MascotState, number>> = CLIP_DURATION_MS;

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

/** The state implied by the world as it stands, ignoring anything that just happened.
 *
 *  ORDER MATTERS, and `sleepy` deliberately outranks `hungry` here -- it used to be the
 *  other way round, which meant a hungry pet could never fall asleep. That was not a
 *  corner case: store.go resets hunger to SessionStartHunger (10) at every boot, which is
 *  below HUNGRY_THRESHOLD (25) on purpose, so EVERY session began hungry. A hub left
 *  running between groups therefore sat in `hungry` indefinitely rather than dozing off --
 *  which both contradicted "goes completely still once nobody is there" and burned a
 *  Raspberry Pi's CPU on an animation with no one in the room to see it.
 *
 *  Being hungry is something the child is meant to notice and act on, so it belongs to the
 *  time when a child is actually there. */
export function sustainedMascotState(
  i: Pick<StateInputs, "busy" | "hunger" | "lastInteractionAt" | "hasRecommendedLevel" | "now">,
): MascotState {
  if (i.busy) return "thinking";
  if (i.now - i.lastInteractionAt >= SLEEPY_AFTER_MS) return "sleepy";
  if (i.hunger < HUNGRY_THRESHOLD) return "hungry";
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
