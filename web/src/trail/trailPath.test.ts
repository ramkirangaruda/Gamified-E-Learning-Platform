import { describe, expect, it } from "vitest";
import { TRAIL_LEVELS_PER_ROW, TRAIL_X_MARGIN, nodePosition, smoothPath, trailHeight, trailSegments } from "./trailPath";

describe("nodePosition", () => {
  it("starts each row at the left margin, not the center -- the path now travels width-first", () => {
    expect(nodePosition(0).x).toBe(TRAIL_X_MARGIN);
  });

  it("sweeps a whole row across nearly the full width", () => {
    const rowEnd = nodePosition(TRAIL_LEVELS_PER_ROW - 1);
    expect(rowEnd.x).toBeCloseTo(100 - TRAIL_X_MARGIN, 5);
  });

  it("alternates direction row to row (boustrophedon), so consecutive rows join at the same x", () => {
    const lastOfRow0 = nodePosition(TRAIL_LEVELS_PER_ROW - 1);
    const firstOfRow1 = nodePosition(TRAIL_LEVELS_PER_ROW);
    expect(firstOfRow1.x).toBeCloseTo(lastOfRow0.x, 5);

    const lastOfRow1 = nodePosition(TRAIL_LEVELS_PER_ROW * 2 - 1);
    expect(lastOfRow1.x).toBeCloseTo(TRAIL_X_MARGIN, 5); // back to the left edge
  });

  it("moves to a new row baseline every TRAIL_LEVELS_PER_ROW levels, strictly further down the page", () => {
    const rowCount = 4;
    for (let row = 0; row < rowCount - 1; row++) {
      const thisRowFirst = nodePosition(row * TRAIL_LEVELS_PER_ROW);
      const nextRowFirst = nodePosition((row + 1) * TRAIL_LEVELS_PER_ROW);
      expect(nextRowFirst.y).toBeGreaterThan(thisRowFirst.y);
    }
  });

  it("bows each row into a gentle arc rather than a flat line -- a mid-row node sits off the row's own baseline", () => {
    const first = nodePosition(0);
    const mid = nodePosition(2); // middle of a 5-per-row row
    expect(mid.y).not.toBeCloseTo(first.y, 0);
  });
});

describe("trailHeight", () => {
  it("is zero for no levels", () => {
    expect(trailHeight(0)).toBe(0);
  });

  it("grows with more levels", () => {
    expect(trailHeight(25)).toBeGreaterThan(trailHeight(5));
  });
});

describe("smoothPath", () => {
  it("starts with a moveto at the first point", () => {
    const d = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 30 }]);
    expect(d.startsWith("M 0 0")).toBe(true);
  });

  it("has one bezier curve segment per pair of consecutive points", () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 30 }, { x: 5, y: 60 }];
    const d = smoothPath(points);
    expect((d.match(/C /g) ?? []).length).toBe(points.length - 1);
  });

  it("handles a single point without crashing", () => {
    expect(smoothPath([{ x: 5, y: 5 }])).toBe("M 5 5");
  });

  it("handles zero points", () => {
    expect(smoothPath([])).toBe("");
  });
});

describe("trailSegments", () => {
  it("draws nothing at all when nothing is solved yet", () => {
    const { walked, next } = trailSegments(10, 0);
    expect(walked).toEqual([]);
    expect(next).toEqual([]);
  });

  it("draws the walked path through every solved level, and a next segment into the first unsolved one", () => {
    const { walked, next } = trailSegments(10, 3);
    expect(walked).toHaveLength(3);
    expect(walked).toEqual([nodePosition(0), nodePosition(1), nodePosition(2)]);
    expect(next).toEqual([nodePosition(2), nodePosition(3)]);
  });

  it("draws nothing beyond the frontier -- no path for unreached levels", () => {
    const { walked, next } = trailSegments(10, 3);
    const allDrawnPoints = [...walked, ...next];
    for (let i = 4; i < 10; i++) {
      expect(allDrawnPoints).not.toContainEqual(nodePosition(i));
    }
  });

  it("walks the whole thing and draws no next segment once everything is solved", () => {
    const { walked, next } = trailSegments(10, 10);
    expect(walked).toHaveLength(10);
    expect(next).toEqual([]);
  });
});
