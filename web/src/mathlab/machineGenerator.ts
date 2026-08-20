import { randInt } from "./rng";

export type SequenceOpKind = "add" | "sub" | "mul";

export interface SequenceQuestion {
  round: number;
  terms: number[];
  answer: number;
  opKind: SequenceOpKind;
  opValue: number;
  prompt: string;
}

/** One "Fix the Machine" round: a 4-term arithmetic sequence, the 5th term hidden.
 *  Difficulty ramps with `round` (0-4) -- early rounds favor familiar skip-counting
 *  steps, later rounds mix in subtraction and multiplication. */
export function generateSequenceQuestion(round: number, rng: () => number = Math.random): SequenceQuestion {
  const tier = Math.min(round, 4);
  const kind: SequenceOpKind =
    tier <= 1 ? "add" : tier === 2 ? (rng() < 0.5 ? "add" : "sub") : tier === 3 ? "mul" : (["add", "sub", "mul"] as const)[Math.floor(rng() * 3)];

  let start: number;
  let step: number;
  if (kind === "add") {
    step = tier <= 1 ? [1, 2, 5, 10][Math.floor(rng() * 4)] : randInt(2, 6, rng);
    start = randInt(0, 12, rng);
  } else if (kind === "sub") {
    step = randInt(2, 4 + tier, rng);
    // Comfortably >= 4 * step so the sequence never dips below zero.
    start = randInt(4 * step + 4, 4 * step + 24, rng);
  } else {
    step = randInt(2, tier >= 4 ? 4 : 3, rng);
    start = randInt(1, 4, rng);
  }

  const terms: number[] = [];
  let cur = start;
  for (let i = 0; i < 4; i++) {
    terms.push(cur);
    cur = kind === "add" ? cur + step : kind === "sub" ? cur - step : cur * step;
  }

  return { round, terms, answer: cur, opKind: kind, opValue: step, prompt: `${terms.join(", ")}, ?` };
}
