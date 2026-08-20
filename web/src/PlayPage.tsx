import { useCallback, useEffect, useState } from "react";
import type * as Blockly from "blockly/core";
import Editor from "./Editor";
import GridRenderer from "./GridRenderer";
import Icon from "./icons/Icon";
import TierHUD from "./TierHUD";
import { compileWorkspaceToAst } from "./blocks/compileAst";
import { computeAttemptReward, clampHunger } from "./pet/reward";
import { usePet } from "./pet/PetProvider";
import { fetchHint, fetchTierInfo, runProgram, type GameState, type TierInfo } from "./api";
import type { ExecResult } from "./executorTypes";
import { friendlyError } from "./friendlyError";

// The play screen. Everything about the pet -- its state, its mood, its speech, its
// hunger, the points display -- now lives in the persistent bar above (pet/PetBar.tsx),
// so this page is purely "build a program and run it". It reports events to the pet
// (`react`, `setBusy`, `answerCorrect`/`answerIncorrect`/`levelCompleted`, `say`) and
// never owns any pet state itself.

interface PlayPageProps {
  /** Which level to open on -- set by HomePage when a child picks one. */
  initialLevelId?: string;
  onBackToDashboard: () => void;
}

export default function PlayPage({ initialLevelId, onBackToDashboard }: PlayPageProps) {
  const { state, levels, commitState, setActiveLevelId, setBusy, react, say, answerCorrect, answerIncorrect, levelCompleted } =
    usePet();

  const [levelId, setLevelId] = useState<string | null>(initialLevelId ?? null);
  const [workspace, setWorkspace] = useState<Blockly.WorkspaceSvg | null>(null);
  const [result, setResult] = useState<ExecResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
  const [hintLatencyMs, setHintLatencyMs] = useState<number | null>(null);
  // First-try tracking is client-side only and resets on reload (AUDIT P2): the server's
  // attempts table does have a real writer now, so deriving this server-side is possible
  // -- it just isn't done yet. Bounded by the alreadySolved gate below, so the worst case
  // is a level's genuine first solve being scored as first-try after a page refresh.
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchTierInfo().then(setTierInfo).catch(() => setTierInfo(null));
  }, []);

  useEffect(() => {
    if (!levelId && levels.length > 0) setLevelId(initialLevelId ?? levels[0].id);
  }, [levels, levelId, initialLevelId]);

  // Tell the bar which level is open so it can show "Level 7" and its stars, and clear it
  // on the way out so the bar falls back to the overall progress line.
  useEffect(() => {
    setActiveLevelId(levelId);
    return () => setActiveLevelId(null);
  }, [levelId, setActiveLevelId]);

  const onWorkspaceReady = useCallback((ws: Blockly.WorkspaceSvg | null) => {
    setWorkspace(ws);
  }, []);

  // Every block drag or snap makes the mascot look over -- the single most frequent thing
  // a child does in this app, and previously its only reaction was on submit. Not one of
  // the named mascot events (it's not in the brief's 11-method list) -- react() directly
  // is the right tool here, same as before.
  const onBlockActivity = useCallback(() => react("playful"), [react]);

  const level = levels.find((l) => l.id === levelId) ?? null;
  // Only this level's own concept group, not all 25 -- the trail is where a child
  // switches groups; within a group this reads as a level picker rather than a wall.
  const sectionLevels = level ? levels.filter((l) => l.teaches === level.teaches) : [];

  async function handleRun() {
    if (!workspace || !level) return;
    setRunning(true);
    setBusy(true); // -> thinking, for as long as the run and any hint take
    setRunError(null);
    say(null);
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
      // Real per-level solved tracking (level_progress, via state.solved_levels), not a
      // highest-index comparison -- otherwise re-running an already-beaten level's saved
      // program keeps granting the full solve bonus forever (nothing else caps it,
      // unlike hunger which clampHunger bounds at 100), AND a highest-index check breaks
      // entirely once levels can be solved out of strict linear order.
      const alreadySolved = !!state && state.solved_levels.includes(level.id);

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
          // solved_levels is deliberately NOT set here: /api/program has already recorded
          // this attempt against level_progress, and POST /api/state echoes the freshly
          // read list back, which commitState adopts. Guessing it client-side could only
          // ever disagree with the server's record.
        };
        await commitState(next);
      }

      // Solving IS "the answer was correct" in this game's model (a whole program is
      // submitted and either reaches the goal or doesn't -- there's no smaller per-step
      // question/answer unit to react to separately). Firing both lets the celebration
      // (priority 120) win the display over the plain correct-answer pulse (70) via
      // mascot/state.ts's priority table, while still exercising both named events.
      if (execResult.outcome === "solved") {
        answerCorrect();
        levelCompleted(level);
      } else {
        // Never disappointed/angry/crying -- confused, settling toward encouraging once
        // the hint arrives just below. A failed run (bump or otherwise) is this game's
        // "incorrect answer" moment.
        answerIncorrect();
      }

      // brief §11's pipeline fires here: a failed run with a recognized signature (or
      // even an unrecognized one -- /api/hint falls back to a generic encouraging line
      // rather than showing nothing) gets a hint in Pip's voice.
      if (execResult.outcome === "failed") {
        try {
          const hint = await fetchHint(level.id, execResult.error_signature ?? "");
          say(hint.hint);
          setHintLatencyMs(hint.latency_ms ?? null);
          if (hint.tier) {
            setTierInfo((prev) => (prev ? { ...prev, tier: hint.tier!, model: hint.model ?? prev.model } : prev));
          }
        } catch {
          // Hint pipeline failing entirely (not just a model error, which /api/hint
          // already handles gracefully) shouldn't block the rest of the game.
        }
      }
    } catch (e) {
      setRunError(friendlyError("run", e));
    } finally {
      setRunning(false);
      setBusy(false);
    }
  }

  const LEVEL_COLOR = [
    { bg: "bg-quest-sky", border: "border-quest-sky-dark" },
    { bg: "bg-quest-coral", border: "border-quest-coral-dark" },
    { bg: "bg-quest-grass", border: "border-quest-grass-dark" },
  ];

  return (
    <div className="flex h-[calc(100vh-var(--app-header-h))] w-full bg-quest-cream">
      <div className="flex-1 p-3">
        <div className="h-full overflow-hidden rounded-3xl border-4 border-white bg-white shadow-lg">
          <Editor onWorkspaceReady={onWorkspaceReady} onBlockActivity={onBlockActivity} />
        </div>
      </div>

      {/* overscroll-contain: once this panel hits its end, the wheel stops there instead
          of handing the scroll on to the page behind it. Without it, scrolling past the
          bottom of the level list quietly drags the whole play screen. */}
      <div className="flex w-[440px] flex-col gap-5 overflow-y-auto overscroll-contain p-5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="rounded-full bg-white/70 px-3 py-1.5 font-display text-sm font-bold text-quest-ink shadow-sm hover:-translate-y-0.5 transition-transform"
          >
            ← My path
          </button>
          <TierHUD tier={tierInfo} lastLatencyMs={hintLatencyMs} />
        </div>

        <div>
          <div className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-quest-ink/60">
            Pick a level
          </div>
          <div className="flex flex-wrap gap-3">
            {sectionLevels.map((l, i) => {
              const active = l.id === levelId;
              const color = LEVEL_COLOR[i % LEVEL_COLOR.length];
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLevelId(l.id)}
                  className={`min-w-24 flex-1 rounded-2xl border-b-4 px-3 py-3 text-center font-display text-sm font-bold text-white shadow-md transition-transform hover:-translate-y-0.5 ${color.bg} ${
                    active ? `${color.border} scale-105` : "border-transparent opacity-70"
                  }`}
                >
                  <div className="text-2xl leading-none">{levels.findIndex((x) => x.id === l.id) + 1}</div>
                  <div className="mt-1 text-xs font-semibold">{l.name}</div>
                </button>
              );
            })}
          </div>
        </div>

        {level && (
          <p className="-mt-2 text-xs font-medium text-quest-ink/50">
            {level.concept} · par: {level.parBlocks} blocks {level.hard && "· hard"}
          </p>
        )}

        <button
          type="button"
          onClick={handleRun}
          disabled={!workspace || !level || running}
          className="flex items-center justify-center gap-2 rounded-2xl border-b-4 border-quest-grass-dark bg-quest-grass px-5 py-3 font-display text-lg font-bold text-white shadow-md transition-transform hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:border-b-2 disabled:translate-y-0 disabled:opacity-40"
        >
          {running ? (
            "Running…"
          ) : (
            <>
              <Icon name="play" size={22} />
              Run program
            </>
          )}
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
      </div>
    </div>
  );
}
