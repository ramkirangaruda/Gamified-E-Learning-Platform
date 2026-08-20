// The mascot event-bus surface (brief requirement #4): callers reach the mascot through
// these named methods -- sessionStart(), levelHovered(level), etc. -- and never touch a
// MascotState, a Rive trigger name, or an animation type directly. The actual
// implementation lives in pet/PetProvider.tsx (it needs the same state -- game state,
// active level, transient reactions -- the rest of the provider already owns; a second,
// separate store would just be two places the same bug could hide), this file only
// re-exports the slice of the context that is the event API, so a component that only
// needs to fire events doesn't have to import from pet/ or know PetProvider exists.
import { usePet } from "../pet/PetProvider";
import type { LevelDef } from "../api";
import type { Milestone } from "./progress";

export interface MascotEvents {
  sessionStart(): void;
  levelHovered(level: LevelDef): void;
  levelSelected(level: LevelDef): void;
  levelLocked(level: LevelDef): void;
  answerCorrect(): void;
  answerIncorrect(): void;
  levelCompleted(level: LevelDef): void;
  streakIncreased(streak: number): void;
  milestoneReached(milestone: Milestone): void;
  levelUnlocked(level: LevelDef): void;
  mascotClicked(): void;
}

export function useMascotEvents(): MascotEvents {
  const pet = usePet();
  return {
    sessionStart: pet.sessionStart,
    levelHovered: pet.levelHovered,
    levelSelected: pet.levelSelected,
    levelLocked: pet.levelLocked,
    answerCorrect: pet.answerCorrect,
    answerIncorrect: pet.answerIncorrect,
    levelCompleted: pet.levelCompleted,
    streakIncreased: pet.streakIncreased,
    milestoneReached: pet.milestoneReached,
    levelUnlocked: pet.levelUnlocked,
    mascotClicked: pet.mascotClicked,
  };
}
