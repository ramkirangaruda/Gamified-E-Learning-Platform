import { useState } from "react";
import Pet from "../pet/Pet";
import SpeechBubble from "../pet/SpeechBubble";
import { usePet } from "../pet/PetProvider";
import { ChunkyButton } from "../ui/Chunky";
import { generateDigitPuzzle, type TileId } from "./escapeGenerator";
import { nextStateForCorrectAnswer } from "./reward";

const TILES: { id: TileId; emoji: string; label: string }[] = [
  { id: "box", emoji: "📦", label: "Locked Box" },
  { id: "painting", emoji: "🖼️", label: "Wall Painting" },
  { id: "bookshelf", emoji: "📚", label: "Bookshelf" },
  { id: "clock", emoji: "⏰", label: "Old Clock" },
];
const MAX_WRONG = 3;
const WELCOME_LINE = "We're locked in! Solve puzzles to find the escape code.";

function freshPuzzles() {
  return Object.fromEntries(TILES.map((t) => [t.id, generateDigitPuzzle(t.id)])) as Record<TileId, ReturnType<typeof generateDigitPuzzle>>;
}

export default function EscapeRoom({ onSolved }: { onSolved: () => void }) {
  const { state, react, say, answerCorrect, answerIncorrect, commitState } = usePet();

  const [puzzles, setPuzzles] = useState(freshPuzzles);
  const [solvedDigits, setSolvedDigits] = useState<Partial<Record<TileId, number>>>({});
  const [selfSolved, setSelfSolved] = useState<Set<TileId>>(new Set());
  const [activeTile, setActiveTile] = useState<TileId | null>(null);
  const [wrongCounts, setWrongCounts] = useState<Record<TileId, number>>({ box: 0, painting: 0, bookshelf: 0, clock: 0 });
  const [escaped, setEscaped] = useState(false);
  const [assistantText, setAssistantText] = useState(WELCOME_LINE);

  const allFound = TILES.every((t) => solvedDigits[t.id] !== undefined);

  function openTile(id: TileId) {
    if (solvedDigits[id] !== undefined) return;
    setActiveTile(id);
    setAssistantText(`Investigating the ${TILES.find((t) => t.id === id)?.label}...`);
  }

  function pressDigit(id: TileId, d: number) {
    const puzzle = puzzles[id];
    if (d === puzzle.answer) {
      setSolvedDigits((prev) => ({ ...prev, [id]: d }));
      setSelfSolved((prev) => new Set(prev).add(id));
      const line = "That's it! One piece of the code found.";
      setAssistantText(line);
      say(line);
      answerCorrect();
      onSolved();
      if (state) void commitState(nextStateForCorrectAnswer(state));
      setActiveTile(null);
      return;
    }

    const nextWrong = (wrongCounts[id] ?? 0) + 1;
    setWrongCounts((prev) => ({ ...prev, [id]: nextWrong }));
    answerIncorrect();
    if (nextWrong >= MAX_WRONG) {
      setSolvedDigits((prev) => ({ ...prev, [id]: puzzle.answer }));
      const line = `Here's the answer: ${puzzle.answer}. Let's check the next spot!`;
      setAssistantText(line);
      say(line);
      setActiveTile(null);
    } else {
      const line = "Not quite — try counting it out!";
      setAssistantText(line);
      say(line);
    }
  }

  function escape() {
    setEscaped(true);
    react("celebrating");
  }

  function restart() {
    setPuzzles(freshPuzzles());
    setSolvedDigits({});
    setSelfSolved(new Set());
    setActiveTile(null);
    setWrongCounts({ box: 0, painting: 0, bookshelf: 0, clock: 0 });
    setEscaped(false);
    setAssistantText(WELCOME_LINE);
  }

  if (escaped) {
    const code = TILES.map((t) => solvedDigits[t.id]).join("");
    return (
      <div className="flex flex-col items-center gap-4 rounded-chunk-xl border-(length:--outline-chunk-thick) border-quest-while bg-quest-paper px-6 py-10 text-center shadow-chunk">
        <Pet state="celebrating" species={state?.pet.species} size={110} inventory={state?.inventory} />
        <h2 className="font-display text-2xl font-bold text-quest-ink">You escaped! 🎉</h2>
        <p className="font-display text-3xl font-bold tracking-widest text-quest-while-dark">{code}</p>
        <p className="max-w-md font-medium text-quest-ink-soft">You cracked {selfSolved.size} of {TILES.length} codes yourself!</p>
        <ChunkyButton tone="while" size="lg" onClick={restart}>
          Try a new room
        </ChunkyButton>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-quest-ink">Number Escape Room</h2>
          <span className="rounded-chunk-sm border-2 border-quest-while-dark bg-quest-while/15 px-3 py-1.5 font-display text-sm font-bold text-quest-while-dark">
            Room 1
          </span>
        </div>
        <p className="mt-1 font-medium text-quest-ink-soft">Find the 4-digit escape code!</p>

        <div className="mt-4 rounded-chunk-xl border-(length:--outline-chunk-thick) border-quest-while bg-white p-6 shadow-chunk">
          <div className="grid grid-cols-2 gap-4">
            {TILES.map((t) => {
              const solved = solvedDigits[t.id] !== undefined;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openTile(t.id)}
                  disabled={solved}
                  className={`flex flex-col items-center gap-1 rounded-chunk-xl border-[3px] px-4 py-6 text-center shadow-chunk transition-transform disabled:cursor-default ${!solved ? "border-quest-locked bg-quest-cream hover:-translate-y-1 active:translate-y-[2px]" : "border-quest-while-dark bg-quest-while/20"}`}
                >
                  <span className="text-4xl" aria-hidden="true">{t.emoji}</span>
                  <span className="font-display font-bold text-quest-ink">{t.label}</span>
                  <span className="text-sm font-medium text-quest-ink-soft">{solved ? `Found: ${solvedDigits[t.id]}` : "Tap to investigate"}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 rounded-chunk-lg border-2 border-quest-locked bg-quest-cream p-4 text-center">
            <h3 className="font-display text-sm font-bold text-quest-ink">Escape Code</h3>
            <div className="mt-3 flex justify-center gap-3">
              {TILES.map((t) => (
                <div key={t.id} className="flex h-14 w-12 items-center justify-center rounded-chunk-sm border-2 border-quest-locked bg-white font-display text-2xl font-bold text-quest-ink">
                  {solvedDigits[t.id] ?? "?"}
                </div>
              ))}
            </div>
            {allFound && (
              <ChunkyButton tone="gold" size="lg" className="mt-4" onClick={escape}>
                🔓 Escape!
              </ChunkyButton>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-chunk-xl border-[3px] border-quest-while bg-quest-while/12 p-5">
        <div className="mx-auto w-fit rounded-chunk-sm border-2 border-quest-while-dark bg-quest-while px-4 py-1.5 font-display text-sm font-bold uppercase tracking-wide text-white">
          Math Buddy
        </div>
        <Pet state={activeTile ? "thinking" : "playful"} species={state?.pet.species} size={100} inventory={state?.inventory} />
        <SpeechBubble text={assistantText} />
      </div>

      {activeTile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-quest-ink/55 p-4">
          <div className="w-full max-w-sm rounded-chunk-xl border-(length:--outline-chunk-thick) border-quest-while bg-white p-6 text-center shadow-chunk-lg">
            <h3 className="font-display text-xl font-bold text-quest-ink">{TILES.find((t) => t.id === activeTile)?.label}</h3>
            <p className="mt-2 font-display text-3xl font-bold text-quest-ink">{puzzles[activeTile].prompt}</p>
            <div className="mt-5 grid grid-cols-5 gap-2">
              {Array.from({ length: 10 }, (_, d) => d).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => pressDigit(activeTile, d)}
                  className="rounded-chunk-sm border-2 border-quest-locked bg-quest-cream py-3 font-display text-lg font-bold text-quest-ink shadow-chunk-sm transition-transform hover:-translate-y-0.5 active:translate-y-[2px]"
                >
                  {d}
                </button>
              ))}
            </div>
            <ChunkyButton tone="neutral" className="mt-4" onClick={() => setActiveTile(null)}>
              Close
            </ChunkyButton>
          </div>
        </div>
      )}
    </div>
  );
}
