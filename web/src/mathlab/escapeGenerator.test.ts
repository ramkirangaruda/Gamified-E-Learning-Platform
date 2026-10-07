import { describe, expect, it } from "vitest";
import { generateDigitPuzzle, type TileId } from "./escapeGenerator";

const TILES: TileId[] = ["box", "painting", "bookshelf", "clock"];

describe("generateDigitPuzzle", () => {
  it("always answers with a single digit 0-9", () => {
    for (const tileId of TILES) {
      for (let i = 0; i < 50; i++) {
        const p = generateDigitPuzzle(tileId, () => Math.random());
        expect(p.answer).toBeGreaterThanOrEqual(0);
        expect(p.answer).toBeLessThanOrEqual(9);
        expect(Number.isInteger(p.answer)).toBe(true);
      }
    }
  });

  it("terminates even when every draw would otherwise overflow (fallback path)", () => {
    // rng() -> 0.99 picks op "×" and near-max operands every time, forcing the fallback.
    const p = generateDigitPuzzle("clock", () => 0.99);
    expect(p.answer).toBeGreaterThanOrEqual(0);
    expect(p.answer).toBeLessThanOrEqual(9);
  });

  it("carries the requested tileId through", () => {
    expect(generateDigitPuzzle("bookshelf", () => 0.5).tileId).toBe("bookshelf");
  });
});
