// Lite mode: one boolean, three inputs, applied in exactly one place.
//
//   1. the launcher's --lite flag (or auto-on for the low RAM tier), via GET /api/tier
//   2. the child/operator's own toggle, remembered for the session
//   3. prefers-reduced-motion, handled purely in CSS (tokens.css) so it applies even
//      before this module has fetched anything
//
// Applied by setting data-lite on <html>, which tokens.css keys off. Nothing else in the
// app reads this -- components just add their animation class unconditionally and the
// attribute decides whether it does anything. That keeps "is animation on" out of every
// component's render logic.

const STORAGE_KEY = "tessera-quest:lite";

export function applyLite(on: boolean) {
  document.documentElement.dataset.lite = on ? "on" : "off";
}

/** Session override, if the child has toggled it. null = follow the server's decision. */
export function storedOverride(): boolean | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    return v === null ? null : v === "on";
  } catch {
    // Private mode / storage disabled -- fall back to the server's decision rather than
    // failing. Never let a preference lookup break the game.
    return null;
  }
}

export function setOverride(on: boolean) {
  try {
    sessionStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* ignore -- applyLite below still takes effect for this page view */
  }
  applyLite(on);
}
