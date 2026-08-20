import { useState } from "react";
import BackgroundScene from "./BackgroundScene";
import LevelGrid from "./trail/LevelGrid";
import Trail from "./trail/Trail";
import { ChunkyButton } from "./ui/Chunky";
import ClassroomPanel from "./pet/ClassroomPanel";
import { usePet } from "./pet/PetProvider";

// The home screen. Trail is primary ("where am I, what's next"); the grid is secondary
// ("where was that one about loops").
//
// Levels, points, hunger and solved state all come from PetProvider now rather than being
// fetched here. That removed a duplicated /api/levels + /api/state pair (this page and
// PlayPage each had their own) which could disagree with each other until whichever
// request landed last, and it is what lets the pet bar and the trail agree instantly
// after a solve without either one re-fetching.

type View = "trail" | "grid";

interface HomePageProps {
  onSelectLevel: (levelId: string) => void;
  onOpenSandbox: () => void;
  /** Owned by App, which is what resolves it from the server/session -- see App.tsx. */
  lite: boolean;
  onToggleLite: () => void;
}

export default function HomePage({ onSelectLevel, onOpenSandbox, lite, onToggleLite }: HomePageProps) {
  const { state, levels, error, suggestion } = usePet();
  const [view, setView] = useState<View>("trail");
  const [classroomOpen, setClassroomOpen] = useState(false);

  const solvedIds = state?.solved_levels ?? [];
  // handoff/04-stars.md: real, server-computed per-level star counts, persisted in
  // level_progress.stars. Previously hardcoded to 1 per solved level -- that
  // under-reporting was the deliberate, safe placeholder until this landed.
  const starsByLevel: Record<string, number> = state?.stars_by_level ?? {};

  const solvedCount = solvedIds.length;

  return (
    <div className="relative min-h-[calc(100vh-var(--pet-bar-h))] w-full overflow-x-hidden">
      <BackgroundScene />

      <header className="relative mx-auto mb-6 max-w-5xl px-6 pt-6">
        <div className="rounded-chunk-lg border-[var(--outline-chunk)] border-white bg-white/75 px-6 py-4 shadow-chunk backdrop-blur-sm">
          <h1 className="font-display text-3xl font-bold text-quest-ink">Tessera Quest</h1>
          <p className="font-medium text-quest-ink-soft">
            {solvedCount === 0
              ? "Let's start your first level!"
              : `${solvedCount} of ${levels.length} done — nice work.`}
          </p>
        </div>

        <div className="mt-4 flex gap-2">
          <ChunkyButton tone={view === "trail" ? "gold" : "neutral"} onClick={() => setView("trail")}>
            My path
          </ChunkyButton>
          <ChunkyButton tone={view === "grid" ? "gold" : "neutral"} onClick={() => setView("grid")}>
            All levels
          </ChunkyButton>
          <ChunkyButton tone="neutral" title="Fiddle with cards, no goal, just see what happens" onClick={onOpenSandbox}>
            Sandbox
          </ChunkyButton>
          <ChunkyButton
            tone="neutral"
            title="Sync your progress to a classroom computer, or recover a lost key"
            onClick={() => setClassroomOpen(true)}
          >
            Classroom
          </ChunkyButton>
          <ChunkyButton
            tone="neutral"
            className="ml-auto"
            aria-pressed={lite}
            title="Turn decoration off for slower machines"
            onClick={onToggleLite}
          >
            {lite ? "Calm mode: on" : "Calm mode: off"}
          </ChunkyButton>
        </div>

        {/* "Pip suggests" -- a deterministic recommendation (internal/api/suggestion.go),
            never the model's call. Only rendered once a real suggestion has loaded, and
            silently absent if the fetch failed -- this is a nice-to-have on top of the
            trail, not something worth showing an error state for. */}
        {suggestion && (
          <button
            type="button"
            onClick={() => (suggestion.level_id ? onSelectLevel(suggestion.level_id) : onOpenSandbox())}
            aria-label={`Pip suggests: ${suggestion.message}`}
            className="mt-4 flex w-full items-center gap-3 rounded-chunk-lg border-[var(--outline-chunk)] border-quest-gold bg-quest-gold/15 px-5 py-3 text-left shadow-chunk transition-transform hover:-translate-y-0.5"
          >
            <span className="font-display text-sm font-bold uppercase tracking-wide text-quest-gold-dark">
              Pip suggests
            </span>
            <span className="font-medium text-quest-ink">{suggestion.message}</span>
          </button>
        )}

        {error === "levels" && (
          <p className="mt-4 font-medium text-quest-coral-dark">
            I couldn't find the levels just now. Try starting Tessera Quest again.
          </p>
        )}
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

      {classroomOpen && <ClassroomPanel onClose={() => setClassroomOpen(false)} />}
    </div>
  );
}
