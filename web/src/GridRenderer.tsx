import { useEffect, useMemo, useState } from "react";
import type { Dir, ExecEvent, Grid, Pos } from "./executorTypes";

// Pure trace player: this file must never decide whether a move is legal, whether the
// goal was reached, or anything else "did the program work" -- that's 100% decided by
// the Go executor and baked into the event stream already. All this does is animate
// the events it's given. The only computation that looks like "logic" is turning a
// sequence of *relative* turn events (dir: "left"/"right", per executor.go's Event.Dir
// -- it doesn't carry the resulting absolute facing) into an absolute angle for
// rendering the robot sprite's orientation. That's presentation, not a movement rule:
// every move/bump/goal outcome still comes verbatim from the trace.

const CELL_PX = 56;
const DIR_ANGLE: Record<Dir, number> = { right: 0, down: 90, left: 180, up: -90 };
const TURN_ORDER: Dir[] = ["up", "right", "down", "left"];

export function applyTurn(dir: Dir, turn: "left" | "right"): Dir {
  const i = TURN_ORDER.indexOf(dir);
  const next = turn === "right" ? (i + 1) % 4 : (i + 3) % 4;
  return TURN_ORDER[next];
}

export interface ReplayState {
  pos: Pos;
  dir: Dir;
  lastEvent: ExecEvent | null;
}

/** Exported for testing (GridRenderer.test.ts) -- this is the one function in the file
 *  that looks like "logic," so it's the one worth a unit test independent of React. */
export function replay(events: ExecEvent[], startPos: Pos, startDir: Dir, uptoIndex: number): ReplayState {
  let pos = startPos;
  let dir = startDir;
  let lastEvent: ExecEvent | null = null;

  for (let i = 0; i < uptoIndex && i < events.length; i++) {
    const e = events[i];
    if (e.type === "move" && e.to) pos = e.to;
    if (e.type === "turn" && e.dir) dir = applyTurn(dir, e.dir);
    lastEvent = e;
  }
  return { pos, dir, lastEvent };
}

export interface GridRendererProps {
  grid: Grid;
  startPos: Pos;
  startDir: Dir;
  events: ExecEvent[];
  outcome?: "solved" | "failed";
  /** ms between auto-play steps */
  stepMs?: number;
}

export default function GridRenderer({ grid, startPos, startDir, events, outcome, stepMs = 450 }: GridRendererProps) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (index >= events.length) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setIndex((i) => i + 1), stepMs);
    return () => clearTimeout(timer);
  }, [playing, index, events.length, stepMs]);

  // New trace (e.g. re-ran the program) resets playback to the start.
  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [events]);

  const state = useMemo(() => replay(events, startPos, startDir, index), [events, startPos, startDir, index]);

  const atEnd = index >= events.length;
  const cx = (state.pos[0] + 0.5) * CELL_PX;
  const cy = (state.pos[1] + 0.5) * CELL_PX;
  const angle = DIR_ANGLE[state.dir];

  const effectClass =
    state.lastEvent?.type === "bump" ? "quest-robot-bump" : state.lastEvent?.type === "goal" ? "quest-robot-goal" : "";

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        width={grid.width * CELL_PX}
        height={grid.height * CELL_PX}
        className="rounded-lg border border-slate-300 bg-slate-50"
      >
        {grid.walls.map((row, y) =>
          row.map(
            (isWall, x) =>
              isWall && (
                <rect
                  key={`wall-${x}-${y}`}
                  x={x * CELL_PX}
                  y={y * CELL_PX}
                  width={CELL_PX}
                  height={CELL_PX}
                  className="fill-slate-700"
                />
              ),
          ),
        )}

        {Array.from({ length: grid.width + 1 }, (_, i) => (
          <line key={`gx-${i}`} x1={i * CELL_PX} y1={0} x2={i * CELL_PX} y2={grid.height * CELL_PX} className="stroke-slate-200" />
        ))}
        {Array.from({ length: grid.height + 1 }, (_, i) => (
          <line key={`gy-${i}`} x1={0} y1={i * CELL_PX} x2={grid.width * CELL_PX} y2={i * CELL_PX} className="stroke-slate-200" />
        ))}

        {(grid.items ?? []).map(([ix, iy], i) => (
          <circle key={`item-${i}`} cx={(ix + 0.5) * CELL_PX} cy={(iy + 0.5) * CELL_PX} r={CELL_PX * 0.14} className="fill-amber-400" />
        ))}

        <g transform={`translate(${(grid.goal[0] + 0.5) * CELL_PX}, ${(grid.goal[1] + 0.5) * CELL_PX})`}>
          <polygon points={`0,${-CELL_PX * 0.3} ${CELL_PX * 0.28},${CELL_PX * 0.22} ${-CELL_PX * 0.28},${CELL_PX * 0.22}`} className="fill-emerald-400" />
        </g>

        <g transform={`translate(${cx}, ${cy})`} className={effectClass} key={index}>
          <polygon
            points={`${CELL_PX * 0.32},0 ${-CELL_PX * 0.22},${CELL_PX * 0.24} ${-CELL_PX * 0.22},${-CELL_PX * 0.24}`}
            transform={`rotate(${angle})`}
            className="fill-sky-500 stroke-sky-700"
            strokeWidth={2}
          />
        </g>
      </svg>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIndex(0)}
          className="rounded bg-slate-200 px-3 py-1 text-sm hover:bg-slate-300"
        >
          ⟲ Reset
        </button>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          disabled={atEnd && !playing}
          className="rounded bg-sky-600 px-3 py-1 text-sm text-white hover:bg-sky-700 disabled:opacity-40"
        >
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(i + 1, events.length))}
          disabled={atEnd}
          className="rounded bg-slate-200 px-3 py-1 text-sm hover:bg-slate-300 disabled:opacity-40"
        >
          ⏭ Step
        </button>
        <span className="ml-2 text-xs text-slate-500">
          {index} / {events.length}
        </span>
      </div>

      {atEnd && outcome && (
        <div className={outcome === "solved" ? "text-emerald-600 font-semibold" : "text-slate-500"}>
          {outcome === "solved" ? "🎉 Solved!" : "Not there yet — try again"}
        </div>
      )}
    </div>
  );
}
