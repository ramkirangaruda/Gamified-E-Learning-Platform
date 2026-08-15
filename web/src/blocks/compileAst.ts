import * as Blockly from "blockly/core";

// Compiles a workspace of flat card blocks into the shared AST (packages/ast/types.ts).
// This is the "blocks" source's half of brief §5/§6: cards and blocks are two different
// physical inputs that must produce the *same* AST shape. Because the card blocks were
// deliberately kept flat (see cardBlocks.ts / DECISIONS.md), this compiler is the same
// open/close stack-parse the camera pipeline needs for the physical cards -- one
// algorithm, two front ends, not two compilers that could drift apart.
//
// Mirrors packages/ast/validate.go's rules: max nesting depth 4, unbalanced open/close
// is handled by skipping the stray block and continuing rather than throwing -- this
// runs on a workspace state a child can legitimately leave unfinished (brief §6: that's
// a normal event, not an error), so it always returns a best-effort program plus a list
// of problems, never an exception.

export type AstNode =
  | { op: "move"; steps: number }
  | { op: "turn"; dir: "left" | "right" }
  | { op: "wait"; ticks: number }
  | { op: "pickup" }
  | { op: "repeat"; times: number; body: AstNode[] }
  | { op: "if"; cond: AstCond; then: AstNode[]; else?: AstNode[] }
  | { op: "while"; cond: AstCond; body: AstNode[] };

export type AstCond = { check: "wall_ahead" | "on_goal" | "item_here" } | { check: "not"; of: AstCond };

export interface AstProgram {
  version: 1;
  source: "blocks";
  program: AstNode[];
}

export interface CompileProblem {
  blockId: string;
  message: string;
}

export interface CompileResult {
  program: AstProgram;
  problems: CompileProblem[];
}

const MAX_DEPTH = 4; // packages/ast/validate.go: MaxDepth

const REPEAT_TIMES: Record<string, number> = { card_repeat_2: 2, card_repeat_3: 3, card_repeat_4: 4 };

/** Compiles a run of sibling blocks starting at `start`, stopping at (and returning,
 *  uncompiled) the first block whose type is in `stopAt`. Returns null for `next` if the
 *  chain ran out before hitting a stop type -- the "never closed" case. */
function compileList(
  start: Blockly.BlockSvg | null,
  depth: number,
  problems: CompileProblem[],
  stopAt?: Set<string>,
): { nodes: AstNode[]; next: Blockly.BlockSvg | null } {
  const nodes: AstNode[] = [];
  let block = start;

  while (block && !(stopAt && stopAt.has(block.type))) {
    const openerId = block.id;

    if (block.type in REPEAT_TIMES) {
      if (depth + 1 > MAX_DEPTH) {
        problems.push({ blockId: openerId, message: `nesting too deep (max ${MAX_DEPTH})` });
        block = block.getNextBlock() as Blockly.BlockSvg | null;
        continue;
      }
      const inner = compileList(block.getNextBlock() as Blockly.BlockSvg | null, depth + 1, problems, new Set(["card_end_repeat"]));
      nodes.push({ op: "repeat", times: REPEAT_TIMES[block.type], body: inner.nodes });
      if (!inner.next) {
        problems.push({ blockId: openerId, message: "repeat never closed" });
        return { nodes, next: null };
      }
      block = inner.next.getNextBlock() as Blockly.BlockSvg | null;
      continue;
    }

    switch (block.type) {
      case "card_move_forward":
        nodes.push({ op: "move", steps: 1 });
        break;
      case "card_turn_left":
        nodes.push({ op: "turn", dir: "left" });
        break;
      case "card_turn_right":
        nodes.push({ op: "turn", dir: "right" });
        break;
      case "card_pick_up":
        nodes.push({ op: "pickup" });
        break;
      case "card_wait":
        nodes.push({ op: "wait", ticks: 1 });
        break;

      case "card_if_wall_ahead": {
        if (depth + 1 > MAX_DEPTH) {
          problems.push({ blockId: openerId, message: `nesting too deep (max ${MAX_DEPTH})` });
          break;
        }
        const thenPart = compileList(
          block.getNextBlock() as Blockly.BlockSvg | null,
          depth + 1,
          problems,
          new Set(["card_else", "card_end_if"]),
        );
        if (!thenPart.next) {
          problems.push({ blockId: openerId, message: "if never closed with end if" });
          return { nodes, next: null };
        }
        let elseNodes: AstNode[] | undefined;
        let closer = thenPart.next;
        if (closer.type === "card_else") {
          const elsePart = compileList(closer.getNextBlock() as Blockly.BlockSvg | null, depth + 1, problems, new Set(["card_end_if"]));
          if (!elsePart.next) {
            problems.push({ blockId: openerId, message: "if never closed with end if" });
            return { nodes, next: null };
          }
          elseNodes = elsePart.nodes;
          closer = elsePart.next;
        }
        nodes.push({ op: "if", cond: { check: "wall_ahead" }, then: thenPart.nodes, ...(elseNodes ? { else: elseNodes } : {}) });
        block = closer.getNextBlock() as Blockly.BlockSvg | null;
        continue;
      }

      case "card_while_not_goal": {
        if (depth + 1 > MAX_DEPTH) {
          problems.push({ blockId: openerId, message: `nesting too deep (max ${MAX_DEPTH})` });
          break;
        }
        const inner = compileList(block.getNextBlock() as Blockly.BlockSvg | null, depth + 1, problems, new Set(["card_end_while"]));
        nodes.push({ op: "while", cond: { check: "not", of: { check: "on_goal" } }, body: inner.nodes });
        if (!inner.next) {
          problems.push({ blockId: openerId, message: "while never closed" });
          return { nodes, next: null };
        }
        block = inner.next.getNextBlock() as Blockly.BlockSvg | null;
        continue;
      }

      case "card_end_repeat":
      case "card_end_if":
      case "card_end_while":
      case "card_else":
        // A closer/else with no matching opener above it -- skip it (no AST node) and
        // keep compiling the rest of the stack. indentGuides.ts already flags this
        // visually; the compiler shouldn't also block the child from testing whatever
        // part of their program *is* well-formed.
        problems.push({ blockId: openerId, message: `${block.type} with no matching opener` });
        break;
    }

    block = block?.getNextBlock() as Blockly.BlockSvg | null;
  }

  return { nodes, next: block };
}

export function compileWorkspaceToAst(workspace: Blockly.Workspace): CompileResult {
  const problems: CompileProblem[] = [];
  const nodes: AstNode[] = [];

  for (const top of workspace.getTopBlocks(true) as Blockly.BlockSvg[]) {
    const { nodes: chainNodes } = compileList(top, 1, problems);
    nodes.push(...chainNodes);
  }

  return {
    program: { version: 1, source: "blocks", program: nodes },
    problems,
  };
}
