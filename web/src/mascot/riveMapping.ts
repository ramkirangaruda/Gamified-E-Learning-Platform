// State -> Rive playback cue. THE one file to correct once someone can actually look at
// the animations in a browser (this session's screenshot/compositing tooling wasn't
// available, so every trigger assignment below was chosen from the .riv file's ArUco... no
// -- from its *animation/input names* alone: Idle, Silly, Movie, Music, Smart, all
// verified to exist via @rive-app/canvas's rive.contents/stateMachineInputs() against
// web/public/mascot.riv, but never actually watched playing).
//
// Every other file in mascot/ reads ONLY through resolveRiveCue() -- nothing else branches
// on a raw trigger name ("Silly"/"Movie"/"Music"/"Smart"). That means fixing a wrong guess
// here is a one-line edit with zero blast radius elsewhere.
//
// The .riv asset ("14535-27401-kids-mascotte") and its 4 trigger names read like a
// themed-reaction character (a trivia-category mascot), not a purpose-built 13-state
// emotion rig -- so distinct MascotStates deliberately reuse the same trigger, differentiated
// by a `cssEffect` layered outside the <canvas>, rather than inventing animations that don't
// exist in the file. (@rive-app/canvas v2.40's public API has no playback-speed/timeScale
// control -- checked its .d.ts directly rather than assumed -- so speed variation isn't part
// of this mapping; cssEffect carries all the differentiation instead.)
import type { MascotState } from "./state";

export type RiveTrigger = "Silly" | "Movie" | "Music" | "Smart" | null; // null = stay on the Idle loop, fire nothing

export type MascotCssEffect = "glow-soft" | "bounce-once" | "sparkle-burst" | "nod" | "shrink-slight" | null;

export interface RiveCue {
  trigger: RiveTrigger;
  /** Consumed by mascot/MascotCanvas.tsx's CSS wrapper effects (glow/scale/bounce/sparkle),
   *  layered on `.mascot-shell` outside the canvas -- same budgeted-CSS-animation approach
   *  as pet/index.css, never inside the canvas itself. */
  cssEffect: MascotCssEffect;
}

export const RIVE_MAPPING: Record<MascotState, RiveCue> = {
  idle: { trigger: null, cssEffect: null },
  // GUESS: an upbeat first-thing-you-see greeting.
  welcome: { trigger: "Music", cssEffect: "bounce-once" },
  // GUESS: light and playful -- fed a treat, a small positive nudge.
  happy: { trigger: "Silly", cssEffect: "glow-soft" },
  // Same clip as happy, paired with a bigger bounce -- a correct answer reads as "more".
  excited: { trigger: "Silly", cssEffect: "bounce-once" },
  // GUESS: "Smart" read literally as deliberate/thoughtful.
  thinking: { trigger: "Smart", cssEffect: null },
  encouraging: { trigger: "Music", cssEffect: "nod" },
  // Deliberately gentle -- never a frown/sad-clip assumption. A wrong answer is a teaching
  // moment, not a scolding.
  confused: { trigger: "Smart", cssEffect: "shrink-slight" },
  // GUESS: "Movie" read as a directed, theatrical gesture -- stands in for pointing.
  pointing: { trigger: "Movie", cssEffect: "nod" },
  celebrating: { trigger: "Silly", cssEffect: "sparkle-burst" },
  streak: { trigger: "Music", cssEffect: "glow-soft" },
  milestone: { trigger: "Movie", cssEffect: "sparkle-burst" },
  playful: { trigger: "Silly", cssEffect: null },
  // Idle loop, no trigger fired -- see MascotCanvas.tsx for the "pause playback entirely
  // after a while" behavior layered on top of this.
  sleepy: { trigger: null, cssEffect: null },
  // Unchanged from today: hunger is rendered via Pet.tsx's existing CSS fallback path
  // (data-mood="hungry"), not through Rive -- the hunger bar already communicates this.
  hungry: { trigger: null, cssEffect: null },
};

export function resolveRiveCue(state: MascotState): RiveCue {
  return RIVE_MAPPING[state];
}
