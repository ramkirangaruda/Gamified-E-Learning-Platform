import type { AstProgram } from "./blocks/compileAst";
import type { Dir, ExecResult, Grid, Pos } from "./executorTypes";

export interface LevelDef {
  id: string;
  name: string;
  /** Concept group key: move | repeat | nested_repeat | if_wall_ahead | while | composition */
  teaches: string;
  /** easy | medium | hard. `hard` below is derived from this server-side. */
  difficulty: string;
  /** Kept because pet/reward.ts's §10 hard-points bonus reads it. */
  hard: boolean;
  /** One-line "what this level teaches", shown on the trail and the grid. */
  concept: string;
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

/** One row of §7's `inventory` table. `qty` is a LIFETIME COUNT, not a stock level --
 *  how many of this item have ever been bought -- so it only ever grows and nothing in
 *  the game consumes it (see pet/items.ts, and internal/store's saveInventory, which
 *  enforces the same rule server-side). `equipped` is what the pet is wearing right now
 *  and moves freely in both directions. */
export interface InventoryItem {
  item_id: string;
  qty: number;
  equipped: boolean;
}

export interface GameState {
  learner: Learner;
  pet: PetState;
  inventory: InventoryItem[];
  // Derived from level_progress -- every level_id ever solved, regardless of order.
  // The correct, order-independent replacement for a "highest_level index" check now
  // that levels are reachable via independent dashboard sections rather than one
  // strictly linear sequence -- see internal/api's stateResponse and DECISIONS.md.
  solved_levels: string[];
  // Real per-level star counts (handoff/04-stars.md), computed and persisted
  // server-side in handleProgram -- solved + under-par + first-try, 1-3, never
  // regresses. Only levels with at least 1 star are present; an absent key means 0,
  // same convention as solved_levels omitting anything never solved.
  stars_by_level: Record<string, number>;
}

export interface TierInfo {
  tier: string;
  model: string;
  available_mb: number;
  selected_at_ms: number;
  /** Whether the launcher decided decorative animation should be off (--lite, or auto
   *  for the low RAM tier). The UI toggle can override it for the session. */
  lite: boolean;
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

// Sandbox response is /api/program's shape plus the grid/start info the client needs to
// feed GridRenderer -- the sandbox has no level, so nothing else already has this grid.
export interface SandboxResult extends ExecResult {
  grid: Grid;
  start_pos: Pos;
  start_dir: Dir;
}

// The free-play surface (handoff: sandbox mode). Deliberately NOT scored, not tied to a
// level_id, and touches none of the economy/progress state on the server -- see
// internal/api's handleSandbox.
export function runSandbox(program: AstProgram): Promise<SandboxResult> {
  return fetch("/api/sandbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ast: program }),
  }).then((r) => json<SandboxResult>(r));
}

export interface Suggestion {
  level_id: string;
  /** "next" | "review" | "challenge" | "done" -- see internal/api/suggestion.go. */
  category: string;
  message: string;
}

// "<pet> suggests" (dynamic level suggestion, handoff item). Deterministic server-side
// logic over real progress data; the model is never involved in deciding this -- see
// internal/api/suggestion.go's own comment for why that boundary matters here.
export function fetchSuggestion(): Promise<Suggestion> {
  return fetch("/api/suggestion").then((r) => json<Suggestion>(r));
}

export interface ClassroomResult {
  ok: boolean;
  error?: string;
}

// Classroom Hub (handoff item). Both always return 200 with ok:false on any failure --
// an unreachable hub, sync not configured, an unknown name -- rather than throwing, since
// all of those are ordinary, expected outcomes here, not exceptional ones. See
// internal/api/classroom.go's handleSyncToClassroom/handleRestoreFromClassroom.
export function syncToClassroom(): Promise<ClassroomResult> {
  return fetch("/api/sync-to-classroom", { method: "POST" }).then((r) => json<ClassroomResult>(r));
}

export function restoreFromClassroom(displayName: string): Promise<ClassroomResult> {
  return fetch("/api/restore-from-classroom", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ display_name: displayName }),
  }).then((r) => json<ClassroomResult>(r));
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

/** One of the five lab tests the Chem Lab design fixes -- matches internal/chemistry's
 *  TestKind exactly, a closed set rather than an open string. */
export type ChemistryTest = "flame" | "ph" | "solubility" | "reactivity" | "smell";

export interface ChemistryClue {
  test: ChemistryTest;
  text: string;
}

export interface ChemistryChoice {
  id: string;
  name: string;
  formula: string;
}

// Deliberately has no field for the correct answer -- /api/chemistry/samples never sends
// it (see internal/api's chemistrySampleResponse). Grading happens server-side, the same
// "server is authoritative" rule /api/program already applies to a coding level's goal.
export interface ChemistrySample {
  id: string;
  name: string;
  formula: string;
  description: string;
  tags: string[];
  clues: ChemistryClue[];
  choices: ChemistryChoice[];
}

export function fetchChemistrySamples(): Promise<ChemistrySample[]> {
  return fetch("/api/chemistry/samples").then((r) => json<ChemistrySample[]>(r));
}

export interface ChemistryGuessResult {
  correct: boolean;
  answer: ChemistryChoice;
}

export function guessChemistrySample(sampleId: string, choiceId: string): Promise<ChemistryGuessResult> {
  return fetch("/api/chemistry/guess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sample_id: sampleId, choice_id: choiceId }),
  }).then((r) => json<ChemistryGuessResult>(r));
}
