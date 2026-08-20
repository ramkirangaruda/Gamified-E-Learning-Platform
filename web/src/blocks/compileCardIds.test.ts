import { describe, it, expect } from "vitest";
import { compileCardIds } from "./compileCardIds";
import {
  MOVE_FORWARD,
  TURN_LEFT,
  TURN_RIGHT,
  PICK_UP,
  WAIT,
  REPEAT_2,
  REPEAT_4,
  END_REPEAT,
  IF_WALL_AHEAD,
  ELSE,
  END_IF,
  WHILE_NOT_GOAL,
  END_WHILE,
} from "./cardIds";

// Same cases as compileAst.test.ts and hub/tests/test_ast_builder.py, over an ordered
// id array instead of a Blockly chain / Python list -- the three should stay provably
// equivalent for every case here.

describe("compileCardIds", () => {
  it("compiles a flat sequence of primitives", () => {
    const { program, problems } = compileCardIds([MOVE_FORWARD, TURN_RIGHT, PICK_UP, WAIT]);
    expect(problems).toEqual([]);
    expect(program).toEqual({
      version: 1,
      source: "cards",
      program: [
        { op: "move", steps: 1 },
        { op: "turn", dir: "right" },
        { op: "pickup" },
        { op: "wait", ticks: 1 },
      ],
    });
  });

  it("compiles a repeat block", () => {
    const { program, problems } = compileCardIds([REPEAT_4, MOVE_FORWARD, TURN_LEFT, END_REPEAT]);
    expect(problems).toEqual([]);
    expect(program.program).toEqual([
      { op: "repeat", times: 4, body: [{ op: "move", steps: 1 }, { op: "turn", dir: "left" }] },
    ]);
  });

  it("compiles if/then/else", () => {
    const { program, problems } = compileCardIds([IF_WALL_AHEAD, TURN_LEFT, ELSE, MOVE_FORWARD, END_IF]);
    expect(problems).toEqual([]);
    expect(program.program).toEqual([
      { op: "if", cond: { check: "wall_ahead" }, then: [{ op: "turn", dir: "left" }], else: [{ op: "move", steps: 1 }] },
    ]);
  });

  it("compiles a while loop", () => {
    const { program, problems } = compileCardIds([WHILE_NOT_GOAL, MOVE_FORWARD, END_WHILE]);
    expect(problems).toEqual([]);
    expect(program.program).toEqual([
      { op: "while", cond: { check: "not", of: { check: "on_goal" } }, body: [{ op: "move", steps: 1 }] },
    ]);
  });

  it("degrades an unbalanced repeat instead of throwing", () => {
    const { program, problems } = compileCardIds([REPEAT_2, MOVE_FORWARD]);
    expect(program.program).toEqual([{ op: "repeat", times: 2, body: [{ op: "move", steps: 1 }] }]);
    expect(problems).toEqual([{ position: 0, code: "unclosed_block", message: "repeat never closed" }]);
  });

  it("skips an orphan closer and keeps compiling", () => {
    const { program, problems } = compileCardIds([END_IF, MOVE_FORWARD]);
    expect(program.program).toEqual([{ op: "move", steps: 1 }]);
    expect(problems).toEqual([{ position: 0, code: "orphan_closer", message: "end if with no matching opener" }]);
  });

  it("reports nesting too deep at the 5th level without crashing", () => {
    // repeat(repeat(repeat(repeat(repeat(move))))) -- 5 nested repeats, MAX_DEPTH is 4.
    const ids = [REPEAT_2, REPEAT_2, REPEAT_2, REPEAT_2, REPEAT_2, MOVE_FORWARD, END_REPEAT, END_REPEAT, END_REPEAT, END_REPEAT, END_REPEAT];
    const { problems } = compileCardIds(ids);
    expect(problems.some((p) => p.code === "nesting_too_deep")).toBe(true);
  });

  it("an empty row compiles to an empty program", () => {
    const { program, problems } = compileCardIds([]);
    expect(program.program).toEqual([]);
    expect(problems).toEqual([]);
  });
});
