import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// AUDIT P1-2: the speech bubble's default text is on screen for every level load, before
// the first hint. An M2 placeholder ("I'll have real hints for you soon -- M3 territory")
// survived M3 shipping and was the first thing a judge read on the game screen. This
// guards the class of mistake, not just the one string: no milestone/placeholder language
// may appear in the idle line.
const source = readFileSync(fileURLToPath(new URL("./SpeechBubble.tsx", import.meta.url)), "utf8");

describe("SpeechBubble idle line", () => {
  const idle = source.match(/const IDLE_LINE = "([^"]+)"/)?.[1];

  it("exists and is non-empty", () => {
    expect(idle).toBeTruthy();
  });

  it("makes no promise that features are still to come", () => {
    const banned = [/\bM[1-5]\b/, /territory/i, /coming soon/i, /soon\b/i, /not yet/i, /placeholder/i, /TODO/i];
    for (const pattern of banned) {
      expect(idle, `idle line must not match ${pattern}`).not.toMatch(pattern);
    }
  });

  it("stays short enough for the bubble and speaks as Pip", () => {
    expect(idle!.length).toBeLessThan(110);
    expect(idle).toMatch(/Pip/);
  });
});
