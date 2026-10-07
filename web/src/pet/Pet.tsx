import type { CSSProperties } from "react";
import type { MascotState } from "../mascot/state";
import { FRAME, SHEET, resolveClip } from "./spriteLayout";
import { characterById, spriteUrlFor } from "./characters";
import { equippedInSlot, type Slot } from "./items";
import { WEARABLE_ART } from "./itemArt";
import type { InventoryItem } from "../api";

// Sprite-sheet character rendering, shared by every selectable companion (settings
// screen: "choose your pet") -- replacing the original inline-SVG mascot at explicit
// product direction, see DECISIONS.md for why that was a deliberate, logged reversal of
// "every illustration here is inline SVG", not an oversight.
//
// `name` is deliberately NOT defaulted to a hardcoded string -- it falls back to whichever
// character `species` names (characterById), so a call site that passes a species but no
// name captions the right pet instead of always saying "Tom".
//
// THE PROP IS NOW `state`, NOT `mood`. This component used to take one of pet/mood.ts's 8
// PetMoods, which meant every caller holding a MascotState had to squash it through
// mascotStateToLegacyMood first, and the squash threw most of the state machine away (see
// spriteLayout.ts's header for the full account). There is one vocabulary now and this
// renders directly from it.
//
// HOW THE ANIMATION IS DRIVEN. Everything about a clip -- which row, how many steps, how
// long, how many times -- comes from spriteLayout.resolveClip() and is handed to CSS as
// custom properties on the element. index.css holds ONE generic keyframe rather than one
// per animation, which is what lets fourteen states differ in speed and repeat count
// without fourteen hand-written keyframe blocks that could drift from the table.
//
// The two transforms live on two nested elements on purpose: the row offset (translateY)
// on `.pet-row` and the frame stepping (translateX) on `.pet-frames`. Animating the same
// CSS property twice on one element does not compose -- the animation simply replaces the
// static value -- which is the same lesson index.css already records for the mascot's
// breathe-vs-tilt pair. Both are expressed in PERCENTAGES of the sheet image's own box, so
// one set of rules works at every size this is rendered at (52px, 64px, 72px, 84px, 96px)
// with no per-instance CSS beyond the numbers.

interface PetProps {
  /** Which of the fourteen mascot states to draw. */
  state: MascotState;
  name?: string;
  /** Which character's spritesheet to render -- `pet.species` on the saved state.
   *  Defaults to the roster's first entry for call sites that don't (yet) know the
   *  selection. */
  species?: string;
  evolutionStage?: number;
  /** Rendered pixel size (height-constrained; the frame's own aspect ratio sets width). */
  size?: number;
  /** Bumped by the provider on every feed; re-keys the treat so its one-shot eat
   *  animation replays. Never read as a number, only compared for change. */
  feedTick?: number;
  /** Suppresses the name caption where the surrounding chrome already says it. */
  showName?: boolean;
  /** What the child owns and is wearing. Optional so the several decorative call sites
   *  that render a bare character (the settings roster, the style guide) don't have to
   *  invent one. */
  inventory?: InventoryItem[];
}

export default function Pet({
  state,
  name,
  species = "tom-lizard",
  evolutionStage = 0,
  size = 96,
  feedTick = 0,
  showName = false,
  inventory = [],
}: PetProps) {
  const scale = size / FRAME.height;
  const frameW = FRAME.width * scale;
  const frameH = FRAME.height * scale;
  const sheetW = SHEET.width * scale;
  const sheetH = SHEET.height * scale;
  const spriteUrl = spriteUrlFor(species);
  const displayName = name ?? characterById(species).displayName;

  // null = this state animates nothing at all (sleepy). The sheet then simply rests at
  // row 0, frame 0 -- see spriteLayout.ts for why that is deliberate and enforced.
  const clip = resolveClip(state, species);

  const hat = equippedInSlot(inventory, "hat");
  const mat = equippedInSlot(inventory, "mat");

  // One 12.5%-wide column per frame, one (100/9)% row per animation. Expressed as
  // percentages of the sheet so they hold at any `size`.
  const rowStyle: CSSProperties = {
    width: sheetW,
    height: sheetH,
    transform: `translateY(${((clip?.rowIndex ?? 0) * -100) / SHEET.rows}%)`,
  };

  const frameStyle: CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: sheetW,
    height: sheetH,
    backgroundImage: `url(${spriteUrl})`,
    backgroundSize: `${sheetW}px ${sheetH}px`,
    ...(clip
      ? ({
          "--pet-span": `${(clip.steps * -100) / SHEET.columns}%`,
          "--pet-dur": `${clip.durationMs / (clip.plays ?? 1)}ms`,
          "--pet-plays": clip.plays ?? "infinite",
        } as CSSProperties)
      : {}),
  };

  /** Both slots are placed as a fraction of the FRAME rather than in pixels, so one
   *  placement holds at every size the pet is drawn at. */
  function wearable(itemId: string, slot: Slot) {
    const art = WEARABLE_ART[itemId];
    if (!art) return null; // half-added item: invisible, never a crash
    const style: CSSProperties =
      slot === "hat"
        ? { position: "absolute", top: "2%", left: "50%", transform: "translateX(-50%)", width: frameW * 0.46 }
        : { position: "absolute", bottom: "2%", left: "50%", transform: "translateX(-50%)", width: frameW * 0.92 };
    return (
      <svg className={`pet-wearable pet-wearable-${slot}`} viewBox={art.viewBox} style={style} aria-hidden="true">
        {art.body}
      </svg>
    );
  }

  return (
    <div className="quest-pet-shell quest-decorative flex flex-col items-center" data-pet-state={state}>
      <div
        className={`quest-pet relative${clip?.fx ? ` pet-fx-${clip.fx}` : ""}`}
        data-state={state}
        data-stage={evolutionStage}
        style={{ width: frameW, height: frameH }}
        role="img"
        aria-label={`${displayName} looks ${STATE_WORD[state]}`}
      >
        {/* Evolution stage aura -- deliberately outside the frame-clipping box below, so
            it can bleed past the sprite's own bounds (index.css: inset < 0). */}
        <div className="pet-stage-aura" />

        {/* The mat is the one wearable that goes BEHIND the character, which is the whole
            reason it can be drawn once for seven silhouettes: the pet sits on it and
            whatever shape the pet is simply covers the middle of it. */}
        {mat && wearable(mat.id, "mat")}

        {/* The only element that clips: the sheet image is far larger than one frame,
            and this is what turns it into a window onto exactly one cell of it. */}
        <div className="relative overflow-hidden" style={{ width: frameW, height: frameH }}>
          {/* Row offset. Static -- the row never changes inside a clip. */}
          <div className="pet-row absolute top-0 left-0" style={rowStyle}>
            {/* Frame stepping. `key` restarts the animation whenever the clip changes, so
                a new reaction always plays from its first frame instead of picking up
                mid-cycle from whatever the previous state had reached. */}
            <div
              key={`${state}-${clip?.rowIndex ?? "still"}`}
              className={clip ? `pet-frames pet-steps-${clip.steps}${clip.holdsLastFrame ? " pet-hold" : ""}` : undefined}
              style={frameStyle}
            />
          </div>
        </div>

        {/* A bought hat takes the head, and the evolution hat steps aside for it -- one
            head, one hat. Nothing is lost by that: the stage badge and the stage-3 aura
            are untouched, so how far the child has come is still on the pet, and the
            hat they chose sits on top of it. */}
        {hat && wearable(hat.id, "hat")}

        {/* Evolution stage art (§13 step 2): the cap that used to sit here at stage 1 was
            removed at product direction (no default cap on the pet). What remains is the
            badge, still stage 2's own additive signal, and the aura (via .pet-stage-aura
            above) at stage 3. See index.css's [data-stage] rules. */}
        <svg
          className={`pet-hat${hat ? " pet-hat-replaced" : ""}`}
          viewBox="0 0 40 40"
          style={{ position: "absolute", top: "4%", left: "50%", transform: "translateX(-50%)", width: frameW * 0.34, height: frameW * 0.34 }}
          aria-hidden="true"
        >
          <g className="pet-hat-badge">
            <path d="M 33 12 l 1.8 4 l 4 1.8 l -4 1.8 l -1.8 4 l -1.8 -4 l -4 -1.8 l 4 -1.8 Z" />
          </g>
        </svg>

        {/* Treat drop target, re-keyed on every feed so the one-shot eat animation
            replays; parked invisible (index.css) otherwise. */}
        <div key={feedTick} className={`pet-treat ${feedTick > 0 ? "quest-pet-eat" : ""}`} />
      </div>

      {showName && <div className="mt-1 font-display text-sm font-bold text-quest-ink">{displayName}</div>}
    </div>
  );
}

/** Only used for the accessible label -- the visual is entirely CSS/sprite driven. One
 *  entry per mascot state, so a screen reader hears the same fourteen distinctions a
 *  sighted child sees rather than the eight the old mood vocabulary could express. */
const STATE_WORD: Record<MascotState, string> = {
  idle: "content",
  welcome: "pleased to see you",
  happy: "happy",
  excited: "excited",
  thinking: "thoughtful",
  encouraging: "encouraging",
  confused: "puzzled",
  pointing: "eager to show you something",
  celebrating: "delighted",
  streak: "thrilled",
  milestone: "very proud",
  playful: "playful",
  sleepy: "sleepy",
  hungry: "hungry",
};
