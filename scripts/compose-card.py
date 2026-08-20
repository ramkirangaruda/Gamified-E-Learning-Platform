#!/usr/bin/env python3
"""
Composites one print-ready card: a white canvas at fixed physical size (9x5cm @ 300
DPI, brief §6), an ArUco marker (DICT_4X4_50, id = the card's §6 table id) in the
top-left with a guaranteed white quiet zone, and the Blockly-exported block glyph
(from web/'s card gallery) placed in the remaining space.

Uses only opencv-contrib-python -- already brief §4's chosen vision dependency, no new
one added. Generating the marker with the same library that will later decode it
(cv2.aruco, same DICT_4X4_50) guarantees round-trip compatibility, instead of
hand-rolling the dictionary's bit tables from memory and hoping they match.

Importable (compose_card / save_card_png) for compose-all-cards.py and
test-detect-cards.py, or standalone:
    python compose-card.py <card.png> <marker_id 0-49> <out.png>
"""
import argparse
import math
import struct
import sys
import zlib

import cv2
import numpy as np

DPI = 300
CARD_W_CM = 9.0
CARD_H_CM = 5.0
MARKER_CM = 3.5
QUIET_ZONE_MIN_CM = 0.5  # 5mm, brief §6: "or detection fails"


def cm_to_px(cm: float) -> int:
    return round(cm / 2.54 * DPI)


def cm_to_px_min(cm: float) -> int:
    # Ceil, not round: this is a floor ("at least 5mm"), so rounding down even by one
    # pixel could put a real print under the minimum.
    return math.ceil(cm / 2.54 * DPI)


CARD_W_PX = cm_to_px(CARD_W_CM)
CARD_H_PX = cm_to_px(CARD_H_CM)
MARKER_PX = cm_to_px(MARKER_CM)
QUIET_PX = cm_to_px_min(QUIET_ZONE_MIN_CM)


def compose_card(card_png_path: str, marker_id: int) -> np.ndarray:
    """Returns the composited BGR canvas (not yet written to disk)."""
    if not (0 <= marker_id < 50):
        raise ValueError(f"marker_id must be 0-49 for DICT_4X4_50, got {marker_id}")

    card_art = cv2.imread(card_png_path, cv2.IMREAD_UNCHANGED)
    if card_art is None:
        raise FileNotFoundError(f"could not read {card_png_path}")

    canvas = np.full((CARD_H_PX, CARD_W_PX, 3), 255, dtype=np.uint8)

    aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    marker_img = cv2.aruco.generateImageMarker(aruco_dict, marker_id, MARKER_PX)
    mx, my = QUIET_PX, QUIET_PX
    canvas[my:my + MARKER_PX, mx:mx + MARKER_PX] = cv2.cvtColor(marker_img, cv2.COLOR_GRAY2BGR)

    # The quiet zone has to surround the marker on all four sides, not just open
    # outward from the card's corner -- so the content-free square is this much bigger
    # than the marker itself in both directions.
    clear_edge = QUIET_PX + MARKER_PX + QUIET_PX

    # First-draft layout, flagged for review rather than locked in: block glyph fills
    # the space to the right of the marker's clear zone, scaled to fit while
    # preserving aspect ratio, centered in that space. A 3.5cm marker plus its quiet
    # zone eats most of the card's 5cm height, so this is the only generous open
    # region left -- a wide/short block glyph will end up noticeably smaller than the
    # marker as a result.
    pad = cm_to_px_min(0.2)
    avail_w = CARD_W_PX - clear_edge - 2 * pad
    avail_h = CARD_H_PX - 2 * pad

    art_h, art_w = card_art.shape[:2]
    scale = min(avail_w / art_w, avail_h / art_h)
    new_w, new_h = max(1, round(art_w * scale)), max(1, round(art_h * scale))
    art_resized = cv2.resize(card_art, (new_w, new_h), interpolation=cv2.INTER_AREA)

    ax = clear_edge + pad + (avail_w - new_w) // 2
    ay = pad + (avail_h - new_h) // 2

    if art_resized.ndim == 3 and art_resized.shape[2] == 4:
        alpha = art_resized[:, :, 3:4].astype(np.float32) / 255.0
        rgb = art_resized[:, :, :3].astype(np.float32)
        bg = canvas[ay:ay + new_h, ax:ax + new_w].astype(np.float32)
        canvas[ay:ay + new_h, ax:ax + new_w] = (rgb * alpha + bg * (1 - alpha)).astype(np.uint8)
    else:
        canvas[ay:ay + new_h, ax:ax + new_w] = art_resized[:, :, :3]

    return canvas


def set_png_dpi(path: str, dpi: int) -> None:
    """Injects a pHYs chunk so print software reads the physical size correctly.

    cv2.imwrite's PNG encoder has no DPI/physical-size option -- the pixel dimensions
    above are only actually 9x5cm at 300 DPI if something tells the print pipeline
    that. Hand-rolled with stdlib struct/zlib rather than pulling in Pillow as a
    dependency for one 9-byte metadata chunk.
    """
    ppm = round(dpi / 0.0254)  # pixels per meter, what the pHYs chunk wants
    phys_data = struct.pack(">IIB", ppm, ppm, 1)  # unit 1 = meter
    chunk_type = b"pHYs"
    crc = zlib.crc32(chunk_type + phys_data) & 0xFFFFFFFF
    chunk = struct.pack(">I", len(phys_data)) + chunk_type + phys_data + struct.pack(">I", crc)

    with open(path, "rb") as f:
        data = f.read()

    # IHDR is always the very first chunk: 8-byte signature, then
    # [4-byte length][4-byte type][13-byte data][4-byte crc]. pHYs must come before
    # IDAT; immediately after IHDR is the conventional (and valid) place for it.
    if data[12:16] != b"IHDR":
        raise ValueError(f"{path}: unexpected PNG structure, no IHDR where expected")
    ihdr_end = 8 + 4 + 4 + 13 + 4

    with open(path, "wb") as f:
        f.write(data[:ihdr_end])
        f.write(chunk)
        f.write(data[ihdr_end:])


def save_card_png(canvas: np.ndarray, out_path: str) -> None:
    cv2.imwrite(out_path, canvas)
    set_png_dpi(out_path, DPI)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("card_png", help="Blockly-exported card PNG")
    ap.add_argument("marker_id", type=int, help="ArUco marker id, 0-49 (DICT_4X4_50) -- brief §6 card table id")
    ap.add_argument("out_png", help="output path for the composited, print-ready card")
    args = ap.parse_args()

    try:
        canvas = compose_card(args.card_png, args.marker_id)
    except (ValueError, FileNotFoundError) as e:
        sys.exit(str(e))

    save_card_png(canvas, args.out_png)
    print(
        f"wrote {args.out_png}  {CARD_W_PX}x{CARD_H_PX}px @ {DPI}dpi "
        f"({CARD_W_CM}x{CARD_H_CM}cm), marker id={args.marker_id} "
        f"size={MARKER_PX}px, quiet_zone>={QUIET_PX}px"
    )


if __name__ == "__main__":
    main()
