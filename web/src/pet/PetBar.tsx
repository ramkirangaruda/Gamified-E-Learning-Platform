import Icon from "../icons/Icon";
import Pet from "./Pet";
import { mascotStateToLegacyMood } from "../mascot/state";
import SpeechBubble from "./SpeechBubble";
import TreatShop from "./TreatShop";
import { StarRow } from "../ui/Chunky";
import { usePet } from "./PetProvider";

// The Rive mascot (mascot/MascotCanvas.tsx) is built and working -- self-hosted offline,
// full 14-state event wiring, world decorations -- but visually parked here pending a
// design review: the raw Rive canvas render didn't read as polished/kiddish enough yet
// (see DECISIONS.md). This file goes back to rendering the original hand-drawn Pet.tsx
// SVG as the primary mascot, translating the wider MascotState vocabulary down to it via
// mascotStateToLegacyMood so every event (hover, correct/incorrect, streaks, clicks, ...)
// still visibly reacts through the old character. Nothing about the mascot/ event system,
// Rive plumbing, or tests was removed -- swapping MascotCanvas back in here is a one-line
// change once the visual is approved.

// The fixed companion bar. Mounted once by App, above the page switch, so it never
// unmounts -- see PetProvider for why that matters.
//
// Layout is deliberately fixed-height (--pet-bar-h, 92px) and the pages below simply pad
// past it. The speech bubble is absolutely positioned and OVERLAYS the page rather than
// participating in the bar's layout: a bubble that pushed content would reflow the whole
// screen every time Tom said something, which on a Pi is both janky and disorienting for
// a child mid-drag.

function hungerWord(hunger: number): string {
  if (hunger >= 85) return "completely full";
  if (hunger >= 60) return "nicely fed";
  if (hunger >= 40) return "peckish";
  if (hunger >= 25) return "quite hungry";
  return "very hungry";
}

/** Hunger as a chunky segmented meter. Never shown as a number -- a bar a child can read
 *  at a glance is the point, and "73" means nothing to an eight-year-old. */
function HungerBar({ hunger }: { hunger: number }) {
  const pct = Math.max(0, Math.min(100, hunger));
  const low = pct < 25;
  return (
    <div
      className="flex items-center gap-2"
      role="meter"
      aria-label="Tom's tummy"
      aria-valuetext={hungerWord(pct)}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <Icon name="apple" size={20} />
      <div className="relative h-6 w-32 overflow-hidden rounded-chunk-sm border-[var(--outline-chunk)] border-quest-ink/25 bg-quest-cream sm:w-40">
        {/* scaleX rather than width: transform-only, so filling up after a feed is
            composited and cannot reflow the bar or anything beside it. */}
        <div
          className={`absolute inset-0 origin-left rounded-chunk-sm transition-transform duration-500 ease-out ${
            low ? "bg-quest-coral" : "bg-quest-cond"
          }`}
          style={{ transform: `scaleX(${pct / 100})` }}
        />
        {/* Notches, purely so the bar reads as a meter rather than a progress bar. */}
        <div className="absolute inset-0 flex">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-full flex-1 border-r-2 border-quest-ink/10 last:border-r-0" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PetBar() {
  const { state, mood, speech, feedTick, activeLevel, levels, shopOpen, setShopOpen, mascotClicked } = usePet();

  const points = state?.learner.points ?? 0;
  const hunger = state?.pet.hunger ?? 50;
  const petName = state?.pet.name ?? "Tom";
  const petSpecies = state?.pet.species ?? "tom-lizard";
  const solved = state?.solved_levels ?? [];
  const levelNumber = activeLevel ? levels.findIndex((l) => l.id === activeLevel.id) + 1 : null;
  // handoff/04-stars.md: real per-level star count instead of a hardcoded solved-or-not.
  const stars = activeLevel ? (state?.stars_by_level?.[activeLevel.id] ?? 0) : 0;

  return (
    <>
      <header
        className="fixed inset-x-0 top-0 z-40 h-[var(--pet-bar-h)] border-b-[var(--outline-chunk-thick)] border-quest-ink/15 bg-quest-paper/95 backdrop-blur-sm"
        data-testid="pet-bar"
      >
        <div className="relative mx-auto flex h-full max-w-6xl items-center gap-4 px-4">
          {/* The pet itself is the shop button (item 5). A child does not look for a
              "shop" label -- they click the animal. */}
          <button
            type="button"
            onClick={() => {
              // A tap on Tom is both "open the shop" (existing behavior) and a direct
              // mascot click -- the brief's "make it feel like a pet" click interaction.
              // The two don't conflict: the reaction plays immediately, the shop opens
              // over it a beat later.
              mascotClicked();
              setShopOpen(true);
            }}
            aria-label={`${petName} — open treats`}
            title="Give Tom a treat"
            className="relative -my-2 shrink-0 rounded-chunk transition-transform duration-100 hover:-translate-y-0.5 active:translate-y-[2px]"
          >
            <Pet
              mood={mascotStateToLegacyMood(mood)}
              name={petName}
              species={petSpecies}
              evolutionStage={state?.pet.evolution_stage ?? 0}
              size={84}
              feedTick={feedTick}
            />
            {hunger < 25 && (
              <span className="absolute -right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-quest-coral font-display text-[11px] font-bold text-white">
                !
              </span>
            )}
          </button>

          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="font-display text-base font-bold leading-none text-quest-ink">{petName}</span>
            <HungerBar hunger={hunger} />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-chunk border-[var(--outline-chunk)] border-quest-gold-dark bg-quest-gold px-3 py-1.5 font-display text-lg font-bold text-quest-ink">
              <Icon name="star" size={18} />
              {/* Re-keyed so a change replays the one-shot bump. No timer. */}
              <span key={points} className="quest-decorative quest-count-bump">
                {points}
              </span>
            </span>

            <div className="hidden flex-col items-end sm:flex">
              <span className="font-display text-sm font-bold text-quest-ink">
                {levelNumber ? `Level ${levelNumber}` : `${solved.length} of ${levels.length || "…"} done`}
              </span>
              {levelNumber ? (
                <StarRow earned={stars} size={14} />
              ) : (
                <span className="text-xs font-semibold text-quest-ink-soft">Pick a level</span>
              )}
            </div>
          </div>

          {/* Anchored to the pet, overlaying whatever is below. pointer-events-none so it
              can never intercept a click meant for the page underneath. */}
          {speech && (
            <div className="pointer-events-none absolute left-20 top-[calc(var(--pet-bar-h)-14px)] z-50 max-w-md">
              <SpeechBubble text={speech} />
            </div>
          )}
        </div>
      </header>

      {shopOpen && <TreatShop onClose={() => setShopOpen(false)} />}
    </>
  );
}
