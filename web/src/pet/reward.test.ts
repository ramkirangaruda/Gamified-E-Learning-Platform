import { describe, expect, it } from "vitest";
import { computeAttemptReward } from "./reward";

describe("computeAttemptReward", () => {
  it("grants the full solve bonus the first time a level is beaten", () => {
    const r = computeAttemptReward({
      outcome: "solved",
      firstTry: true,
      hard: false,
      blocksUsed: 3,
      parBlocks: 5,
      alreadySolved: false,
    });
    // 1 (attempt) + 8 (first-try solve) + 5 (under par) = 14
    expect(r.points).toBe(14);
  });

  it("does not re-grant the solve bonus on a re-run of an already-solved level", () => {
    const r = computeAttemptReward({
      outcome: "solved",
      firstTry: false,
      hard: true,
      blocksUsed: 3,
      parBlocks: 5,
      alreadySolved: true,
    });
    // Only the flat attempt point -- no solve/first-try/hard/under-par bonuses,
    // regardless of how "good" this particular re-run looked.
    expect(r.points).toBe(1);
  });

  it("clicking Run repeatedly on a solved level does not keep growing points", () => {
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const r = computeAttemptReward({
        outcome: "solved",
        firstTry: false,
        hard: false,
        blocksUsed: 3,
        parBlocks: 5,
        alreadySolved: true,
      });
      total += r.points;
    }
    // 10 replays should add up to 10 flat attempt points, not 10x a solve bonus.
    expect(total).toBe(10);
  });

  // "a hard problem attempted and failed feeds the pet more than an easy one solved" --
  // brief §10's single most important balance decision, previously only checked by hand
  // (see DECISIONS.md) and never actually asserted in an automated test.
  it("feeds the pet more for a failed hard attempt than a solved easy one", () => {
    const hardFailed = computeAttemptReward({
      outcome: "failed",
      firstTry: false,
      hard: true,
      blocksUsed: 5,
      parBlocks: 5,
      alreadySolved: false,
    });
    const easySolved = computeAttemptReward({
      outcome: "solved",
      firstTry: false,
      hard: false,
      blocksUsed: 5,
      parBlocks: 5,
      alreadySolved: false,
    });
    expect(hardFailed.hungerDelta).toBeGreaterThan(easySolved.hungerDelta);
  });
});
