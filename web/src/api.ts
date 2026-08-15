import type { AstProgram } from "./blocks/compileAst";
import type { ExecResult, Grid, Pos } from "./executorTypes";

export interface LevelDef {
  id: string;
  name: string;
  teaches: string;
  hard: boolean;
  parBlocks: number;
  startPos: Pos;
  startDir: "up" | "right" | "down" | "left";
  grid: Grid;
}

export interface Learner {
  id: string;
  display_name: string;
  created_at: number;
  total_xp: number;
  points: number;
  highest_level: number;
}

export interface PetState {
  id: string;
  species: string;
  name: string;
  evolution_stage: number;
  hunger: number;
  session_started_at: number;
}

export interface GameState {
  learner: Learner;
  pet: PetState;
  inventory: unknown[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export function fetchLevels(): Promise<LevelDef[]> {
  return fetch("/api/levels").then((r) => json<LevelDef[]>(r));
}

export function runProgram(levelId: string, program: AstProgram): Promise<ExecResult> {
  return fetch(`/api/program?level_id=${encodeURIComponent(levelId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(program),
  }).then((r) => json<ExecResult>(r));
}

export function fetchState(): Promise<GameState> {
  return fetch("/api/state").then((r) => json<GameState>(r));
}

export function saveState(state: GameState): Promise<GameState> {
  return fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  }).then((r) => json<GameState>(r));
}
