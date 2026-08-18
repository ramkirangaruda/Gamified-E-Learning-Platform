"""Camera/frame -> ordered card-id list.

Two separable pieces, both pure-ish and independently testable: detect_markers() reads
raw ArUco detections out of an image (same cv2.aruco call as
scripts/test-detect-cards.py -- the marker id *is* the card id, brief §6/M5), and
order_markers() turns that unordered detection set into the left-to-right, top-to-bottom
program order a physical row (or stacked rows) of cards represents.

DICT_4X4_50 only, matching scripts/compose-card.py's marker generation -- decoding with
any other dictionary would silently never match.
"""
from __future__ import annotations

from typing import Any, TypedDict

import cv2
import numpy as np


class Detection(TypedDict):
    id: int
    cx: float
    cy: float
    size: float  # approx marker width in px, used to size-adapt row clustering


def get_detector() -> "cv2.aruco.ArucoDetector":
    aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    return cv2.aruco.ArucoDetector(aruco_dict, cv2.aruco.DetectorParameters())


def detect_markers(image: np.ndarray) -> list[Detection]:
    """Detects every ArUco marker in `image` and returns one Detection per marker,
    in no particular order -- order_markers() imposes the program order separately."""
    detector = get_detector()
    corners, ids, _rejected = detector.detectMarkers(image)
    if ids is None:
        return []

    detections: list[Detection] = []
    for corner, marker_id in zip(corners, ids.flatten().tolist()):
        pts = corner.reshape(4, 2)
        cx, cy = float(pts[:, 0].mean()), float(pts[:, 1].mean())
        size = float(pts[:, 0].max() - pts[:, 0].min())
        detections.append({"id": int(marker_id), "cx": cx, "cy": cy, "size": size})
    return detections


def order_markers(detections: list[Detection], row_threshold: float | None = None) -> list[int]:
    """Left-to-right, top-to-bottom reading order (brief handoff step 3).

    Rule, logged in DECISIONS.md: sort into rows by marker centre y first (a physical
    row of cards is never perfectly level, so a fixed y-gap tolerance is needed rather
    than requiring exact equality), then sort left-to-right by centre x *within* each
    row, then concatenate rows top-to-bottom. Single-row is the common case and this
    degrades to it automatically. This is a chained/sequential clustering (each card
    compared to the previous one's y, not to the row's start), which is the simplest
    rule that still tolerates gradual skew across a long row -- documented as the
    "simplest defensible rule" the handoff asked for, not the only possible one.

    row_threshold defaults to 0.6x the mean detected marker size when omitted, so it
    self-scales with however close the camera is instead of a hardcoded pixel constant.
    """
    if not detections:
        return []

    by_y = sorted(detections, key=lambda d: d["cy"])

    if row_threshold is None:
        sizes = [d["size"] for d in by_y if d["size"] > 0]
        row_threshold = (sum(sizes) / len(sizes)) * 0.6 if sizes else 40.0

    rows: list[list[Detection]] = [[by_y[0]]]
    for d in by_y[1:]:
        if d["cy"] - rows[-1][-1]["cy"] <= row_threshold:
            rows[-1].append(d)
        else:
            rows.append([d])

    ordered: list[int] = []
    for row in rows:
        ordered.extend(d["id"] for d in sorted(row, key=lambda d: d["cx"]))
    return ordered


def capture_frame(camera_index: int = 0) -> np.ndarray:
    """Grabs a single frame from a plain laptop/USB webcam (brief handoff acceptance
    #5 -- Pi camera comes later, this must not block on it)."""
    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        raise RuntimeError(f"could not open camera index {camera_index}")
    try:
        ok, frame = cap.read()
        if not ok:
            raise RuntimeError(f"failed to read a frame from camera index {camera_index}")
        return frame
    finally:
        cap.release()
