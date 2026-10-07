import { randInt } from "./rng";

export type TileId = "box" | "painting" | "bookshelf" | "clock";

export interface DigitPuzzle {
  tileId: TileId;
  prompt: string;
  answer: number;
}

/** One Escape Room tile's puzzle: a single-digit (0-9) arithmetic answer, so it can drop
 *  straight into the 4-digit escape code. Retries with fresh operands until one lands in
 *  range; the fallback guarantees termination even in pathological rng cases. */
export function generateDigitPuzzle(tileId: TileId, rng: () => number = Math.random): DigitPuzzle {
  for (let attempt = 0; attempt < 50; attempt++) {
    const op = (["+", "-", "×"] as const)[Math.floor(rng() * 3)];
    const a = randInt(1, 9, rng);
    const b = randInt(0, 9, rng);
    const result = op === "+" ? a + b : op === "-" ? a - b : a * b;
    if (result >= 0 && result <= 9) {
      return { tileId, prompt: `${a} ${op} ${b} = ?`, answer: result };
    }
  }
  const b = randInt(0, 9, rng);
  return { tileId, prompt: `9 − ${9 - b} = ?`, answer: b };
}
