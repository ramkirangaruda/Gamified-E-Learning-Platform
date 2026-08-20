import { useCallback, useEffect, useState } from "react";
import type * as Blockly from "blockly/core";
import Editor from "./Editor";
import GridRenderer from "./GridRenderer";
import Pet from "./pet/Pet";
import SpeechBubble from "./pet/SpeechBubble";
import TierHUD from "./TierHUD";
import { compileWorkspaceToAst } from "./blocks/compileAst";
import { computeAttemptReward, clampHunger, moodFromHunger } from "./pet/reward";
import {
  fetchHint,
  fetchLevels,
  fetchState,
  fetchTierInfo,
  runProgram,
  saveState,
  type GameState,
  type LevelDef,
  type TierInfo,
} from "./api";
import type { ExecResult } from "./executorTypes";

// The page-level wiring for M2's acceptance test (brief §12) plus M3's tutor pipeline
// (brief §11/§12): solve three levels with a mouse, watch the pet react, get a real
// in-character hint when stuck. Each piece (Editor/indentGuides, compileAst, the
// executor via /api/program, GridRenderer, Pet, /api/hint) was built and tested
// independently -- this component is where they actually meet.

export default function PlayPage() {
  const [levels, setLevels] = useState<LevelDef[]>([]);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Blockly.WorkspaceSvg | null>(null);
  const [result, setResult] = useState<ExecResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintLatencyMs, setHintLatencyMs] = useState<number | null>(null);
  // No backend attempts log yet (M1/M2 deferred internal/store's attempts table until
  // something needs it) -- first-try tracking is client-side only for now and resets on
  // reload. Logged in DECISIONS.md; real persistence is a straightforward follow-up once
  // the attempts table has a writer.
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchLevels().then(setLevels).catch((e) => setRunError(String(e)));
    fetchState().then(setState).catch((e) => setRunError(String(e)));
    fetchTierInfo().then(setTierInfo).catch(() => setTierInfo(null));
  }, []);

  useEffect(() => {
    if (!levelId && levels.length > 0) setLevelId(levels[0].id);
  }, [levels, levelId]);

  const onWorkspaceReady = useCallback((ws: Blockly.WorkspaceSvg | null) => {
    setWorkspace(ws);
  }, []);

  const level = levels.find((l) => l.id === levelId) ?? null;

  async function handleRun() {
    if (!workspace || !level) return;
    setRunning(true);
    setRunError(null);
    setHintText(null);
    try {
      const { program, problems } = compileWorkspaceToAst(workspace);
      const blocksUsed = workspace.getAllBlocks(false).length;
      const clientProblems = problems.map((p) => p.message);
      const execResult = await runProgram(level.id, program, clientProblems);
      setResult(execResult);

      const attemptsSoFar = attemptCounts[level.id] ?? 0;
      const firstTry = attemptsSoFar === 0;
      setAttemptCounts((prev) => ({ ...prev, [level.id]: attemptsSoFar + 1 }));

      const reward = computeAttemptReward({
        outcome: execResult.outcome,
        firstTry,
        hard: level.hard,
        blocksUsed,
        parBlocks: level.parBlocks,
      });

      if (state) {
        const levelIndex = levels.findIndex((l) => l.id === level.id);
        const next: GameState = {
          ...state,
          learner: {
            ...state.learner,
            points: state.learner.points + reward.points,
            total_xp: state.learner.total_xp + reward.points,
            // Pet never regresses (brief §10) -- only raise highest_level, never lower it.
            highest_level:
              execResult.outcome === "solved"
                ? Math.max(state.learner.highest_level, levelIndex + 1)
                : state.learner.highest_level,
          },
          pet: {
            ...state.pet,
            hunger: clampHunger(state.pet.hunger + reward.hungerDelta),
          },
        };
        setState(next);
        await saveState(next);
      }

      // brief §11's pipeline fires here: a failed run with a recognized signature (or
      // even an unrecognized one -- /api/hint falls back to a generic encouraging line
      // rather than showing nothing) gets a hint in Pip's voice.
      if (execResult.outcome === "failed") {
        try {
          const hint = await fetchHint(level.id, execResult.error_signature ?? "");
          setHintText(hint.hint);
          setHintLatencyMs(hint.latency_ms ?? null);
          if (hint.tier) {
            setTierInfo((prev) => (prev ? { ...prev, tier: hint.tier!, model: hint.model ?? prev.model } : prev));
          }
        } catch {
          // Hint pipeline failing entirely (not just a model error, which /api/hint
          // already handles gracefully) shouldn't block the rest of the game -- just
          // leave the speech bubble on its default placeholder.
        }
      }
    } catch (e) {
      setRunError(String(e));
    } finally {
      setRunning(false);
    }
  }

  const mood = state ? moodFromHunger(state.pet.hunger, result?.outcome ?? null) : "idle";

  return (
    <div className="flex h-screen w-screen">
      <div className="flex-1">
        <Editor onWorkspaceReady={onWorkspaceReady} />
      </div>

      <div className="flex w-[420px] flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Level</div>
            <div className="flex gap-2">
              {levels.map((l, i) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLevelId(l.id)}
                  className={`rounded px-3 py-1 text-sm ${
                    l.id === levelId ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {i + 1}. {l.name}
                </button>
              ))}
            </div>
          </div>
          <TierHUD tier={tierInfo} lastLatencyMs={hintLatencyMs} />
        </div>
        {level && (
          <p className="-mt-2 text-xs text-slate-400">
            teaches: {level.teaches} · par: {level.parBlocks} blocks {level.hard && "· hard"}
          </p>
        )}

        <button
          type="button"
          onClick={handleRun}
          disabled={!workspace || !level || running}
          className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          {running ? "Running…" : "▶ Run program"}
        </button>
        {runError && <p className="text-sm text-red-600">{runError}</p>}

        {level && (
          <GridRenderer
            grid={level.grid}
            startPos={level.startPos}
            startDir={level.startDir}
            events={result?.events ?? []}
            outcome={result?.outcome}
          />
        )}

        <div className="mt-auto flex items-end gap-3">
          <Pet mood={mood} evolutionStage={state?.pet.evolution_stage ?? 0} name={state?.pet.name} />
          <SpeechBubble text={hintText ?? undefined} />
        </div>

        {state && (
          <div className="text-xs text-slate-400">
            {state.learner.points} pts · hunger {state.pet.hunger} · level {state.learner.highest_level}
          </div>
        )}
      </div>
    </div>
  );
}
