#!/usr/bin/env python3
"""Hub Mode camera pipeline entrypoint (HANDOFF-hub-mode.md): point a webcam at a row
of printed cards, and run the resulting program through the real executor.

    python -m hub.hub --level-id level-1
    python -m hub.hub --image path/to/photo.png --level-id level-1
    python -m hub.hub --image path/to/photo.png --dry-run   # print the AST, don't POST

A Python sidecar deliberately, not a Go/gocv addition -- see DECISIONS.md: the launcher
builds with CGO_ENABLED=0 so it cross-compiles to the Pi trivially, and gocv would
require CGO. This talks to the already-running server over plain HTTP instead.
"""
from __future__ import annotations

import argparse
import json
import sys

import cv2

from hub.ast_builder import compile_row
from hub.client import DEFAULT_API_BASE, post_program
from hub.detect import capture_frame, detect_markers, order_markers


def run(image, level_id: str | None, api_base: str, dry_run: bool) -> int:
    detections = detect_markers(image)
    if not detections:
        print("no ArUco markers detected in frame", file=sys.stderr)
        return 1

    ordered_ids = order_markers(detections)
    print(f"detected {len(ordered_ids)} card(s), reading order: {ordered_ids}")

    result = compile_row(ordered_ids)
    if result.problems:
        print(f"{len(result.problems)} problem(s) (unbalanced program is a normal event, not an error):")
        for p in result.problems:
            print(f"  - position {p.position}: {p.code}: {p.message}")

    if dry_run:
        print(json.dumps(result.program, indent=2))
        return 0

    resp = post_program(result.program, level_id=level_id, api_base=api_base)
    print(f"POST /api/program -> {resp.status_code}")
    print(resp.text)
    return 0 if resp.ok else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--camera-index", type=int, default=0, help="webcam index (ignored if --image is given)")
    ap.add_argument("--image", help="read a single still frame from this file instead of a live camera")
    ap.add_argument("--level-id", help="level to run the program against, e.g. level-1")
    ap.add_argument("--api-base", default=DEFAULT_API_BASE, help=f"server base URL (default {DEFAULT_API_BASE})")
    ap.add_argument("--dry-run", action="store_true", help="print the AST envelope instead of POSTing it")
    args = ap.parse_args()

    if args.image:
        image = cv2.imread(args.image)
        if image is None:
            print(f"could not read image {args.image}", file=sys.stderr)
            return 1
    else:
        try:
            image = capture_frame(args.camera_index)
        except RuntimeError as e:
            print(str(e), file=sys.stderr)
            return 1

    return run(image, args.level_id, args.api_base, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
