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
      // The server matches on `code`, not prose -- see compileAst.ts's ProblemCode.
      const clientProblems = problems.map((p) => p.code);
      const execResult = await runProgram(level.id, program, clientProblems);
      setResult(execResult);

      const attemptsSoFar = attemptCounts[level.id] ?? 0;
      const firstTry = attemptsSoFar === 0;
      setAttemptCounts((prev) => ({ ...prev, [level.id]: attemptsSoFar + 1 }));

      const levelIndex = levels.findIndex((l) => l.id === level.id);
      // Only a *new* highest_level milestone counts as "just solved" for reward
      // purposes -- otherwise re-running an already-beaten level's saved program keeps
      // granting the full solve bonus forever, since nothing else caps it (unlike
      // hunger, which clampHunger bounds at 100).
      const alreadySolved = !!state && levelIndex + 1 <= state.learner.highest_level;

      const reward = computeAttemptReward({
        outcome: execResult.outcome,
        firstTry,
        hard: level.hard,
        blocksUsed,
        parBlocks: level.parBlocks,
        alreadySolved,
      });

      if (state) {
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

  const LEVEL_COLOR = [
    { bg: "bg-quest-sky", border: "border-quest-sky-dark" },
    { bg: "bg-quest-coral", border: "border-quest-coral-dark" },
    { bg: "bg-quest-grass", border: "border-quest-grass-dark" },
  ];

  return (
    <div className="flex h-screen w-screen bg-quest-cream">
      <div className="flex-1 p-3">
        <div className="h-full overflow-hidden rounded-3xl border-4 border-white bg-white shadow-lg">
          <Editor onWorkspaceReady={onWorkspaceReady} />
        </div>
      </div>

      <div className="flex w-[440px] flex-col gap-5 overflow-y-auto p-5">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-quest-ink">Tessera Quest</h1>
          <TierHUD tier={tierInfo} lastLatencyMs={hintLatencyMs} />
        </div>

        <div>
          <div className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-quest-ink/60">
            Pick a level
          </div>
          <div className="flex gap-3">
            {levels.map((l, i) => {
              const active = l.id === levelId;
              const color = LEVEL_COLOR[i % LEVEL_COLOR.length];
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLevelId(l.id)}
                  className={`flex-1 rounded-2xl border-b-4 px-3 py-3 text-center font-display text-sm font-bold text-white shadow-md transition-transform hover:-translate-y-0.5 ${color.bg} ${
                    active ? `${color.border} scale-105` : "border-transparent opacity-70"
                  }`}
                >
                  <div className="text-2xl leading-none">{i + 1}</div>
                  <div className="mt-1 text-xs font-semibold">{l.name}</div>
                </button>
              );
            })}
          </div>
        </div>

        {level && (
          <p className="-mt-2 text-xs font-medium text-quest-ink/50">
            teaches: {level.teaches} · par: {level.parBlocks} blocks {level.hard && "· hard"}
          </p>
        )}

        <button
          type="button"
          onClick={handleRun}
          disabled={!workspace || !level || running}
          className="rounded-2xl border-b-4 border-quest-grass-dark bg-quest-grass px-5 py-3 font-display text-lg font-bold text-white shadow-md transition-transform hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:border-b-2 disabled:translate-y-0 disabled:opacity-40"
        >
          {running ? "Running…" : "▶ Run program"}
        </button>
        {runError && <p className="text-sm font-medium text-quest-coral-dark">{runError}</p>}

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
          <div className="flex justify-between rounded-2xl bg-white/70 px-4 py-2 font-display text-sm font-bold text-quest-ink shadow-sm">
            <span>⭐ {state.learner.points} pts</span>
            <span>🍎 {state.pet.hunger}</span>
            <span>🏆 Level {state.learner.highest_level}</span>
          </div>
        )}
      </div>
    </div>
  );
}
