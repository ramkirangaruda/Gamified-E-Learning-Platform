import { describe, expect, it } from "vitest";
import {
  ALL_MASCOT_STATES,
  HUNGRY_THRESHOLD,
  POINTING_AFTER_MS,
  SLEEPY_AFTER_MS,
  STATE_DURATION_MS,
  STATE_PRIORITY,
  makeTransient,
  resolveMascotState,
  shouldReplaceTransient,
  sustainedMascotState,
  type MascotState,
} from "./state";

const T0 = 1_000_000;

function inputs(over: Partial<Parameters<typeof resolveMascotState>[0]> = {}) {
  return {
    transient: null,
    busy: false,
    hunger: 80,
    lastInteractionAt: T0,
    hasRecommendedLevel: false,
    now: T0,
    ...over,
  };
}

describe("sustained states", () => {
  it("is idle when nothing is happening", () => {
    expect(sustainedMascotState(inputs())).toBe("idle");
  });

  it("is thinking while a program or hint is in flight", () => {
    expect(sustainedMascotState(inputs({ busy: true }))).toBe("thinking");
  });

  it("is hungry below the threshold", () => {
    expect(sustainedMascotState(inputs({ hunger: HUNGRY_THRESHOLD - 1 }))).toBe("hungry");
    expect(sustainedMascotState(inputs({ hunger: HUNGRY_THRESHOLD }))).toBe("idle");
  });

  it("is sleepy only after a long spell with no interaction", () => {
    expect(sustainedMascotState(inputs({ now: T0 + SLEEPY_AFTER_MS - 1 }))).toBe("idle");
    expect(sustainedMascotState(inputs({ now: T0 + SLEEPY_AFTER_MS }))).toBe("sleepy");
  });

  it("never shows sleepy over something that is actually happening", () => {
    expect(sustainedMascotState(inputs({ busy: true, now: T0 + SLEEPY_AFTER_MS * 3 }))).toBe("thinking");
  });

  it("points toward a recommended level after a shorter idle spell, before sleepy kicks in", () => {
    expect(sustainedMascotState(inputs({ hasRecommendedLevel: true, now: T0 + POINTING_AFTER_MS - 1 }))).toBe("idle");
    expect(sustainedMascotState(inputs({ hasRecommendedLevel: true, now: T0 + POINTING_AFTER_MS }))).toBe("pointing");
  });

  it("never points when there is nothing to point at", () => {
    expect(sustainedMascotState(inputs({ hasRecommendedLevel: false, now: T0 + POINTING_AFTER_MS }))).toBe("idle");
  });

  it("still falls asleep eventually even with a recommended level", () => {
    expect(sustainedMascotState(inputs({ hasRecommendedLevel: true, now: T0 + SLEEPY_AFTER_MS }))).toBe("sleepy");
  });
});

describe("transients", () => {
  it("shows while live and falls back once expired", () => {
    const transient = makeTransient("playful", T0);
    expect(transient).not.toBeNull();
    expect(resolveMascotState(inputs({ transient, now: T0 + 100 }))).toBe("playful");
    expect(resolveMascotState(inputs({ transient, now: T0 + STATE_DURATION_MS.playful! + 1 }))).toBe("idle");
  });

  it("does not mask a higher-priority sustained state", () => {
    const transient = makeTransient("playful", T0);
    expect(resolveMascotState(inputs({ transient, busy: true, now: T0 + 100 }))).toBe("thinking");
  });

  it("outranks a sustained state when it is more important", () => {
    const transient = makeTransient("celebrating", T0);
    expect(resolveMascotState(inputs({ transient, hunger: 5, now: T0 + 100 }))).toBe("celebrating");
  });

  it("falls back to hungry, not idle, once the celebration ends", () => {
    const transient = makeTransient("celebrating", T0);
    expect(resolveMascotState(inputs({ transient, hunger: 5, now: T0 + 5000 }))).toBe("hungry");
  });

  it("pointing CAN be pushed as a transient too -- the hover/unlock pulse, distinct from the sustained idle-pointing branch", () => {
    const transient = makeTransient("pointing", T0);
    expect(transient).not.toBeNull();
    expect(resolveMascotState(inputs({ transient, now: T0 + 100 }))).toBe("pointing");
    expect(resolveMascotState(inputs({ transient, now: T0 + STATE_DURATION_MS.pointing! + 1 }))).toBe("idle");
  });
});

describe("interruption", () => {
  it("lets a wrong answer interrupt a playful reaction", () => {
    const playful = makeTransient("playful", T0)!;
    expect(shouldReplaceTransient(playful, "confused", T0 + 50)).toBe(true);
  });

  it("does not let a playful reaction overwrite a wrong answer", () => {
    // The run finishes, the mascot goes confused, and the child immediately clicks it.
    // Dropping the lower-priority reaction keeps the teaching moment on screen.
    const confused = makeTransient("confused", T0)!;
    expect(shouldReplaceTransient(confused, "playful", T0 + 50)).toBe(false);
  });

  it("re-fires an equal-priority reaction rather than ignoring it", () => {
    const playful = makeTransient("playful", T0)!;
    expect(shouldReplaceTransient(playful, "playful", T0 + 50)).toBe(true);
  });

  it("accepts anything once the current reaction has expired", () => {
    const celebrating = makeTransient("celebrating", T0)!;
    expect(shouldReplaceTransient(celebrating, "playful", T0 + STATE_DURATION_MS.celebrating! + 1)).toBe(true);
  });

  it("accepts anything when nothing is showing", () => {
    expect(shouldReplaceTransient(null, "sleepy", T0)).toBe(true);
  });
});

describe("the state vocabulary itself", () => {
  it("covers all fourteen states with a priority each", () => {
    expect(ALL_MASCOT_STATES).toHaveLength(14);
    for (const state of ALL_MASCOT_STATES) {
      expect(STATE_PRIORITY[state as MascotState]).toBeTypeOf("number");
    }
  });

  it("treats purely-sustained states as non-transient (pointing is the one exception -- see the dedicated test above)", () => {
    expect(makeTransient("idle", T0)).toBeNull();
    expect(makeTransient("thinking", T0)).toBeNull();
    expect(makeTransient("hungry", T0)).toBeNull();
    expect(makeTransient("sleepy", T0)).toBeNull();
  });

  it("ranks completing a level above everything, and sleepy below every real state", () => {
    const others = ALL_MASCOT_STATES.filter((s) => s !== "celebrating");
    for (const s of others) expect(STATE_PRIORITY.celebrating).toBeGreaterThan(STATE_PRIORITY[s]);
    const real = ALL_MASCOT_STATES.filter((s) => s !== "sleepy" && s !== "idle");
    for (const s of real) expect(STATE_PRIORITY.sleepy).toBeLessThan(STATE_PRIORITY[s]);
  });

  it("never lets encouraging or a locked-level reaction outrank a wrong answer", () => {
    expect(STATE_PRIORITY.confused).toBeGreaterThan(STATE_PRIORITY.encouraging);
  });

  it("keeps milestone and streak below celebrating but above ordinary reactions", () => {
    expect(STATE_PRIORITY.celebrating).toBeGreaterThan(STATE_PRIORITY.milestone);
    expect(STATE_PRIORITY.milestone).toBeGreaterThan(STATE_PRIORITY.streak);
    expect(STATE_PRIORITY.streak).toBeGreaterThan(STATE_PRIORITY.excited);
  });
});
