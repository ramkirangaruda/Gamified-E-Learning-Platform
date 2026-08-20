import { describe, it, expect, beforeEach } from "vitest";
import * as Blockly from "blockly/core";
import { registerCardBlocks } from "./cardBlocks";
import { compileWorkspaceToAst } from "./compileAst";

// Headless Blockly.Workspace (not WorkspaceSvg/inject) -- no DOM needed. newBlock(),
// previousConnection/nextConnection, and getTopBlocks() are all base-Workspace/Block
// APIs; only rendering (initSvg/render) needs a real SVG surface, and this test never
// calls those. This is the "block-editor -> AST" half of item 6's integration coverage;
// api_test.go on the Go side picks up "AST -> executor -> trace".

registerCardBlocks();

function mk(ws: Blockly.Workspace, type: string): Blockly.Block {
  return ws.newBlock(type);
}

function chain(ws: Blockly.Workspace, types: string[]): Blockly.Block {
  const blocks = types.map((t) => mk(ws, t));
  for (let i = 1; i < blocks.length; i++) {
    blocks[i - 1].nextConnection!.connect(blocks[i].previousConnection!);
  }
  return blocks[0];
}

describe("compileWorkspaceToAst", () => {
  let ws: Blockly.Workspace;

  beforeEach(() => {
    ws = new Blockly.Workspace();
  });

  it("compiles a flat sequence of primitives", () => {
    chain(ws, ["card_move_forward", "card_turn_right", "card_pick_up", "card_wait"]);
    const { program, problems } = compileWorkspaceToAst(ws);
    expect(problems).toEqual([]);
    expect(program.program).toEqual([
      { op: "move", steps: 1 },
      { op: "turn", dir: "right" },
      { op: "pickup" },
      { op: "wait", ticks: 1 },
    ]);
  });

  it("compiles a repeat block", () => {
    chain(ws, ["card_repeat_4", "card_move_forward", "card_turn_left", "card_end_repeat"]);
    const { program, problems } = compileWorkspaceToAst(ws);
    expect(problems).toEqual([]);
    expect(program.program).toEqual([
      {
        op: "repeat",
        times: 4,
        body: [
          { op: "move", steps: 1 },
          { op: "turn", dir: "left" },
        ],
      },
    ]);
  });

  it("compiles if/else", () => {
    chain(ws, [
      "card_if_wall_ahead",
      "card_turn_right",
      "card_else",
      "card_turn_left",
      "card_end_if",
      "card_move_forward",
    ]);
    const { program, problems } = compileWorkspaceToAst(ws);
    expect(problems).toEqual([]);
    expect(program.program).toEqual([
      {
        op: "if",
        cond: { check: "wall_ahead" },
        then: [{ op: "turn", dir: "right" }],
        else: [{ op: "turn", dir: "left" }],
      },
      { op: "move", steps: 1 },
    ]);
  });

  it("compiles a while loop", () => {
    chain(ws, ["card_while_not_goal", "card_move_forward", "card_end_while"]);
    const { program } = compileWorkspaceToAst(ws);
    expect(program.program).toEqual([
      {
        op: "while",
        cond: { check: "not", of: { check: "on_goal" } },
        body: [{ op: "move", steps: 1 }],
      },
    ]);
  });

  it("nests up to the AST's max depth without error", () => {
    // repeat > if > while > move -- depth 4, exactly at packages/ast/validate.go's limit
    chain(ws, [
      "card_repeat_2",
      "card_if_wall_ahead",
      "card_while_not_goal",
      "card_move_forward",
      "card_end_while",
      "card_end_if",
      "card_end_repeat",
    ]);
    const { problems } = compileWorkspaceToAst(ws);
    expect(problems).toEqual([]);
  });

  it("reports an unclosed repeat without throwing", () => {
    chain(ws, ["card_repeat_3", "card_move_forward"]);
    expect(() => compileWorkspaceToAst(ws)).not.toThrow();
    const { problems } = compileWorkspaceToAst(ws);
    expect(problems.some((p) => p.code === "unclosed_block")).toBe(true);
  });

  it("reports an orphan closer without throwing and keeps compiling the rest", () => {
    const top = chain(ws, ["card_end_while", "card_move_forward"]);
    void top;
    const { program, problems } = compileWorkspaceToAst(ws);
    expect(problems.some((p) => p.code === "orphan_closer")).toBe(true);
    expect(program.program).toEqual([{ op: "move", steps: 1 }]);
  });

  it("compiles an empty workspace to an empty program, not an error", () => {
    const { program, problems } = compileWorkspaceToAst(ws);
    expect(program.program).toEqual([]);
    expect(problems).toEqual([]);
  });
});
