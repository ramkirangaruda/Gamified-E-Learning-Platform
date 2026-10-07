import { describe, it, expect } from "vitest";
import { orderMarkers, pickStableReading, type Detection } from "./cardDetect";

// Pure-logic tests for orderMarkers/pickStableReading -- no camera, no ImageData (this
// project's vitest env is `node`, see vitest.config.ts). detectMarkers() itself just
// wraps the vendored js-aruco2 detector and isn't re-tested here; these two functions
// are this app's own logic layered on top, mirroring hub/detect.py's order_markers()
// and capture_frame()'s burst-and-vote fix (see cardDetect.ts's header comment).

function det(id: number, cx: number, cy: number, size = 40): Detection {
  return { id, cx, cy, size };
}

describe("orderMarkers", () => {
  it("returns empty for no detections", () => {
    expect(orderMarkers([])).toEqual([]);
  });

  it("reads a single row left to right regardless of detection order", () => {
    const detections = [det(3, 300, 100), det(0, 0, 100), det(2, 200, 100), det(1, 100, 100)];
    expect(orderMarkers(detections)).toEqual([0, 1, 2, 3]);
  });

  it("reads top row then bottom row", () => {
    const detections = [
      det(2, 0, 200), // bottom-left
      det(0, 0, 0), // top-left
      det(3, 100, 200), // bottom-right
      det(1, 100, 0), // top-right
    ];
    expect(orderMarkers(detections)).toEqual([0, 1, 2, 3]);
  });

  it("tolerates gradual skew within a row via the default 0.6x-mean-size threshold", () => {
    // A slightly tilted row: y drifts by 5px per card, well under 0.6*40=24px.
    const detections = [det(0, 0, 100), det(1, 100, 105), det(2, 200, 110), det(3, 300, 115)];
    expect(orderMarkers(detections)).toEqual([0, 1, 2, 3]);
  });
});

describe("pickStableReading", () => {
  it("returns empty for no readings", () => {
    expect(pickStableReading([])).toEqual([]);
  });

  it("ignores a minority dropout reading", () => {
    const full = [0, 1, 2];
    const dropout = [0, 1];
    const readings = [full, dropout, full, full, dropout, full, dropout, full];
    expect(pickStableReading(readings)).toEqual(full);
  });

  it("breaks an exact tie toward the fuller reading", () => {
    const full = [7, 0, 8];
    const dropout = [7, 0];
    const readings = [full, dropout, dropout, full];
    expect(pickStableReading(readings)).toEqual(full);
  });
});
