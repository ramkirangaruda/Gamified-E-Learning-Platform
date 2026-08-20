import { useState } from "react";
import Pet from "./Pet";
import { characterById } from "./characters";
import { usePet } from "./PetProvider";
import { ChunkyButton } from "../ui/Chunky";

// A welcome overlay shown every time the app is freshly opened -- explicit product
// direction (a child re-launching the game later should see it again, not just once
// ever). Gated by sessionStorage, not localStorage: sessionStorage clears when the
// tab/browser closes, which is what "opened the app" actually means for a
// locally-launched binary, while still NOT re-showing on every internal navigation back
// to the home screen within the same sitting (HomePage remounts on every visit; the
// flag survives that because it lives in the browser session, not this component's own
// state).
//
// No backdrop blur, on purpose -- the same feedback that reshaped ChemLabPage's panels
// applies here too: a blurred background reads as visibility interference, not polish.
// A plain dark tint behind the card is enough to focus attention without hiding the
// meadow scene the child is about to land on.

const STORAGE_KEY = "tessera-quest:welcomed-this-session";

function alreadyWelcomed(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // private mode / storage disabled -- show it every time rather than break
  }
}

function markWelcomed() {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore -- the overlay just reappears next load, not a crash */
  }
}

export default function WelcomeIntro() {
  const { state } = usePet();
  const [dismissed, setDismissed] = useState(alreadyWelcomed);

  if (dismissed) return null;

  const petName = state?.pet.name?.trim() || characterById(state?.pet.species).displayName;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-quest-ink/55 p-4">
      <div className="quest-decorative quest-bubble-in flex max-w-2xl flex-col items-center gap-5 rounded-chunk-xl border-[var(--outline-chunk-thick)] border-quest-gold bg-quest-paper px-8 py-10 text-center shadow-chunk-lg">
        <h1 className="font-display text-4xl font-bold text-quest-ink sm:text-5xl">Welcome to Tessera Quest!</h1>
        <p className="max-w-lg text-xl font-medium text-quest-ink-soft">
          A place to learn STEM and coding with interactive games.
        </p>

        <Pet state="celebrating" species={state?.pet.species} evolutionStage={state?.pet.evolution_stage ?? 0} size={200} inventory={state?.inventory} />

        <p className="font-display text-2xl font-bold text-quest-ink">
          Meet {petName}, your companion for the whole journey!
        </p>

        <div className="grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-3">
          <div className="flex flex-col items-center gap-2 rounded-chunk-lg border-2 border-quest-move-dark bg-quest-move/15 p-4 text-center">
            <span className="text-4xl" aria-hidden="true">🎮</span>
            <span className="font-display text-sm font-bold text-quest-ink">Clear levels to earn points</span>
          </div>
          <div className="flex flex-col items-center gap-2 rounded-chunk-lg border-2 border-quest-coral-dark bg-quest-coral/15 p-4 text-center">
            <span className="text-4xl" aria-hidden="true">🍎</span>
            <span className="font-display text-sm font-bold text-quest-ink">Feed {petName} to keep it happy</span>
          </div>
          <div className="flex flex-col items-center gap-2 rounded-chunk-lg border-2 border-quest-gold-dark bg-quest-gold/20 p-4 text-center">
            <span className="text-4xl" aria-hidden="true">👕</span>
            <span className="font-display text-sm font-bold text-quest-ink">Buy clothes with the points you earn</span>
          </div>
        </div>

        <ChunkyButton
          tone="gold"
          size="lg"
          className="text-2xl"
          onClick={() => {
            markWelcomed();
            setDismissed(true);
          }}
        >
          Let's go!
        </ChunkyButton>
      </div>
    </div>
  );
}
