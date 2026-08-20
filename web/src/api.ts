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

export interface TierInfo {
  tier: string;
  model: string;
  available_mb: number;
  selected_at_ms: number;
}

export interface HintResult {
  hint: string;
  error_signature?: string;
  tier?: string;
  model?: string;
  latency_ms?: number;
  cached: boolean;
}

export interface TierHintRecord {
  tier: string;
  model: string;
  hint_text: string;
  level_id: string;
  error_signature: string;
  latency_ms: number;
  ts: number;
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

// Request body is {"ast": <AST envelope>, "client_problems": [...]} -- a wrapper around
// M1/M2's original "body is the raw AST" contract, added in M3 so the server can see
// compileAst.ts's own problem messages (needed to classify unbalanced_block, which is
// otherwise undetectable server-side once the AST has already been silently truncated).
// See DECISIONS.md for why this is an HTTP envelope change, not an AST contract change.
export function runProgram(levelId: string, program: AstProgram, clientProblems: string[] = []): Promise<ExecResult> {
  return fetch(`/api/program?level_id=${encodeURIComponent(levelId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ast: program, client_problems: clientProblems }),
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

export function fetchHint(levelId: string, errorSignature: string): Promise<HintResult> {
  return fetch("/api/hint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level_id: levelId, error_signature: errorSignature }),
  }).then((r) => json<HintResult>(r));
}

export function fetchTierInfo(): Promise<TierInfo> {
  return fetch("/api/tier").then((r) => json<TierInfo>(r));
}

export function fetchCompare(): Promise<TierHintRecord[]> {
  return fetch("/api/compare").then((r) => json<TierHintRecord[]>(r));
}
