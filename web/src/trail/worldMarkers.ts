// World-decoration thresholds -- mirrors concepts.ts's EVOLUTION_MARKERS shape exactly
// (afterSolved, additive-only). Consumed by BackgroundScene.tsx to grow the meadow as the
// child solves more levels; nothing here is a new progression system, it's a pure
// rendering-time derivation of solved_levels.length, which GameState already provides.

export interface FlowerSpec {
  x: number;
  y: number;
  c: string;
}

export interface WorldStage {
  afterSolved: number;
  extraFlowers: FlowerSpec[];
  /** Whether this stage also adds an extra tree to the mid-hill. */
  extraTree?: { x: number; y: number; s: number };
}

export const WORLD_GROWTH_STAGES: WorldStage[] = [
  {
    afterSolved: 3,
    extraFlowers: [
      { x: 380, y: 865, c: "#ff6b6b" },
      { x: 1050, y: 860, c: "#9b6bdb" },
    ],
  },
  {
    afterSolved: 8,
    extraFlowers: [
      { x: 160, y: 860, c: "#ffb703" },
      { x: 700, y: 878, c: "#3bb4e5" },
      { x: 1320, y: 865, c: "#ff6b6b" },
    ],
    extraTree: { x: 800, y: 705, s: 0.9 },
  },
  {
    afterSolved: 15,
    extraFlowers: [
      { x: 40, y: 865, c: "#3bb4e5" },
      { x: 480, y: 870, c: "#ffb703" },
      { x: 1240, y: 878, c: "#9b6bdb" },
    ],
    extraTree: { x: 300, y: 700, s: 1 },
  },
  {
    afterSolved: 22,
    extraFlowers: [
      { x: 620, y: 862, c: "#ff6b6b" },
      { x: 950, y: 850, c: "#ffb703" },
      { x: 1500, y: 862, c: "#3bb4e5" },
    ],
    extraTree: { x: 1150, y: 715, s: 1.1 },
  },
];

/** Every flower from every stage reached so far -- additive, persists automatically
 *  because it's re-derived from solvedCount on every render, same as EVOLUTION_MARKERS. */
export function activeFlowers(solvedCount: number): FlowerSpec[] {
  return WORLD_GROWTH_STAGES.filter((s) => s.afterSolved <= solvedCount).flatMap((s) => s.extraFlowers);
}

export function activeExtraTrees(solvedCount: number): { x: number; y: number; s: number }[] {
  return WORLD_GROWTH_STAGES.filter((s) => s.afterSolved <= solvedCount && s.extraTree).map((s) => s.extraTree!);
}
