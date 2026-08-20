// Physics's progress, kept separate from PhysicsQuest.tsx (the canvas game itself) so
// HomePage and SubjectPage can read "how far has this child gotten" without pulling in
// the whole game and its render loop.
//
// This is real, honest progress -- three stars per round, computed from the same win/fail
// checks the game runs -- but it lives in localStorage, not pet.db on the USB drive. That
// is a real gap, not an oversight: Physics has no executor, no AST, and no server-side
// schema the way Coding does, so there is nowhere on the drive for it to live yet. A swap
// to a different USB drive loses Physics progress the same way it would lose nothing for
// Coding. Worth fixing later; not worth blocking this subject on.

export type PhysicsLevelKey = "proj" | "spring" | "lever" | "circuit" | "mirror";

export const PHYSICS_LEVEL_KEYS: PhysicsLevelKey[] = ["proj", "spring", "lever", "circuit", "mirror"];
export const PHYSICS_ROUNDS_PER_LEVEL = 3;

export type PhysicsSolved = Record<PhysicsLevelKey, [number, number, number]>;

const EMPTY_SOLVED: PhysicsSolved = {
  proj: [0, 0, 0],
  spring: [0, 0, 0],
  lever: [0, 0, 0],
  circuit: [0, 0, 0],
  mirror: [0, 0, 0],
};

const STORAGE_KEY = "tessera-physics-progress-v1";

export function loadPhysicsSolved(): PhysicsSolved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SOLVED;
    const parsed = JSON.parse(raw) as Partial<PhysicsSolved>;
    return { ...EMPTY_SOLVED, ...parsed };
  } catch {
    return EMPTY_SOLVED;
  }
}

export function savePhysicsSolved(solved: PhysicsSolved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(solved));
  } catch {
    // localStorage unavailable (private mode etc.) -- progress just won't persist
  }
}

/** Total XP across every solved round -- same 20 + (stars-1)*10 curve the game awards live. */
export function physicsXp(solved: PhysicsSolved): number {
  let xp = 0;
  for (const key of PHYSICS_LEVEL_KEYS) for (const stars of solved[key]) if (stars > 0) xp += 20 + (stars - 1) * 10;
  return xp;
}

/** Rounds with at least one star, out of the 15 total -- the unit HomePage's progress bar
 *  and star row use, so it moves smoothly rather than jumping only on whole-level clears. */
export function physicsRoundsSolved(solved: PhysicsSolved): number {
  let n = 0;
  for (const key of PHYSICS_LEVEL_KEYS) for (const stars of solved[key]) if (stars > 0) n++;
  return n;
}

/** Sum of every round's star count (0-45) -- ProgressPage's "stars earned" grain, the same
 *  shape as its Coding rows (sum of per-level stars, scaled by round/level count). */
export function physicsStarsSum(solved: PhysicsSolved): number {
  let n = 0;
  for (const key of PHYSICS_LEVEL_KEYS) for (const stars of solved[key]) n += stars;
  return n;
}

/** Levels with all three rounds solved -- the unit shown in "X of 5 levels cleared". */
export function physicsLevelsCleared(solved: PhysicsSolved): number {
  return PHYSICS_LEVEL_KEYS.filter((key) => solved[key].every((v) => v > 0)).length;
}
