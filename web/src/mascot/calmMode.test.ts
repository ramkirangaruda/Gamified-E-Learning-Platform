import { describe, expect, it } from "vitest";
import { gateCssEffect } from "./calmMode";

describe("gateCssEffect", () => {
  it("passes every effect through unchanged when Calm Mode is off", () => {
    expect(gateCssEffect("sparkle-burst", false)).toBe("sparkle-burst");
    expect(gateCssEffect("bounce-once", false)).toBe("bounce-once");
    expect(gateCssEffect("glow-soft", false)).toBe("glow-soft");
    expect(gateCssEffect(null, false)).toBeNull();
  });

  it("suppresses the big, sudden effects in Calm Mode", () => {
    expect(gateCssEffect("sparkle-burst", true)).toBeNull();
    expect(gateCssEffect("bounce-once", true)).toBeNull();
  });

  it("keeps the gentle effects even in Calm Mode", () => {
    expect(gateCssEffect("glow-soft", true)).toBe("glow-soft");
    expect(gateCssEffect("nod", true)).toBe("nod");
    expect(gateCssEffect("shrink-slight", true)).toBe("shrink-slight");
  });

  it("null stays null either way", () => {
    expect(gateCssEffect(null, true)).toBeNull();
    expect(gateCssEffect(null, false)).toBeNull();
  });
});
