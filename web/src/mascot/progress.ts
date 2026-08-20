// Streak/milestone derivation and the "what's the recommended next level" calculation --
// all pure functions over data GameState/LevelDef already provide. Nothing here is
// persisted server-side: streaks and milestones are additive-only client-side readings of
// fields (`total_xp`, `solved_levels`) that are themselves already monotonic, matching the
// "the mascot/world never regresses" convention the rest of this codebase already commits
// to (highest_level/stars_by_level/total_xp all only ever grow -- see DECISIONS.md).
import type { GameState, LevelDef } from "../api";

/** The first unsolved level's index -- "where the child is." Mirrors trail/Trail.tsx's own
 *  `current` calculation exactly (kept as one shared function so the mascot's idea of
 *  "the recommended next level" can never drift from what the trail itself shows as
 *  current). If every level is solved, the last level is "current". */
export function findCurrentLevelIndex(levels: LevelDef[], solvedIds: string[]): number {
  if (levels.length === 0) return -1;
  const solvedSet = new Set(solvedIds);
  const idx = levels.findIndex((l) => !solvedSet.has(l.id));
  return idx === -1 ? levels.length - 1 : idx;
}

/** total_xp thresholds. Additive-only -- growing this list is safe, removing/lowering a
 *  value is not (a milestone already reached must stay reachable). */
export const XP_MILESTONES: readonly number[] = [50, 150, 300, 500, 750, 1000];

/** solved_levels.length thresholds. */
export const LEVEL_COUNT_MILESTONES: readonly number[] = [5, 10, 15, 20, 25];

export type Milestone =
  | { kind: "xp"; threshold: number }
  | { kind: "levels"; threshold: number };

/** Every threshold that sits in (prev, next] -- i.e. was just crossed. Returns them in
 *  ascending order; usually zero or one, but a big optimistic-state jump (e.g. after a
 *  reconnect) can legitimately cross more than one at once, and every one of them is a
 *  real milestone worth telling the child about, not just the last. */
export function detectNewMilestones(prevXp: number, nextXp: number, prevSolvedCount: number, nextSolvedCount: number): Milestone[] {
  const found: Milestone[] = [];
  for (const t of XP_MILESTONES) if (prevXp < t && nextXp >= t) found.push({ kind: "xp", threshold: t });
  for (const t of LEVEL_COUNT_MILESTONES) if (prevSolvedCount < t && nextSolvedCount >= t) found.push({ kind: "levels", threshold: t });
  return found;
}

/** The level that just became reachable, or null if the recommended level didn't move
 *  (nothing to announce -- most renders). Compares `current` indices, not raw solved
 *  counts, so it fires exactly once per real unlock rather than once per solve. */
export function detectNewlyUnlockedLevel(
  levels: LevelDef[],
  prevCurrentIndex: number,
  nextCurrentIndex: number,
): LevelDef | null {
  if (nextCurrentIndex <= prevCurrentIndex) return null;
  return levels[nextCurrentIndex] ?? null;
}

/** Whether there's a sensible "go here next" level to point the mascot toward -- false
 *  once every level is solved (nothing left to recommend). */
export function hasRecommendedLevel(levels: LevelDef[], state: GameState | null): boolean {
  if (!state || levels.length === 0) return false;
  const idx = findCurrentLevelIndex(levels, state.solved_levels);
  return idx >= 0 && !state.solved_levels.includes(levels[idx]?.id ?? "");
}
