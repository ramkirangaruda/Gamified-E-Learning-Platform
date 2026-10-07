import { describe, expect, it } from "vitest";
import { randInt, sampleDistinctIndices, shuffle } from "./rng";

describe("randInt", () => {
  it("stays within [min, max] inclusive across many draws", () => {
    for (let i = 0; i < 500; i++) {
      const v = randInt(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("is driven entirely by the injected rng, not Math.random", () => {
    expect(randInt(0, 9, () => 0)).toBe(0);
    expect(randInt(0, 9, () => 0.999)).toBe(9);
  });
});

describe("shuffle", () => {
  it("returns a permutation of the input and does not mutate it", () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, () => 0.5);
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("sampleDistinctIndices", () => {
  it("returns k distinct indices in [0, n)", () => {
    const idx = sampleDistinctIndices(10, 4, () => 0.37);
    expect(idx).toHaveLength(4);
    expect(new Set(idx).size).toBe(4);
    for (const i of idx) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(10);
    }
  });
});
