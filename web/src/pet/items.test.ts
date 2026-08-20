import { describe, expect, it } from "vitest";
import type { InventoryItem } from "../api";
import {
  ITEMS,
  TREATS,
  WEARABLES,
  applyEquip,
  applyPurchase,
  canAfford,
  equippedInSlot,
  isOwned,
  itemById,
  ownedCount,
  purchaseBlocker,
} from "./items";

const berry = itemById("berry")!;
const cake = itemById("cake")!;
const sunHat = itemById("sun-hat")!;
const cosyMat = itemById("cosy-mat")!;
const starCrown = itemById("star-crown")!;

/** Enough solved levels that nothing is gated -- for the tests that are about money. */
const ALL_UNLOCKED = 99;

function buy(over: Partial<Parameters<typeof applyPurchase>[0]> = {}) {
  return applyPurchase({
    points: 100,
    hunger: 50,
    item: berry,
    inventory: [],
    solvedCount: ALL_UNLOCKED,
    ...over,
  });
}

// --- Everything the treat shop used to guarantee, unchanged -----------------
describe("treats", () => {
  it("spends points and fills hunger", () => {
    const r = buy({ points: 30, hunger: 40, item: berry });
    expect(r.ok).toBe(true);
    expect(r.points).toBe(30 - berry.cost);
    expect(r.hunger).toBe(40 + berry.fills!);
  });

  it("refuses a treat the child cannot afford, changing nothing", () => {
    const r = buy({ points: cake.cost - 1, hunger: 10, item: cake });
    expect(r.ok).toBe(false);
    expect(r.blocker).toBe("cost");
    expect(r.points).toBe(cake.cost - 1);
    expect(r.hunger).toBe(10);
  });

  it("never lets points go negative, however many treats are bought", () => {
    let points = 37;
    let hunger = 0;
    let inventory: InventoryItem[] = [];
    for (let i = 0; i < 50; i++) {
      const r = applyPurchase({ points, hunger, item: berry, inventory, solvedCount: ALL_UNLOCKED });
      if (!r.ok) break;
      points = r.points;
      hunger = r.hunger;
      inventory = r.inventory;
    }
    expect(points).toBeGreaterThanOrEqual(0);
    expect(points).toBeLessThan(berry.cost); // spent down to what it can't afford
  });

  it("clamps hunger at 100 rather than overflowing it", () => {
    const r = buy({ points: 100, hunger: 95, item: cake });
    expect(r.ok).toBe(true);
    expect(r.hunger).toBe(100);
  });

  it("still lets a full pet be given a treat", () => {
    // The moment matters more than the meter -- refusing would read as "no, go away".
    expect(buy({ points: 100, hunger: 100, item: berry }).ok).toBe(true);
  });

  it("prices every treat within reach of real play, cheapest first", () => {
    // A solved level is 5-8 points (reward.ts), so the entry treat must be affordable
    // after roughly one level and the cake must feel like an occasion without being
    // out of reach.
    const costs = TREATS.map((t) => t.cost);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
    expect(Math.min(...costs)).toBeLessThanOrEqual(8);
    expect(Math.max(...costs)).toBeLessThanOrEqual(30);
  });

  it("makes a more expensive treat always fill more", () => {
    for (let i = 1; i < TREATS.length; i++) {
      expect(TREATS[i].fills!).toBeGreaterThan(TREATS[i - 1].fills!);
    }
  });

  it("agrees with canAfford", () => {
    expect(canAfford(berry.cost, berry)).toBe(true);
    expect(canAfford(berry.cost - 1, berry)).toBe(false);
  });

  it("counts every treat ever fed, and never counts down", () => {
    // The lifetime-count rule the whole inventory design rests on. A treat is not stock
    // being drawn down; it is a tally of a thing that happened, which is why nothing --
    // here or in internal/store -- ever needs to decrement it.
    let inventory: InventoryItem[] = [];
    for (let i = 1; i <= 3; i++) {
      inventory = applyPurchase({ points: 100, hunger: 0, item: berry, inventory, solvedCount: ALL_UNLOCKED }).inventory;
      expect(ownedCount(inventory, "berry")).toBe(i);
    }
  });
});

// --- The part that makes spending a decision --------------------------------
describe("wearables", () => {
  it("is bought once and then owned forever", () => {
    const first = buy({ item: sunHat });
    expect(first.ok).toBe(true);
    expect(isOwned(first.inventory, sunHat.id)).toBe(true);

    const again = buy({ item: sunHat, inventory: first.inventory });
    expect(again.ok).toBe(false);
    expect(again.blocker).toBe("owned");
    expect(again.points).toBe(100); // and it certainly does not charge twice
  });

  it("goes on the pet the moment it is bought", () => {
    // A child who saved thirty points for a hat should not have to hunt for a second
    // button to wear it -- seeing it on the pet IS the reward for the saving.
    const r = buy({ item: sunHat });
    expect(equippedInSlot(r.inventory, "hat")?.id).toBe(sunHat.id);
  });

  it("costs points but never fills the pet up", () => {
    const r = buy({ points: 100, hunger: 40, item: sunHat });
    expect(r.points).toBe(100 - sunHat.cost);
    expect(r.hunger).toBe(40);
  });

  it("stays visible but unbuyable until its levels are solved", () => {
    // Never a rejection, always a distance: the shop needs to be able to say "solve N
    // more" rather than hiding the thing or refusing flatly (§10).
    expect(purchaseBlocker(starCrown, 500, [], 0)).toBe("locked");
    expect(purchaseBlocker(starCrown, 500, [], starCrown.unlocksAt!)).toBeNull();
  });

  it("refuses a locked item even when the child could afford it", () => {
    const r = buy({ points: 1000, item: starCrown, solvedCount: 0 });
    expect(r.ok).toBe(false);
    expect(r.points).toBe(1000);
    expect(isOwned(r.inventory, starCrown.id)).toBe(false);
  });

  it("reports cost before lock only when the item is actually reachable", () => {
    // Ordering matters for the copy: an item you have not unlocked should say so, not
    // tell you to earn points you may already have.
    expect(purchaseBlocker(starCrown, 0, [], 0)).toBe("locked");
    expect(purchaseBlocker(sunHat, 0, [], 0)).toBe("cost");
  });

  it("never wears two things in the same slot", () => {
    const withHat = buy({ item: sunHat }).inventory;
    const withCrown = applyEquip(
      [...withHat, { item_id: starCrown.id, qty: 1, equipped: false }],
      starCrown,
      true,
    );
    const wornHats = withCrown.filter((row) => row.equipped && itemById(row.item_id)?.slot === "hat");
    expect(wornHats.map((r) => r.item_id)).toEqual([starCrown.id]);
  });

  it("leaves the other slot alone when a slot changes", () => {
    let inv = buy({ item: sunHat }).inventory;
    inv = applyPurchase({ points: 100, hunger: 0, item: cosyMat, inventory: inv, solvedCount: ALL_UNLOCKED }).inventory;
    expect(equippedInSlot(inv, "hat")?.id).toBe(sunHat.id);
    expect(equippedInSlot(inv, "mat")?.id).toBe(cosyMat.id);
  });

  it("taking something off does not un-buy it", () => {
    const bought = buy({ item: sunHat }).inventory;
    const off = applyEquip(bought, sunHat, false);
    expect(equippedInSlot(off, "hat")).toBeNull();
    expect(isOwned(off, sunHat.id)).toBe(true);
  });
});

describe("the economy as a whole", () => {
  it("never returns a smaller inventory than it was given", () => {
    // The §10 guarantee, stated as an invariant over the one function that can change an
    // inventory at all. A purchase that fails must not quietly drop anything either.
    const start: InventoryItem[] = [
      { item_id: "berry", qty: 7, equipped: false },
      { item_id: "sun-hat", qty: 1, equipped: true },
    ];
    for (const item of ITEMS) {
      for (const solved of [0, 5, 13, 99]) {
        for (const points of [0, 20, 1000]) {
          const r = applyPurchase({ points, hunger: 50, item, inventory: start, solvedCount: solved });
          for (const was of start) {
            expect(ownedCount(r.inventory, was.item_id)).toBeGreaterThanOrEqual(was.qty);
          }
          expect(r.points).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("gives every item a unique id and a non-empty name", () => {
    const ids = ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of ITEMS) {
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.blurb.length).toBeGreaterThan(0);
      expect(item.cost).toBeGreaterThan(0);
    }
  });

  it("describes each kind with the fields that kind actually uses", () => {
    for (const item of TREATS) {
      expect(item.fills, `${item.id} must fill something`).toBeGreaterThan(0);
      expect(item.line, `${item.id} needs a line in the pet's voice`).toBeTruthy();
      expect(item.slot).toBeUndefined();
    }
    for (const item of WEARABLES) {
      expect(item.slot, `${item.id} must sit in a slot`).toBeTruthy();
      expect(item.fills).toBeUndefined();
    }
  });

  it("always leaves something buyable from the very start", () => {
    // A shop whose every item is gated is a locked door on day one.
    const fromTheStart = ITEMS.filter((i) => (i.unlocksAt ?? 0) === 0);
    expect(fromTheStart.length).toBeGreaterThan(0);
    expect(fromTheStart.some((i) => i.kind === "wearable")).toBe(true);
  });

  it("makes a wearable a real saving decision against the treats", () => {
    // The whole point of adding them: if the cheapest wearable cost about what a treat
    // costs there would be nothing to weigh up, and the shop would go back to being a
    // button with several labels.
    const dearestTreat = Math.max(...TREATS.map((t) => t.cost));
    const cheapestWearable = Math.min(...WEARABLES.map((w) => w.cost));
    expect(cheapestWearable).toBeGreaterThan(dearestTreat);
  });

  it("keeps the whole collection reachable in one child's lifetime of play", () => {
    // The other half of the pricing argument, and the one that stops "make it a real
    // decision" drifting into "make it unattainable". content/levels holds 25 levels, so
    // a lifetime is roughly 200 points solving everything first try and around 325 with
    // the under-par bonus. The set must fit inside that with room left over for treats --
    // a collection a child can never finish is its own kind of punishment.
    const collection = WEARABLES.reduce((sum, w) => sum + w.cost, 0);
    expect(collection).toBeLessThanOrEqual(250);
  });

  it("prices later unlocks above earlier ones", () => {
    const byUnlock = [...WEARABLES].sort((a, b) => (a.unlocksAt ?? 0) - (b.unlocksAt ?? 0));
    for (let i = 1; i < byUnlock.length; i++) {
      expect(byUnlock[i].cost).toBeGreaterThan(byUnlock[i - 1].cost);
    }
  });
});
