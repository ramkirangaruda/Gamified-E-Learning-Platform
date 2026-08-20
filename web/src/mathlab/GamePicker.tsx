import { ConceptChip } from "../ui/Chunky";
import { toneClasses, type ChunkyTone } from "../ui/tone";

export type MathGameId = "machine" | "detective" | "tetris" | "escape";

interface GameCardDef {
  id: MathGameId;
  title: string;
  desc: string;
  emoji: string;
  tone: ChunkyTone;
  tags: [string, string];
}

// Math's own subject tone (subjects.ts) is "coral" -- these 4 cards deliberately use the
// other four tones, the same reuse Chemistry already makes across its 5 unrelated lab
// tests (flame/ph/solubility/reactivity/smell), so nothing here invents new hex colors.
const GAMES: GameCardDef[] = [
  { id: "machine", title: "Fix the Machine", desc: "Spot the pattern and repair the broken machine.", emoji: "🛠️", tone: "move", tags: ["Addition", "Patterns"] },
  { id: "detective", title: "Math Detective", desc: "Solve number clues to crack the case.", emoji: "🔍", tone: "repeat", tags: ["Logic", "Reasoning"] },
  { id: "tetris", title: "Math Tetris", desc: "Pick the tiles that add up to the target.", emoji: "🧩", tone: "cond", tags: ["Addition", "Strategy"] },
  { id: "escape", title: "Escape Room", desc: "Crack four number puzzles to find the code.", emoji: "🔐", tone: "while", tags: ["Mixed Ops", "Puzzles"] },
];

export default function GamePicker({ onSelect }: { onSelect: (id: MathGameId) => void }) {
  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-quest-ink">Choose a game to play</h2>
      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {GAMES.map((g) => {
          const t = toneClasses(g.tone);
          return (
            <button key={g.id} type="button" onClick={() => onSelect(g.id)} className="text-left">
              <div
                className={`flex h-full flex-col gap-3 rounded-chunk-lg border-(length:--outline-chunk-thick) ${t.border} bg-quest-paper p-6 shadow-chunk transition-transform hover:-translate-y-1 active:translate-y-[2px]`}
              >
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-full border-b-[3px] text-3xl ${t.bg} ${t.border}`}
                  aria-hidden="true"
                >
                  {g.emoji}
                </span>
                <h3 className="font-display text-xl font-bold text-quest-ink">{g.title}</h3>
                <p className="text-sm font-medium text-quest-ink-soft">{g.desc}</p>
                <div className="mt-auto flex gap-2">
                  <ConceptChip tone={g.tone} label={g.tags[0]} />
                  <ConceptChip tone={g.tone} label={g.tags[1]} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
