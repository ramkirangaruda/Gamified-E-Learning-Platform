import type { ButtonHTMLAttributes, ReactNode } from "react";
import { TONE, type ChunkyTone } from "./tone";

export type { ChunkyTone };

// The chunky/sticker component vocabulary. Every interactive surface in the game is one
// of these, so the "thick outline + offset solid shadow + press-down" behaviour is
// defined once rather than re-typed as ad-hoc Tailwind on every button.
//
// The press interaction is the important part: the shadow offset shrinks and the element
// translates down by the same amount, so the button physically depresses. That is the
// single highest-value piece of feedback in the whole UI for this age group -- it makes
// every click feel like it did something even before the app responds.
//
// Transform/opacity only (tokens.css motion policy). Nothing here animates while idle.

// The tone table itself now lives in ui/tone.ts so the dashboard shell can share it --
// re-exported above so every existing `import { ChunkyTone } from "../ui/Chunky"` still
// resolves and no call site had to change.

interface ChunkyButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ChunkyTone;
  size?: "md" | "lg";
  children: ReactNode;
}

export function ChunkyButton({ tone = "move", size = "md", className = "", children, ...rest }: ChunkyButtonProps) {
  const t = TONE[tone];
  // min-h-tap / min-h-tap-lg are the 48px and 64px floors from tokens.css.
  const sizing = size === "lg" ? "min-h-tap-lg px-7 text-xl" : "min-h-tap px-5 text-base";
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-chunk border-b-[var(--outline-chunk-thick)] font-display font-bold
        ${t.bg} ${t.border} ${t.text} ${sizing}
        shadow-chunk transition-transform duration-100
        hover:-translate-y-0.5 active:translate-y-[3px] active:shadow-chunk-sm
        disabled:pointer-events-none disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  );
}

interface ChunkyCardProps {
  tone?: ChunkyTone;
  className?: string;
  children: ReactNode;
}

export function ChunkyCard({ tone = "neutral", className = "", children }: ChunkyCardProps) {
  const t = TONE[tone];
  return (
    <div className={`rounded-chunk-lg border-[var(--outline-chunk)] ${t.bg} ${t.border} ${t.text} shadow-chunk ${className}`}>
      {children}
    </div>
  );
}

/** A single filled or empty star. Stars are the only progress currency shown per level. */
export function Star({ filled, size = 20 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.5 L14.8 9 L21.8 9.6 L16.5 14.2 L18.1 21 L12 17.3 L5.9 21 L7.5 14.2 L2.2 9.6 L9.2 9 Z"
        fill={filled ? "var(--color-quest-gold)" : "var(--color-quest-locked)"}
        stroke={filled ? "var(--color-quest-gold-dark)" : "var(--color-quest-locked-deep)"}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Row of three stars — the per-level score shown on the trail and the grid. */
export function StarRow({ earned, size = 20 }: { earned: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${earned} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <Star key={i} filled={i < earned} size={size} />
      ))}
    </span>
  );
}

/** Concept-group chip. Colour carries the meaning, text repeats it for clarity. */
export function ConceptChip({ tone, label }: { tone: ChunkyTone; label: string }) {
  const t = TONE[tone];
  return (
    <span className={`inline-flex items-center rounded-chunk-sm border-2 ${t.bg} ${t.border} ${t.text} px-2.5 py-1 font-display text-xs font-bold`}>
      {label}
    </span>
  );
}
