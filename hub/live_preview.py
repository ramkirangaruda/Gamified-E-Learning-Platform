#!/usr/bin/env python3
"""Live webcam smoke test for the ArUco card pipeline -- the one thing every prior
session flagged as unverified (QUESTIONS.md: "a physical camera was never pointed at
real printed cards") because no dev machine had a camera attached. This one does.

Opens a live preview window with detected markers outlined and the current reading
order overlaid, so a row of physical cards can be positioned and read in real time
instead of blind single-shot capture. Reuses detect.py/ast_builder.py unchanged --
this only adds a human-in-the-loop preview around the same functions hub.py's --image
and live-camera paths already call.

    python -m hub.live_preview
    python -m hub.live_preview --camera-index 1

Keys: q/Esc quit, s save the current frame + detection summary to hub/live_captures/.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2

from hub.ast_builder import compile_row
from hub.detect import detect_markers, get_detector, order_markers

CAPTURE_DIR = Path(__file__).parent / "live_captures"


def _overlay(frame, detections, ordered_ids):
    text_lines = [f"markers: {len(detections)}", f"reading order: {ordered_ids}"]
    for i, line in enumerate(text_lines):
        cv2.putText(frame, line, (10, 30 + 28 * i), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 4, cv2.LINE_AA)
        cv2.putText(frame, line, (10, 30 + 28 * i), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 1, cv2.LINE_AA)
    cv2.putText(
        frame, "q/Esc quit  s save", (10, frame.shape[0] - 14),
        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 3, cv2.LINE_AA,
    )
    cv2.putText(
        frame, "q/Esc quit  s save", (10, frame.shape[0] - 14),
        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA,
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--camera-index", type=int, default=0)
    args = ap.parse_args()

    cap = cv2.VideoCapture(args.camera_index)
    if not cap.isOpened():
        print(f"could not open camera index {args.camera_index}", file=sys.stderr)
        return 1

    detector = get_detector()
    print("live preview running -- press 's' to save a capture, 'q'/Esc to quit")

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("failed to read a frame", file=sys.stderr)
                return 1

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            corners, ids, _rejected = detector.detectMarkers(gray)
            if ids is not None:
                cv2.aruco.drawDetectedMarkers(frame, corners, ids)

            detections = detect_markers(frame)
            ordered_ids = order_markers(detections)
            _overlay(frame, detections, ordered_ids)

            cv2.imshow("ArUco card reader (hub.live_preview)", frame)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            if key == ord("s"):
                CAPTURE_DIR.mkdir(exist_ok=True)
                stamp = time.strftime("%Y%m%d-%H%M%S")
                img_path = CAPTURE_DIR / f"capture-{stamp}.png"
                cv2.imwrite(str(img_path), frame)

                result = compile_row(ordered_ids)
                summary = {
                    "ordered_ids": ordered_ids,
                    "detections": detections,
                    "problems": [p.__dict__ for p in result.problems],
                    "program": result.program,
                }
                json_path = CAPTURE_DIR / f"capture-{stamp}.json"
                json_path.write_text(json.dumps(summary, indent=2))
                print(f"saved {img_path.name} + {json_path.name} -- {len(ordered_ids)} card(s): {ordered_ids}")
                if result.problems:
                    for p in result.problems:
                        print(f"  problem @ {p.position}: {p.code}: {p.message}")
    finally:
        cap.release()
        cv2.destroyAllWindows()

    return 0


if __name__ == "__main__":
    sys.exit(main())
