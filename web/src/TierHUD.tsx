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
      <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
        Tutor offline
      </div>
    );
  }

  const ramGb = (tier.available_mb / 1024).toFixed(1);

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1.5 text-xs font-medium text-white shadow-sm">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      <span>{TIER_LABEL[tier.tier] ?? tier.tier}</span>
      <span className="text-slate-400">·</span>
      <span>{shortModelName(tier.model)}</span>
      <span className="text-slate-400">·</span>
      <span>{ramGb} GB</span>
      {lastLatencyMs !== null && (
        <>
          <span className="text-slate-400">·</span>
          <span className="text-slate-300">{lastLatencyMs}ms</span>
        </>
      )}
    </div>
  );
}
