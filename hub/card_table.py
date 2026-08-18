"""The card id -> card table, brief §6 / web/src/blocks/cardBlocks.ts's CARDS array.

One source of truth on the Python side, mirroring the TS one exactly (id, slug used in
print/composited/card-<NN>-<slug>.png filenames, and the op-kind ast_builder.py needs).
Do not hand-maintain a second copy of this anywhere else in hub/.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CardDef:
    id: int
    slug: str
    label: str


CARDS: list[CardDef] = [
    CardDef(0, "move-forward", "move forward"),
    CardDef(1, "turn-left", "turn left"),
    CardDef(2, "turn-right", "turn right"),
    CardDef(3, "pick-up", "pick up"),
    CardDef(4, "wait", "wait"),
    CardDef(5, "repeat-2", "repeat 2"),
    CardDef(6, "repeat-3", "repeat 3"),
    CardDef(7, "repeat-4", "repeat 4"),
    CardDef(8, "end-repeat", "end repeat"),
    CardDef(9, "if-wall-ahead", "if wall ahead"),
    CardDef(10, "else", "else"),
    CardDef(11, "end-if", "end if"),
    CardDef(12, "while-not-goal", "while not at goal"),
    CardDef(13, "end-while", "end while"),
]

CARDS_BY_ID: dict[int, CardDef] = {c.id: c for c in CARDS}

# Named ids, so ast_builder.py reads like the TS switch statement it mirrors instead of
# a wall of magic numbers.
MOVE_FORWARD = 0
TURN_LEFT = 1
TURN_RIGHT = 2
PICK_UP = 3
WAIT = 4
REPEAT_2 = 5
REPEAT_3 = 6
REPEAT_4 = 7
END_REPEAT = 8
IF_WALL_AHEAD = 9
ELSE = 10
END_IF = 11
WHILE_NOT_GOAL = 12
END_WHILE = 13
