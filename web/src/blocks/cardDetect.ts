// Browser-side counterpart to hub/detect.py: reads ArUco markers out of a camera
// frame and turns them into left-to-right/top-to-bottom reading order. Same algorithm
// as detect.py's detect_markers()/order_markers(), checked line-by-line against it
// rather than trusted to independently match -- see DECISIONS.md's "in-app camera
// scan" entry for why this exists as a third (Go AST validator aside) port of the
// same logic instead of only ever living in the Python sidecar.
//
// Uses the vendored js-aruco2 (MIT) with OpenCV's actual DICT_4X4_50 codes (see
// aruco_4x4_1000.js's header) -- the same dictionary compose-card.py prints the
// physical cards with, so a marker this decodes to id N is the exact same card
// id N as hub/card_table.py and web/src/blocks/cardBlocks.ts's CARDS table.
import { AR, type ArDetectorInstance } from "../vendor/js-aruco2/aruco.js";
import "../vendor/js-aruco2/aruco_4x4_1000.js";

export interface Detection {
  id: number;
  cx: number;
  cy: number;
  size: number;
}

let detector: ArDetectorInstance | null = null;

function getDetector(): ArDetectorInstance {
  if (!detector) {
    detector = new AR.Detector({ dictionaryName: "ARUCO_4X4_1000" });
  }
  return detector;
}

/** Detects every ArUco marker in a camera frame, in no particular order --
 *  orderMarkers() imposes the program order separately, matching detect.py's split.
 *  Accepts anything shaped like the DOM's ImageData (width/height/RGBA data) rather
 *  than the real type, so a plain test fixture doesn't need to fake `colorSpace` too. */
export function detectMarkers(image: { width: number; height: number; data: Uint8ClampedArray | number[] }): Detection[] {
  const markers = getDetector().detect(image);
  return markers.map((m) => {
    const xs = m.corners.map((c) => c.x);
    const ys = m.corners.map((c) => c.y);
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    const size = Math.max(...xs) - Math.min(...xs);
    return { id: m.id, cx, cy, size };
  });
}

/** Left-to-right, top-to-bottom reading order -- exact port of detect.py's
 *  order_markers(): sort into rows by centre y (chained/sequential clustering, each
 *  card compared to the previous one's y, not the row's start -- tolerates gradual
 *  skew across a long row), then sort left-to-right by centre x within each row. */
export function orderMarkers(detections: Detection[], rowThreshold?: number): number[] {
  if (detections.length === 0) return [];

  const byY = [...detections].sort((a, b) => a.cy - b.cy);

  let threshold = rowThreshold;
  if (threshold == null) {
    const sizes = byY.map((d) => d.size).filter((s) => s > 0);
    threshold = sizes.length > 0 ? (sizes.reduce((a, b) => a + b, 0) / sizes.length) * 0.6 : 40;
  }

  const rows: Detection[][] = [[byY[0]]];
  for (const d of byY.slice(1)) {
    const lastRow = rows[rows.length - 1];
    if (d.cy - lastRow[lastRow.length - 1].cy <= threshold) {
      lastRow.push(d);
    } else {
      rows.push([d]);
    }
  }

  return rows.flatMap((row) => [...row].sort((a, b) => a.cx - b.cx).map((d) => d.id));
}

/** Burst-and-vote over several already-detected readings, picking the modal ordered-id
 *  result (ties broken toward more markers) -- the same fix hub/detect.py's
 *  capture_frame() needed after live testing (2026-08-20) showed single-frame ArUco
 *  detection flickering by one marker even with the camera held steady. A live preview
 *  loop calls detectMarkers()+orderMarkers() every frame; this picks the "capture"
 *  moment's result from a short rolling window instead of trusting whichever frame
 *  happened to be on screen when the button was pressed. */
export function pickStableReading(readings: number[][]): number[] {
  if (readings.length === 0) return [];

  const counts = new Map<string, { reading: number[]; count: number }>();
  for (const reading of readings) {
    const key = JSON.stringify(reading);
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { reading, count: 1 });
  }

  let best: { reading: number[]; count: number } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count || (entry.count === best.count && entry.reading.length > best.reading.length)) {
      best = entry;
    }
  }
  return best!.reading;
}
