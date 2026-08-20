import { describe, expect, it } from "vitest";
import type { GameState } from "../api";
import { MATH_LAB_HUNGER_PER_CORRECT, MATH_LAB_POINTS_PER_CORRECT, nextStateForCorrectAnswer } from "./reward";

function fixtureState(overrides?: Partial<GameState["learner"] & { hunger: number }>): GameState {
  return {
    learner: { id: "l1", display_name: "Kid", created_at: 0, total_xp: 10, points: 10, highest_level: 1, ...overrides },
    pet: { id: "p1", species: "tom-lizard", name: "Tom", evolution_stage: 0, hunger: overrides?.hunger ?? 50, session_started_at: 0 },
    inventory: [],
    solved_levels: [],
    stars_by_level: {},
  } as unknown as GameState;
}

describe("nextStateForCorrectAnswer", () => {
  it("adds exactly the shared point/xp constant", () => {
    const state = fixtureState();
    const next = nextStateForCorrectAnswer(state);
    expect(next.learner.points).toBe(10 + MATH_LAB_POINTS_PER_CORRECT);
    expect(next.learner.total_xp).toBe(10 + MATH_LAB_POINTS_PER_CORRECT);
  });

  it("adds the shared hunger constant", () => {
    const state = fixtureState({ hunger: 50 });
    const next = nextStateForCorrectAnswer(state);
    expect(next.pet.hunger).toBe(50 + MATH_LAB_HUNGER_PER_CORRECT);
  });

  it("clamps hunger at 100", () => {
    const state = fixtureState({ hunger: 99 });
    const next = nextStateForCorrectAnswer(state);
    expect(next.pet.hunger).toBe(100);
  });

  it("does not mutate the input", () => {
    const state = fixtureState();
    const before = JSON.stringify(state);
    nextStateForCorrectAnswer(state);
    expect(JSON.stringify(state)).toBe(before);
  });
});
