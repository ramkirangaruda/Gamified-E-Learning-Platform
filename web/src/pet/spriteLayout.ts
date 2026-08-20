import type { MascotState } from "../mascot/state";

// THE SPRITE AUTHORITY: the grid, the nine rows of art, and which clip each of the
// fourteen mascot states plays. One table, one vocabulary.
//
// WHAT THIS REPLACED, because the shape of the old bug is the reason for the new shape.
// There used to be three vocabularies chained together: PetProvider resolved one of 14
// MascotStates, mascotStateToLegacyMood squashed that to one of 8 PetMoods, and
// MOOD_ANIMATION squashed THAT to one of 5 clips. The squashing was badly lopsided --
// welcome, happy, excited, streak, milestone, encouraging, pointing and playful, eight
// states spanning nearly the whole priority table, all came out as the identical `waving`
// clip. A milestone and a block drag looked the same on screen. The state machine was
// never the problem; it was that almost none of it survived the trip to the renderer.
//
// So states map to clips HERE, once, with no intermediate vocabulary. Nine rows cannot
// give fourteen states nine distinct animations, so the states that share a row are
// separated by playback instead -- speed, how many times it plays, and an optional
// one-shot effect. That is what `plays`/`speed`/`fx` are for, and it is why `celebrating`
// (jump three times, sparkle) reads as bigger than `excited` (jump once) on the same row.

/** One frame's pixel size, and the sheet it is cut from. Verified against the actual
 *  .webp of all seven characters (every one is exactly 1536x1872), not taken on trust
 *  from pet.json -- only two of the seven pet.json files describe the grid at all, and
 *  those two disagree about how (tom-lizard uses an `animations` block, rex uses `states`
 *  plus `atlasRowSemantics`; the other five say nothing). The art is uniform even though
 *  its metadata is not, so the grid lives here as one verified constant. */
export const FRAME = { width: 192, height: 208 };
export const SHEET = { columns: 8, rows: 9, width: 1536, height: 1872 };

/** The nine rows every character's sheet carries, in sheet order. Frame counts and rates
 *  are the delivery spec from tom-lizard/pet.json -- the one file that documents them --
 *  and hold for every character, since the sheets share a generator. */
export type RowName =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

export interface Row {
  index: number;
  frames: number;
  fps: number;
  /** Whether the art is built to cycle seamlessly. A cycling row can still be played a
   *  fixed number of times; this only says its last frame joins back to its first. */
  cycles: boolean;
}

export const ROWS: Record<RowName, Row> = {
  idle: { index: 0, frames: 6, fps: 6, cycles: true },
  "running-right": { index: 1, frames: 8, fps: 10, cycles: true },
  "running-left": { index: 2, frames: 8, fps: 10, cycles: true },
  waving: { index: 3, frames: 4, fps: 8, cycles: false },
  jumping: { index: 4, frames: 5, fps: 10, cycles: false },
  failed: { index: 5, frames: 8, fps: 8, cycles: false },
  waiting: { index: 6, frames: 6, fps: 6, cycles: true },
  running: { index: 7, frames: 6, fps: 10, cycles: true },
  review: { index: 8, frames: 6, fps: 6, cycles: false },
};

/** A one-shot flourish layered on the sprite, for states that need to feel bigger than
 *  their row alone can carry. These CSS rules already existed -- they were written for the
 *  Rive mascot that never shipped -- and are now doing the job they were always right for. */
export type PetFx = "glow" | "sparkle" | "bounce" | null;

export interface StateClip {
  row: RowName;
  /** Multiplier on the row's native rate. Below 1 is slower. */
  speed?: number;
  /** How many times the clip runs before the state ends. Ignored when `sustained`. */
  plays?: number;
  fx?: PetFx;
  /** Sustained states cycle for as long as the state is true; transients are bounded by
   *  `plays`. A state mapped to `null` animates nothing at all -- see `sleepy`. */
  sustained?: boolean;
}

/** State to clip. All fourteen are here, and no two share both a row and a playback, so
 *  all fourteen read differently on screen. */
export const STATE_CLIP: Record<MascotState, StateClip | null> = {
  // --- Sustained: cycles for as long as the state is true ------------------
  idle: { row: "idle", sustained: true },
  // Row 6 is "waiting" for most of the roster, which is exactly right for a program in
  // flight. Rex overrides it below -- his row 6 is a roadside doze.
  thinking: { row: "waiting", sustained: true },
  // Looking around for something to eat, slower than its native rate so it reads as
  // searching rather than alert.
  hungry: { row: "review", speed: 0.6, sustained: true },
  // Walking toward the level it wants you to try next -- the one state whose whole point
  // is directional motion, and the reason row 1 exists.
  //
  // Bounded rather than sustained, uniquely among the derived states, because `pointing`
  // is the one state that arrives BOTH ways: sustainedMascotState derives it after twelve
  // idle seconds, and levelHovered/levelUnlocked also push it as an ordinary transient. It
  // therefore has to have a duration, or makeTransient returns null and react("pointing")
  // goes silently dead -- a bug this file's predecessor shipped once already. Bounding it
  // also means the nudge is a couple of steps and a stop, not a walk cycle grinding away
  // for the thirty-three seconds before `sleepy` takes over.
  pointing: { row: "running-right", speed: 0.8, plays: 2 },
  // DELIBERATELY NOTHING. An unattended hub -- a classroom at lunch, a judge's table
  // before the demo starts -- must animate nothing at all, and `sleepy` is precisely the
  // state reached when nobody is there. This null is load-bearing, and
  // pet/idleAnimation.test.ts fails the build if it is filled in. See that file for the
  // measurements behind it.
  sleepy: null,

  // --- Transient: bounded, and each one's lifetime IS its clip's duration ---
  welcome: { row: "waving", plays: 2 },
  happy: { row: "waving", plays: 2, fx: "glow" },
  excited: { row: "jumping", plays: 1, fx: "bounce" },
  encouraging: { row: "review", plays: 1 },
  // Slowed rather than repeated. A wrong answer is the teaching moment and has to stay on
  // screen long enough to register alongside the hint that follows it, but replaying the
  // stumble twice reads as tripping over twice; one slower slump reads as one setback.
  confused: { row: "failed", plays: 1, speed: 0.7 },
  playful: { row: "running-left", plays: 1, speed: 1.2 },
  streak: { row: "running", plays: 3, fx: "bounce" },
  milestone: { row: "jumping", plays: 2, fx: "glow" },
  celebrating: { row: "jumping", plays: 3, fx: "sparkle" },
};

/** Per-character overrides, for when a character's art means something different in a row
 *  than the roster default assumes.
 *
 *  Sparse on purpose. The sheets share a grid but not always a reading of it, and rex is
 *  currently the only character whose delivery notes say so: his pet.json documents row 6
 *  ("waiting") as a "drowsy roadside rest with drooping eyelids" and row 8 ("review") as
 *  an "alert scanning look". The roster default plays row 6 for `thinking`, which had Rex
 *  nodding off every time a program started running. */
export const CHARACTER_CLIPS: Record<string, Partial<Record<MascotState, StateClip | null>>> = {
  rex: {
    thinking: { row: "review", sustained: true },
    hungry: { row: "waiting", speed: 0.6, sustained: true },
  },
};

export interface ResolvedClip {
  rowIndex: number;
  /** Steps in the animation, and the number of 12.5%-wide columns it travels -- always
   *  equal. A cycling clip walks all `frames` columns and wraps; a one-shot walks
   *  `frames - 1` and holds the real last drawing rather than the one past the end. */
  steps: number;
  durationMs: number;
  /** undefined = cycle forever. */
  plays: number | undefined;
  /**
   * Whether the clip should freeze on its final value when it finishes.
   *
   * Only true for a one-shot row, and the distinction is not cosmetic. A one-shot row
   * walks `frames - 1` columns, so its end value IS the last drawing and holding it is the
   * whole point. A CYCLING row walks all `frames` columns, so its end value is one column
   * PAST the last drawing -- the position a loop is only ever at for the instant it wraps.
   * Holding that shows an empty cell: the pet vanishes.
   *
   * That is not hypothetical. `pointing` is a bounded clip on the cycling walk row and is
   * also a SUSTAINED state, so it holds its end value for as long as the state lasts -- up
   * to the thirty-three seconds before `sleepy` takes over. Freezing it would have made the
   * pet disappear every time it finished nudging you toward the next level.
   */
  holdsLastFrame: boolean;
  fx: PetFx;
}

/**
 * The clip for a state, as numbers the renderer hands straight to CSS.
 *
 * `durationMs` is the load-bearing output. mascot/state.ts uses it as the transient's
 * lifetime, so a reaction lasts exactly as long as its animation -- the fix for the single
 * most visible piece of jank in the old pet. Those durations used to be hand-typed
 * constants unrelated to the art: `celebrating` held for 1800ms while its jump clip ran
 * for 500ms, so every celebration was half a second of motion, 1.3 seconds frozen on the
 * last frame, then a snap back to idle. Every reaction in the app behaved that way.
 * Deriving one number from the other is what stops it coming back.
 */
export function resolveClip(state: MascotState, species?: string): ResolvedClip | null {
  const overrides = CHARACTER_CLIPS[species ?? ""];
  const clip = overrides && state in overrides ? overrides[state] : STATE_CLIP[state];
  if (!clip) return null;

  const row = ROWS[clip.row];
  const speed = clip.speed ?? 1;
  const steps = clip.sustained || row.cycles ? row.frames : row.frames - 1;
  const cycleMs = (steps / (row.fps * speed)) * 1000;
  const plays = clip.sustained ? undefined : (clip.plays ?? 1);

  return {
    rowIndex: row.index,
    steps,
    durationMs: Math.round(cycleMs * (plays ?? 1)),
    plays,
    // A cycling row ends one column past its last drawing, so it must fall back to the
    // resting frame rather than freeze there. See the field's own comment.
    holdsLastFrame: !row.cycles && !clip.sustained,
    fx: clip.fx ?? null,
  };
}

/** Every transient state's lifetime, derived from its clip. Sustained states are absent
 *  (they end when the world changes, not on a timer) and so is `sleepy`. Consumed by
 *  mascot/state.ts, which used to hand-type these numbers next to art it could not see. */
export const CLIP_DURATION_MS: Partial<Record<MascotState, number>> = Object.fromEntries(
  (Object.keys(STATE_CLIP) as MascotState[])
    .map((state) => [state, resolveClip(state)] as const)
    .filter(([, clip]) => clip !== null && clip.plays !== undefined)
    .map(([state, clip]) => [state, clip!.durationMs]),
);
