import { describe, expect, it } from "vitest";
import { generateSequenceQuestion } from "./machineGenerator";

// A fixed cycling rng, not a single constant -- exercises every branch (kind pick, step
// pick, start pick) rather than degenerating into one repeated value.
function cyclingRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("generateSequenceQuestion", () => {
  it("always produces 4 shown terms and a consistent hidden 5th", () => {
    const rng = cyclingRng([0.1, 0.4, 0.7, 0.9, 0.2, 0.6]);
    for (let round = 0; round <= 4; round++) {
      const q = generateSequenceQuestion(round, rng);
      expect(q.terms).toHaveLength(4);
      const step = q.opValue;
      const next = q.opKind === "add" ? q.terms[3] + step : q.opKind === "sub" ? q.terms[3] - step : q.terms[3] * step;
      expect(q.answer).toBe(next);
      expect(q.prompt).toBe(`${q.terms.join(", ")}, ?`);
    }
  });

  it("never produces a negative term for subtraction sequences", () => {
    const rng = cyclingRng([0.99, 0.01, 0.5, 0.75, 0.25]);
    for (let round = 0; round <= 4; round++) {
      const q = generateSequenceQuestion(round, rng);
      if (q.opKind === "sub") {
        for (const t of [...q.terms, q.answer]) expect(t).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("is deterministic for a fixed rng", () => {
    const a = generateSequenceQuestion(2, () => 0.3);
    const b = generateSequenceQuestion(2, () => 0.3);
    expect(a).toEqual(b);
  });
});
