import { useEffect, useState } from "react";
import AnimalMascot, { type AnimalKind } from "./animals/AnimalMascot";
import BackgroundScene from "./BackgroundScene";
import Icon from "./icons/Icon";
import { fetchLevels, fetchState, type GameState, type LevelDef } from "./api";
import { friendlyError } from "./friendlyError";

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
    fetchLevels().then(setLevels).catch((e) => setError(friendlyError("levels", e)));
    fetchState().then(setState).catch(() => setState(null));
  }, []);

  const levelsFor = (teaches: string) => levels.filter((l) => l.teaches === teaches);

  return (
    <div className="relative min-h-screen w-screen overflow-hidden p-8">
      <BackgroundScene />
      <div className="relative mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between rounded-3xl bg-white/70 px-6 py-4 shadow-lg backdrop-blur-sm">
          <div>
            <h1 className="font-display text-4xl font-bold text-quest-ink drop-shadow-sm">Tessera Quest</h1>
            <p className="mt-1 font-medium text-quest-ink/70">Pick a friend, pick a level, and start coding!</p>
          </div>
          {state && (
            <div className="flex items-center gap-4 rounded-2xl bg-quest-ink px-5 py-2.5 font-display text-sm font-bold text-white shadow-md">
              <span className="flex items-center gap-1.5">
                <Icon name="star" />
                {state.learner.points}
              </span>
              <span className="h-4 w-px bg-white/20" />
              <span className="flex items-center gap-1.5">
                <Icon name="trophy" />
                {state.solved_levels.length} solved
              </span>
            </div>
          )}
        </div>

        {error && <p className="mb-4 font-medium text-quest-coral-dark">{error}</p>}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {SECTIONS.map((section) => {
            const sectionLevels = levelsFor(section.teaches);
            const sectionSolvedCount = sectionLevels.filter((l) => state?.solved_levels.includes(l.id)).length;
            return (
              <div
                key={section.teaches}
                className={`relative flex flex-col gap-4 overflow-hidden rounded-3xl border-4 ${section.border} ${section.bg} p-5 shadow-xl transition-transform hover:-translate-y-1`}
              >
                {/* Decorative corner texture -- a soft oversized circle bleeding off the
                    card edge, purely to break up the flat color fill; same discipline as
                    the mascots/background, hand-drawn shapes, nothing sourced. */}
                <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
                <div className="pointer-events-none absolute -bottom-12 -left-6 h-28 w-28 rounded-full bg-white/10" />

                <div className="relative flex items-center gap-4">
                  <div className="rounded-full bg-white p-1.5 shadow-md ring-4 ring-white/40">
                    <AnimalMascot kind={section.animal} size={64} />
                  </div>
                  <div className="flex-1">
                    <h2 className="font-display text-xl font-bold text-white drop-shadow">{section.title}</h2>
                    <p className="text-sm font-medium text-white/90">{section.blurb}</p>
                  </div>
                  {sectionLevels.length > 0 && (
                    <div className="flex items-center gap-1 rounded-full bg-white/25 px-2.5 py-1 font-display text-xs font-bold text-white">
                      <Icon name="trophy" size={14} />
                      {sectionSolvedCount}/{sectionLevels.length}
                    </div>
                  )}
                </div>

                <div className="relative flex gap-3">
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
                        className="group flex-1 rounded-2xl border-b-4 border-quest-ink/10 bg-white px-3 py-3 text-left shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:border-b-2"
                      >
                        <div className="flex items-center justify-between font-display text-sm font-bold text-quest-ink">
                          <span>{i + 1}. {level.name}</span>
                          {solved && <Icon name="check" size={16} />}
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                          {Array.from({ length: level.hard ? 3 : 1 }, (_, s) => (
                            <Icon key={s} name="star" size={11} />
                          ))}
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
