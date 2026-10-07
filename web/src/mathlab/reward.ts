import type { GameState } from "../api";

// The one points/hunger step every Math Lab game applies on a correct answer, extracted
// so all four games share exactly one constant instead of four inline copies that could
// quietly drift apart. +8 matches ChemLabPage's own flat per-correct-guess rate exactly
// (see DECISIONS.md) -- one confirmed correct answer here is worth the same as one
// confirmed correct guess there.
export const MATH_LAB_POINTS_PER_CORRECT = 8;
export const MATH_LAB_HUNGER_PER_CORRECT = 3;

/** Pure: the next GameState to commitState() after a correct Math Lab answer. */
export function nextStateForCorrectAnswer(state: GameState): GameState {
  return {
    ...state,
    learner: {
      ...state.learner,
      points: state.learner.points + MATH_LAB_POINTS_PER_CORRECT,
      total_xp: state.learner.total_xp + MATH_LAB_POINTS_PER_CORRECT,
    },
    pet: { ...state.pet, hunger: Math.min(100, state.pet.hunger + MATH_LAB_HUNGER_PER_CORRECT) },
  };
}
