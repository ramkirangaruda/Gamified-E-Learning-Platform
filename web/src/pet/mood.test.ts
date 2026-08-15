import { describe, expect, it } from "vitest";
import {
  ALL_MOODS,
  HUNGRY_THRESHOLD,
  MOOD_DURATION_MS,
  MOOD_PRIORITY,
  SLEEPY_AFTER_MS,
  makeTransient,
  resolveMood,
  shouldReplaceTransient,
  sustainedMood,
  type PetMood,
} from "./mood";

const T0 = 1_000_000;

function inputs(over: Partial<Parameters<typeof resolveMood>[0]> = {}) {
  return {
    transient: null,
    busy: false,
    hunger: 80,
    lastInteractionAt: T0,
    now: T0,
    ...over,
  };
}

describe("sustained moods", () => {
  it("is idle when nothing is happening", () => {
    expect(sustainedMood(inputs())).toBe("idle");
  });

  it("is thinking while a program or hint is in flight", () => {
    expect(sustainedMood(inputs({ busy: true }))).toBe("thinking");
  });

  it("is hungry below the threshold", () => {
    expect(sustainedMood(inputs({ hunger: HUNGRY_THRESHOLD - 1 }))).toBe("hungry");
    expect(sustainedMood(inputs({ hunger: HUNGRY_THRESHOLD }))).toBe("idle");
  });

  it("is sleepy only after a long spell with no interaction", () => {
    expect(sustainedMood(inputs({ now: T0 + SLEEPY_AFTER_MS - 1 }))).toBe("idle");
    expect(sustainedMood(inputs({ now: T0 + SLEEPY_AFTER_MS }))).toBe("sleepy");
  });

  it("never shows sleepy over something that is actually happening", () => {
    // A long-running hint on a slow tier must not put the pet to sleep mid-think.
    expect(sustainedMood(inputs({ busy: true, now: T0 + SLEEPY_AFTER_MS * 3 }))).toBe("thinking");
  });
});

describe("transients", () => {
  it("shows while live and falls back once expired", () => {
    const transient = makeTransient("curious", T0);
    expect(transient).not.toBeNull();
    expect(resolveMood(inputs({ transient, now: T0 + 100 }))).toBe("curious");
    expect(resolveMood(inputs({ transient, now: T0 + MOOD_DURATION_MS.curious! + 1 }))).toBe("idle");
  });

  it("does not mask a higher-priority sustained mood", () => {
    // The child drags a block and immediately hits Run. `curious` is still live, but the
    // program is running -- the pet must be visibly thinking, not still looking over.
    const transient = makeTransient("curious", T0);
    expect(resolveMood(inputs({ transient, busy: true, now: T0 + 100 }))).toBe("thinking");
  });

  it("outranks a sustained mood when it is more important", () => {
    // Reaching the goal while the pet happens to be hungry: the celebration wins.
    const transient = makeTransient("celebrating", T0);
    expect(resolveMood(inputs({ transient, hunger: 5, now: T0 + 100 }))).toBe("celebrating");
  });

  it("falls back to hungry, not idle, once the celebration ends", () => {
    const transient = makeTransient("celebrating", T0);
    expect(resolveMood(inputs({ transient, hunger: 5, now: T0 + 5000 }))).toBe("hungry");
  });
});

describe("interruption", () => {
  it("lets a bump interrupt a block drag", () => {
    const curious = makeTransient("curious", T0)!;
    expect(shouldReplaceTransient(curious, "confused", T0 + 50)).toBe(true);
  });

  it("does not let a block drag overwrite a bump", () => {
    // This is the case that matters: the run finishes, the pet goes confused, and the
    // child immediately grabs a block. Dropping the lower-priority reaction is what keeps
    // the teaching moment on screen.
    const confused = makeTransient("confused", T0)!;
    expect(shouldReplaceTransient(confused, "curious", T0 + 50)).toBe(false);
  });

  it("re-fires an equal-priority reaction rather than ignoring it", () => {
    const curious = makeTransient("curious", T0)!;
    expect(shouldReplaceTransient(curious, "curious", T0 + 50)).toBe(true);
  });

  it("accepts anything once the current reaction has expired", () => {
    const celebrating = makeTransient("celebrating", T0)!;
    expect(shouldReplaceTransient(celebrating, "curious", T0 + MOOD_DURATION_MS.celebrating! + 1)).toBe(true);
  });

  it("accepts anything when nothing is showing", () => {
    expect(shouldReplaceTransient(null, "sleepy", T0)).toBe(true);
  });
});

describe("the mood vocabulary itself", () => {
  it("covers all eight states with a priority each", () => {
    expect(ALL_MOODS).toHaveLength(8);
    for (const mood of ALL_MOODS) {
      expect(MOOD_PRIORITY[mood as PetMood]).toBeTypeOf("number");
    }
  });

  it("treats sustained moods as non-transient", () => {
    // Pushing a sustained mood as a reaction is meaningless -- they are derived from the
    // world, so makeTransient returns null and the caller keeps whatever it had.
    expect(makeTransient("idle", T0)).toBeNull();
    expect(makeTransient("thinking", T0)).toBeNull();
    expect(makeTransient("hungry", T0)).toBeNull();
    expect(makeTransient("sleepy", T0)).toBeNull();
  });

  it("ranks the goal above everything and sleepy below every real mood", () => {
    const others = ALL_MOODS.filter((m) => m !== "celebrating");
    for (const m of others) expect(MOOD_PRIORITY.celebrating).toBeGreaterThan(MOOD_PRIORITY[m]);
    const real = ALL_MOODS.filter((m) => m !== "sleepy" && m !== "idle");
    for (const m of real) expect(MOOD_PRIORITY.sleepy).toBeLessThan(MOOD_PRIORITY[m]);
  });
});
