import { useState } from "react";
import BackgroundScene from "./BackgroundScene";
import Icon from "./icons/Icon";
import Pet from "./pet/Pet";
import { usePet } from "./pet/PetProvider";
import { subjectById } from "./subjects";
import type { Route } from "./routes";
import LevelGrid from "./trail/LevelGrid";
import Trail from "./trail/Trail";
import { ChunkyButton } from "./ui/Chunky";
import { toneClasses } from "./ui/tone";

// A subject's own page -- the middle floor of the redesigned IA, between the home screen's
// subject cards and an individual level.
//
// This is where the two views that used to live on the home screen now sit: the trail
// ("where am I, what's next", primary) and the level grid ("where was that one about
// loops", secondary). Neither component changed; they were lifted here verbatim, which is
// the point -- the redesign is an information-architecture change, not a rewrite of the
// things that already worked.
//
// For a subject with no content yet (subjects.ts: everything except Coding), the same
// page renders an honest "coming soon" panel instead. It is a real page rather than a
// disabled tab because a click that appears to do nothing reads as broken to a child.

type View = "trail" | "grid";

interface SubjectPageProps {
  subjectId: string;
  onNavigate: (route: Route) => void;
}

export default function SubjectPage({ subjectId, onNavigate }: SubjectPageProps) {
  const { state, levels, error } = usePet();
  const [view, setView] = useState<View>("trail");

  const subject = subjectById(subjectId);
  const t = toneClasses(subject.tone);

  const solvedIds = state?.solved_levels ?? [];
  // handoff/04-stars.md: real, server-computed per-level star counts, persisted in
  // level_progress.stars.
  const starsByLevel: Record<string, number> = state?.stars_by_level ?? {};
  const solvedCount = solvedIds.length;

  const header = (
    <header className="relative mx-auto max-w-6xl px-6 pt-6">
      <div className="flex flex-wrap items-center gap-4 rounded-chunk-lg border-(length:--outline-chunk) border-white bg-quest-paper/80 px-6 py-4 shadow-chunk backdrop-blur-sm">
        <span
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-b-[3px] font-display text-xl font-bold shadow-chunk-sm
            ${subject.available ? `${t.bg} ${t.border} ${t.text}` : "border-quest-locked-deep bg-quest-locked text-white/80"}`}
          aria-hidden="true"
        >
          {subject.letter}
        </span>

        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-bold text-quest-ink">{subject.title}</h1>
          <p className="font-medium text-quest-ink-soft">{subject.desc}</p>
        </div>

        {subject.available && (
          <span className={`rounded-chunk-sm border-2 ${t.border} ${t.soft} px-3 py-1.5 font-display text-sm font-bold ${t.ink}`}>
            {solvedCount} of {levels.length} done
          </span>
        )}
      </div>
    </header>
  );

  // ---- A subject with no content yet ------------------------------------
  if (!subject.available) {
    return (
      <div className="relative min-h-[calc(100vh-var(--app-header-h))] w-full overflow-x-clip">
        <BackgroundScene solvedCount={solvedCount} />
        {header}

        <div className="relative mx-auto mt-8 max-w-3xl px-6 pb-24">
          <div className="flex flex-col items-center gap-4 rounded-chunk-xl border-(length:--outline-chunk-thick) border-quest-locked bg-quest-paper/85 px-6 py-10 text-center shadow-chunk backdrop-blur-sm">
            <Pet state="playful" species={state?.pet.species} size={96} inventory={state?.inventory} />
            <h2 className="font-display text-2xl font-bold text-quest-ink">
              {subject.title} isn't ready yet
            </h2>
            {/* Deliberately warm and blame-free, and deliberately specific about what a
                child CAN do right now -- §10's "never a dead end" applied to a subject
                rather than to a level. */}
            <p className="max-w-md font-medium text-quest-ink-soft">
              We're still building this one. Coding is ready and waiting though — there's
              plenty to explore in there.
            </p>
            <ChunkyButton tone="gold" onClick={() => onNavigate({ name: "subject", subjectId: "coding" })}>
              <Icon name="play" size={20} />
              Go to Coding
            </ChunkyButton>
          </div>
        </div>
      </div>
    );
  }

  // ---- The real thing ----------------------------------------------------
  return (
    <div className="relative min-h-[calc(100vh-var(--app-header-h))] w-full overflow-x-clip">
      <BackgroundScene solvedCount={solvedCount} />
      {header}

      <div className="relative mx-auto mt-4 max-w-6xl px-6">
        <div className="flex flex-wrap gap-2">
          <ChunkyButton tone={view === "trail" ? "gold" : "neutral"} onClick={() => setView("trail")}>
            My path
          </ChunkyButton>
          <ChunkyButton tone={view === "grid" ? "gold" : "neutral"} onClick={() => setView("grid")}>
            All levels
          </ChunkyButton>
          <ChunkyButton
            tone="neutral"
            title="Fiddle with cards, no goal, just see what happens"
            onClick={() => onNavigate({ name: "sandbox" })}
          >
            Sandbox
          </ChunkyButton>
        </div>

        {error === "levels" && (
          <p className="mt-4 font-medium text-quest-coral-dark">
            I couldn't find the levels just now. Try starting Tessera Quest again.
          </p>
        )}
      </div>

      <main className="relative mt-6">
        {levels.length === 0 && !error && (
          <p className="px-6 text-center font-medium text-quest-ink-soft">Loading your levels…</p>
        )}
        {levels.length > 0 &&
          (view === "trail" ? (
            <Trail
              levels={levels}
              solvedIds={solvedIds}
              starsByLevel={starsByLevel}
              onSelectLevel={(levelId) => onNavigate({ name: "play", levelId })}
              petStage={state?.pet.evolution_stage ?? 0}
              petName={state?.pet.name}
              petSpecies={state?.pet.species}
            />
          ) : (
            <LevelGrid
              levels={levels}
              solvedIds={solvedIds}
              starsByLevel={starsByLevel}
              onSelectLevel={(levelId) => onNavigate({ name: "play", levelId })}
            />
          ))}
      </main>
    </div>
  );
}
