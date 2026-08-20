"""capture_frame()'s burst-and-vote logic, added after live testing against a real
webcam and real printed cards (2026-08-20) showed single-frame detection flickering
by one marker, frame to frame, even held steady -- see DECISIONS.md and detect.py's
capture_frame() docstring. Fakes cv2.VideoCapture so this runs without a real camera,
but the detection itself is real: markers are actually composited and actually decoded
via cv2.aruco, same as test_detect_composited.py.
"""
from __future__ import annotations

import cv2
import pytest

from hub.card_table import END_REPEAT, MOVE_FORWARD, PICK_UP, REPEAT_3, TURN_RIGHT
from hub.detect import capture_frame, detect_markers, order_markers
from hub.tests.test_detect_composited import _hstack_cards, composited_cards  # noqa: F401


class _FakeCapture:
    def __init__(self, frames):
        self._frames = list(frames)
        self._opened = True

    def isOpened(self):
        return self._opened

    def read(self):
        if not self._frames:
            return False, None
        return True, self._frames.pop(0)

    def release(self):
        self._opened = False


def test_burst_capture_ignores_a_minority_dropout_frame(composited_cards, monkeypatch):
    full_row = _hstack_cards(composited_cards, [MOVE_FORWARD, TURN_RIGHT, PICK_UP])
    dropout_row = _hstack_cards(composited_cards, [MOVE_FORWARD, TURN_RIGHT])  # one card missed

    # 5 good frames, 3 with a dropped marker, interleaved -- majority should win.
    frames = [full_row, dropout_row, full_row, full_row, dropout_row, full_row, dropout_row, full_row]
    monkeypatch.setattr(cv2, "VideoCapture", lambda index: _FakeCapture(frames))

    result = capture_frame(camera_index=0)
    ids = order_markers(detect_markers(result))
    assert ids == [MOVE_FORWARD, TURN_RIGHT, PICK_UP]


def test_burst_capture_breaks_ties_toward_more_markers(composited_cards, monkeypatch):
    full_row = _hstack_cards(composited_cards, [REPEAT_3, MOVE_FORWARD, END_REPEAT])
    dropout_row = _hstack_cards(composited_cards, [REPEAT_3, MOVE_FORWARD])

    # Exactly tied frequency (2 vs 2) -- the fuller reading should still win.
    frames = [full_row, dropout_row, dropout_row, full_row]
    monkeypatch.setattr(cv2, "VideoCapture", lambda index: _FakeCapture(frames))

    result = capture_frame(camera_index=0)
    ids = order_markers(detect_markers(result))
    assert ids == [REPEAT_3, MOVE_FORWARD, END_REPEAT]


def test_capture_frame_raises_if_camera_never_opens(monkeypatch):
    class _NeverOpens(_FakeCapture):
        def isOpened(self):
            return False

    monkeypatch.setattr(cv2, "VideoCapture", lambda index: _NeverOpens([]))
    with pytest.raises(RuntimeError, match="could not open camera"):
        capture_frame(camera_index=7)


def test_capture_frame_raises_if_every_read_fails(monkeypatch):
    monkeypatch.setattr(cv2, "VideoCapture", lambda index: _FakeCapture([]))
    with pytest.raises(RuntimeError, match="failed to read a frame"):
        capture_frame(camera_index=0)
