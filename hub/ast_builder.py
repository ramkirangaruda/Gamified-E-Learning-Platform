"""Card-id sequence -> AST envelope (packages/ast/schema.json, `"source": "cards"`).

This is the exact same open/close stack-parse as web/src/blocks/compileAst.ts's
compileList, ported from "walk a linked chain of Blockly blocks" to "walk a flat,
already-ordered list of card ids" -- the camera pipeline's ordering step (order_markers
in detect.py) is what produces that flat list, standing in for Blockly's
previousStatement/nextStatement chain. Keeping the recursion structure identical
(including which stop-set closes which opener, and depth accounting) means this can be
checked line-by-line against compileAst.ts rather than trusted to independently match.

Mirrors validate.go/compileAst.ts's rule: max nesting depth 4, and an unbalanced
open/close is a normal event (brief §6), not an error -- it's handled by skipping the
stray card / stopping the current chain and reporting a problem, and this module never
raises for malformed input. It always returns a best-effort AST plus a list of problems.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

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
    REPEAT_4,
    TURN_LEFT,
    TURN_RIGHT,
    WAIT,
    WHILE_NOT_GOAL,
)

MAX_DEPTH = 4  # packages/ast/validate.go: MaxDepth: top-level program array is depth 1.

REPEAT_TIMES: dict[int, int] = {REPEAT_2: 2, REPEAT_3: 3, REPEAT_4: 4}

CLOSER_NAMES: dict[int, str] = {
    END_REPEAT: "end repeat",
    END_IF: "end if",
    END_WHILE: "end while",
    ELSE: "else",
}


@dataclass
class CompileProblem:
    # Position (index into the ordered id list) stands in for compileAst.ts's
    # Blockly block.id -- cards have no independent identity, so "which slot in the
    # row" is the equivalent handle for a UI to highlight later.
    position: int
    code: str  # "nesting_too_deep" | "unclosed_block" | "orphan_closer"
    message: str


@dataclass
class CompileResult:
    program: dict[str, Any]
    problems: list[CompileProblem] = field(default_factory=list)


def _compile_list(
    ids: list[int],
    i: int,
    depth: int,
    problems: list[CompileProblem],
    stop_at: frozenset[int] = frozenset(),
) -> tuple[list[dict[str, Any]], int | None]:
    """Compiles ids[i:] until a stop_at id or the end of the list.

    Returns (nodes, next_index). next_index is the index of the stop-set id that ended
    the run (not yet consumed), or None if the list ran out first -- the "never closed"
    case, matching compileList's `next: Blockly.BlockSvg | null`.
    """
    nodes: list[dict[str, Any]] = []
    n = len(ids)

    while i < n and ids[i] not in stop_at:
        opener_pos = i
        cid = ids[i]

        if cid in REPEAT_TIMES:
            if depth + 1 > MAX_DEPTH:
                problems.append(CompileProblem(opener_pos, "nesting_too_deep", f"nesting too deep (max {MAX_DEPTH})"))
                i += 1
                continue
            inner_nodes, next_i = _compile_list(ids, i + 1, depth + 1, problems, frozenset({END_REPEAT}))
            nodes.append({"op": "repeat", "times": REPEAT_TIMES[cid], "body": inner_nodes})
            if next_i is None:
                problems.append(CompileProblem(opener_pos, "unclosed_block", "repeat never closed"))
                return nodes, None
            i = next_i + 1
            continue

        if cid == MOVE_FORWARD:
            nodes.append({"op": "move", "steps": 1})
            i += 1
            continue
        if cid == TURN_LEFT:
            nodes.append({"op": "turn", "dir": "left"})
            i += 1
            continue
        if cid == TURN_RIGHT:
            nodes.append({"op": "turn", "dir": "right"})
            i += 1
            continue
        if cid == PICK_UP:
            nodes.append({"op": "pickup"})
            i += 1
            continue
        if cid == WAIT:
            nodes.append({"op": "wait", "ticks": 1})
            i += 1
            continue

        if cid == IF_WALL_AHEAD:
            if depth + 1 > MAX_DEPTH:
                problems.append(CompileProblem(opener_pos, "nesting_too_deep", f"nesting too deep (max {MAX_DEPTH})"))
                i += 1
                continue
            then_nodes, next_i = _compile_list(ids, i + 1, depth + 1, problems, frozenset({ELSE, END_IF}))
            if next_i is None:
                problems.append(CompileProblem(opener_pos, "unclosed_block", "if never closed with end if"))
                return nodes, None
            else_nodes: list[dict[str, Any]] | None = None
            closer_i = next_i
            if ids[closer_i] == ELSE:
                else_part, next_i2 = _compile_list(ids, closer_i + 1, depth + 1, problems, frozenset({END_IF}))
                if next_i2 is None:
                    problems.append(CompileProblem(opener_pos, "unclosed_block", "if never closed with end if"))
                    return nodes, None
                else_nodes = else_part
                closer_i = next_i2
            node: dict[str, Any] = {"op": "if", "cond": {"check": "wall_ahead"}, "then": then_nodes}
            if else_nodes is not None:
                node["else"] = else_nodes
            nodes.append(node)
            i = closer_i + 1
            continue

        if cid == WHILE_NOT_GOAL:
            if depth + 1 > MAX_DEPTH:
                problems.append(CompileProblem(opener_pos, "nesting_too_deep", f"nesting too deep (max {MAX_DEPTH})"))
                i += 1
                continue
            inner_nodes, next_i = _compile_list(ids, i + 1, depth + 1, problems, frozenset({END_WHILE}))
            nodes.append({"op": "while", "cond": {"check": "not", "of": {"check": "on_goal"}}, "body": inner_nodes})
            if next_i is None:
                problems.append(CompileProblem(opener_pos, "unclosed_block", "while never closed"))
                return nodes, None
            i = next_i + 1
            continue

        if cid in CLOSER_NAMES:
            # A closer/else with no matching opener above it -- skip it (no AST node)
            # and keep compiling the rest of the row, exactly like compileAst.ts.
            problems.append(CompileProblem(opener_pos, "orphan_closer", f"{CLOSER_NAMES[cid]} with no matching opener"))
            i += 1
            continue

        raise ValueError(f"unknown card id {cid} at position {i}")  # detect.py never emits ids outside 0-13

    return nodes, (i if i < n else None)


def compile_row(ordered_ids: list[int]) -> CompileResult:
    """Top-level entry point: an already left-to-right-ordered list of card ids (the
    output of detect.order_markers) -> the AST envelope + any problems.

    One row is one flat chain, so this is the single-top-block case of
    compileWorkspaceToAst (a camera frame has exactly one physical row, unlike a
    Blockly workspace which can have several disconnected stacks)."""
    problems: list[CompileProblem] = []
    nodes, _next = _compile_list(ordered_ids, 0, 1, problems)
    program = {"version": 1, "source": "cards", "program": nodes}
    return CompileResult(program=program, problems=problems)
