import { describe, expect, it } from "vitest";
import {
  LEVEL_COUNT_MILESTONES,
  XP_MILESTONES,
  detectNewMilestones,
  detectNewlyUnlockedLevel,
  findCurrentLevelIndex,
  hasRecommendedLevel,
} from "./progress";
import type { GameState, LevelDef } from "../api";

function level(id: string): LevelDef {
  return { id, name: id, teaches: "move", difficulty: "easy", parBlocks: 1 } as LevelDef;
}

const LEVELS = [level("l1"), level("l2"), level("l3")];

describe("findCurrentLevelIndex", () => {
  it("is the first unsolved level", () => {
    expect(findCurrentLevelIndex(LEVELS, [])).toBe(0);
    expect(findCurrentLevelIndex(LEVELS, ["l1"])).toBe(1);
  });

  it("is the last level once everything is solved", () => {
    expect(findCurrentLevelIndex(LEVELS, ["l1", "l2", "l3"])).toBe(2);
  });

  it("is -1 for an empty level list", () => {
    expect(findCurrentLevelIndex([], [])).toBe(-1);
  });

  it("ignores solve order (matches Trail.tsx's own set-based logic)", () => {
    expect(findCurrentLevelIndex(LEVELS, ["l3", "l1"])).toBe(1);
  });
});

describe("detectNewMilestones", () => {
  it("fires nothing when nothing was crossed", () => {
    expect(detectNewMilestones(10, 20, 1, 2)).toEqual([]);
  });

  it("fires exactly the xp thresholds crossed", () => {
    const first = XP_MILESTONES[0];
    expect(detectNewMilestones(first - 1, first, 0, 0)).toEqual([{ kind: "xp", threshold: first }]);
  });

  it("fires exactly the level-count thresholds crossed", () => {
    const first = LEVEL_COUNT_MILESTONES[0];
    expect(detectNewMilestones(0, 0, first - 1, first)).toEqual([{ kind: "levels", threshold: first }]);
  });

  it("never re-fires a threshold already behind both readings", () => {
    const first = XP_MILESTONES[0];
    expect(detectNewMilestones(first + 5, first + 10, 0, 0)).toEqual([]);
  });

  it("can fire more than one threshold on a big jump, in ascending order", () => {
    const [a, b] = XP_MILESTONES;
    const found = detectNewMilestones(0, b, 0, 0);
    expect(found).toEqual([
      { kind: "xp", threshold: a },
      { kind: "xp", threshold: b },
    ]);
  });
});

describe("detectNewlyUnlockedLevel", () => {
  it("fires when the current index advances", () => {
    expect(detectNewlyUnlockedLevel(LEVELS, 0, 1)).toEqual(level("l2"));
  });

  it("does not fire when the index stays the same", () => {
    expect(detectNewlyUnlockedLevel(LEVELS, 1, 1)).toBeNull();
  });

  it("does not fire when the index goes backward", () => {
    expect(detectNewlyUnlockedLevel(LEVELS, 2, 1)).toBeNull();
  });
});

describe("hasRecommendedLevel", () => {
  it("is false with no state", () => {
    expect(hasRecommendedLevel(LEVELS, null)).toBe(false);
  });

  it("is true while there's an unsolved level to recommend", () => {
    const state = { solved_levels: ["l1"] } as GameState;
    expect(hasRecommendedLevel(LEVELS, state)).toBe(true);
  });

  it("is false once everything is solved", () => {
    const state = { solved_levels: ["l1", "l2", "l3"] } as GameState;
    expect(hasRecommendedLevel(LEVELS, state)).toBe(false);
  });
});
