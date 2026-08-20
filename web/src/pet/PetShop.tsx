import { useState } from "react";
import Icon from "../icons/Icon";
import { ChunkyButton } from "../ui/Chunky";
import Modal from "../ui/Modal";
import { usePet } from "./PetProvider";
import { ITEM_ART } from "./itemArt";
import {
  TREATS,
  WEARABLES,
  isEquipped,
  isOwned,
  ownedCount,
  purchaseBlocker,
  type Blocker,
  type Item,
} from "./items";

// Reached by clicking the pet in the bar, never from a menu -- a child does not look for
// a "shop" label, they click the animal.
//
// The dialog chrome -- backdrop, centring, Escape, click-outside -- is ui/Modal.tsx. Worth
// knowing why: this panel is opened from inside the fixed app header, whose backdrop-filter
// made every `fixed` descendant resolve against the header instead of the viewport and
// sheared the top off this panel. See Modal.tsx for the full account.
//
// WHAT CHANGED FROM THE TREAT SHOP. It used to hold three treats and close the instant you
// bought one, which made it a button with three labels rather than a place. Two things fix
// that, and both come from what the shop now has to sell:
//
//   * It has TABS, because treats and wearables are different decisions. A treat is spent
//     without thinking; a wearable is saved for, and browsing the ones you cannot afford
//     yet is the entire point of having them.
//   * It only auto-closes on a TREAT. That behaviour was right for feeding -- the eat
//     animation and the hunger bar both happen in the bar behind this panel, and watching
//     it land is the whole reward -- and wrong for everything else. Buying a hat, taking a
//     hat off, or looking at what you are saving for should all leave you where you are.
//
// What an item the child cannot have yet looks like matters as much as the ones they can.
// §10 is explicit that absence of progress is never punished, so an item out of reach is
// dimmed and says plainly how far away it is -- how many more points, or how many more
// levels. It is never red, never crossed out, and never implies they did something wrong.

type Tab = "treats" | "wearables";

/** The one place the "you can't have this yet" copy is written, so a price and a lock read
 *  as the same kind of gentle distance rather than two different tones of refusal. */
function blockerLabel(blocker: Blocker, item: Item, points: number, solvedCount: number): string {
  switch (blocker) {
    case "cost":
      return `${item.cost - points} more`;
    case "locked":
      return `${(item.unlocksAt ?? 0) - solvedCount} more levels`;
    case "owned":
      return "Yours";
    default:
      return item.kind === "treat" ? "Feed" : "Wear it";
  }
}

function ShopCard({
  item,
  points,
  solvedCount,
  onBuy,
  onEquip,
}: {
  item: Item;
  points: number;
  solvedCount: number;
  onBuy: (item: Item) => void;
  onEquip: (item: Item, on: boolean) => void;
}) {
  const { state } = usePet();
  const inventory = state?.inventory ?? [];
  const blocker = purchaseBlocker(item, points, inventory, solvedCount);
  const owned = isOwned(inventory, item.id);
  const worn = isEquipped(inventory, item.id);
  const affordable = blocker === null;
  const fed = item.kind === "treat" ? ownedCount(inventory, item.id) : 0;

  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-chunk-lg border-(length:--outline-chunk) p-4 text-center ${
        affordable || owned ? "border-quest-locked bg-quest-cream" : "border-quest-locked bg-quest-cream/50 opacity-60"
      }`}
    >
      <div className={worn ? "rounded-chunk bg-quest-gold/25 p-1" : "p-1"}>{ITEM_ART[item.id]}</div>
      <div className="font-display text-base font-bold text-quest-ink">{item.name}</div>
      <div className="text-xs font-medium text-quest-ink-soft">{item.blurb}</div>

      {/* A treat's price is always worth showing -- you buy it again and again. A wearable
          you already own has no price any more, so the space says what it IS instead. */}
      {owned && item.kind === "wearable" ? (
        <div className="font-display text-sm font-bold text-quest-cond-dark">Yours</div>
      ) : (
        <div className="flex items-center gap-1 font-display text-sm font-bold text-quest-ink-soft">
          <Icon name="star" size={14} />
          {item.cost}
        </div>
      )}

      {owned && item.kind === "wearable" ? (
        <ChunkyButton tone={worn ? "neutral" : "cond"} onClick={() => onEquip(item, !worn)} className="w-full">
          {worn ? "Take off" : "Wear it"}
        </ChunkyButton>
      ) : (
        <ChunkyButton
          tone={affordable ? "cond" : "neutral"}
          disabled={!affordable}
          onClick={() => onBuy(item)}
          className="w-full"
        >
          {blockerLabel(blocker, item, points, solvedCount)}
        </ChunkyButton>
      )}

      {/* The collection's memory: proof that feeding the pet was a thing that happened,
          and the only place the lifetime count is ever surfaced. Hidden at zero rather
          than shown as "0", which would read as a score you are failing at. */}
      {fed > 0 && (
        <div className="text-[11px] font-semibold text-quest-ink-soft">
          fed {fed} {fed === 1 ? "time" : "times"}
        </div>
      )}
    </div>
  );
}

export default function PetShop({ onClose }: { onClose: () => void }) {
  const { state, buy, equip } = usePet();
  const [tab, setTab] = useState<Tab>("treats");
  const points = state?.learner.points ?? 0;
  const solvedCount = state?.solved_levels.length ?? 0;
  const petName = state?.pet.name ?? "Tom";

  async function handleBuy(item: Item) {
    const ok = await buy(item);
    // Only a treat closes the shop -- see the header comment.
    if (ok && item.kind === "treat") onClose();
  }

  const items = tab === "treats" ? TREATS : WEARABLES;

  return (
    <Modal label={`Things for ${petName}`} onClose={onClose} width="max-w-2xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-quest-ink">Things for {petName}</h2>
          <p className="text-sm font-medium text-quest-ink-soft">
            Points come from every attempt — trying counts, not just getting it right.
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-chunk border-(length:--outline-chunk) border-quest-gold-dark bg-quest-gold px-3 py-1.5 font-display text-lg font-bold text-quest-ink">
          <Icon name="star" size={18} />
          {points}
        </span>
      </div>

      <div className="mb-4 flex gap-2" role="tablist" aria-label="What to buy">
        {(["treats", "wearables"] as const).map((t) => (
          <ChunkyButton
            key={t}
            role="tab"
            aria-selected={tab === t}
            tone={tab === t ? "gold" : "neutral"}
            onClick={() => setTab(t)}
          >
            {t === "treats" ? "Treats" : "Things to wear"}
          </ChunkyButton>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3" role="tabpanel">
        {items.map((item) => (
          <ShopCard
            key={item.id}
            item={item}
            points={points}
            solvedCount={solvedCount}
            onBuy={handleBuy}
            onEquip={equip}
          />
        ))}
      </div>

      <div className="mt-5 flex justify-end">
        <ChunkyButton tone="neutral" onClick={onClose}>
          Not now
        </ChunkyButton>
      </div>
    </Modal>
  );
}
