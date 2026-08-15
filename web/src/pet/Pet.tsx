import type { PetMood } from "./reward";

// All-SVG/CSS, no external assets (brief §10 / queue item 5). Three states minimum
// (idle, happy, confused) plus hungry since the hunger meter needs *some* visible
// expression of "low" or the stat is invisible to the child it's meant to motivate.
// Body shape is shared across moods so evolution-stage silhouette changes (later
// milestones) only need to swap this one path, not four.

interface PetProps {
  mood: PetMood;
  name?: string;
  evolutionStage?: number;
}

const BODY_FILL: Record<PetMood, string> = {
  idle: "#38bdf8",
  happy: "#34d399",
  confused: "#a78bfa",
  hungry: "#fb923c",
};

const ANIMATION_CLASS: Record<PetMood, string> = {
  idle: "quest-pet-idle",
  happy: "quest-pet-happy",
  confused: "quest-pet-confused",
  hungry: "quest-pet-hungry",
};

export default function Pet({ mood, name = "Pip", evolutionStage = 0 }: PetProps) {
  return (
    <div className="flex flex-col items-center gap-1" data-pet-mood={mood}>
      <svg viewBox="-60 -60 120 120" width={140} height={140} className={ANIMATION_CLASS[mood]}>
        {/* body */}
        <ellipse cx={0} cy={8} rx={42} ry={38} fill={BODY_FILL[mood]} stroke="#0f172a" strokeOpacity={0.15} strokeWidth={2} />
        {/* stage marker: a tiny extra ring once evolved, cheap stand-in for real stage art */}
        {evolutionStage > 0 && (
          <ellipse cx={0} cy={8} rx={48} ry={44} fill="none" stroke="#f59e0b" strokeWidth={3} strokeDasharray="6 5" />
        )}

        {mood === "happy" ? (
          <g>
            <path d="M -18 0 Q -12 -10 -6 0" stroke="#0f172a" strokeWidth={3} fill="none" strokeLinecap="round" />
            <path d="M 6 0 Q 12 -10 18 0" stroke="#0f172a" strokeWidth={3} fill="none" strokeLinecap="round" />
            <path d="M -14 20 Q 0 32 14 20" stroke="#0f172a" strokeWidth={3} fill="none" strokeLinecap="round" />
            <text x={30} y={-28} fontSize={22}>✦</text>
            <text x={-46} y={-20} fontSize={16}>✦</text>
          </g>
        ) : mood === "confused" ? (
          <g>
            <circle cx={-12} cy={0} r={4} fill="#0f172a" />
            <circle cx={12} cy={0} r={4} fill="#0f172a" />
            <path d="M -14 22 Q -6 16 0 22 Q 6 28 14 20" stroke="#0f172a" strokeWidth={3} fill="none" strokeLinecap="round" />
            <text x={20} y={-30} fontSize={26} fontWeight="bold" fill="#0f172a">?</text>
          </g>
        ) : mood === "hungry" ? (
          <g>
            <path d="M -16 2 Q -12 6 -8 2" stroke="#0f172a" strokeWidth={3} fill="none" strokeLinecap="round" />
            <path d="M 8 2 Q 12 6 16 2" stroke="#0f172a" strokeWidth={3} fill="none" strokeLinecap="round" />
            <path d="M -10 22 Q 0 18 10 22" stroke="#0f172a" strokeWidth={3} fill="none" strokeLinecap="round" />
          </g>
        ) : (
          <g>
            <circle cx={-12} cy={0} r={4} fill="#0f172a" />
            <circle cx={12} cy={0} r={4} fill="#0f172a" />
            <path d="M -10 20 Q 0 26 10 20" stroke="#0f172a" strokeWidth={3} fill="none" strokeLinecap="round" />
          </g>
        )}
      </svg>
      <div className="text-sm font-medium text-slate-600">{name}</div>
    </div>
  );
}
