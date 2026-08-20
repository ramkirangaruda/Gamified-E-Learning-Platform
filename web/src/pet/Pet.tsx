import type { PetMood } from "./mood";
import { FRAME, MOOD_ANIMATION, SHEET, SPRITE_URL } from "./tomLizard";

// Tom Lizard. A sprite-sheet character (tom-lizard/spritesheet.webp), replacing Pip's
// inline SVG at explicit product direction -- see DECISIONS.md for why this is a
// deliberate, logged reversal of "every illustration here is inline SVG", not an
// oversight. The prop contract is unchanged from Pip on purpose: PetBar/Trail/
// CompareView/StyleGuide all render <Pet mood=... name=... evolutionStage=...
// size=... feedTick=... showName=... /> and none of them needed to change.
//
// Frame-stepping is done with CSS `transform: translate(...)` in PERCENTAGES of the
// sheet image's own box (see index.css) rather than fixed pixel values, so the exact
// same keyframes work at every `size` this component is ever rendered at (52px in the
// trail, 84px in the pet bar, 96px by default) with no per-instance CSS needed. Only
// `idle` and `thinking` loop -- every other mood is a one-shot reaction that holds its
// final frame -- mirroring Pip's own "idle animation is a rare, budgeted exception"
// rule (pet/idleAnimation.test.ts polices this for whichever character is here).

interface PetProps {
  mood: PetMood;
  name?: string;
  evolutionStage?: number;
  /** Rendered pixel size (height-constrained; the frame's own aspect ratio sets width). */
  size?: number;
  /** Bumped by the provider on every feed; re-keys the treat so its one-shot eat
   *  animation replays. Never read as a number, only compared for change. */
  feedTick?: number;
  /** Suppresses the name caption where the surrounding chrome already says it. */
  showName?: boolean;
}

export default function Pet({
  mood,
  name = "Tom",
  evolutionStage = 0,
  size = 96,
  feedTick = 0,
  showName = false,
}: PetProps) {
  const scale = size / FRAME.height;
  const frameW = FRAME.width * scale;
  const frameH = FRAME.height * scale;
  const sheetW = SHEET.width * scale;
  const sheetH = SHEET.height * scale;

  // null = a static resting pose (hungry, sleepy) -- no animation class at all, so the
  // sheet just sits at its default (idle frame 0) position. See tomLizard.ts.
  const animName = MOOD_ANIMATION[mood];

  return (
    <div className="quest-pet-shell quest-decorative flex flex-col items-center" data-pet-mood={mood}>
      <div
        className="quest-pet relative"
        data-mood={mood}
        data-stage={evolutionStage}
        style={{ width: frameW, height: frameH }}
        role="img"
        aria-label={`${name} looks ${MOOD_WORD[mood]}`}
      >
        {/* Evolution stage aura -- deliberately outside the frame-clipping box below, so
            it can bleed past the sprite's own bounds (index.css: inset < 0). */}
        <div className="pet-stage-aura" />

        {/* The only element that clips: the sheet image is far larger than one frame,
            and this is what turns it into a window onto exactly one cell of it. */}
        <div className="relative overflow-hidden" style={{ width: frameW, height: frameH }}>
          <div
            className={`tom-lizard-sheet${animName ? ` tom-lizard-anim-${animName}` : ""}`}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: sheetW,
              height: sheetH,
              backgroundImage: `url(${SPRITE_URL})`,
              backgroundSize: `${sheetW}px ${sheetH}px`,
            }}
          />
        </div>

        {/* Evolution stage art (§13 step 2): same additive hat/badge language Pip used,
            now a small overlay above the sprite instead of a recolor -- stage 1 adds the
            hat, stage 2 adds the badge, stage 3 (via .pet-stage-aura above) adds the
            glow. See index.css's [data-stage] rules. */}
        <svg
          className="pet-hat"
          viewBox="0 0 40 40"
          style={{ position: "absolute", top: "4%", left: "50%", transform: "translateX(-50%)", width: frameW * 0.34, height: frameW * 0.34 }}
          aria-hidden="true"
        >
          <path className="pet-hat-brim" d="M 8 27 Q 20 23 32 27 L 30 31 Q 20 28 10 31 Z" />
          <path className="pet-hat-cone" d="M 10 28 L 30 28 L 20 5 Z" />
          <circle className="pet-hat-pompom" cx={20} cy={5} r={3} />
          <g className="pet-hat-badge">
            <path d="M 33 12 l 1.8 4 l 4 1.8 l -4 1.8 l -1.8 4 l -1.8 -4 l -4 -1.8 l 4 -1.8 Z" />
          </g>
        </svg>

        {/* Treat drop target, re-keyed on every feed so the one-shot eat animation
            replays; parked invisible (index.css) otherwise. */}
        <div key={feedTick} className={`pet-treat ${feedTick > 0 ? "quest-pet-eat" : ""}`} />
      </div>

      {showName && <div className="mt-1 font-display text-sm font-bold text-quest-ink">{name}</div>}
    </div>
  );
}

/** Only used for the accessible label -- the visual is entirely CSS/sprite driven. */
const MOOD_WORD: Record<PetMood, string> = {
  idle: "content",
  curious: "curious",
  thinking: "thoughtful",
  happy: "happy",
  celebrating: "delighted",
  hungry: "hungry",
  sleepy: "sleepy",
  confused: "puzzled",
};
