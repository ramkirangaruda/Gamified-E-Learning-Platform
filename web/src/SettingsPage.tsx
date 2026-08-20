import { useState } from "react";
import Pet from "./pet/Pet";
import { ALL_MASCOT_STATES, type MascotState } from "./mascot/state";
import { CHARACTERS, characterById } from "./pet/characters";
import { ChunkyButton, ChunkyCard } from "./ui/Chunky";
import { usePet } from "./pet/PetProvider";

// The settings screen: "choose your pet". Picking a card doesn't save anything by
// itself -- it only changes which character the preview panel below shows, cycling
// through every state that character actually reacts with during real play, each
// labeled with the in-game moment that triggers it. This is also the one screen where a
// per-character clip override (pet/spriteLayout.ts's CHARACTER_CLIPS) is visible side by
// side with the roster default, which is exactly where you want to notice one. Saving is a separate, explicit
// step ("Make this my pet"), so a child can browse the whole roster before committing
// rather than overwriting their current pet on every click.
//
// Species selection reuses the exact same persistence path as everything else pet-
// related: PetProvider.commitState (POST /api/state), which already writes
// pet.species/pet.name verbatim (internal/store.SaveState) -- no new endpoint needed.

const SCENARIO_LABEL: Record<MascotState, string> = {
  idle: "Just relaxing",
  welcome: "You just arrived",
  playful: "Notices you moving a block",
  thinking: "Your program is running",
  happy: "You just got a treat",
  excited: "You got it right",
  encouraging: "A level that isn't unlocked yet",
  celebrating: "You solved a level!",
  streak: "Three solved in a row",
  milestone: "A big total reached",
  pointing: "Nudging you toward the next level",
  confused: "Your program hit a wall",
  hungry: "Getting hungry",
  sleepy: "Nobody's touched anything in a while",
};

interface SettingsPageProps {
  onBack: () => void;
}

export default function SettingsPage({ onBack }: SettingsPageProps) {
  const { state, commitState } = usePet();
  const currentSpecies = state?.pet.species ?? "tom-lizard";
  const [previewId, setPreviewId] = useState(currentSpecies);
  const [saved, setSaved] = useState(false);

  const preview = characterById(previewId);
  const evolutionStage = state?.pet.evolution_stage ?? 0;

  async function choosePet() {
    if (!state) return;
    const newName = previewId === currentSpecies ? state.pet.name : preview.displayName;
    await commitState({
      ...state,
      pet: { ...state.pet, species: previewId, name: newName },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 pb-24 pt-6">
      <div className="mb-6 flex items-center gap-3">
        <ChunkyButton tone="neutral" onClick={onBack}>
          ← Back
        </ChunkyButton>
        <h1 className="font-display text-3xl font-bold text-quest-ink">Choose your pet</h1>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {CHARACTERS.map((c) => {
          const isPreviewed = c.id === previewId;
          const isCurrent = c.id === currentSpecies;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setPreviewId(c.id)}
              aria-pressed={isPreviewed}
              aria-label={`Preview ${c.displayName}${isCurrent ? ", your current pet" : ""}`}
              className={`flex flex-col items-center gap-2 rounded-chunk-lg border-(length:--outline-chunk) p-4 text-center shadow-chunk transition-transform hover:-translate-y-0.5
                ${isPreviewed ? "border-quest-gold-dark bg-quest-gold/20 ring-4 ring-quest-gold/40" : "border-quest-locked bg-white/80"}`}
            >
              <Pet state="idle" species={c.id} size={72} />
              <span className="font-display text-sm font-bold text-quest-ink">{c.displayName}</span>
              {isCurrent && (
                <span className="rounded-chunk-sm border-2 border-quest-cond-dark bg-quest-cond px-2 py-0.5 font-display text-[10px] font-bold text-white">
                  Current pet
                </span>
              )}
            </button>
          );
        })}
      </div>

      <ChunkyCard tone="neutral" className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-quest-ink">{preview.displayName}</h2>
            <p className="font-medium text-quest-ink-soft">{preview.description}</p>
          </div>
          <ChunkyButton tone="gold" onClick={choosePet} disabled={!state}>
            {saved ? "Saved!" : previewId === currentSpecies ? "This is your pet" : "Make this my pet"}
          </ChunkyButton>
        </div>

        {/* Every state this character actually reacts with in real play, each labeled
            with the scenario that triggers it -- not a generic "here's the art" gallery,
            but a preview of how this specific companion behaves as you play. */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {ALL_MASCOT_STATES.map((petState) => (
            <div
              key={petState}
              className="flex flex-col items-center gap-2 rounded-chunk border-2 border-quest-locked bg-quest-cream/60 p-3 text-center"
            >
              <Pet state={petState} species={previewId} evolutionStage={evolutionStage} size={64} inventory={state?.inventory} />
              <span className="text-xs font-semibold text-quest-ink-soft">{SCENARIO_LABEL[petState]}</span>
            </div>
          ))}
        </div>
      </ChunkyCard>
    </div>
  );
}
