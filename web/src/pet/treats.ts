// The treat shop, as data plus one pure function. §10's economy, extended by exactly the
// minimum needed to spend points -- no new stats, no new currencies.
//
// PRICING. The brief's §10 table prices what you *earn* (attempt 1, solved 5, first-try
// 8, hard +15, under par +5) but no printed price list for treats exists anywhere in the
// repo, so the prices below are derived from that table rather than invented next to it:
//
//   * berry     5 pts  -- one solved level. Always affordable soon after any real play.
//   * sandwich 12 pts  -- roughly two solves.
//   * cake     25 pts  -- three to four solves, or one hard level. This is §13 step 5's
//                        cake, so it has to feel like an occasion, not a default.
//
// Judgment call, logged in DECISIONS.md: **spending reduces `points` but never
// `total_xp`.** That is exactly why §7's schema carries both -- `total_xp` is the
// permanent record of everything ever earned and only ever grows, so §10's "the pet never
// regresses" holds even though the spendable balance goes down when you buy something.
// A child can spend everything and lose no progress: no level re-locks, no star is
// removed, no evolution stage is lost.
//
// Deliberately NOT here, per the queue: happiness, energy, a sleep/rest mechanic,
// cross-day decay, streaks, or any timer that depletes anything. Hunger only ever goes up
// (feeding, and attempts) and resets at session start.

export interface Treat {
  id: string;
  name: string;
  /** Points it costs. Never allowed to take the balance below zero. */
  cost: number;
  /** Hunger it restores, before clamping at 100. */
  fills: number;
  /** One short line in Pip's voice, shown when it's eaten. */
  line: string;
}

export const TREATS: Treat[] = [
  {
    id: "berry",
    name: "Sun berry",
    cost: 5,
    fills: 15,
    line: "Ooh, a sun berry! My favourite little snack.",
  },
  {
    id: "sandwich",
    name: "Cloud sandwich",
    cost: 12,
    fills: 35,
    line: "A whole cloud sandwich? You must have been working hard!",
  },
  {
    id: "cake",
    name: "Star cake",
    cost: 25,
    fills: 60,
    line: "STAR CAKE! This is the best day. Thank you!",
  },
];

export function treatById(id: string): Treat | undefined {
  return TREATS.find((t) => t.id === id);
}

export function canAfford(points: number, treat: Treat): boolean {
  return points >= treat.cost;
}

export interface PurchaseInput {
  points: number;
  hunger: number;
  treat: Treat;
}

export interface PurchaseResult {
  /** False when the child can't afford it -- points and hunger come back untouched. */
  ok: boolean;
  points: number;
  hunger: number;
}

/**
 * The whole transaction, as one pure function so the invariants are testable without a
 * store, a server, or a rendered component:
 *   * you can never buy what you can't afford
 *   * points can never go negative
 *   * hunger can never exceed 100 (and buying at 100 is still allowed -- the child gets
 *     the moment, just no extra meter)
 */
export function applyPurchase({ points, hunger, treat }: PurchaseInput): PurchaseResult {
  if (!canAfford(points, treat)) return { ok: false, points, hunger };
  return {
    ok: true,
    points: points - treat.cost,
    hunger: Math.min(100, hunger + treat.fills),
  };
}
