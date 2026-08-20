import { useEffect, useRef } from "react";
import Icon from "../icons/Icon";
import Pet from "../pet/Pet";
import { StarRow } from "../ui/Chunky";
import { CONCEPT_GROUPS, EVOLUTION_MARKERS, groupFor } from "./concepts";
import type { LevelDef } from "../api";

// The primary view: 25 levels as a winding path the child travels along.
//
// §10 compliance is structural here, not a coat of paint:
//   * `unlockedThrough` is derived from solved count and only ever grows -- a level that
//     has been reachable can never become unreachable.
//   * There are no streaks, no timers, and nothing decays. Coming back after a week shows
//     exactly what you left.
//   * Locked levels read "not yet" with a soft padlock -- never a cross, never red, never
//     anything a child could read as "you failed".
//
// The winding shape is pure CSS grid + a per-row direction flip. No absolute positioning
// maths, no SVG path, nothing to recompute on resize.

interface TrailProps {
  levels: LevelDef[];
  solvedIds: string[];
  starsByLevel: Record<string, number>;
  onSelectLevel: (levelId: string) => void;
  petStage: number;
  petName?: string;
}

const PER_ROW = 5;

export default function Trail({ levels, solvedIds, starsByLevel, onSelectLevel, petStage, petName }: TrailProps) {
  const currentRef = useRef<HTMLButtonElement>(null);

  const solvedSet = new Set(solvedIds);
  // The first unsolved level is "current". Everything after it is visible but not yet
  // open; everything before it stays open forever.
  const currentIndex = levels.findIndex((l) => !solvedSet.has(l.id));
  const current = currentIndex === -1 ? levels.length - 1 : currentIndex;

  useEffect(() => {
    // Bring the child straight to where they are, so the next thing to do is on screen
    // without scrolling. Instant, not smooth: this is a jump-to-position on load, not a
    // decorative animation, so it is exempt from the motion budget.
    currentRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [current]);

  // Split into rows and alternate direction so the path snakes.
  const rows: LevelDef[][] = [];
  for (let i = 0; i < levels.length; i += PER_ROW) rows.push(levels.slice(i, i + PER_ROW));

  return (
    <div className="mx-auto max-w-4xl px-6 pb-24">
      {rows.map((row, rowIndex) => {
        const reversed = rowIndex % 2 === 1;
        const ordered = reversed ? [...row].reverse() : row;
        return (
          <div key={rowIndex}>
            <div className="flex items-start justify-between gap-3">
              {ordered.map((level) => {
                const index = levels.indexOf(level);
                const solved = solvedSet.has(level.id);
                const isCurrent = index === current;
                // A solved level is NEVER locked, even if it sits past the current
                // position -- §10: nothing re-locks once unlocked. Without the
                // `!solved` guard, solving out of order (via the grid's replay, or a
                // level completed on another machine with the same key) made finished
                // levels render as padlocked, which is precisely the regression §10
                // forbids.
                const locked = index > current && !solved;
                const group = groupFor(level.teaches);
                const stars = starsByLevel[level.id] ?? 0;

                return (
                  <div key={level.id} className="flex w-full flex-col items-center gap-1">
                    <button
                      ref={isCurrent ? currentRef : undefined}
                      type="button"
                      disabled={locked}
                      aria-current={isCurrent ? "step" : undefined}
                      aria-label={
                        locked
                          ? `${level.name}, not yet — keep going to reach it`
                          : `${level.name}${solved ? ", complete" : ""}`
                      }
                      onClick={() => !locked && onSelectLevel(level.id)}
                      className={`flex h-tap-lg w-tap-lg items-center justify-center rounded-full border-[var(--outline-chunk-thick)] font-display text-xl font-bold shadow-chunk transition-transform
                        ${
                          locked
                            ? "cursor-not-allowed border-quest-locked-deep bg-quest-locked text-white/80 shadow-chunk-sm"
                            : solved
                              ? "border-quest-cond-dark bg-quest-cond text-white hover:-translate-y-0.5 active:translate-y-[3px]"
                              : "border-quest-gold-dark bg-quest-gold text-quest-ink ring-4 ring-quest-gold/40 hover:-translate-y-0.5 active:translate-y-[3px]"
                        }`}
                    >
                      {locked ? <Icon name="lock" size={24} /> : solved ? <Icon name="check" size={28} /> : index + 1}
                    </button>

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
                        <div key={m.label} className="mt-1 flex flex-col items-center">
                          <div className="scale-50">
                            <Pet mood="happy" name="" evolutionStage={petStage} />
                          </div>
                          <div className="-mt-3 rounded-chunk-sm border-2 border-quest-gold-dark bg-quest-gold px-2 py-0.5 font-display text-[10px] font-bold text-quest-ink">
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
                          className={`mt-1 rounded-chunk-sm border-2 px-2 py-0.5 font-display text-[10px] font-bold text-white
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
              {/* Pad the last row so it stays aligned with the ones above. */}
              {Array.from({ length: PER_ROW - row.length }, (_, i) => (
                <div key={`pad-${i}`} className="w-full" />
              ))}
            </div>

            {/* Connector between rows -- a plain dashed rule, no SVG path to recompute. */}
            {rowIndex < rows.length - 1 && (
              <div className={`flex h-10 ${reversed ? "justify-start pl-6" : "justify-end pr-6"}`}>
                <div className="h-full w-1 rounded-full border-l-4 border-dashed border-quest-ink/20" />
              </div>
            )}
          </div>
        );
      })}

      <p className="mt-10 text-center text-sm font-medium text-quest-ink-soft">
        {petName ?? "Pip"} is waiting at level {current + 1}. Nothing here ever locks again — come back whenever you like.
      </p>
    </div>
  );
}
