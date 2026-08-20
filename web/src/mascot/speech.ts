// Short, contextual speech lines and the anti-spam rules around showing them. Deliberately
// a plain data table plus a couple of pure functions -- adding or editing a line later
// should never require touching event-wiring code, matching the brief's "create the speech
// system so adding/changing messages later is easy."
//
// Speech is NOT shown for every state change (per the brief: "never randomly spammed").
// Only the states in SPEECH_LINES have anything to say; states left out (idle, pointing,
// hungry, sleepy, thinking) rely on the mascot's motion alone.
import type { MascotState } from "./state";

export const SPEECH_LINES: Partial<Record<MascotState, readonly string[]>> = {
  welcome: ["Ready?", "Let's go!", "Welcome back!"],
  happy: ["Nice!", "Yum, thanks!"],
  excited: ["Great!", "You got it!", "Nice one!"],
  encouraging: ["Almost!", "Try again!", "You've got this!"],
  celebrating: ["You did it!", "Level complete!", "Amazing!"],
  streak: ["Whoa, nice streak!", "You're on a roll!"],
  milestone: ["New milestone!", "Look how far you've come!"],
  playful: ["Hee hee!", "That tickles!", "Hi!"],
};

// Locked-level hover uses its own pool -- always gentle, never phrased as a rejection.
export const LOCKED_LINES: readonly string[] = ["Almost there!", "Not yet — keep going!", "So close!"];

export const UNLOCK_LINES: readonly string[] = ["New level!", "Ooh, a new one!"];

const MIN_GAP_MS = 4_000;
const MIN_GAP_MS_CALM = 8_000;

/** Picks a line for `state`, avoiding immediate repetition of whatever was last said for
 *  that same pool. Returns null if the state has nothing to say. */
export function pickLine(pool: readonly string[] | undefined, lastLine: string | null): string | null {
  if (!pool || pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  const candidates = pool.filter((line) => line !== lastLine);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Whether an unsolicited (event-driven, non-hint) line is allowed to show right now.
 *  Hint text from /api/hint always bypasses this -- it's the one thing worth interrupting
 *  for, and PlayPage's existing `say(hint.hint)` call site is untouched by the mascot
 *  event API for exactly that reason. */
export function canSpeak(lastSpokenAt: number, now: number, calm: boolean): boolean {
  return now - lastSpokenAt >= (calm ? MIN_GAP_MS_CALM : MIN_GAP_MS);
}
