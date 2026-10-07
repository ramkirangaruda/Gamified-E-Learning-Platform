import { useState } from "react";
import Pet from "../pet/Pet";
import SpeechBubble from "../pet/SpeechBubble";
import { usePet } from "../pet/PetProvider";
import { ChunkyButton } from "../ui/Chunky";
import { generateTetrisLevel } from "./tetrisGenerator";
import { nextStateForCorrectAnswer } from "./reward";

const LEVELS = 5;
const HINT_AFTER_FAILS = 3;
const WELCOME_LINE = "Match the blocks to hit the target number!";

export default function MathTetris({ onSolved }: { onSolved: () => void }) {
  const { state, react, say, answerCorrect, answerIncorrect, commitState } = usePet();

  const [level, setLevel] = useState(1);
  const [data, setData] = useState(() => generateTetrisLevel(1));
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [correct, setCorrect] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [hintIndex, setHintIndex] = useState<number | null>(null);
  const [clearedCount, setClearedCount] = useState(0);
  const [assistantText, setAssistantText] = useState(WELCOME_LINE);

  const done = level > LEVELS;
  const selectedSum = [...selected].reduce((sum, i) => sum + data.tiles[i], 0);

  function toggleTile(i: number) {
    if (correct) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function clear() {
    if (correct) return;
    setSelected(new Set());
  }

  function check() {
    if (correct || selected.size === 0) return;
    if (selectedSum === data.target) {
      setCorrect(true);
      setClearedCount((n) => n + 1);
      const line = "You matched it! Great counting!";
      setAssistantText(line);
      say(line);
      answerCorrect();
      onSolved();
      if (state) void commitState(nextStateForCorrectAnswer(state));
      return;
    }
    const nextFail = failCount + 1;
    setFailCount(nextFail);
    answerIncorrect();
    if (nextFail >= HINT_AFTER_FAILS) {
      const unused = data.solutionIndices.find((i) => !selected.has(i));
      setHintIndex(unused ?? null);
      const line = "Here's a hint — try including the glowing tile!";
      setAssistantText(line);
      say(line);
    } else {
      const line = selectedSum > data.target ? "A little too high — try removing a tile." : "Not quite enough yet — try adding a tile.";
      setAssistantText(line);
      say(line);
    }
  }

  function nextLevel() {
    const next = level + 1;
    setLevel(next);
    setData(generateTetrisLevel(next));
    setSelected(new Set());
    setCorrect(false);
    setFailCount(0);
    setHintIndex(null);
    setAssistantText(WELCOME_LINE);
    react("playful");
  }

  function restart() {
    setLevel(1);
    setData(generateTetrisLevel(1));
    setSelected(new Set());
    setCorrect(false);
    setFailCount(0);
    setHintIndex(null);
    setClearedCount(0);
    setAssistantText(WELCOME_LINE);
  }

  const TILE_COLORS = ["bg-quest-move", "bg-quest-cond", "bg-quest-coral", "bg-quest-repeat"];

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-chunk-xl border-(length:--outline-chunk-thick) border-quest-cond bg-quest-paper px-6 py-10 text-center shadow-chunk">
        <Pet state="celebrating" species={state?.pet.species} size={110} inventory={state?.inventory} />
        <h2 className="font-display text-2xl font-bold text-quest-ink">All levels cleared!</h2>
        <p className="max-w-md font-medium text-quest-ink-soft">
          You matched {clearedCount} of {LEVELS} targets.
        </p>
        <ChunkyButton tone="cond" size="lg" onClick={restart}>
          Play again
        </ChunkyButton>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-quest-ink">Math Tetris</h2>
          <span className="rounded-chunk-sm border-2 border-quest-cond-dark bg-quest-cond/15 px-3 py-1.5 font-display text-sm font-bold text-quest-cond-dark">
            Level {level} · Target: {data.target}
          </span>
        </div>

        <div className="mt-4 rounded-chunk-xl border-(length:--outline-chunk-thick) border-quest-cond bg-white p-6 shadow-chunk">
          <div className="grid grid-cols-4 gap-3">
            {data.tiles.map((v, i) => {
              const isSelected = selected.has(i);
              const isHint = hintIndex === i;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={correct}
                  onClick={() => toggleTile(i)}
                  className={`aspect-[3/4] rounded-chunk-lg border-[3px] font-display text-2xl font-bold text-white shadow-chunk transition-transform disabled:cursor-not-allowed ${!correct ? "hover:-translate-y-1 active:translate-y-[2px]" : ""} ${TILE_COLORS[i % TILE_COLORS.length]} ${isSelected ? "border-quest-ink ring-4 ring-quest-gold" : "border-white/40"} ${isHint ? "animate-pulse ring-4 ring-quest-gold" : ""}`}
                >
                  {v}
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-chunk-lg border-2 border-quest-locked bg-quest-cream px-4 py-3">
            <span className="font-display text-sm font-bold text-quest-ink-soft">
              Selected: {selected.size > 0 ? `${[...selected].map((i) => data.tiles[i]).join(" + ")} = ${selectedSum}` : "—"}
            </span>
            <div className="ml-auto flex gap-2">
              <ChunkyButton tone="neutral" onClick={clear} disabled={correct || selected.size === 0}>
                Clear
              </ChunkyButton>
              {!correct ? (
                <ChunkyButton tone="cond" onClick={check} disabled={selected.size === 0}>
                  Check!
                </ChunkyButton>
              ) : (
                <ChunkyButton tone="gold" onClick={nextLevel}>
                  {level + 1 > LEVELS ? "See results" : "Next Level →"}
                </ChunkyButton>
              )}
            </div>
          </div>

          {correct && <p className="mt-3 font-display text-xl font-bold text-quest-cond-dark">Target Matched! ✨</p>}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-chunk-xl border-[3px] border-quest-cond bg-quest-cond/12 p-5">
        <div className="mx-auto w-fit rounded-chunk-sm border-2 border-quest-cond-dark bg-quest-cond px-4 py-1.5 font-display text-sm font-bold uppercase tracking-wide text-white">
          Math Buddy
        </div>
        <Pet state={correct ? "celebrating" : "playful"} species={state?.pet.species} size={100} inventory={state?.inventory} />
        <SpeechBubble text={assistantText} />
      </div>
    </div>
  );
}
