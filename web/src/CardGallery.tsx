import { useEffect, useRef, useState } from "react";
import * as Blockly from "blockly/core";
import { CARDS, registerCardBlocks } from "./blocks/cardBlocks";
import { exportCardPng, slugify } from "./exportCard";

registerCardBlocks();

const hostRefs = new Map<number, HTMLDivElement>();

// One card = one tiny, chrome-free, read-only Blockly workspace holding exactly one
// block. This page's only job is to be screenshotted per card (brief §6: "Each card is
// a printed screenshot of the corresponding Blockly block") — not to be a real editor.
function CardTile({ id, type, label }: { id: number; type: string; label: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    hostRefs.set(id, hostRef.current);

    // move.drag must be explicitly true — Blockly defaults an injected workspace to
    // non-movable unless a move option opts in, and scrollCenter()/cleanUp() below
    // silently no-op (with a console warning) on a non-movable workspace instead of
    // centering the block. Not readOnly either, for the same "who's allowed to move
    // things" reason; no toolbox means there's nothing to drag in regardless.
    const workspace = Blockly.inject(hostRef.current, {
      trashcan: false,
      zoom: { controls: false, wheel: false, startScale: 1.6 },
      scrollbars: true,
      sounds: false,
      move: { drag: true, scrollbars: true, wheel: false },
    });

    const block = workspace.newBlock(type);
    block.initSvg();
    block.render();
    workspace.cleanUp();
    workspace.scrollCenter();

    return () => {
      workspace.dispose();
      hostRefs.delete(id);
    };
  }, [id, type]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs font-mono text-slate-400">
        card {id.toString().padStart(2, "0")}
      </div>
      <div
        ref={hostRef}
        data-card-id={id}
        data-card-label={label}
        className="h-[140px] w-[320px] rounded-xl border border-slate-300 bg-white shadow-sm"
      />
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ExportAllButton() {
  const [status, setStatus] = useState<"idle" | "exporting" | "done">("idle");

  async function handleExportAll() {
    setStatus("exporting");
    for (const card of CARDS) {
      const host = hostRefs.get(card.id);
      if (!host) continue;
      const blob = await exportCardPng(host);
      const filename = `card-${card.id.toString().padStart(2, "0")}-${slugify(card.label)}.png`;
      downloadBlob(blob, filename);
      // Stagger downloads — firing 14 at once is what gets a browser's multi-download
      // prompt to silently drop some of them.
      await new Promise((r) => setTimeout(r, 150));
    }
    setStatus("done");
  }

  return (
    <button
      type="button"
      onClick={handleExportAll}
      disabled={status === "exporting"}
      className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
    >
      {status === "exporting" ? "Exporting…" : status === "done" ? "Exported ✓ (run again to re-export)" : "Export all 14 cards (PNG)"}
    </button>
  );
}

export default function CardGallery() {
  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-slate-800">
            Tessera Quest — card gallery
          </h1>
          <p className="text-sm text-slate-500">
            Each tile is the exact Blockly render for that card — this is the source of
            truth for the printed cards (brief §6). 14 cards, levels 1–3.
          </p>
        </div>
        <ExportAllButton />
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {CARDS.map((card) => (
          <CardTile key={card.id} id={card.id} type={card.type} label={card.label} />
        ))}
      </div>
    </div>
  );
}
