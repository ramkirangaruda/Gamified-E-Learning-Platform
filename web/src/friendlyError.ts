// AUDIT P0-5. Every failure path used to do `.catch((e) => setError(String(e)))` and
// render that string, so a failing request put something like
//   Error: 500 Internal Server Error: {"error":"store: reading learner: ..."}
// on screen in front of an eight-year-old. This maps anything thrown to one short,
// non-alarming sentence a child can act on. The real error still reaches the console for
// whoever is debugging on stage -- it is hidden from the child, not discarded.

export type ErrorContext = "levels" | "state" | "run" | "compare" | "camera";

const MESSAGE: Record<ErrorContext, string> = {
  levels: "Couldn't load the levels just now. Try again in a moment!",
  state: "Couldn't find your pet's save just now. Try again in a moment!",
  run: "Something went wrong running your program. Give it another go!",
  compare: "Nothing to compare yet.",
  camera: "Couldn't reach the camera. Check it's plugged in and this page has permission to use it.",
};

/** Returns the child-facing message and logs the real error for the operator. */
export function friendlyError(context: ErrorContext, err: unknown): string {
  // eslint-disable-next-line no-console -- deliberate: the operator needs the real error.
  console.error(`[tessera-quest] ${context} failed:`, err);
  return MESSAGE[context];
}
