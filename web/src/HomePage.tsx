import { useEffect, useState } from "react";
import BackgroundScene from "./BackgroundScene";
import Icon from "./icons/Icon";
import Pet from "./pet/Pet";
import LevelGrid from "./trail/LevelGrid";
import Trail from "./trail/Trail";
import { ChunkyButton } from "./ui/Chunky";
import { fetchLevels, fetchState, type GameState, type LevelDef } from "./api";
import { friendlyError } from "./friendlyError";

// The home screen. Trail is primary ("where am I, what's next"); the grid is secondary
// ("where was that one about loops"). Replaces the old four-card Dashboard, which did not
// scale past a handful of levels and had no notion of progress.

type View = "trail" | "grid";

interface HomePageProps {
  onSelectLevel: (levelId: string) => void;
}

export default function HomePage({ onSelectLevel }: HomePageProps) {
  const [levels, setLevels] = useState<LevelDef[]>([]);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("trail");

  useEffect(() => {
    fetchLevels().then(setLevels).catch((e) => setError(friendlyError("levels", e)));
    fetchState().then(setState).catch(() => setState(null));
  }, []);

  const solvedIds = state?.solved_levels ?? [];
  // Stars are not persisted per level yet (the store keeps solved/attempts, not a star
  // count) -- a solved level shows one star until that lands. Deliberately conservative:
  // §10 says progress never moves backwards, so under-reporting is safe where
  // over-reporting would mean taking a star away later.
  const starsByLevel: Record<string, number> = {};
  for (const id of solvedIds) starsByLevel[id] = 1;

  const solvedCount = solvedIds.length;

  return (
    <div className="relative min-h-screen w-screen overflow-x-hidden">
      <BackgroundScene />

      <header className="relative mx-auto mb-6 max-w-5xl px-6 pt-8">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-chunk-lg border-[var(--outline-chunk)] border-white bg-white/75 px-6 py-4 shadow-chunk backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Pet mood={solvedCount > 0 ? "happy" : "idle"} evolutionStage={state?.pet.evolution_stage ?? 0} name="" />
            <div>
              <h1 className="font-display text-3xl font-bold text-quest-ink">Tessera Quest</h1>
              <p className="font-medium text-quest-ink-soft">
                {solvedCount === 0 ? "Let's start your first level!" : `${solvedCount} of ${levels.length} done — nice work.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 rounded-chunk border-[var(--outline-chunk)] border-quest-ink bg-quest-ink px-4 py-2 font-display text-sm font-bold text-white">
              <span className="flex items-center gap-1.5">
                <Icon name="star" />
                {state?.learner.points ?? 0}
              </span>
              <span className="h-4 w-px bg-white/25" />
              <span className="flex items-center gap-1.5">
                <Icon name="trophy" />
                {solvedCount}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <ChunkyButton tone={view === "trail" ? "gold" : "neutral"} onClick={() => setView("trail")}>
            My path
          </ChunkyButton>
          <ChunkyButton tone={view === "grid" ? "gold" : "neutral"} onClick={() => setView("grid")}>
            All levels
          </ChunkyButton>
        </div>

        {error && <p className="mt-4 font-medium text-quest-coral-dark">{error}</p>}
      </header>

      <main className="relative">
        {levels.length === 0 && !error && (
          <p className="px-6 text-center font-medium text-quest-ink-soft">Loading your levels…</p>
        )}
        {levels.length > 0 &&
          (view === "trail" ? (
            <Trail
              levels={levels}
              solvedIds={solvedIds}
              starsByLevel={starsByLevel}
              onSelectLevel={onSelectLevel}
              petStage={state?.pet.evolution_stage ?? 0}
              petName={state?.pet.name}
            />
          ) : (
            <LevelGrid levels={levels} solvedIds={solvedIds} starsByLevel={starsByLevel} onSelectLevel={onSelectLevel} />
          ))}
      </main>
    </div>
  );
}
