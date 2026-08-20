import { describe, it, expect } from "vitest";
import { replay, applyTurn } from "./GridRenderer";
import type { ExecEvent } from "./executorTypes";

// The "trace -> render state" half of item 6's integration coverage. replay() is the
// only thing in GridRenderer.tsx that looks like logic (turning relative turn events
// into an absolute facing angle) -- everything else is JSX, tested here independent of
// React so it doesn't need a DOM.

describe("applyTurn", () => {
  it("cycles clockwise on right turns", () => {
    expect(applyTurn("up", "right")).toBe("right");
    expect(applyTurn("right", "right")).toBe("down");
    expect(applyTurn("down", "right")).toBe("left");
    expect(applyTurn("left", "right")).toBe("up");
  });

  it("cycles counter-clockwise on left turns", () => {
    expect(applyTurn("up", "left")).toBe("left");
    expect(applyTurn("left", "left")).toBe("down");
  });
});

describe("replay", () => {
  const events: ExecEvent[] = [
    { t: 1, type: "move", from: [0, 0], to: [1, 0] },
    { t: 2, type: "move", from: [1, 0], to: [2, 0] },
    { t: 3, type: "turn", dir: "right" },
    { t: 4, type: "move", from: [2, 0], to: [2, 1] },
    { t: 4, type: "goal" },
  ];

  it("starts at the initial state before any events are replayed", () => {
    const state = replay(events, [0, 0], "right", 0);
    expect(state.pos).toEqual([0, 0]);
    expect(state.dir).toBe("right");
    expect(state.lastEvent).toBeNull();
  });

  it("replays move events by taking their `to` position, not recomputing it", () => {
    const state = replay(events, [0, 0], "right", 2);
    expect(state.pos).toEqual([2, 0]);
    expect(state.dir).toBe("right"); // no turn event processed yet
  });

  it("applies turn events as a relative rotation on top of the running facing", () => {
    const state = replay(events, [0, 0], "right", 3);
    expect(state.dir).toBe("down"); // right + turn right = down
  });

  it("reaches the final state after replaying the whole trace", () => {
    const state = replay(events, [0, 0], "right", events.length);
    expect(state.pos).toEqual([2, 1]);
    expect(state.dir).toBe("down");
    expect(state.lastEvent?.type).toBe("goal");
  });

  it("bump events don't move the sprite (no `to` field to apply)", () => {
    const bumpEvents: ExecEvent[] = [{ t: 1, type: "bump", at: [1, 0] }];
    const state = replay(bumpEvents, [0, 0], "right", 1);
    expect(state.pos).toEqual([0, 0]);
    expect(state.lastEvent?.type).toBe("bump");
  });
});
