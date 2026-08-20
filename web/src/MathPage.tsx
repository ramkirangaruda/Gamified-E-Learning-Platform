// The Math tab: a self-contained interactive page (four mini-games -- Fix the Machine,
// Math Detective, Math Tetris, Escape Room -- plus a "create your own questions" mode)
// exported from a Claude Artifact and bundled fully offline. Its own manifest already
// embeds every asset (fonts, React itself) as base64 blobs unpacked client-side at load,
// so it needs no network access and no build step here -- see public/math-lab.html.
//
// Rendered in an <iframe>, not inlined into this page's own DOM: the artifact ships its
// own extensive inline styling and a proprietary template runtime (visible if you inspect
// the bundle's source), and this app's own Tailwind utility classes are exactly the kind
// of global class names that could collide with an unrelated page's styling if the two
// shared one document. An iframe keeps the two fully isolated -- same reasoning as why
// the mascot's Rive canvas is contained rather than painted into the shared page.
interface MathPageProps {
  onBackToDashboard: () => void;
}

export default function MathPage({ onBackToDashboard }: MathPageProps) {
  return (
    <div className="flex h-[calc(100vh-var(--pet-bar-h))] w-full flex-col bg-quest-cream">
      <div className="flex items-center justify-between p-3">
        <button
          type="button"
          onClick={onBackToDashboard}
          className="rounded-full bg-white/70 px-3 py-1.5 font-display text-sm font-bold text-quest-ink shadow-sm transition-transform hover:-translate-y-0.5"
        >
          ← My path
        </button>
        <span className="rounded-full bg-quest-gold/20 px-3 py-1.5 font-display text-sm font-bold text-quest-gold-dark">
          Math Lab
        </span>
      </div>

      {/* No `sandbox` attribute, deliberately: this bundle needs full page privileges
          (its own React tree, blob: URLs, real event handlers) to render at all, and it's
          trusted, same-origin content shipped with the app rather than arbitrary third-
          party content -- locking it down would just break it, not add real safety here. */}
      <iframe src="/math-lab.html" title="Math Lab" className="w-full flex-1 border-0" />
    </div>
  );
}
