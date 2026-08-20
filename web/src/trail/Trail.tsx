import { useEffect, useRef } from "react";
import Icon from "../icons/Icon";
import Pet from "../pet/Pet";
import { usePet } from "../pet/PetProvider";
import { useMascotEvents } from "../mascot/events";
import { findCurrentLevelIndex } from "../mascot/progress";
import { StarRow } from "../ui/Chunky";
import { CONCEPT_GROUPS, EVOLUTION_MARKERS, groupFor } from "./concepts";
import { nodePosition, smoothPath, trailHeight, trailSegments } from "./trailPath";
import type { LevelDef } from "../api";

// The primary view: levels laid out along a single winding path, like a board-game trail
// (brief: "connecting paths joining the levels", reference was a Candy-Crush-style map).
//
// §10 compliance is structural here, not a coat of paint:
//   * `unlockedThrough` is derived from solved count and only ever grows -- a level that
//     has been reachable can never become unreachable.
//   * There are no streaks, no timers, and nothing decays. Coming back after a week shows
//     exactly what you left.
//   * Locked levels read "not yet" with a soft padlock -- never a cross, never red, never
//     anything a child could read as "you failed".
//
// Positioning: trailPath.ts's nodePosition() gives every level an (x%, yPx) spot on a
// horizontal snake -- each row sweeps nearly the full container width left-to-right, then
// right-to-left on the next row (a boustrophedon), so a wide screen actually gets used
// instead of most of it sitting empty either side of a narrow vertical column. x is in
// viewBox-percent units (tracks the container's width with no resize observer needed), y
// is real pixels (a fixed row ladder, with a gentle per-row arc so it still reads as an
// S rather than flat shelves). The connecting path is drawn from the SAME points via a
// Catmull-Rom smoothPath(), split into a "walked" segment (through every solved level)
// and a "next" segment (the one still-open step into the current level) by
// trailSegments() -- nothing is drawn past the frontier, per the brief's "no path for the
// ones that aren't complete".
export default function Trail({ levels, solvedIds, starsByLevel, onSelectLevel, petStage, petName }: TrailProps) {
  const currentRef = useRef<HTMLButtonElement>(null);
  const { mood, celebratingLevelId } = usePet();
  const { levelHovered, levelSelected, levelLocked } = useMascotEvents();

  const solvedSet = new Set(solvedIds);
  // The first unsolved level is "current". Everything after it is visible but not yet
  // open; everything before it stays open forever. Shared with mascot/progress.ts (the
  // mascot's "recommended next level" reads this exact same function) so the two can
  // never disagree about which node is current.
  const current = findCurrentLevelIndex(levels, solvedIds);

  useEffect(() => {
    // Bring the child straight to where they are, so the next thing to do is on screen
    // without scrolling. Instant, not smooth: this is a jump-to-position on load, not a
    // decorative animation, so it is exempt from the motion budget.
    currentRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [current]);

  const height = trailHeight(levels.length);
  const { walked, next } = trailSegments(levels.length, solvedIds.length);

  return (
    <div className="relative mx-auto max-w-6xl px-10 pb-24" style={{ height }}>
      {/* The path itself. viewBox x is 0-100 ("percent" units, stretched to the
          container's actual width by preserveAspectRatio="none") so it always lines up
          with the nodes below, which use the same x values as CSS `left: N%`. y is real
          pixels, 1:1 with the SVG's own height, so it never scales vertically.
          vector-effect="non-scaling-stroke" keeps the rope's thickness a genuine N
          screen-pixels regardless of that non-uniform x/y scaling. */}
      <svg
        className="pointer-events-none absolute inset-0 w-full"
        style={{ height }}
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {walked.length > 1 && (
          <path
            d={smoothPath(walked)}
            fill="none"
            stroke="#5fb04a"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray="2 9"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {next.length > 1 && (
          <path
            d={smoothPath(next)}
            fill="none"
            stroke="#ffb703"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray="2 9"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {levels.map((level, index) => {
        const { x, y } = nodePosition(index);
        const solved = solvedSet.has(level.id);
        const isCurrent = index === current;
        // A solved level is NEVER locked, even if it sits past the current position --
        // §10: nothing re-locks once unlocked. Without the `!solved` guard, solving out
        // of order (via the grid's replay, or a level completed on another machine with
        // the same key) made finished levels render as padlocked, which is precisely the
        // regression §10 forbids.
        const locked = index > current && !solved;
        const group = groupFor(level.teaches);
        const stars = starsByLevel[level.id] ?? 0;
        // The mascot only ever "points" at the current (next-to-play) node -- see
        // mascot/state.ts's sustainedMascotState pointing branch. Purely additive CSS on
        // top of the existing gold ring, gated by the same .quest-decorative Calm Mode
        // kill-switch everything else here uses.
        const isPointedAt = isCurrent && mood === "pointing";
        const isCelebratingHere = celebratingLevelId === level.id;

        return (
          <div
            key={level.id}
            className="absolute flex w-32 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{ left: `${x}%`, top: y }}
          >
            <div className="relative">
              <button
                ref={isCurrent ? currentRef : undefined}
                type="button"
                // aria-disabled, not the native `disabled` attribute: a truly disabled
                // button fires NO mouse events at all -- not click, not mouseenter --
                // which would make a locked level's hover reaction (levelLocked)
                // impossible to ever trigger. Verified against a real running instance,
                // not just reasoned about: the handler silently never fired with
                // `disabled`, no console error to point at why. The click is still gated
                // manually below, same net effect.
                aria-disabled={locked}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={
                  locked
                    ? `${level.name}, not yet — keep going to reach it`
                    : `${level.name}${solved ? ", complete" : ""}`
                }
                onMouseEnter={() => (locked ? levelLocked(level) : levelHovered(level))}
                onFocus={() => (locked ? levelLocked(level) : levelHovered(level))}
                onClick={() => {
                  if (locked) return;
                  levelSelected(level);
                  onSelectLevel(level.id);
                }}
                className={`flex h-tap-lg w-tap-lg items-center justify-center rounded-full border-[var(--outline-chunk-thick)] font-display text-xl font-bold shadow-chunk transition-transform
                  ${
                    locked
                      ? "cursor-not-allowed border-quest-locked-deep bg-quest-locked text-white/80 shadow-chunk-sm"
                      : solved
                        ? "border-quest-cond-dark bg-quest-cond text-white hover:-translate-y-0.5 active:translate-y-[3px]"
                        : "border-quest-gold-dark bg-quest-gold text-quest-ink ring-4 ring-quest-gold/40 hover:-translate-y-0.5 active:translate-y-[3px]"
                  }
                  ${isPointedAt ? "quest-decorative quest-node-pointed" : ""}`}
              >
                {/* The level NUMBER stays visible even once solved -- a plain green
                    circle with only a checkmark loses "which level is this" at a
                    glance. Completion is instead shown by the small badge below,
                    overlapping the circle's bottom edge. */}
                {locked ? <Icon name="lock" size={24} /> : index + 1}
              </button>

              {solved && (
                <span
                  className="absolute -bottom-1.5 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border-2 border-white bg-quest-cond shadow-chunk-sm"
                  aria-hidden="true"
                >
                  <Icon name="check" size={13} className="text-white" />
                </span>
              )}

              {isCelebratingHere && (
                <div
                  className="quest-decorative quest-node-celebrate pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2"
                  aria-hidden="true"
                >
                  ✨
                </div>
              )}
            </div>

            <div className="text-center">
              <div
                className={`font-display text-[11px] font-bold leading-tight ${
                  locked ? "text-quest-ink/35" : "text-quest-ink"
                }`}
              >
                {level.name}
              </div>
              {locked ? (
                <div className="text-[10px] font-semibold text-quest-ink/35">not yet</div>
              ) : (
                <StarRow earned={stars} size={12} />
              )}
            </div>

            {/* Pet evolution marker, at the level where the stage was reached. */}
            {EVOLUTION_MARKERS.map((m) =>
              m.afterSolved === index + 1 ? (
                <div key={m.label} className="flex flex-col items-center">
                  <Pet mood="happy" evolutionStage={petStage} size={52} />
                  <div className="-mt-1 rounded-chunk-sm border-2 border-quest-gold-dark bg-quest-gold px-2 py-0.5 font-display text-[10px] font-bold text-quest-ink">
                    {m.label}
                  </div>
                </div>
              ) : null,
            )}

            {/* Concept-group banner: shown on the first level of each group so
                finishing one idea and starting the next is visible, not implied. */}
            {CONCEPT_GROUPS.some((g) => g.teaches === level.teaches) &&
              levels.findIndex((l) => l.teaches === level.teaches) === index && (
                <div
                  className={`rounded-chunk-sm border-2 px-2 py-0.5 font-display text-[10px] font-bold text-white
                    ${group.tone === "move" ? "border-quest-move-dark bg-quest-move" : ""}
                    ${group.tone === "repeat" ? "border-quest-repeat-dark bg-quest-repeat" : ""}
                    ${group.tone === "cond" ? "border-quest-cond-dark bg-quest-cond" : ""}
                    ${group.tone === "while" ? "border-quest-while-dark bg-quest-while" : ""}
                    ${group.tone === "gold" ? "border-quest-gold-dark bg-quest-gold !text-quest-ink" : ""}`}
                >
                  {group.title}
                </div>
              )}
          </div>
        );
      })}

      <p
        className="absolute inset-x-0 text-center text-sm font-medium text-quest-ink-soft"
        style={{ top: height + 24 }}
      >
        {petName ?? "Pip"} is waiting at level {current + 1}. Nothing here ever locks again — come back whenever you like.
      </p>
    </div>
  );
}

interface TrailProps {
  levels: LevelDef[];
  solvedIds: string[];
  starsByLevel: Record<string, number>;
  onSelectLevel: (levelId: string) => void;
  petStage: number;
  petName?: string;
}
