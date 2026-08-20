import { describe, expect, it } from "vitest";
import { canSpeak, pickLine, SPEECH_LINES } from "./speech";

describe("pickLine", () => {
  it("returns null for a state with nothing to say", () => {
    expect(pickLine(undefined, null)).toBeNull();
  });

  it("returns the only line when there's just one", () => {
    expect(pickLine(["only one"], null)).toBe("only one");
  });

  it("avoids repeating the immediately-previous line when alternatives exist", () => {
    const pool = SPEECH_LINES.excited!;
    for (let i = 0; i < 20; i++) {
      const line = pickLine(pool, pool[0]);
      expect(line).not.toBe(pool[0]);
    }
  });

  it("always returns a line from the pool", () => {
    const pool = SPEECH_LINES.celebrating!;
    const line = pickLine(pool, null);
    expect(pool).toContain(line);
  });
});

describe("canSpeak", () => {
  it("blocks a second line too soon after the last one", () => {
    expect(canSpeak(1000, 1000 + 1000, false)).toBe(false);
  });

  it("allows a line once the gap has passed", () => {
    expect(canSpeak(1000, 1000 + 4000, false)).toBe(true);
  });

  it("widens the required gap in calm mode", () => {
    expect(canSpeak(1000, 1000 + 4000, true)).toBe(false);
    expect(canSpeak(1000, 1000 + 8000, true)).toBe(true);
  });
});
