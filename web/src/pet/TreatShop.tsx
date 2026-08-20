import type { ReactNode } from "react";
import Icon from "../icons/Icon";
import { ChunkyButton } from "../ui/Chunky";
import Modal from "../ui/Modal";
import { usePet } from "./PetProvider";
import { TREATS, canAfford, type Treat } from "./treats";

// Reached by clicking the pet in the bar, never from a menu. Closes as soon as something
// is bought, on purpose: the eat animation and the hunger bar filling both happen in the
// bar behind this panel, and the whole point of feeding is watching it land.
//
// The dialog chrome -- backdrop, centring, Escape, click-outside -- is ui/Modal.tsx.
// Worth knowing why, since this panel is where the problem showed: it is opened from
// inside the fixed app header, whose backdrop-filter made every `fixed` descendant
// resolve against the header instead of the viewport and sheared the top off this panel.
// See Modal.tsx for the full account.
//
// What a treat a child cannot afford looks like matters as much as the ones they can.
// §10 is explicit that absence of progress is never punished, so an unaffordable treat is
// dimmed and says how many more points it needs -- it is never red, never crossed out,
// and never implies they did something wrong.

const TREAT_ART: Record<string, ReactNode> = {
  berry: (
    <svg viewBox="0 0 60 60" width={56} height={56} aria-hidden="true">
      <circle cx="30" cy="36" r="17" fill="var(--color-quest-coral)" stroke="var(--color-quest-coral-dark)" strokeWidth="3" />
      <circle cx="24" cy="30" r="4" fill="#fff" opacity="0.7" />
      <path d="M30 19 q10 -9 15 1 q-9 7 -15 -1 Z" fill="var(--color-quest-cond)" stroke="var(--color-quest-cond-dark)" strokeWidth="2.5" />
    </svg>
  ),
  sandwich: (
    <svg viewBox="0 0 60 60" width={56} height={56} aria-hidden="true">
      <rect x="8" y="34" width="44" height="12" rx="5" fill="#f2c17a" stroke="#c8934a" strokeWidth="3" />
      <rect x="8" y="24" width="44" height="10" rx="4" fill="var(--color-quest-cond)" stroke="var(--color-quest-cond-dark)" strokeWidth="3" />
      <rect x="8" y="13" width="44" height="12" rx="5" fill="#f2c17a" stroke="#c8934a" strokeWidth="3" />
    </svg>
  ),
  cake: (
    <svg viewBox="0 0 60 60" width={56} height={56} aria-hidden="true">
      <rect x="10" y="30" width="40" height="20" rx="6" fill="#ffd9e8" stroke="#e59ab8" strokeWidth="3" />
      <rect x="10" y="24" width="40" height="10" rx="5" fill="#fff3c4" stroke="#e0b84a" strokeWidth="3" />
      <path
        d="M30 4 l3.4 7.4 l7.6 .8 l-5.7 5.2 l1.6 7.6 l-6.9 -4 l-6.9 4 l1.6 -7.6 l-5.7 -5.2 l7.6 -.8 Z"
        fill="var(--color-quest-gold)"
        stroke="var(--color-quest-gold-dark)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

export default function TreatShop({ onClose }: { onClose: () => void }) {
  const { state, feed } = usePet();
  const points = state?.learner.points ?? 0;

  async function buy(treat: Treat) {
    const ok = await feed(treat);
    if (ok) onClose();
  }

  return (
    <Modal label="Treats for Tom" onClose={onClose} width="max-w-2xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-quest-ink">Treats for Tom</h2>
          <p className="text-sm font-medium text-quest-ink-soft">
            Points come from every attempt — trying counts, not just getting it right.
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-chunk border-(length:--outline-chunk) border-quest-gold-dark bg-quest-gold px-3 py-1.5 font-display text-lg font-bold text-quest-ink">
          <Icon name="star" size={18} />
          {points}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {TREATS.map((treat) => {
          const affordable = canAfford(points, treat);
          return (
            <div
              key={treat.id}
              className={`flex flex-col items-center gap-2 rounded-chunk-lg border-(length:--outline-chunk) p-4 text-center ${
                affordable ? "border-quest-locked bg-quest-cream" : "border-quest-locked bg-quest-cream/50 opacity-60"
              }`}
            >
              {TREAT_ART[treat.id]}
              <div className="font-display text-base font-bold text-quest-ink">{treat.name}</div>
              <div className="flex items-center gap-1 font-display text-sm font-bold text-quest-ink-soft">
                <Icon name="star" size={14} />
                {treat.cost}
              </div>
              <ChunkyButton
                tone={affordable ? "cond" : "neutral"}
                disabled={!affordable}
                onClick={() => buy(treat)}
                className="w-full"
              >
                {affordable ? "Feed" : `${treat.cost - points} more`}
              </ChunkyButton>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex justify-end">
        <ChunkyButton tone="neutral" onClick={onClose}>
          Not now
        </ChunkyButton>
      </div>
    </Modal>
  );
}
