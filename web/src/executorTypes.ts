// Mirrors internal/executor/executor.go's JSON output exactly. Pos marshals as a
// [x, y] 2-tuple (executor.Pos.MarshalJSON), not {x, y} -- matched here as a tuple type,
// not an object, or every response would silently fail to parse as expected.

export type Pos = [number, number];

export type EventType = "move" | "turn" | "bump" | "goal" | "pickup" | "wait";

export interface ExecEvent {
  t: number;
  type: EventType;
  from?: Pos;
  to?: Pos;
  dir?: "left" | "right"; // turn events only -- the turn direction, NOT resulting facing
  at?: Pos;
}

export interface ExecResult {
  events: ExecEvent[];
  outcome: "solved" | "failed";
  ticks_used: number;
  error_signature?: string;
}

export type Dir = "up" | "right" | "down" | "left";

export interface Grid {
  width: number;
  height: number;
  walls: boolean[][]; // row-major, walls[y][x]
  goal: Pos;
  items?: Pos[];
}
