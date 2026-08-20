import Icon from "./icons/Icon";
import { usePet } from "./pet/PetProvider";
import { SUBJECTS } from "./subjects";
import { CONCEPT_GROUPS } from "./trail/concepts";
import { StarRow } from "./ui/Chunky";
import { toneClasses, type ChunkyTone } from "./ui/tone";

// "Everything you've done so far" -- the redesign's one genuinely new destination.
//
// Every number here is DERIVED from state the app already had (solved_levels,
// stars_by_level, learner.points/total_xp, pet.evolution_stage). Nothing is stored for
// this page and no endpoint was added for it, which also means it cannot drift from what
// the trail and the pet bar show.
//
// It reads in two grains, because "how am I doing" is two different questions:
//   * by SUBJECT -- the top-level shape, matching the home screen's cards
//   * by TOPIC   -- within Coding, the six concept groups from trail/concepts.ts, which
//                   is the grain a teacher or a parent actually asks about ("has she got
//                   loops yet?")
//
// §10 applies here as much as anywhere: these are counts of things done, never of things
// missed, and nothing on this page decays or expires.

/** One derived row. Rendered identically for a subject and for a concept group, since
 *  both answer the same question at different grains. */
interface ProgressRow {
  key: string;
  title: string;
  blurb: string;
  tone: ChunkyTone;
  solved: number;
  total: number;
  stars: number;
  /** False for a subject with no content yet -- renders "coming soon", never "0 of 0". */
  available: boolean;
}

function StatTile({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-chunk-lg border-[var(--outline-chunk)] border-quest-ink/10 bg-quest-paper p-4 shadow-chunk">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-b-[3px] border-quest-gold-dark bg-quest-gold text-quest-ink">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="font-display text-2xl font-bold leading-tight text-quest-ink">{value}</div>
        <div className="text-xs font-semibold uppercase tracking-wide text-quest-ink-soft">{label}</div>
      </div>
    </div>
  );
}

function RowList({ title, rows }: { title: string; rows: ProgressRow[] }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-display text-xl font-bold text-quest-ink">{title}</h2>
      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const t = toneClasses(row.tone);
          return (
            <div
              key={row.key}
              className="flex flex-wrap items-center gap-4 rounded-chunk-lg border-[var(--outline-chunk)] border-quest-ink/10 bg-quest-paper p-4 shadow-chunk"
            >
              <div className="min-w-[10rem] flex-1">
                <div className="font-display text-base font-bold text-quest-ink">{row.title}</div>
                <div className="text-xs font-medium text-quest-ink-soft">{row.blurb}</div>
              </div>

              {row.available ? (
                <>
                  <div className="min-w-[8rem] flex-[2]">
                    <div
                      className="h-3 overflow-hidden rounded-full border-2 border-quest-ink/15 bg-quest-cream"
                      role="progressbar"
                      aria-label={`${row.title} progress`}
                      aria-valuenow={row.solved}
                      aria-valuemin={0}
                      aria-valuemax={row.total}
                    >
                      <div
                        className={`h-full origin-left rounded-full transition-transform duration-500 ease-out ${t.bg}`}
                        style={{ transform: `scaleX(${row.total > 0 ? row.solved / row.total : 0})` }}
                      />
                    </div>
                  </div>
                  <StarRow earned={Math.min(3, Math.floor(row.stars / Math.max(1, row.total)))} size={14} />
                  <span className="w-20 text-right font-display text-sm font-bold text-quest-ink">
                    {row.solved} / {row.total}
                  </span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-chunk-sm border-2 border-quest-locked bg-quest-locked/25 px-2.5 py-1 font-display text-[11px] font-bold text-quest-ink-soft">
                  <Icon name="lock" size={12} />
                  Coming soon
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function ProgressPage() {
  const { state, levels } = usePet();

  const solvedIds = new Set(state?.solved_levels ?? []);
  const starsByLevel = state?.stars_by_level ?? {};
  const totalStars = Object.values(starsByLevel).reduce((a, b) => a + b, 0);

  const subjectRows: ProgressRow[] = SUBJECTS.map((s) => {
    const subjectLevels = s.available ? levels : [];
    return {
      key: s.id,
      title: s.title,
      blurb: s.desc,
      tone: s.tone,
      solved: subjectLevels.filter((l) => solvedIds.has(l.id)).length,
      total: subjectLevels.length,
      stars: subjectLevels.reduce((a, l) => a + (starsByLevel[l.id] ?? 0), 0),
      available: s.available,
    };
  });

  // The six concept groups, in curriculum order. Each level declares its own group
  // (`teaches`), so inserting or reordering levels can never mis-group them here.
  const topicRows: ProgressRow[] = CONCEPT_GROUPS.map((g) => {
    const groupLevels = levels.filter((l) => l.teaches === g.teaches);
    return {
      key: g.teaches,
      title: g.title,
      blurb: g.blurb,
      tone: g.tone,
      solved: groupLevels.filter((l) => solvedIds.has(l.id)).length,
      total: groupLevels.length,
      stars: groupLevels.reduce((a, l) => a + (starsByLevel[l.id] ?? 0), 0),
      available: groupLevels.length > 0,
    };
  });

  return (
    <div className="mx-auto max-w-5xl px-6 pb-24 pt-6">
      <h1 className="mb-1 font-display text-3xl font-bold text-quest-ink">Your progress</h1>
      <p className="mb-6 font-medium text-quest-ink-soft">
        Everything you've done so far. Nothing here ever goes down.
      </p>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Points" value={state?.learner.points ?? 0} icon={<Icon name="star" size={20} />} />
        <StatTile label="Levels done" value={`${solvedIds.size} / ${levels.length}`} icon={<Icon name="check" size={20} />} />
        <StatTile label="Stars earned" value={totalStars} icon={<Icon name="trophy" size={20} />} />
        <StatTile label="Pet stage" value={(state?.pet.evolution_stage ?? 0) + 1} icon={<Icon name="party" size={20} />} />
      </div>

      <RowList title="By subject" rows={subjectRows} />
      <RowList title="Coding, topic by topic" rows={topicRows} />
    </div>
  );
}
