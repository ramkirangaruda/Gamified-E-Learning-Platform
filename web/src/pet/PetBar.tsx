import Icon from "../icons/Icon";
import Pet from "./Pet";
import SpeechBubble from "./SpeechBubble";
import PetShop from "./PetShop";
import { StarRow } from "../ui/Chunky";
import { usePet } from "./PetProvider";
import { WEARABLES, purchaseBlocker } from "./items";

// The sprite character (pet/Pet.tsx) is the mascot, and the MascotState it is handed is
// the same value the state machine resolved -- no translation in between. There used to be
// a parked Rive canvas here and a mascotStateToLegacyMood() call squashing 14 states down
// to the 8 the old renderer understood; both are gone (see DECISIONS.md).

// The companion row: the pet, its hunger meter, points, and the current level's stars.
//
// This is the LOWER of the two rows inside nav/AppHeader.tsx, which owns the fixed
// positioning both rows share. It used to be the fixed header itself; the redesign put a
// navigation row above it, and the one thing that could not change in the move is that it
// is still mounted exactly ONCE by App, above the page switch, so it never unmounts --
// see PetProvider for why that matters. Everything here is unchanged apart from no longer
// positioning itself.
//
// Layout is deliberately fixed-height (--app-header-pet-h) and the pages below pad past
// the header total (--app-header-h). The speech bubble is absolutely positioned and
// OVERLAYS the page rather than participating in the row's layout: a bubble that pushed
// content would reflow the whole screen every time Tom said something, which on a Pi is
// both janky and disorienting for a child mid-drag.

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
      <div className="relative h-6 w-32 overflow-hidden rounded-chunk-sm border-(length:--outline-chunk) border-quest-ink/25 bg-quest-cream sm:w-40">
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

  // Closes the earn-and-spend loop. Without this a child only finds out they can finally
  // afford the hat they have been saving for by opening the shop and checking, which is
  // exactly the moment worth telling them about. Deliberately only for WEARABLES: treats
  // are affordable almost always, so a dot that is permanently lit says nothing.
  //
  // It is a quiet gold dot, not a count or a "NEW!" -- the same restraint as the hunger
  // badge beside it. Nothing is lost by ignoring it and it never nags (§10).
  const canBuySomething = WEARABLES.some(
    (item) => purchaseBlocker(item, points, state?.inventory ?? [], solved.length) === null,
  );

  return (
    <>
      <div className="h-[var(--app-header-pet-h)] border-t-2 border-quest-ink/10" data-testid="pet-bar">
        <div className="relative mx-auto flex h-full max-w-6xl items-center gap-4 px-4">
          {/* The pet itself is the shop button. A child does not look for a "shop" label --
              they click the animal. Sized and laid out as an inline row item (not a
              corner mascot) to keep the header compact. */}
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
            aria-label={`${petName} — open the shop`}
            title={`Treats and things to wear for ${petName}`}
            className="relative -my-2 shrink-0 rounded-chunk transition-transform duration-100 hover:-translate-y-0.5 active:translate-y-[2px]"
          >
            <Pet
              state={mood}
              name={petName}
              species={petSpecies}
              evolutionStage={state?.pet.evolution_stage ?? 0}
              size={84}
              feedTick={feedTick}
              inventory={state?.inventory}
            />
            {hunger < 25 && (
              <span className="absolute -right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-quest-coral font-display text-[11px] font-bold text-white">
                !
              </span>
            )}
            {canBuySomething && (
              <span
                className="absolute -left-1 top-1 h-4 w-4 rounded-full border-2 border-white bg-quest-gold"
                title="There's something new you can afford"
              />
            )}
          </button>

          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="font-display text-base font-bold leading-none text-quest-ink">{petName}</span>
            <HungerBar hunger={hunger} />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-chunk border-(length:--outline-chunk) border-quest-gold-dark bg-quest-gold px-3 py-1.5 font-display text-lg font-bold text-quest-ink">
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
            <div className="pointer-events-none absolute left-0 top-full z-50 mt-2">
              <SpeechBubble text={speech} tail="up" />
            </div>
          )}
        </div>
      </div>

      {shopOpen && <PetShop onClose={() => setShopOpen(false)} />}
    </>
  );
}
