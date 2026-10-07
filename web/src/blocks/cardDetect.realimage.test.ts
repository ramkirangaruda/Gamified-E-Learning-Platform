import { describe, it, expect } from "vitest";
import { detectMarkers } from "./cardDetect";
import fixture from "./__fixtures__/marker-id7.json";

// End-to-end check of the actual detection path (vendored js-aruco2 + the OpenCV
// DICT_4X4_50 dictionary), not just the pure-logic ordering/voting functions covered
// in cardDetect.test.ts. The fixture is a real marker id 7 (REPEAT_4 in cardBlocks.ts's
// CARDS table) rendered by `cv2.aruco.generateImageMarker` -- the exact same call
// compose-card.py uses to print the physical cards -- and round-tripped through the
// real cv2 detector before being saved (see the generation script logged in
// DECISIONS.md), so this proves the browser-side decoder agrees with OpenCV, not just
// that it runs without throwing.

describe("detectMarkers (real marker image)", () => {
  it("decodes a real DICT_4X4_50 marker id back to its own id", () => {
    const detections = detectMarkers({
      width: fixture.width,
      height: fixture.height,
      data: new Uint8ClampedArray(fixture.data),
    });
    expect(detections).toHaveLength(1);
    expect(detections[0].id).toBe(fixture.expectedId);
  });
});
