import type { TierInfo } from "./api";

// Brief §8: "Expose the choice in the UI as a small status pill... expose live RAM and
// per-request latency on the game screen, styled as part of the game HUD, not a debug
// panel." Deliberately reuses the exact label format from the brief's own examples
// ("Pi mode · 0.6B · 1.4 GB") rather than inventing new wording.

const TIER_LABEL: Record<string, string> = {
  low: "Pi mode",
  high: "Laptop mode",
};

function shortModelName(model: string): string {
  // "qwen3-0.6b-q4_k_m.gguf" -> "0.6B"
  const match = model.match(/(\d+(?:\.\d+)?b)/i);
  return match ? match[1].toUpperCase() : model;
}

interface TierHUDProps {
  tier: TierInfo | null;
  lastLatencyMs: number | null;
}

export default function TierHUD({ tier, lastLatencyMs }: TierHUDProps) {
  if (!tier || !tier.tier) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 font-display text-xs font-bold text-quest-ink/40 shadow-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-quest-ink/20" />
        Tutor offline
      </div>
    );
  }

  const ramGb = (tier.available_mb / 1024).toFixed(1);

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-quest-ink px-3 py-1.5 font-display text-xs font-bold text-white shadow-md">
      <span className="h-1.5 w-1.5 rounded-full bg-quest-grass" />
      <span>{TIER_LABEL[tier.tier] ?? tier.tier}</span>
      <span className="text-white/40">·</span>
      <span>{shortModelName(tier.model)}</span>
      <span className="text-white/40">·</span>
      <span>{ramGb} GB</span>
      {lastLatencyMs !== null && (
        <>
          <span className="text-white/40">·</span>
          {/* AUDIT P1-1: a pre-warmed (cached) hint has a real latency of 0, which used
              to render as a bare "0ms" or -- before the API sent the field at all --
              as nothing. "instant" is both truthful and the better demo line. */}
          <span className="text-quest-sun">{lastLatencyMs > 0 ? `${lastLatencyMs}ms` : "instant"}</span>
        </>
      )}
    </div>
  );
}
