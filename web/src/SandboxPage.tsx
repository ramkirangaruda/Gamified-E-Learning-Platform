import { useCallback, useState } from "react";
import type * as Blockly from "blockly/core";
import Editor from "./Editor";
import GridRenderer from "./GridRenderer";
import Icon from "./icons/Icon";
import { compileWorkspaceToAst } from "./blocks/compileAst";
import { runSandbox, type SandboxResult } from "./api";
import { friendlyError } from "./friendlyError";
import { usePet } from "./pet/PetProvider";

// Free play: same blocks, same real executor, no level, no goal, no scoring. The point
// is "what does this code actually do", answered as fast as possible by just running it
// and watching -- not "did I solve it". PlayPage's economy code (points/hunger/stars/
// hints) is deliberately absent here, not trimmed down; see internal/api's handleSandbox
// for why running the same trivial program on a loop here must never be a way to farm
// points.
interface SandboxPageProps {
  onBackToDashboard: () => void;
}

export default function SandboxPage({ onBackToDashboard }: SandboxPageProps) {
  const { react, say } = usePet();
  const [workspace, setWorkspace] = useState<Blockly.WorkspaceSvg | null>(null);
  const [result, setResult] = useState<SandboxResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const onWorkspaceReady = useCallback((ws: Blockly.WorkspaceSvg | null) => setWorkspace(ws), []);
  const onBlockActivity = useCallback(() => react("curious"), [react]);

  async function handleRun() {
    if (!workspace) return;
    setRunning(true);
    setRunError(null);
    say(null);
    try {
      const { program } = compileWorkspaceToAst(workspace);
      const sandboxResult = await runSandbox(program);
      setResult(sandboxResult);
      react(sandboxResult.events.length > 0 ? "happy" : "curious");
    } catch (e) {
      setRunError(friendlyError("run", e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-var(--pet-bar-h))] w-full bg-quest-cream">
      <div className="flex-1 p-3">
        <div className="h-full overflow-hidden rounded-3xl border-4 border-white bg-white shadow-lg">
          <Editor onWorkspaceReady={onWorkspaceReady} onBlockActivity={onBlockActivity} />
        </div>
      </div>

      <div className="flex w-[440px] flex-col gap-5 overflow-y-auto p-5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="rounded-full bg-white/70 px-3 py-1.5 font-display text-sm font-bold text-quest-ink shadow-sm hover:-translate-y-0.5 transition-transform"
          >
            ← My path
          </button>
          <span className="rounded-full bg-quest-gold/20 px-3 py-1.5 font-display text-sm font-bold text-quest-gold-dark">
            Sandbox
          </span>
        </div>

        <p className="-mt-2 text-xs font-medium text-quest-ink/50">
          No goal here — just drag cards in and press Run to see what they do.
        </p>

        <button
          type="button"
          onClick={handleRun}
          disabled={!workspace || running}
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

        <GridRenderer
          grid={result?.grid ?? { width: 10, height: 10, walls: Array.from({ length: 10 }, () => Array(10).fill(false)), goal: [9, 9] }}
          startPos={result?.start_pos ?? [0, 0]}
          startDir={result?.start_dir ?? "right"}
          events={result?.events ?? []}
          outcome={undefined}
        />
      </div>
    </div>
  );
}
