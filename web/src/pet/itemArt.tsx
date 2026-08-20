import type { ReactNode } from "react";

// Every item's drawing, in one place, as inline SVG -- the codebase's rule for
// illustration everywhere except the character sheets themselves (DECISIONS.md).
//
// A wearable is drawn twice from one description: once at card size in the shop, and once
// over the sprite in the pet bar. Both come from the same `body` below rather than two
// separate drawings, so an item can never look like one thing in the shop and another on
// the pet. Only the viewBox and the placement differ, and the placement is the slot's job
// (see Pet.tsx's SLOT_STYLE), not the art's.
//
// THE CONSTRAINT THE WEARABLE ART IS DRAWN AGAINST: seven characters with completely
// different silhouettes -- a lizard, a carrot, a round robot, a wolf on a motorbike -- and
// one drawing has to sit correctly on all of them. That rules out anything that has to
// meet an edge or wrap a limb. What is left, and what these two slots are, is the top of
// the head (where the evolution hat already proves the placement works at 34% of the frame
// width) and the ground under the pet (which cannot be wrong at all). Everything here is
// drawn to read at 52px in the trail as well as at 84px in the pet bar, so: thick outlines,
// no small interior detail, and colours straight from the palette.

interface WearableArt {
  viewBox: string;
  body: ReactNode;
}

const SUN_HAT: WearableArt = {
  viewBox: "0 0 40 24",
  body: (
    <>
      {/* Brim first so the crown sits on top of it. */}
      <ellipse cx="20" cy="17" rx="18" ry="5.5" fill="var(--color-quest-gold)" stroke="var(--color-quest-gold-dark)" strokeWidth="2" />
      <path
        d="M 9 16 Q 10 4 20 4 Q 30 4 31 16 Z"
        fill="var(--color-quest-gold)"
        stroke="var(--color-quest-gold-dark)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* A band, so the crown reads as a hat rather than a dome at small sizes. */}
      <path d="M 9.4 14 Q 20 11 30.6 14" fill="none" stroke="var(--color-quest-coral)" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
};

const STAR_CROWN: WearableArt = {
  viewBox: "0 0 40 24",
  body: (
    <>
      <path
        d="M 7 20 L 7 7 L 13.5 12 L 20 4 L 26.5 12 L 33 7 L 33 20 Z"
        fill="var(--color-quest-gold)"
        stroke="var(--color-quest-gold-dark)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M 7 19 L 33 19" stroke="var(--color-quest-gold-dark)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="20" cy="14.5" r="2.6" fill="var(--color-quest-coral)" stroke="var(--color-quest-coral-dark)" strokeWidth="1.4" />
    </>
  ),
};

const COSY_MAT: WearableArt = {
  viewBox: "0 0 100 26",
  body: (
    <>
      <ellipse cx="50" cy="14" rx="47" ry="11" fill="var(--color-quest-coral)" stroke="var(--color-quest-coral-dark)" strokeWidth="3" />
      <ellipse cx="50" cy="12.5" rx="36" ry="7" fill="none" stroke="var(--color-quest-coral-dark)" strokeWidth="2" opacity="0.55" />
    </>
  ),
};

const STAR_RUG: WearableArt = {
  viewBox: "0 0 100 26",
  body: (
    <>
      <ellipse cx="50" cy="14" rx="47" ry="11" fill="var(--color-quest-while)" stroke="var(--color-quest-while-dark)" strokeWidth="3" />
      {[24, 50, 76].map((cx, i) => (
        <path
          key={cx}
          d={`M ${cx} ${i === 1 ? 7 : 9} l 1.7 3.6 l 3.9 .4 l -2.9 2.6 l .8 3.8 l -3.5 -2 l -3.5 2 l .8 -3.8 l -2.9 -2.6 l 3.9 -.4 Z`}
          fill="var(--color-quest-gold)"
          stroke="var(--color-quest-gold-dark)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      ))}
    </>
  ),
};

/** The on-pet drawing for every wearable, keyed by item id. Pet.tsx positions these by
 *  slot; an id missing from here simply renders nothing, so a half-added item degrades to
 *  invisible rather than crashing the pet bar. */
export const WEARABLE_ART: Record<string, WearableArt> = {
  "sun-hat": SUN_HAT,
  "star-crown": STAR_CROWN,
  "cosy-mat": COSY_MAT,
  "star-mat": STAR_RUG,
};

/** Card-sized art for the shop grid. Wearables reuse their on-pet drawing; treats are
 *  only ever seen here, so they are drawn once, at this size. */
export const ITEM_ART: Record<string, ReactNode> = {
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
  ...Object.fromEntries(
    Object.entries(WEARABLE_ART).map(([id, art]) => [
      id,
      <svg key={id} viewBox={art.viewBox} width={56} height={56} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
        {art.body}
      </svg>,
    ]),
  ),
};
