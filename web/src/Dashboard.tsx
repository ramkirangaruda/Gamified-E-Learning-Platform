import { useEffect, useState } from "react";
import AnimalMascot, { type AnimalKind } from "./animals/AnimalMascot";
import BackgroundScene from "./BackgroundScene";
import { fetchLevels, fetchState, type GameState, type LevelDef } from "./api";

// The landing screen (queue: "a dashboard with animal cartoon themes and different
// sections to practice from"). One section per taught concept, one animal mascot per
// section -- browsing by character rather than by a bare topic list, matching the
// reference (sesamestreet.org/games) this frontend was restyled after.
//
// Sections are derived from levels' own `teaches` field rather than a separate content
// file: content/levels/*.json already carries this, and duplicating it into a second
// schema the two could drift out of sync is exactly the kind of thing this project
// avoids elsewhere (see DECISIONS.md's AST-is-the-only-contract discipline).

interface SectionMeta {
  teaches: string;
  title: string;
  blurb: string;
  animal: AnimalKind;
  bg: string;
  border: string;
}

const SECTIONS: SectionMeta[] = [
  { teaches: "move", title: "Move it, Monkey!", blurb: "Move and turn to get where you're going", animal: "monkey", bg: "bg-quest-sun", border: "border-quest-sun-dark" },
  { teaches: "repeat", title: "Loopy Land", blurb: "Repeat a pattern instead of placing it by hand", animal: "rabbit", bg: "bg-quest-coral", border: "border-quest-coral-dark" },
  { teaches: "if_wall_ahead", title: "Decision Den", blurb: "Check the wall and decide what to do", animal: "owl", bg: "bg-quest-grape", border: "border-quest-grape-dark" },
  { teaches: "while", title: "While Woods", blurb: "Keep going until you actually get there", animal: "turtle", bg: "bg-quest-grass", border: "border-quest-grass-dark" },
];

interface DashboardProps {
  onSelectLevel: (levelId: string) => void;
}

export default function Dashboard({ onSelectLevel }: DashboardProps) {
  const [levels, setLevels] = useState<LevelDef[]>([]);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLevels().then(setLevels).catch((e) => setError(String(e)));
    fetchState().then(setState).catch(() => setState(null));
  }, []);

  const levelsFor = (teaches: string) => levels.filter((l) => l.teaches === teaches);

  return (
    <div className="relative min-h-screen w-screen overflow-hidden p-8">
      <BackgroundScene />
      <div className="relative mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between rounded-3xl bg-white/60 px-6 py-4 shadow-sm backdrop-blur-sm">
          <div>
            <h1 className="font-display text-4xl font-bold text-quest-ink drop-shadow-sm">Tessera Quest</h1>
            <p className="mt-1 font-medium text-quest-ink/70">Pick a friend, pick a level, and start coding!</p>
          </div>
          {state && (
            <div className="rounded-2xl bg-white/90 px-4 py-2 font-display text-sm font-bold text-quest-ink shadow-sm">
              ⭐ {state.learner.points} pts · 🏆 {state.solved_levels.length} solved
            </div>
          )}
        </div>

        {error && <p className="mb-4 font-medium text-quest-coral-dark">{error}</p>}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {SECTIONS.map((section) => {
            const sectionLevels = levelsFor(section.teaches);
            return (
              <div
                key={section.teaches}
                className={`flex flex-col gap-4 rounded-3xl border-4 ${section.border} ${section.bg} p-5 shadow-xl`}
              >
                <div className="flex items-center gap-4">
                  <div className="rounded-full bg-white/90 p-1 shadow-md">
                    <AnimalMascot kind={section.animal} size={64} />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-bold text-white drop-shadow">{section.title}</h2>
                    <p className="text-sm font-medium text-white/90">{section.blurb}</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  {sectionLevels.length === 0 && (
                    <p className="font-medium text-white/80">Loading…</p>
                  )}
                  {sectionLevels.map((level, i) => {
                    const solved = !!state && state.solved_levels.includes(level.id);
                    return (
                      <button
                        key={level.id}
                        type="button"
                        onClick={() => onSelectLevel(level.id)}
                        className="flex-1 rounded-2xl border-b-4 border-quest-ink/10 bg-white px-3 py-3 text-left shadow-md transition-transform hover:-translate-y-0.5"
                      >
                        <div className="flex items-center justify-between font-display text-sm font-bold text-quest-ink">
                          <span>{i + 1}. {level.name}</span>
                          {solved && <span title="Solved before">✅</span>}
                        </div>
                        <div className="mt-0.5 text-xs font-medium text-quest-ink/50">
                          {level.hard ? "Extra tricky" : "Just right"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
