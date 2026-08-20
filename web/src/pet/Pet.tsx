import type { PetMood } from "./mood";

// Pip. One inline SVG, every part named and individually addressable, mood expressed as
// a data attribute on the root -- no second file, no image swap, no per-mood component.
//
// Why every part is always in the DOM, with visibility done in CSS rather than by
// conditionally rendering it:
//
//   * Mood changes become pure CSS transitions on transform/opacity/fill, so they ease
//     rather than snap.
//   * A mood change mid-transition just re-targets the same properties. There is no
//     mount/unmount race and therefore no way to leave the SVG half-transitioned -- the
//     thing item 4 asks for is a property of the structure here, not of the timing.
//   * The whole character is one rasterised layer the compositor can reuse; nothing
//     below re-lays-out when the mood changes.
//
// Mood-specific styling lives in index.css under `.quest-pet[data-mood="..."]`, keyed off
// the class names below. Adding a mood means adding CSS, not markup.

interface PetProps {
  mood: PetMood;
  name?: string;
  evolutionStage?: number;
  /** Rendered pixel size. The viewBox does the scaling -- no layout maths, no listener. */
  size?: number;
  /** Bumped by the provider on every feed; re-keys the treat so its one-shot eat
   *  animation replays. Never read as a number, only compared for change. */
  feedTick?: number;
  /** Suppresses the name caption where the surrounding chrome already says it. */
  showName?: boolean;
}

export default function Pet({
  mood,
  name = "Pip",
  evolutionStage = 0,
  size = 96,
  feedTick = 0,
  showName = false,
}: PetProps) {
  return (
    // The breathing animation lives on THIS element, not inside the SVG, and that is a
    // measured decision rather than a stylistic one: a transform animation on an SVG
    // child repaints the subtree every frame (SVG content is not promoted to its own
    // compositor layer), while the same animation on an HTML element is composited and
    // costs essentially nothing. Measured on this machine: breathing the <g> cost +41
    // points of one CPU core; breathing this div costs ~1. See DECISIONS.md.
    <div className="quest-pet-shell quest-decorative flex flex-col items-center" data-pet-mood={mood}>
      <svg
        className="quest-pet"
        data-mood={mood}
        data-stage={evolutionStage}
        viewBox="-60 -66 120 126"
        width={size}
        height={size}
        role="img"
        aria-label={`${name} looks ${MOOD_WORD[mood]}`}
      >
        {/* Ground shadow. Outside the breathing group so the pet moves against it
            rather than dragging it along, which is what sells the motion as breath. */}
        <ellipse className="pet-shadow" cx={0} cy={49} rx={30} ry={6} />

        <g className="pet-breathe">
          {/* --- Antennae ------------------------------------------------------ */}
          <g className="pet-antenna pet-antenna-l">
            <path className="pet-antenna-stalk" d="M -16 -26 Q -24 -42 -20 -50" />
            <circle className="pet-antenna-tip" cx={-20} cy={-52} r={5} />
          </g>
          <g className="pet-antenna pet-antenna-r">
            <path className="pet-antenna-stalk" d="M 16 -26 Q 24 -42 20 -50" />
            <circle className="pet-antenna-tip" cx={20} cy={-52} r={5} />
          </g>

          {/* --- Limbs --------------------------------------------------------- */}
          <g className="pet-limb pet-limb-l">
            <ellipse cx={-38} cy={16} rx={9} ry={13} />
          </g>
          <g className="pet-limb pet-limb-r">
            <ellipse cx={38} cy={16} rx={9} ry={13} />
          </g>
          <ellipse className="pet-foot pet-foot-l" cx={-15} cy={44} rx={12} ry={7} />
          <ellipse className="pet-foot pet-foot-r" cx={15} cy={44} rx={12} ry={7} />

          {/* --- Body ---------------------------------------------------------- */}
          <ellipse className="pet-body" cx={0} cy={6} rx={40} ry={38} />
          <ellipse className="pet-belly" cx={0} cy={16} rx={24} ry={21} />
          {/* Evolution marker: a dashed ring at stage 1+, a small crown at 2+. Cheap
              stand-ins until real stage art exists (§13 step 2 is unbuilt -- QUESTIONS.md). */}
          <ellipse className="pet-stage-ring" cx={0} cy={6} rx={46} ry={44} />
          <path className="pet-stage-crown" d="M -14 -34 L -9 -46 L 0 -38 L 9 -46 L 14 -34 Z" />

          {/* --- Eyes ----------------------------------------------------------
              Both eyes share a wrapper so the blink is ONE animation rather than two.
              That halves the idle animation count and, more importantly, makes it
              impossible for the two eyes to drift out of sync -- two independent
              animations on the same keyframes start together but are not guaranteed to
              stay together. Per-eye transforms (the curious widen, the confused
              asymmetry) still apply inside it. */}
          <g className="pet-eyes">
          <g className="pet-eye pet-eye-l">
            <ellipse className="pet-eye-white" cx={-14} cy={0} rx={9} ry={10} />
            <circle className="pet-pupil" cx={-14} cy={1} r={5} />
            <circle className="pet-glint" cx={-16} cy={-3} r={2.2} />
          </g>
          <g className="pet-eye pet-eye-r">
            <ellipse className="pet-eye-white" cx={14} cy={0} rx={9} ry={10} />
            <circle className="pet-pupil" cx={14} cy={1} r={5} />
            <circle className="pet-glint" cx={12} cy={-3} r={2.2} />
          </g>
          </g>
          {/* Happy/celebrating arcs -- drawn over the eyes rather than replacing them,
              so the swap is an opacity crossfade with nothing to remount. */}
          <path className="pet-eye-arc pet-eye-arc-l" d="M -22 2 Q -14 -9 -6 2" />
          <path className="pet-eye-arc pet-eye-arc-r" d="M 6 2 Q 14 -9 22 2" />

          <ellipse className="pet-cheek pet-cheek-l" cx={-27} cy={13} rx={7} ry={5} />
          <ellipse className="pet-cheek pet-cheek-r" cx={27} cy={13} rx={7} ry={5} />

          {/* --- Mouths -------------------------------------------------------- */}
          {/* Five variants, all present, one opaque at a time. Cross-fading two paths is
              reliable everywhere; animating a single path's `d` between different command
              structures is not. */}
          <g key={`mouth-${feedTick}`} className={feedTick > 0 ? "pet-mouth quest-pet-chewing" : "pet-mouth"}>
            <path className="pet-mouth-smile" d="M -11 20 Q 0 28 11 20" />
            <path className="pet-mouth-grin" d="M -14 18 Q 0 34 14 18 Q 0 26 -14 18 Z" />
            <path className="pet-mouth-wobble" d="M -13 22 Q -6.5 16 0 22 Q 6.5 28 13 22" />
            <path className="pet-mouth-flat" d="M -9 22 L 9 22" />
            <ellipse className="pet-mouth-small" cx={0} cy={22} rx={4.5} ry={5.5} />
          </g>
        </g>

        {/* --- Accents ---------------------------------------------------------
            Outside the breathing group: these are speech, not anatomy, and should not
            inherit the body's motion. */}
        <g className="pet-accent pet-accent-sparkle">
          <path d="M 34 -34 l 3 7 l 7 3 l -7 3 l -3 7 l -3 -7 l -7 -3 l 7 -3 Z" />
          <path d="M -40 -22 l 2.2 5 l 5 2.2 l -5 2.2 l -2.2 5 l -2.2 -5 l -5 -2.2 l 5 -2.2 Z" />
          <path d="M 44 4 l 1.8 4 l 4 1.8 l -4 1.8 l -1.8 4 l -1.8 -4 l -4 -1.8 l 4 -1.8 Z" />
        </g>

        <g className="pet-accent pet-accent-question">
          <text x={30} y={-30} className="pet-glyph">
            ?
          </text>
        </g>

        <g className="pet-accent pet-accent-zzz">
          <text x={26} y={-34} className="pet-glyph pet-glyph-z1">
            z
          </text>
          <text x={38} y={-46} className="pet-glyph pet-glyph-z2">
            z
          </text>
        </g>

        {/* Thinking: three dots, no motion of their own -- the mood's own animation
            carries it. */}
        <g className="pet-accent pet-accent-think">
          <circle cx={30} cy={-30} r={3} />
          <circle cx={40} cy={-36} r={4} />
          <circle cx={51} cy={-43} r={5} />
        </g>

        {/* Hungry: the pet visibly wants something, rather than merely looking sad. */}
        <g className="pet-accent pet-accent-want">
          <circle className="pet-want-bowl" cx={40} cy={-32} r={11} />
          <path className="pet-want-mark" d="M 34 -32 h 12 M 40 -38 v 12" />
        </g>

        {/* Eat animation target. Re-keyed on every feed so the one-shot replays; parked
            invisible otherwise. */}
        <g key={feedTick} className={feedTick > 0 ? "pet-treat quest-pet-eat" : "pet-treat"}>
          <circle cx={0} cy={-46} r={9} />
          <path className="pet-treat-leaf" d="M 4 -54 q 8 -5 10 2 q -7 4 -10 -2 Z" />
        </g>
      </svg>

      {showName && <div className="mt-1 font-display text-sm font-bold text-quest-ink">{name}</div>}
    </div>
  );
}

/** Only used for the accessible label -- the visual is entirely CSS. */
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
