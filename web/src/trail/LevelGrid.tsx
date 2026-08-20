import { useState } from "react";
import AnimalMascot from "../animals/AnimalMascot";
import Icon from "../icons/Icon";
import { useMascotEvents } from "../mascot/events";
import { findCurrentLevelIndex } from "../mascot/progress";
import { ChunkyButton, StarRow } from "../ui/Chunky";
import { CONCEPT_GROUPS, groupFor } from "./concepts";
import type { LevelDef } from "../api";

// Secondary view: an ABCya-style card grid of every level, filterable by concept group,
// for jumping back to replay something. The trail answers "where am I"; this answers
// "where was that one about loops".
//
// Same §10 rules as the trail: locked reads "not yet", nothing ever re-locks.

interface LevelGridProps {
  levels: LevelDef[];
  solvedIds: string[];
  starsByLevel: Record<string, number>;
  onSelectLevel: (levelId: string) => void;
}

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "Just right",
  medium: "A bit tricky",
  hard: "Extra tricky",
};

export default function LevelGrid({ levels, solvedIds, starsByLevel, onSelectLevel }: LevelGridProps) {
  const [filter, setFilter] = useState<string | null>(null);
  const { levelHovered, levelSelected, levelLocked } = useMascotEvents();
  const solvedSet = new Set(solvedIds);
  const current = findCurrentLevelIndex(levels, solvedIds);

  const shown = filter ? levels.filter((l) => l.teaches === filter) : levels;

  return (
    <div className="mx-auto max-w-5xl px-6 pb-24">
      <div className="mb-6 flex flex-wrap gap-2">
        <ChunkyButton tone={filter === null ? "gold" : "neutral"} onClick={() => setFilter(null)}>
          All
        </ChunkyButton>
        {CONCEPT_GROUPS.map((g) => (
          <ChunkyButton key={g.teaches} tone={filter === g.teaches ? g.tone : "neutral"} onClick={() => setFilter(g.teaches)}>
            <AnimalMascot kind={g.animal} size={26} />
            {g.title}
          </ChunkyButton>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((level) => {
          const index = levels.indexOf(level);
          const solved = solvedSet.has(level.id);
          // See Trail.tsx: a solved level is never locked (§10).
          const locked = index > current && !solved;
          const group = groupFor(level.teaches);
          const stars = starsByLevel[level.id] ?? 0;

          return (
            <button
              key={level.id}
              type="button"
              // aria-disabled, not the native `disabled` attribute -- see Trail.tsx's
              // matching comment: a disabled button fires no mouse events at all, which
              // would make the locked-hover reaction below impossible to trigger.
              aria-disabled={locked}
              aria-label={locked ? `${level.name}, not yet` : level.name}
              onMouseEnter={() => (locked ? levelLocked(level) : levelHovered(level))}
              onFocus={() => (locked ? levelLocked(level) : levelHovered(level))}
              onClick={() => {
                if (locked) return;
                levelSelected(level);
                onSelectLevel(level.id);
              }}
              className={`flex min-h-tap-lg flex-col gap-1 rounded-chunk-lg border-(length:--outline-chunk) p-4 text-left shadow-chunk transition-transform
                ${
                  locked
                    ? "cursor-not-allowed border-quest-locked-deep bg-quest-locked/40"
                    : "border-quest-ink/10 bg-quest-paper hover:-translate-y-0.5 active:translate-y-[3px]"
                }`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-display text-lg font-bold ${locked ? "text-quest-ink/35" : "text-quest-ink"}`}>
                  {index + 1}
                </span>
                {locked ? (
                  <span className="text-quest-locked-deep">
                    <Icon name="lock" size={18} />
                  </span>
                ) : solved ? (
                  <Icon name="check" size={18} />
                ) : null}
              </div>

              <div className={`font-display text-sm font-bold leading-tight ${locked ? "text-quest-ink/35" : "text-quest-ink"}`}>
                {level.name}
              </div>

              {locked ? (
                <div className="text-xs font-semibold text-quest-ink/35">not yet</div>
              ) : (
                <>
                  <p className="line-clamp-2 text-xs text-quest-ink-soft">{level.concept}</p>
                  <div className="mt-auto flex items-center justify-between pt-1">
                    <StarRow earned={stars} size={13} />
                    <span
                      className={`rounded-chunk-sm px-1.5 py-0.5 font-display text-[10px] font-bold text-white
                        ${group.tone === "move" ? "bg-quest-move" : ""}
                        ${group.tone === "repeat" ? "bg-quest-repeat" : ""}
                        ${group.tone === "cond" ? "bg-quest-cond" : ""}
                        ${group.tone === "while" ? "bg-quest-while" : ""}
                        ${group.tone === "gold" ? "bg-quest-gold !text-quest-ink" : ""}`}
                    >
                      {DIFFICULTY_LABEL[level.difficulty] ?? level.difficulty}
                    </span>
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
