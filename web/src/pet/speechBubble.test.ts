import { describe, expect, it } from "vitest";
import { IDLE_LINE } from "./SpeechBubble";

// AUDIT P1-2: the speech bubble's default text is on screen for every level load, before
// the first hint. An M2 placeholder ("I'll have real hints for you soon -- M3 territory")
// survived M3 shipping and was the first thing a judge read on the game screen. This
// guards the class of mistake, not just the one string: no milestone or "not built yet"
// language may appear in the idle line.
describe("SpeechBubble idle line", () => {
  it("exists and is non-empty", () => {
    expect(IDLE_LINE.trim().length).toBeGreaterThan(0);
  });

  it("makes no promise that features are still to come", () => {
    const banned = [/\bM[1-5]\b/, /territory/i, /coming soon/i, /\bsoon\b/i, /not yet/i, /placeholder/i, /TODO/i];
    for (const pattern of banned) {
      expect(IDLE_LINE, `idle line must not match ${pattern}`).not.toMatch(pattern);
    }
  });

  it("stays short enough for the bubble and speaks as Tom", () => {
    expect(IDLE_LINE.length).toBeLessThan(110);
    expect(IDLE_LINE).toMatch(/Tom/);
  });
});
