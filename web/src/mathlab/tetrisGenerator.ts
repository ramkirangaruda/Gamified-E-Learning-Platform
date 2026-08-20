import { randInt, sampleDistinctIndices } from "./rng";

export interface TetrisLevel {
  level: number;
  tiles: number[];
  target: number;
  solutionIndices: number[];
}

const TILE_COUNT = [6, 8, 9, 10, 12];
const SUBSET_SIZE = [2, 2, 3, 3, 4];
const MAX_VALUE = [9, 9, 9, 12, 15];

/** One "Math Tetris" level (1-5): a grid of number tiles plus a target that's the true
 *  sum of some subset of them -- `solutionIndices` is kept for the hint nudge only, never
 *  shown up front. */
export function generateTetrisLevel(level: number, rng: () => number = Math.random): TetrisLevel {
  const idx = Math.min(Math.max(level, 1), 5) - 1;
  const n = TILE_COUNT[idx];
  const k = SUBSET_SIZE[idx];
  const maxVal = MAX_VALUE[idx];

  const tiles = Array.from({ length: n }, () => randInt(1, maxVal, rng));
  const solutionIndices = sampleDistinctIndices(n, k, rng);
  const target = solutionIndices.reduce((sum, i) => sum + tiles[i], 0);

  return { level, tiles, target, solutionIndices };
}
