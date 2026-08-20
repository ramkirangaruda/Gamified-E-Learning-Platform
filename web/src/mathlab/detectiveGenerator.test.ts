import { describe, expect, it } from "vitest";
import { generateClueQuestion } from "./detectiveGenerator";

function cyclingRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("generateClueQuestion", () => {
  it("produces exactly 4 options containing the answer exactly once, no duplicates", () => {
    const rng = cyclingRng([0.05, 0.95, 0.3, 0.6, 0.15, 0.8, 0.45]);
    for (let clueIndex = 0; clueIndex < 4; clueIndex++) {
      const q = generateClueQuestion(clueIndex, rng);
      expect(q.options).toHaveLength(4);
      expect(q.options.filter((o) => o === q.answer)).toHaveLength(1);
      expect(new Set(q.options).size).toBe(4);
      for (const o of q.options) expect(o).toBeGreaterThanOrEqual(0);
    }
  });

  it("never produces a negative answer for subtraction clues", () => {
    const rng = cyclingRng([0.99, 0.01, 0.5]);
    for (let clueIndex = 0; clueIndex < 4; clueIndex++) {
      const q = generateClueQuestion(clueIndex, rng);
      expect(q.answer).toBeGreaterThanOrEqual(0);
    }
  });

  it("uses each clue slot's own label", () => {
    expect(generateClueQuestion(0, () => 0.5).clueLabel).toBe("Time");
    expect(generateClueQuestion(1, () => 0.5).clueLabel).toBe("Trail");
    expect(generateClueQuestion(2, () => 0.5).clueLabel).toBe("Bag");
    expect(generateClueQuestion(3, () => 0.5).clueLabel).toBe("Code");
  });
});
