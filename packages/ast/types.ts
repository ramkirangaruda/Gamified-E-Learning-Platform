// Mirrors schema.json. Kept hand-written and in lockstep with ast.go — see
// packages/ast/README.md for the rule that keeps these three from drifting.

export type Source = "cards" | "blocks";

export interface Program {
  version: 1;
  source: Source;
  program: Node[];
}

export type Node =
  | MoveNode
  | TurnNode
  | WaitNode
  | PickupNode
  | RepeatNode
  | IfNode
  | WhileNode
  | CallNode
  | DefineNode;

export interface MoveNode {
  op: "move";
  steps: number;
}

export interface TurnNode {
  op: "turn";
  dir: "left" | "right";
}

export interface WaitNode {
  op: "wait";
  ticks: number;
}

export interface PickupNode {
  op: "pickup";
}

export interface RepeatNode {
  op: "repeat";
  times: number;
  body: Node[];
}

export interface IfNode {
  op: "if";
  cond: Cond;
  then: Node[];
  else?: Node[];
}

export interface WhileNode {
  op: "while";
  cond: Cond;
  body: Node[];
}

export interface CallNode {
  op: "call";
  name: string;
}

export interface DefineNode {
  op: "define";
  name: string;
  body: Node[];
}

export type Cond = CheckSimple | CheckNot;

export interface CheckSimple {
  check: "wall_ahead" | "on_goal" | "item_here";
}

export interface CheckNot {
  check: "not";
  of: Cond;
}
