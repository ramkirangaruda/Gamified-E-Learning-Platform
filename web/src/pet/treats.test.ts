import { describe, expect, it } from "vitest";
import { TREATS, applyPurchase, canAfford, treatById } from "./treats";

const berry = treatById("berry")!;
const cake = treatById("cake")!;

describe("treat shop", () => {
  it("spends points and fills hunger", () => {
    const r = applyPurchase({ points: 30, hunger: 40, treat: berry });
    expect(r.ok).toBe(true);
    expect(r.points).toBe(30 - berry.cost);
    expect(r.hunger).toBe(40 + berry.fills);
  });

  it("refuses a treat the child cannot afford, changing nothing", () => {
    const r = applyPurchase({ points: cake.cost - 1, hunger: 10, treat: cake });
    expect(r.ok).toBe(false);
    expect(r.points).toBe(cake.cost - 1);
    expect(r.hunger).toBe(10);
  });

  it("never lets points go negative, however many treats are bought", () => {
    let points = 37;
    let hunger = 0;
    for (let i = 0; i < 50; i++) {
      const r = applyPurchase({ points, hunger, treat: berry });
      if (!r.ok) break;
      points = r.points;
      hunger = r.hunger;
    }
    expect(points).toBeGreaterThanOrEqual(0);
    expect(points).toBeLessThan(berry.cost); // spent down to what it can't afford
  });

  it("clamps hunger at 100 rather than overflowing it", () => {
    const r = applyPurchase({ points: 100, hunger: 95, treat: cake });
    expect(r.ok).toBe(true);
    expect(r.hunger).toBe(100);
  });

  it("still lets a full pet be given a treat", () => {
    // The moment matters more than the meter -- refusing would read as "no, go away".
    const r = applyPurchase({ points: 100, hunger: 100, treat: berry });
    expect(r.ok).toBe(true);
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
      expect(TREATS[i].fills).toBeGreaterThan(TREATS[i - 1].fills);
    }
  });

  it("agrees with canAfford", () => {
    expect(canAfford(berry.cost, berry)).toBe(true);
    expect(canAfford(berry.cost - 1, berry)).toBe(false);
  });
});
