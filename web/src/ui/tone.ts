// The tone -> Tailwind class table, extracted from ui/Chunky.tsx so the dashboard shell
// (subject tabs, subject cards, progress bars, badges) can paint with the exact same
// palette the chunky component vocabulary already uses -- one table, not two that drift.
//
// Lives in its own non-component module rather than being exported from Chunky.tsx
// because a file that exports both components and plain values loses React Fast Refresh
// (oxlint's react(only-export-components) rule flags exactly that).
//
// The colours themselves are the four printed-card colours plus the gold reward accent
// and coral -- see tokens.css, which is where they are actually defined.

export type ChunkyTone = "move" | "repeat" | "cond" | "while" | "gold" | "neutral" | "coral";

export interface ToneClasses {
  /** Solid fill. */
  bg: string;
  /** The darker companion, used for the outline/offset edge. */
  border: string;
  /** Legible foreground on `bg`. */
  text: string;
  /** A soft wash of the same hue, for card fills and progress-track fills. */
  soft: string;
  /** The dark hue as TEXT, for a label sitting on a soft wash. */
  ink: string;
}

export const TONE: Record<ChunkyTone, ToneClasses> = {
  move: { bg: "bg-quest-move", border: "border-quest-move-dark", text: "text-white", soft: "bg-quest-move/12", ink: "text-quest-move-dark" },
  repeat: { bg: "bg-quest-repeat", border: "border-quest-repeat-dark", text: "text-white", soft: "bg-quest-repeat/12", ink: "text-quest-repeat-dark" },
  cond: { bg: "bg-quest-cond", border: "border-quest-cond-dark", text: "text-white", soft: "bg-quest-cond/12", ink: "text-quest-cond-dark" },
  while: { bg: "bg-quest-while", border: "border-quest-while-dark", text: "text-white", soft: "bg-quest-while/12", ink: "text-quest-while-dark" },
  gold: { bg: "bg-quest-gold", border: "border-quest-gold-dark", text: "text-quest-ink", soft: "bg-quest-gold/15", ink: "text-quest-gold-dark" },
  coral: { bg: "bg-quest-coral", border: "border-quest-coral-dark", text: "text-white", soft: "bg-quest-coral/12", ink: "text-quest-coral-dark" },
  neutral: { bg: "bg-quest-paper", border: "border-quest-locked", text: "text-quest-ink", soft: "bg-quest-locked/20", ink: "text-quest-ink-soft" },
};

export function toneClasses(tone: ChunkyTone): ToneClasses {
  return TONE[tone];
}
