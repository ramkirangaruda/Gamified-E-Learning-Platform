// Calm Mode = the existing `lite` flag (App.tsx/lite.ts), nothing separate -- see
// PetProvider.tsx's `lite` prop, threaded down from App rather than re-read from the DOM
// a second way (lite.ts already owns document.documentElement.dataset.lite imperatively;
// a second observer of the same attribute would just be two mechanisms that could drift).
//
// This file is the one place gating RULES live for the parts of the mascot that aren't
// already covered for free by tokens.css's `[data-lite="on"] .quest-decorative`
// kill-switch (that switch handles every purely-CSS decorative effect already, including
// the mascot's idle breathing since `.mascot-shell` carries `quest-decorative`). What
// still needs an explicit check is anything Rive-specific -- trigger firing, the
// cssEffect layered on top -- and the speech throttle, none of which CSS can gate.
import { usePet } from "../pet/PetProvider";
import type { MascotCssEffect } from "./riveMapping";

/** A small, deliberately fixed set of "big" effects -- suppressed in Calm Mode, not
 *  everything. Gentle effects (a nod, a soft glow) stay; only the ones that read as
 *  sudden/attention-grabbing are cut, matching "no rapid transitions" without going
 *  fully silent. */
const SUPPRESSED_IN_CALM_MODE: ReadonlySet<MascotCssEffect> = new Set(["sparkle-burst", "bounce-once"]);

export function gateCssEffect(effect: MascotCssEffect, calm: boolean): MascotCssEffect {
  if (!calm) return effect;
  return SUPPRESSED_IN_CALM_MODE.has(effect) ? null : effect;
}

/** Thin re-export so a component only needing Calm Mode doesn't have to know
 *  PetProvider owns it -- same reasoning as mascot/events.ts's useMascotEvents(). */
export function useCalmMode(): boolean {
  return usePet().lite;
}
