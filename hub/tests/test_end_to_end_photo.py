"""Acceptance #1 (HANDOFF-hub-mode.md): a photo of a real printed row of cards produces
the correct AST, verified against a hand-written expected envelope.

Reuses the same real-marker composited-card generation as test_detect_composited.py
(see that file's module docstring for why print/composited/ itself isn't checked in),
assembled into one synthetic "photo" and run through the full
detect -> order -> compile pipeline, exactly as hub.py's `run()` does.
"""
from __future__ import annotations

from hub.ast_builder import compile_row
from hub.card_table import END_IF, END_REPEAT, IF_WALL_AHEAD, MOVE_FORWARD, PICK_UP, REPEAT_2, TURN_LEFT
from hub.detect import detect_markers, order_markers
from hub.tests.test_detect_composited import _hstack_cards, composited_cards  # noqa: F401 (fixture)


def test_photo_of_real_row_produces_hand_written_expected_ast(composited_cards):
    # "repeat 2 { move forward, if wall ahead { turn left } end if } end repeat"
    ids = [REPEAT_2, MOVE_FORWARD, IF_WALL_AHEAD, TURN_LEFT, END_IF, END_REPEAT, PICK_UP]
    photo = _hstack_cards(composited_cards, ids)

    detections = detect_markers(photo)
    ordered_ids = order_markers(detections)
    assert ordered_ids == ids  # the camera read the row correctly

    result = compile_row(ordered_ids)
    assert result.problems == []

    expected_envelope = {
        "version": 1,
        "source": "cards",
        "program": [
            {
                "op": "repeat",
                "times": 2,
                "body": [
                    {"op": "move", "steps": 1},
                    {
                        "op": "if",
                        "cond": {"check": "wall_ahead"},
                        "then": [{"op": "turn", "dir": "left"}],
                    },
                ],
            },
            {"op": "pickup"},
        ],
    }
    assert result.program == expected_envelope
