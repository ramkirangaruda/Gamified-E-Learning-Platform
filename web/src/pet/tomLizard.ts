import type { PetMood } from "./mood";

// Tom Lizard replaces Pip as the companion (explicit product direction, logged in
// DECISIONS.md -- this is a deliberate reversal of the project's earlier "every
// illustration is inline SVG, no raster art" principle, not an oversight). Metadata
// here mirrors tom-lizard/pet.json exactly, baked into TS rather than fetched at
// runtime since it's fixed, prep-time content -- the same reasoning as cardBlocks.ts's
// CARDS array or trail/concepts.ts's EVOLUTION_MARKERS.
export const SPRITE_URL = "/tom-lizard/spritesheet.webp";

export const FRAME = { width: 192, height: 208 };
export const SHEET = { columns: 8, rows: 9, width: 1536, height: 1872 };

export interface SpriteAnimation {
  row: number;
  frames: number;
  fps: number;
  loop: boolean;
}

// Every row in the sheet, for reference -- only a subset is actually wired to a mood
// below (see MOOD_ANIMATION). "running"/"running-left"/"running-right"/"review" are
// available in the sheet but unused today (no current UI moment calls for them; wiring
// one up later is just adding an entry to MOOD_ANIMATION, not new art).
export const ANIMATIONS: Record<string, SpriteAnimation> = {
  idle: { row: 0, frames: 6, fps: 6, loop: true },
  "running-right": { row: 1, frames: 8, fps: 10, loop: true },
  "running-left": { row: 2, frames: 8, fps: 10, loop: true },
  waving: { row: 3, frames: 4, fps: 8, loop: false },
  jumping: { row: 4, frames: 5, fps: 10, loop: false },
  failed: { row: 5, frames: 8, fps: 8, loop: false },
  waiting: { row: 6, frames: 6, fps: 6, loop: true },
  running: { row: 7, frames: 6, fps: 10, loop: true },
  review: { row: 8, frames: 6, fps: 6, loop: false },
};

// Mood -> animation name, or null for a static resting pose (no animation at all).
// Deliberately narrow, mirroring Pip's own "idle animation is a rare, budgeted
// exception" rule (pet/idleAnimation.test.ts): only idle and thinking actually loop.
// Everything else is a one-shot reaction (CSS holds its last frame via
// animation-fill-mode) or, for hungry/sleepy, nothing moving at all.
export const MOOD_ANIMATION: Record<PetMood, string | null> = {
  idle: "idle",
  curious: "waving",
  thinking: "waiting",
  happy: "waving",
  celebrating: "jumping",
  hungry: null, // a still, neutral pose -- HungerBar already carries the hunger signal
  sleepy: null, // completely still, by design -- see idleAnimation.test.ts
  confused: "failed",
};
