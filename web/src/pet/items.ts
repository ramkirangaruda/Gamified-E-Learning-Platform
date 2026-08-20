import type { InventoryItem } from "../api";

// Everything the child can spend points on, as data plus pure functions. §10's economy,
// extended by exactly the minimum needed to make spending a decision rather than a
// formality -- no new stats, no new currencies, and nothing that can be taken away.
//
// WHY THIS REPLACED treats.ts. The shop used to hold three treats, all affordable within
// a level or two, and it closed the instant you bought one. That is not a choice; it is a
// button with three labels. What was missing was anything worth SAVING for, anything worth
// coming back to look at, and any record that you had ever bought anything at all -- §7's
// `inventory` table was read on every request and written by nothing.
//
// THE ONE RULE THAT SHAPES ALL OF THIS. The brief forbids every standard way a game
// creates pressure: no decay, no timers that deplete, no punishment, and the pet never
// regresses (§10). So this cannot be gamified by giving the child something to LOSE. It is
// gamified by giving them more to do and more to see -- something to save toward, a
// collection that only grows, and a pet that visibly changes because of a choice they made.
//
// Which is also why `qty` is a LIFETIME COUNT rather than a stock level: feeding a berry
// raises the number of berries you have ever fed. Nothing is ever consumed, so nothing can
// ever be lost, and internal/store's saveInventory can safely refuse to decrement anything.

export type ItemKind = "treat" | "wearable";

/** Where a wearable sits on the pet. Both slots are deliberately silhouette-independent:
 *  the roster is seven characters with wildly different shapes (a lizard, a carrot, a wolf
 *  on a motorbike), so an item that has to line up with a neck or a hand cannot be drawn
 *  once and trusted. `hat` is top-centre -- the placement the evolution hat already proves
 *  works on all seven -- and `mat` is a shape on the ground behind the pet, which cannot
 *  be wrong at all. Adding a third slot is one entry here plus one piece of art. */
export type Slot = "hat" | "mat";

export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  /** Points it costs. Never allowed to take the balance below zero. */
  cost: number;
  /** One short line for the shop card. */
  blurb: string;

  /** Treats only: hunger restored, before clamping at 100. */
  fills?: number;
  /** Treats only: one line in the pet's voice, shown when it is eaten. Deliberately
   *  character-neutral so it reads correctly for whichever of the seven is selected. */
  line?: string;

  /** Wearables only. */
  slot?: Slot;
  /** Levels that must be solved before this appears as buyable. 0 = from the very start.
   *
   *  This is the part that makes the shop worth revisiting, and it is NOT a punishment: a
   *  locked item is shown, named, priced, and told plainly how far away it is, exactly the
   *  way a locked level is ("Almost there! Not yet -- keep going!"). §10 rules out
   *  taking things away, not having something to look forward to. */
  unlocksAt?: number;
}

// PRICING. §10's table prices what you EARN -- attempt 1, solved 5, first-try 8, hard +15,
// under par +5 -- and the treats below are unchanged from the prices derived from it when
// they were the only thing to buy. The wearables are priced against the same table, in
// multiples of what a session actually yields:
//
//   * a treat is a few minutes of play, bought without thinking about it
//   * the cheapest wearable is a couple of sessions of saving, and is the first time a
//     child has to choose between spending now and spending later
//   * the dearest is a genuine goal, and is gated behind the same solved-level count as
//     the pet's own last evolution stage, so the two land together
//
// The unlock thresholds are 0 / 5 / 13, the first three of internal/api's
// evolutionThresholds. Reusing that ladder rather than inventing a second one means the
// shop's sense of "how far along am I" agrees with the pet's own.
//
// The absolute numbers are calibrated against what the game can actually pay out, not
// chosen for feel: content/levels holds 25 levels, none flagged hard, so a lifetime is
// roughly 200 points solving everything first try and around 325 with the under-par bonus
// on top. The four wearables total 220. That is deliberately most-but-not-all of a
// careful child's lifetime earnings: enough that collecting the set is genuinely
// reachable, tight enough that buying a cake instead is a real decision rather than
// something you do while waiting for the numbers to go up anyway.
export const ITEMS: Item[] = [
  // --- Treats: small, frequent, immediately visible ------------------------
  {
    id: "berry",
    name: "Sun berry",
    kind: "treat",
    cost: 5,
    fills: 15,
    blurb: "A little snack.",
    line: "Ooh, a sun berry! My favourite little snack.",
  },
  {
    id: "sandwich",
    name: "Cloud sandwich",
    kind: "treat",
    cost: 12,
    fills: 35,
    blurb: "A proper meal.",
    line: "A whole cloud sandwich? You must have been working hard!",
  },
  {
    id: "cake",
    name: "Star cake",
    kind: "treat",
    cost: 25,
    fills: 60,
    blurb: "For a big day.",
    line: "STAR CAKE! This is the best day. Thank you!",
  },

  // --- Wearables: rare, permanent, and the reason to save ------------------
  {
    id: "cosy-mat",
    name: "Cosy mat",
    kind: "wearable",
    slot: "mat",
    cost: 30,
    blurb: "A soft place to sit.",
    unlocksAt: 0,
  },
  {
    id: "sun-hat",
    name: "Sun hat",
    kind: "wearable",
    slot: "hat",
    cost: 45,
    blurb: "Keeps the sun off.",
    unlocksAt: 0,
  },
  {
    id: "star-mat",
    name: "Star rug",
    kind: "wearable",
    slot: "mat",
    cost: 60,
    blurb: "Woven with little stars.",
    unlocksAt: 5,
  },
  {
    id: "star-crown",
    name: "Star crown",
    kind: "wearable",
    slot: "hat",
    cost: 85,
    blurb: "For someone who's come a long way.",
    unlocksAt: 13,
  },
];

export const TREATS: Item[] = ITEMS.filter((i) => i.kind === "treat");
export const WEARABLES: Item[] = ITEMS.filter((i) => i.kind === "wearable");

export function itemById(id: string): Item | undefined {
  return ITEMS.find((i) => i.id === id);
}

export function canAfford(points: number, item: Item): boolean {
  return points >= item.cost;
}

/** How many of this item have ever been bought. For a wearable that is 0 or 1; for a
 *  treat it is the lifetime count fed, which only ever grows. */
export function ownedCount(inventory: InventoryItem[], id: string): number {
  return inventory.find((i) => i.item_id === id)?.qty ?? 0;
}

export function isOwned(inventory: InventoryItem[], id: string): boolean {
  return ownedCount(inventory, id) > 0;
}

/** Whether this item is on the pet right now. */
export function isEquipped(inventory: InventoryItem[], id: string): boolean {
  return inventory.some((i) => i.item_id === id && i.equipped && i.qty > 0);
}

/** The item currently worn in a slot, or null. */
export function equippedInSlot(inventory: InventoryItem[], slot: Slot): Item | null {
  for (const row of inventory) {
    if (!row.equipped || row.qty <= 0) continue;
    const item = itemById(row.item_id);
    if (item?.slot === slot) return item;
  }
  return null;
}

export function isUnlocked(item: Item, solvedCount: number): boolean {
  return solvedCount >= (item.unlocksAt ?? 0);
}

/** Why a purchase can't happen, for copy that says something useful rather than "no". */
export type Blocker = "cost" | "locked" | "owned" | null;

export function purchaseBlocker(
  item: Item,
  points: number,
  inventory: InventoryItem[],
  solvedCount: number,
): Blocker {
  if (item.kind === "wearable" && isOwned(inventory, item.id)) return "owned";
  if (!isUnlocked(item, solvedCount)) return "locked";
  if (!canAfford(points, item)) return "cost";
  return null;
}

export interface PurchaseInput {
  points: number;
  hunger: number;
  item: Item;
  inventory: InventoryItem[];
  /** solved_levels.length -- what the unlock thresholds are measured against. */
  solvedCount: number;
}

export interface PurchaseResult {
  /** False when the purchase can't happen -- everything comes back untouched. */
  ok: boolean;
  blocker: Blocker;
  points: number;
  hunger: number;
  inventory: InventoryItem[];
}

/**
 * The whole transaction, as one pure function so the invariants are testable without a
 * store, a server, or a rendered component:
 *   * you can never buy what you can't afford, haven't unlocked, or already own
 *   * points can never go negative
 *   * hunger can never exceed 100 (and buying at 100 is still allowed -- the child gets
 *     the moment, just no extra meter)
 *   * the inventory that comes back is never smaller than the one that went in
 *
 * Spending reduces `points` but never `total_xp`. That is exactly why §7's schema carries
 * both: `total_xp` is the permanent record of everything ever earned and only ever grows,
 * so §10's "the pet never regresses" holds even though the spendable balance goes down. A
 * child can spend everything and lose no progress -- no level re-locks, no star is
 * removed, no evolution stage is lost, and now no wearable is taken back either.
 */
export function applyPurchase({ points, hunger, item, inventory, solvedCount }: PurchaseInput): PurchaseResult {
  const blocker = purchaseBlocker(item, points, inventory, solvedCount);
  if (blocker) return { ok: false, blocker, points, hunger, inventory };

  const next = inventory.map((row) => ({ ...row }));
  const existing = next.find((row) => row.item_id === item.id);
  if (existing) {
    existing.qty += 1;
  } else {
    next.push({ item_id: item.id, qty: 1, equipped: false });
  }

  return {
    ok: true,
    blocker: null,
    points: points - item.cost,
    hunger: item.kind === "treat" ? Math.min(100, hunger + (item.fills ?? 0)) : hunger,
    // Buying a wearable puts it on immediately. A child who has just saved thirty points
    // for a hat should not then have to find a second button to wear it -- the whole
    // reward for the saving is seeing it on the pet.
    inventory: item.kind === "wearable" ? applyEquip(next, item, true) : next,
  };
}

/**
 * Put an item on or take it off. Equipping one thing unequips whatever else was in the
 * same slot, so the state can never describe a pet wearing two hats.
 *
 * Unlike a purchase this moves freely in both directions, and that is deliberate: what
 * the pet is wearing right now is a preference, not progress, so nothing is lost by
 * changing it. Taking a hat off does not un-buy it.
 */
export function applyEquip(inventory: InventoryItem[], item: Item, equipped: boolean): InventoryItem[] {
  if (!item.slot) return inventory;
  return inventory.map((row) => {
    if (row.item_id === item.id) return { ...row, equipped };
    // Only clear the slot when something is being put ON it.
    if (!equipped) return row;
    return itemById(row.item_id)?.slot === item.slot ? { ...row, equipped: false } : row;
  });
}
