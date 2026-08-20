import BackgroundScene from "./BackgroundScene";
import Icon from "./icons/Icon";
import Pet from "./pet/Pet";
import { characterById } from "./pet/characters";
import { usePet } from "./pet/PetProvider";
import { mascotStateToLegacyMood } from "./mascot/state";
import { SUBJECTS, type Subject } from "./subjects";
import type { Route } from "./routes";
import { StarRow } from "./ui/Chunky";
import { toneClasses } from "./ui/tone";

// The home screen, rebuilt around the dashboard redesign: a hero panel that says where
// you are and gives you one obvious thing to press, then the subject cards.
//
// What moved OUT of this file, and where to:
//   * the trail / all-levels toggle -> SubjectPage.tsx (it belongs to a subject, not to
//     the app's front door)
//   * the row of nav buttons        -> nav/AppHeader.tsx
//   * the classroom modal           -> a route of its own (ClassroomPage)
// What stayed: BackgroundScene, and the deterministic "<pet> suggests" recommendation --
// which is now the hero's speech bubble and the target of its primary button, rather than
// a separate callout strip competing with the trail for attention.
//
// Levels, points, hunger and solved state still come from PetProvider rather than being
// fetched here -- see PetProvider for why that single source matters.

interface HomePageProps {
  onNavigate: (route: Route) => void;
}

/** Everything the card for one subject needs, derived rather than stored. Unavailable
 *  subjects deliberately carry no counts at all: subjects.ts explains why nothing on this
 *  screen may imply progress that does not exist. */
interface CardData {
  subject: Subject;
  solved: number;
  total: number;
}

function SubjectCard({ card, onOpen }: { card: CardData; onOpen: () => void }) {
  const { subject, solved, total } = card;
  const t = toneClasses(subject.tone);
  const done = total > 0 && solved === total;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={
        subject.available ? `${subject.title}: ${solved} of ${total} levels done` : `${subject.title}, coming soon`
      }
      className={`flex flex-col gap-2 rounded-chunk-lg border-(length:--outline-chunk-thick) p-4 text-left shadow-chunk transition-transform duration-100
        hover:-translate-y-1 active:translate-y-[3px] active:shadow-chunk-sm
        ${subject.available ? `${t.border} bg-quest-paper` : "border-quest-locked bg-quest-paper/85 backdrop-blur-sm"}`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-full border-b-[3px] font-display text-lg font-bold shadow-chunk-sm
            ${subject.available ? `${t.bg} ${t.border} ${t.text}` : "border-quest-locked-deep bg-quest-locked text-white/80"}`}
          aria-hidden="true"
        >
          {subject.letter}
        </span>
        {!subject.available && (
          <span className="text-quest-locked-deep" aria-hidden="true">
            <Icon name="lock" size={20} />
          </span>
        )}
      </div>

      <span className={`font-display text-xl font-bold ${subject.available ? "text-quest-ink" : "text-quest-ink/45"}`}>
        {subject.title}
      </span>
      <p className={`text-sm ${subject.available ? "text-quest-ink-soft" : "text-quest-ink/40"}`}>{subject.desc}</p>

      {subject.available ? (
        <>
          {/* Three stars, in the same vocabulary every level already uses, so the card
              reads in units a child has already learned: one per third of the subject. */}
          <StarRow earned={Math.floor((solved / Math.max(1, total)) * 3)} size={16} />
          <div
            className="h-3 overflow-hidden rounded-full border-2 border-quest-ink/15 bg-quest-cream"
            role="progressbar"
            aria-valuenow={solved}
            aria-valuemin={0}
            aria-valuemax={total}
          >
            {/* scaleX, not width: transform-only, so it can never reflow the card. */}
            <div
              className={`h-full origin-left rounded-full transition-transform duration-500 ease-out ${t.bg}`}
              style={{ transform: `scaleX(${total > 0 ? solved / total : 0})` }}
            />
          </div>
          <span className="font-display text-xs font-bold text-quest-ink-soft">
            {solved} of {total} done{done ? " — all finished!" : ""}
          </span>
        </>
      ) : (
        // No bar, no stars, no "0 of 0" -- an empty meter reads as "you have done none of
        // this", which would be untrue of a subject that does not exist yet.
        <span className="mt-auto inline-flex w-fit items-center rounded-chunk-sm border-2 border-quest-locked bg-quest-locked/25 px-2.5 py-1 font-display text-[11px] font-bold text-quest-ink-soft">
          Coming soon
        </span>
      )}
    </button>
  );
}

export default function HomePage({ onNavigate }: HomePageProps) {
  const { state, levels, error, suggestion, mood } = usePet();

  // Whatever the child actually named their pet, falling back to the chosen character's
  // display name and finally to the roster default.
  const petName = state?.pet.name?.trim() || characterById(state?.pet.species).displayName;

  const solvedIds = state?.solved_levels ?? [];
  const solvedCount = solvedIds.length;

  const cards: CardData[] = SUBJECTS.map((subject) => {
    // Only Coding has levels today; every other subject is deliberately empty, which is
    // exactly what makes its card render "coming soon" instead of an empty meter.
    const subjectLevels = subject.available ? levels : [];
    return {
      subject,
      total: subjectLevels.length,
      solved: subjectLevels.filter((l) => solvedIds.includes(l.id)).length,
    };
  });

  // One obvious thing to press. The deterministic recommendation (internal/api's
  // suggestion.go, never the model's call) decides WHICH level; if it hasn't loaded or
  // hasn't named one, fall back to the subject page rather than leaving a dead button.
  const ctaLabel = solvedCount === 0 ? "Start playing" : "Keep playing";
  const onCta = () =>
    suggestion?.level_id
      ? onNavigate({ name: "play", levelId: suggestion.level_id })
      : onNavigate({ name: "subject", subjectId: "coding" });

  return (
    <div className="relative min-h-[calc(100vh-var(--app-header-h))] w-full overflow-x-clip">
      <BackgroundScene solvedCount={solvedCount} />

      <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-6">
        <section className="relative mb-8 overflow-hidden rounded-chunk-xl border-(length:--outline-chunk-thick) border-white bg-quest-paper/85 px-6 py-7 shadow-chunk-lg backdrop-blur-sm">
          {/* Decorative discs, echoing the wireframe's confetti corners. Static shapes,
              not motion, so they cost a Pi nothing. */}
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-quest-gold/45" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-14 right-28 h-24 w-24 rounded-full bg-quest-coral/30" aria-hidden="true" />

          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="min-w-[16rem] max-w-lg flex-1">
              <h1 className="font-display text-4xl font-bold text-quest-ink">Hey there!</h1>
              <p className="mt-1 text-lg font-medium text-quest-ink-soft">
                {solvedCount === 0
                  ? "Let's start your first level!"
                  : `${solvedCount} of ${levels.length} levels done — nice work.`}
              </p>

              <button
                type="button"
                onClick={onCta}
                className="mt-5 inline-flex min-h-tap-lg items-center gap-2 rounded-chunk border-b-(length:--outline-chunk-thick) border-quest-gold-dark bg-quest-gold px-7 font-display text-xl font-bold text-quest-ink shadow-chunk transition-transform duration-100 hover:-translate-y-0.5 active:translate-y-[3px] active:shadow-chunk-sm"
              >
                <Icon name="play" size={22} />
                {ctaLabel}
              </button>
            </div>

            {/* The pet, saying the real suggestion. A second <Pet> is safe: it is purely
                presentational (Trail already renders several at its evolution markers),
                and its one looping animation is a stepped transform on an HTML wrapper --
                the shape this codebase measured at ~0 CPU. See index.css's IDLE LIFE. */}
            <div className="flex items-end gap-3">
              <div className="quest-decorative quest-bubble-in relative max-w-[15rem] rounded-chunk-lg border-[3px] border-quest-gold bg-quest-cream px-4 py-3 shadow-chunk-sm">
                <p className="font-display text-sm font-bold text-quest-ink">
                  {suggestion?.message ?? `Hi! I'm ${petName}. Let's learn something fun!`}
                </p>
                <div
                  className="absolute -bottom-[9px] right-7 h-4 w-4 rotate-45 border-b-[3px] border-r-[3px] border-quest-gold bg-quest-cream"
                  aria-hidden="true"
                />
              </div>

              <div className="text-center">
                <Pet
                  mood={mascotStateToLegacyMood(mood)}
                  species={state?.pet.species}
                  evolutionStage={state?.pet.evolution_stage ?? 0}
                  size={96}
                />
                <div className="font-display text-base font-bold text-quest-ink">{petName}</div>
              </div>
            </div>
          </div>
        </section>

        {error === "levels" && (
          <p className="mb-6 font-medium text-quest-coral-dark">
            I couldn't find the levels just now. Try starting Tessera Quest again.
          </p>
        )}

        <h2 className="mb-4 font-display text-2xl font-bold text-quest-ink">Pick a subject to explore!</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <SubjectCard
              key={card.subject.id}
              card={card}
              onOpen={() => onNavigate({ name: "subject", subjectId: card.subject.id })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
