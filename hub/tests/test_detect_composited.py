"""Detection tests against real, print-pipeline-composited card images.

print/cards/*.png (the Blockly gallery export) and print/composited/*.png are both
gitignored and not present on this branch -- see DECISIONS.md's "Print outputs
gitignored" / "Exported cards are gitignored" entries; they're regenerated from the web
app, not checked into git. This module regenerates equivalent composited cards using
scripts/compose-card.py's own compose_card()/marker-generation code (imported the same
way compose-all-cards.py already does, since the filename has a dash) so the ArUco
marker each test decodes is produced by the exact same code path the real print pipeline
uses -- only the placeholder glyph art in the middle of each card differs, and that
region plays no part in marker detection. Logged in DECISIONS.md.

This is the acceptance gate scripts/test-detect-cards.py runs manually during print
prep, adapted to pytest and to a fully self-generated fixture set so it works without
a printer, a camera, or the web app's browser-only export step.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import cv2
import numpy as np
import pytest

from hub.card_table import CARDS
from hub.detect import detect_markers, order_markers

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "scripts"


def _load_compose_card_mod():
    spec = importlib.util.spec_from_file_location("compose_card_mod", SCRIPTS_DIR / "compose-card.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


compose_card_mod = _load_compose_card_mod()


def _make_placeholder_glyph(tmp_path: Path, label: str) -> Path:
    """A stand-in for the Blockly gallery's exported block glyph -- doesn't need to
    look like anything real, since compose_card() only uses it to fill space outside
    the marker's quiet zone; it's inert with respect to ArUco decoding."""
    img = np.full((160, 400, 4), 255, dtype=np.uint8)
    img[:, :, 3] = 255
    cv2.putText(img, label, (10, 100), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (20, 20, 20, 255), 2, cv2.LINE_AA)
    path = tmp_path / f"glyph-{label}.png"
    cv2.imwrite(str(path), img)
    return path


@pytest.fixture(scope="module")
def composited_cards(tmp_path_factory) -> dict[int, np.ndarray]:
    """All 14 cards, composited (marker + placeholder glyph), as in-memory BGR images
    keyed by expected marker id -- mirrors print/composited/card-<NN>-<slug>.png."""
    tmp_path = tmp_path_factory.mktemp("composited")
    out: dict[int, np.ndarray] = {}
    for card in CARDS:
        glyph_path = _make_placeholder_glyph(tmp_path, card.slug)
        canvas = compose_card_mod.compose_card(str(glyph_path), card.id)
        out[card.id] = canvas
    return out


def test_all_14_cards_detect_to_their_own_id(composited_cards):
    failures = []
    for expected_id, image in composited_cards.items():
        detections = detect_markers(image)
        ids = [d["id"] for d in detections]
        if ids != [expected_id]:
            failures.append(f"card {expected_id}: expected [{expected_id}], detected {ids}")
    assert not failures, "\n".join(failures)


def _hstack_cards(composited_cards: dict[int, np.ndarray], ids: list[int], gap_px: int = 40) -> np.ndarray:
    imgs = [composited_cards[i] for i in ids]
    h = max(img.shape[0] for img in imgs)
    gap = np.full((h, gap_px, 3), 255, dtype=np.uint8)
    padded = [cv2.copyMakeBorder(img, 0, h - img.shape[0], 0, 0, cv2.BORDER_CONSTANT, value=(255, 255, 255)) for img in imgs]
    row = padded[0]
    for img in padded[1:]:
        row = np.hstack([row, gap, img])
    return row


def test_single_row_reads_left_to_right(composited_cards):
    from hub.card_table import MOVE_FORWARD, PICK_UP, TURN_RIGHT

    ids = [MOVE_FORWARD, MOVE_FORWARD, TURN_RIGHT, PICK_UP]
    photo = _hstack_cards(composited_cards, ids)

    detections = detect_markers(photo)
    assert len(detections) == 4
    assert order_markers(detections) == ids


def test_two_rows_read_top_row_then_bottom_row(composited_cards):
    from hub.card_table import END_REPEAT, MOVE_FORWARD, REPEAT_3, TURN_LEFT

    row1_ids = [REPEAT_3, MOVE_FORWARD]
    row2_ids = [TURN_LEFT, END_REPEAT]
    row1 = _hstack_cards(composited_cards, row1_ids)
    row2 = _hstack_cards(composited_cards, row2_ids)

    w = max(row1.shape[1], row2.shape[1])
    row1 = cv2.copyMakeBorder(row1, 0, 0, 0, w - row1.shape[1], cv2.BORDER_CONSTANT, value=(255, 255, 255))
    row2 = cv2.copyMakeBorder(row2, 0, 0, 0, w - row2.shape[1], cv2.BORDER_CONSTANT, value=(255, 255, 255))
    vgap = np.full((60, w, 3), 255, dtype=np.uint8)
    photo = np.vstack([row1, vgap, row2])

    detections = detect_markers(photo)
    assert len(detections) == 4
    assert order_markers(detections) == row1_ids + row2_ids
