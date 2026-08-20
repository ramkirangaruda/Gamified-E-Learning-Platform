#!/usr/bin/env python3
"""
Lays out the 14 composited cards (print/composited/*.png) onto A4 page(s) with 5mm
cut-guide margins between cards, and saves a multi-page PDF.

14 cards at 9x5cm = 630 cm^2 of card area; a single A4 sheet is 21x29.7cm = 623.7 cm^2
total -- smaller than the raw card area alone, before any cut margin is even added. One
sheet is not geometrically possible without shrinking the cards below the compose-card.py
spec, which isn't done here since 3.5cm is what the marker-detection sizing was chosen
for. Fits as many as reasonably lay out per page instead (10 per A4 portrait page, see
the column/row math below) and spills the rest onto additional pages.

Uses Pillow only for the final multi-page PDF write (cv2 can't write PDF) -- the page
layout itself is composited with cv2/numpy, consistent with the rest of this pipeline.

Usage:
    python make-print-sheet.py [composited_dir] [out_pdf]
"""
import math
import re
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent

DPI = 300
A4_W_CM = 21.0
A4_H_CM = 29.7
CARD_W_CM = 9.0
CARD_H_CM = 5.0
CUT_MARGIN_CM = 0.5  # 5mm, matches the brief's quiet-zone unit -- one clean cut per gap

CARD_FILENAME_RE = re.compile(r"^card-(\d\d)-")


def cm_to_px(cm: float) -> int:
    return round(cm / 2.54 * DPI)


A4_W_PX = cm_to_px(A4_W_CM)
A4_H_PX = cm_to_px(A4_H_CM)
CARD_W_PX = cm_to_px(CARD_W_CM)
CARD_H_PX = cm_to_px(CARD_H_CM)
CELL_W_PX = CARD_W_PX + cm_to_px(CUT_MARGIN_CM)
CELL_H_PX = CARD_H_PX + cm_to_px(CUT_MARGIN_CM)

COLS = A4_W_PX // CELL_W_PX
ROWS = A4_H_PX // CELL_H_PX
PER_PAGE = COLS * ROWS

CUT_LINE_COLOR = (200, 200, 200)  # light gray -- guide, not part of the printed art


def make_page(cards: list[tuple[int, np.ndarray]]) -> np.ndarray:
    page = np.full((A4_H_PX, A4_W_PX, 3), 255, dtype=np.uint8)

    grid_w = COLS * CELL_W_PX
    grid_h = ROWS * CELL_H_PX
    origin_x = (A4_W_PX - grid_w) // 2
    origin_y = (A4_H_PX - grid_h) // 2

    for i, (_card_id, card_img) in enumerate(cards):
        col, row = i % COLS, i // COLS
        x = origin_x + col * CELL_W_PX
        y = origin_y + row * CELL_H_PX
        page[y:y + CARD_H_PX, x:x + CARD_W_PX] = card_img
        cv2.rectangle(page, (x, y), (x + CARD_W_PX - 1, y + CARD_H_PX - 1), CUT_LINE_COLOR, 1)

    return page


def main() -> None:
    composited_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO_ROOT / "print" / "composited"
    out_pdf = Path(sys.argv[2]) if len(sys.argv) > 2 else REPO_ROOT / "print" / "tessera-quest-cards.pdf"

    card_files = sorted(composited_dir.glob("card-*.png"))
    if not card_files:
        sys.exit(f"no card-*.png found in {composited_dir} -- run compose-all-cards.py first")

    cards = []
    for card_path in card_files:
        m = CARD_FILENAME_RE.match(card_path.name)
        card_id = int(m.group(1)) if m else -1
        img = cv2.imread(str(card_path))
        if img is None:
            sys.exit(f"could not read {card_path}")
        if img.shape[1] != CARD_W_PX or img.shape[0] != CARD_H_PX:
            sys.exit(
                f"{card_path.name}: {img.shape[1]}x{img.shape[0]}px, expected "
                f"{CARD_W_PX}x{CARD_H_PX}px -- was this composited at the current spec?"
            )
        cards.append((card_id, img))

    num_pages = math.ceil(len(cards) / PER_PAGE)
    pil_pages = []
    for p in range(num_pages):
        chunk = cards[p * PER_PAGE:(p + 1) * PER_PAGE]
        page = make_page(chunk)
        pil_pages.append(Image.fromarray(cv2.cvtColor(page, cv2.COLOR_BGR2RGB)))

    out_pdf.parent.mkdir(parents=True, exist_ok=True)
    pil_pages[0].save(
        out_pdf, save_all=True, append_images=pil_pages[1:], resolution=DPI,
    )

    print(
        f"wrote {out_pdf}: {num_pages} page(s), {COLS}x{ROWS}={PER_PAGE} cards/page, "
        f"{len(cards)} cards total"
    )


if __name__ == "__main__":
    main()
