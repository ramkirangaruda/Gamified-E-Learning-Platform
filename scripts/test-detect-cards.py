#!/usr/bin/env python3
"""
Standalone acceptance test for the composited print cards: loads every
print/composited/card-<NN>-*.png and confirms cv2.aruco decodes it back to marker id
NN. This is the actual gate -- if any card fails, exits non-zero and the print run does
not proceed on this batch.

Deliberately a plain script, not pytest -- this needs to run as a manual gate during
prep (after compose-all-cards.py, before sending anything to a printer), not as part of
a CI suite that doesn't have print/composited/ available.

Usage:
    python test-detect-cards.py [composited_dir]
"""
import re
import sys
from pathlib import Path

import cv2

REPO_ROOT = Path(__file__).resolve().parent.parent
CARD_FILENAME_RE = re.compile(r"^card-(\d\d)-")


def main() -> int:
    composited_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO_ROOT / "print" / "composited"

    card_files = sorted(composited_dir.glob("card-*.png"))
    if not card_files:
        print(f"FAIL: no card-*.png found in {composited_dir} -- run compose-all-cards.py first", file=sys.stderr)
        return 1

    aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    detector = cv2.aruco.ArucoDetector(aruco_dict, cv2.aruco.DetectorParameters())

    failures = []
    for card_path in card_files:
        m = CARD_FILENAME_RE.match(card_path.name)
        if not m:
            failures.append(f"{card_path.name}: doesn't match card-<NN>-<slug>.png")
            continue
        expected_id = int(m.group(1))

        img = cv2.imread(str(card_path))
        if img is None:
            failures.append(f"{card_path.name}: could not read file")
            continue

        corners, ids, _rejected = detector.detectMarkers(img)
        detected = [] if ids is None else ids.flatten().tolist()

        if detected == [expected_id]:
            print(f"  PASS  card {expected_id:02d}: detected id {detected[0]}")
        elif not detected:
            failures.append(f"{card_path.name}: expected id {expected_id}, detected NOTHING")
        elif len(detected) > 1:
            failures.append(f"{card_path.name}: expected id {expected_id}, detected multiple: {detected}")
        else:
            failures.append(f"{card_path.name}: expected id {expected_id}, detected id {detected[0]}")

    print()
    if failures:
        print(f"FAIL: {len(failures)} of {len(card_files)} cards failed detection:", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        return 1

    print(f"PASS: all {len(card_files)} cards detected correctly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
