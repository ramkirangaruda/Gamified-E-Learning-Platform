"""Unit tests for ast_builder.compile_row -- pure, no camera/cv2 involved.

Cross-checks depth-4 nesting against packages/ast/fixtures/valid_nested_depth4.json
directly (the Go validator's own fixture) so this isn't just "trusted to match
compileAst.ts by reading", it's verified byte-for-byte against the authoritative shape.
"""
import json
from pathlib import Path

from hub.ast_builder import compile_row
from hub.card_table import (
    ELSE,
    END_IF,
    END_REPEAT,
    END_WHILE,
    IF_WALL_AHEAD,
    MOVE_FORWARD,
    PICK_UP,
    REPEAT_2,
    REPEAT_3,
    TURN_LEFT,
    TURN_RIGHT,
    WAIT,
    WHILE_NOT_GOAL,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "packages" / "ast" / "fixtures"


def test_flat_sequence_no_problems():
    result = compile_row([MOVE_FORWARD, MOVE_FORWARD, TURN_LEFT, PICK_UP, WAIT])
    assert result.problems == []
    assert result.program == {
        "version": 1,
        "source": "cards",
        "program": [
            {"op": "move", "steps": 1},
            {"op": "move", "steps": 1},
            {"op": "turn", "dir": "left"},
            {"op": "pickup"},
            {"op": "wait", "ticks": 1},
        ],
    }


def test_turn_right():
    result = compile_row([TURN_RIGHT])
    assert result.problems == []
    assert result.program["program"] == [{"op": "turn", "dir": "right"}]


def test_repeat_block():
    result = compile_row([REPEAT_2, MOVE_FORWARD, MOVE_FORWARD, END_REPEAT])
    assert result.problems == []
    assert result.program["program"] == [
        {"op": "repeat", "times": 2, "body": [{"op": "move", "steps": 1}, {"op": "move", "steps": 1}]}
    ]


def test_if_then_else():
    result = compile_row([IF_WALL_AHEAD, MOVE_FORWARD, ELSE, TURN_LEFT, END_IF])
    assert result.problems == []
    assert result.program["program"] == [
        {
            "op": "if",
            "cond": {"check": "wall_ahead"},
            "then": [{"op": "move", "steps": 1}],
            "else": [{"op": "turn", "dir": "left"}],
        }
    ]


def test_if_then_no_else():
    result = compile_row([IF_WALL_AHEAD, MOVE_FORWARD, END_IF])
    assert result.problems == []
    assert result.program["program"] == [
        {"op": "if", "cond": {"check": "wall_ahead"}, "then": [{"op": "move", "steps": 1}]}
    ]


def test_while_loop():
    result = compile_row([WHILE_NOT_GOAL, MOVE_FORWARD, END_WHILE])
    assert result.problems == []
    assert result.program["program"] == [
        {"op": "while", "cond": {"check": "not", "of": {"check": "on_goal"}}, "body": [{"op": "move", "steps": 1}]}
    ]


def test_nested_depth4_matches_go_fixture_exactly():
    # repeat_2 { if_wall_ahead { while_not_goal { move } } } -- depth1 program, depth2
    # repeat body, depth3 if.then, depth4 while.body: exactly MAX_DEPTH.
    ids = [REPEAT_2, IF_WALL_AHEAD, WHILE_NOT_GOAL, MOVE_FORWARD, END_WHILE, END_IF, END_REPEAT]
    result = compile_row(ids)
    assert result.problems == []

    expected = json.loads((FIXTURES / "valid_nested_depth4.json").read_text())
    assert result.program == expected


def test_unbalanced_repeat_degrades_not_throws():
    # brief §6: unbalanced is a normal teaching moment, never an exception.
    result = compile_row([REPEAT_2, MOVE_FORWARD])  # no end_repeat
    assert result.program["program"] == [{"op": "repeat", "times": 2, "body": [{"op": "move", "steps": 1}]}]
    assert len(result.problems) == 1
    assert result.problems[0].code == "unclosed_block"


def test_unbalanced_if_degrades_not_throws():
    # Mirrors compileAst.ts precisely: unlike repeat (which pushes its node *then*
    # checks for a closer, so an unclosed repeat still contributes a best-effort node),
    # `if` only pushes its node *after* resolving the then/else closer -- so an
    # unclosed if contributes nothing to the program, not a partial "if" node. Still
    # never throws; still reported as a problem, not silently dropped.
    result = compile_row([IF_WALL_AHEAD, MOVE_FORWARD])  # no end_if
    assert result.program["program"] == []
    assert len(result.problems) == 1
    assert result.problems[0].code == "unclosed_block"


def test_orphan_closer_is_skipped_not_fatal():
    result = compile_row([END_REPEAT, MOVE_FORWARD])
    assert result.program["program"] == [{"op": "move", "steps": 1}]
    assert len(result.problems) == 1
    assert result.problems[0].code == "orphan_closer"


def test_nesting_too_deep_reported():
    # Five nested repeats -- depth 5 body would exceed MAX_DEPTH=4.
    ids = [REPEAT_2, REPEAT_2, REPEAT_2, REPEAT_2, REPEAT_2, MOVE_FORWARD]
    result = compile_row(ids)
    codes = [p.code for p in result.problems]
    assert "nesting_too_deep" in codes


def test_empty_row_is_empty_program():
    result = compile_row([])
    assert result.problems == []
    assert result.program == {"version": 1, "source": "cards", "program": []}
