import { describe, expect, it } from "vitest";
import { generateTetrisLevel } from "./tetrisGenerator";

describe("generateTetrisLevel", () => {
  it("the target always equals the true sum of the solution tiles", () => {
    for (let level = 1; level <= 5; level++) {
      const l = generateTetrisLevel(level, () => 0.42);
      const sum = l.solutionIndices.reduce((s, i) => s + l.tiles[i], 0);
      expect(l.target).toBe(sum);
    }
  });

  it("solution indices are distinct and within bounds", () => {
    const l = generateTetrisLevel(4, () => 0.7);
    expect(new Set(l.solutionIndices).size).toBe(l.solutionIndices.length);
    for (const i of l.solutionIndices) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(l.tiles.length);
    }
  });

  it("tile count grows with level", () => {
    const counts = [1, 2, 3, 4, 5].map((lvl) => generateTetrisLevel(lvl, () => 0.5).tiles.length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
  });

  it("clamps out-of-range levels into [1, 5]", () => {
    expect(generateTetrisLevel(0, () => 0.5).tiles.length).toBe(generateTetrisLevel(1, () => 0.5).tiles.length);
    expect(generateTetrisLevel(99, () => 0.5).tiles.length).toBe(generateTetrisLevel(5, () => 0.5).tiles.length);
  });
});
