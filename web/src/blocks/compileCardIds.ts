// Card-id sequence -> AST envelope, the browser-side counterpart to
// hub/ast_builder.py's compile_row() (which does the identical job for the Python
// camera sidecar) and the same open/close stack-parse as compileAst.ts's compileList
// (which does it for a live Blockly chain). Three front ends, one algorithm -- kept
// structurally identical (same recursion shape, same stop-set-closes-which-opener
// logic, same depth accounting) so this can be checked line-by-line against the other
// two rather than trusted to independently match. See DECISIONS.md.
//
// Mirrors compileAst.ts/ast_builder.py's rule: max nesting depth 4, and an unbalanced
// open/close is a normal event (brief §6), not an error -- this never throws for
// malformed input, always returning a best-effort program plus a list of problems.
import type { AstNode, AstProgram, ProblemCode } from "./compileAst";
import {
  MOVE_FORWARD,
  TURN_LEFT,
  TURN_RIGHT,
  PICK_UP,
  WAIT,
  REPEAT_2,
  REPEAT_3,
  REPEAT_4,
  END_REPEAT,
  IF_WALL_AHEAD,
  ELSE,
  END_IF,
  WHILE_NOT_GOAL,
  END_WHILE,
} from "./cardIds";

const MAX_DEPTH = 4; // packages/ast/validate.go: MaxDepth

const REPEAT_TIMES: Record<number, number> = { [REPEAT_2]: 2, [REPEAT_3]: 3, [REPEAT_4]: 4 };

const CLOSER_NAMES: Record<number, string> = {
  [END_REPEAT]: "end repeat",
  [END_IF]: "end if",
  [END_WHILE]: "end while",
  [ELSE]: "else",
};

// `position` (index into the ordered id list) stands in for compileAst.ts's
// CompileProblem.blockId -- cards have no independent identity, so "which slot in the
// row" is the equivalent handle for the UI to highlight.
export interface CardCompileProblem {
  position: number;
  code: ProblemCode;
  message: string;
}

export interface CardCompileResult {
  program: AstProgram;
  problems: CardCompileProblem[];
}

/** Compiles ids[i:] until a stopAt id or the end of the list. Returns the index of the
 *  stop-set id that ended the run (not yet consumed), or null if the list ran out
 *  first -- the "never closed" case, matching ast_builder.py's `next_index`. */
function compileList(
  ids: number[],
  i: number,
  depth: number,
  problems: CardCompileProblem[],
  stopAt: ReadonlySet<number> = new Set(),
): { nodes: AstNode[]; next: number | null } {
  const nodes: AstNode[] = [];
  const n = ids.length;

  while (i < n && !stopAt.has(ids[i])) {
    const openerPos = i;
    const cid = ids[i];

    if (cid in REPEAT_TIMES) {
      if (depth + 1 > MAX_DEPTH) {
        problems.push({ position: openerPos, code: "nesting_too_deep", message: `nesting too deep (max ${MAX_DEPTH})` });
        i += 1;
        continue;
      }
      const inner = compileList(ids, i + 1, depth + 1, problems, new Set([END_REPEAT]));
      nodes.push({ op: "repeat", times: REPEAT_TIMES[cid], body: inner.nodes });
      if (inner.next === null) {
        problems.push({ position: openerPos, code: "unclosed_block", message: "repeat never closed" });
        return { nodes, next: null };
      }
      i = inner.next + 1;
      continue;
    }

    switch (cid) {
      case MOVE_FORWARD:
        nodes.push({ op: "move", steps: 1 });
        i += 1;
        continue;
      case TURN_LEFT:
        nodes.push({ op: "turn", dir: "left" });
        i += 1;
        continue;
      case TURN_RIGHT:
        nodes.push({ op: "turn", dir: "right" });
        i += 1;
        continue;
      case PICK_UP:
        nodes.push({ op: "pickup" });
        i += 1;
        continue;
      case WAIT:
        nodes.push({ op: "wait", ticks: 1 });
        i += 1;
        continue;
    }

    if (cid === IF_WALL_AHEAD) {
      if (depth + 1 > MAX_DEPTH) {
        problems.push({ position: openerPos, code: "nesting_too_deep", message: `nesting too deep (max ${MAX_DEPTH})` });
        i += 1;
        continue;
      }
      const thenPart = compileList(ids, i + 1, depth + 1, problems, new Set([ELSE, END_IF]));
      if (thenPart.next === null) {
        problems.push({ position: openerPos, code: "unclosed_block", message: "if never closed with end if" });
        return { nodes, next: null };
      }
      let elseNodes: AstNode[] | undefined;
      let closerI = thenPart.next;
      if (ids[closerI] === ELSE) {
        const elsePart = compileList(ids, closerI + 1, depth + 1, problems, new Set([END_IF]));
        if (elsePart.next === null) {
          problems.push({ position: openerPos, code: "unclosed_block", message: "if never closed with end if" });
          return { nodes, next: null };
        }
        elseNodes = elsePart.nodes;
        closerI = elsePart.next;
      }
      nodes.push({ op: "if", cond: { check: "wall_ahead" }, then: thenPart.nodes, ...(elseNodes ? { else: elseNodes } : {}) });
      i = closerI + 1;
      continue;
    }

    if (cid === WHILE_NOT_GOAL) {
      if (depth + 1 > MAX_DEPTH) {
        problems.push({ position: openerPos, code: "nesting_too_deep", message: `nesting too deep (max ${MAX_DEPTH})` });
        i += 1;
        continue;
      }
      const inner = compileList(ids, i + 1, depth + 1, problems, new Set([END_WHILE]));
      nodes.push({ op: "while", cond: { check: "not", of: { check: "on_goal" } }, body: inner.nodes });
      if (inner.next === null) {
        problems.push({ position: openerPos, code: "unclosed_block", message: "while never closed" });
        return { nodes, next: null };
      }
      i = inner.next + 1;
      continue;
    }

    if (cid in CLOSER_NAMES) {
      // A closer/else with no matching opener above it -- skip it (no AST node) and
      // keep compiling the rest of the row, exactly like compileAst.ts/ast_builder.py.
      problems.push({ position: openerPos, code: "orphan_closer", message: `${CLOSER_NAMES[cid]} with no matching opener` });
      i += 1;
      continue;
    }

    throw new Error(`unknown card id ${cid} at position ${i}`); // cardDetect.ts never emits ids outside 0-13
  }

  return { nodes, next: i < n ? i : null };
}

/** Top-level entry point: an already left-to-right-ordered list of card ids (the
 *  output of orderMarkers) -> the AST envelope + any problems. One row is one flat
 *  chain, so this is the single-top-block case of compileWorkspaceToAst (a camera
 *  frame has exactly one physical row, unlike a Blockly workspace which can have
 *  several disconnected stacks). */
export function compileCardIds(orderedIds: number[]): CardCompileResult {
  const problems: CardCompileProblem[] = [];
  const { nodes } = compileList(orderedIds, 0, 1, problems);
  return {
    program: { version: 1, source: "cards", program: nodes },
    problems,
  };
}
