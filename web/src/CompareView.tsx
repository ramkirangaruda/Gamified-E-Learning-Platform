import { useEffect, useState } from "react";
import { fetchCompare, type TierHintRecord } from "./api";
import Pet from "./pet/Pet";
import { friendlyError } from "./friendlyError";

// Queue item 6, and explicitly not a dev tool: "how I show judges the same key
// producing better hints on better hardware." Reads whatever's in tier_hint_history
// (internal/store) -- populated across *different machines* on the same drive (low
// tier demoed on the Pi, high tier on a laptop), which is why this has to read from the
// persisted drive state rather than this process's own live tier (a laptop running the
// high tier alone would have nothing to compare against otherwise).

const TIER_LABEL: Record<string, string> = { low: "Pi 5 (low tier)", high: "Laptop (high tier)" };

function TierCard({ tier }: { tier: TierHintRecord | undefined }) {
  const label = tier ? (TIER_LABEL[tier.tier] ?? tier.tier) : "Not demoed yet";
  return (
    <div className="flex flex-1 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">{label}</h2>
        {tier && <span className="text-xs text-slate-400">{tier.model}</span>}
      </div>
      {tier ? (
        <>
          <div className="flex items-start gap-3">
            <Pet mood="idle" name="" />
            <div className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {tier.hint_text}
            </div>
          </div>
          <div className="mt-auto flex justify-between text-xs text-slate-400">
            <span>{tier.level_id} · {tier.error_signature}</span>
            <span>{tier.latency_ms}ms</span>
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-400">
          Plug this key into that tier's hardware and get stuck once to fill this in.
        </p>
      )}
    </div>
  );
}

export default function CompareView() {
  const [records, setRecords] = useState<TierHintRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCompare().then(setRecords).catch((e) => setError(friendlyError("compare", e)));
  }, []);

  const low = records?.find((r) => r.tier === "low");
  const high = records?.find((r) => r.tier === "high");

  return (
    <div className="min-h-screen bg-slate-100 p-10">
      <h1 className="mb-1 text-2xl font-semibold text-slate-800">Same key, two machines</h1>
      <p className="mb-8 text-sm text-slate-500">
        The last hint generated at each tier — same drive, same child, different hardware.
      </p>
      {error && <p className="text-red-600">{error}</p>}
      <div className="flex gap-6">
        <TierCard tier={low} />
        <TierCard tier={high} />
      </div>
    </div>
  );
}
