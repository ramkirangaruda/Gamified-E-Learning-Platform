// The Math subject's actual content: four mini-games (Fix the Machine, Math Detective,
// Math Tetris, Escape Room) plus a "create your own questions" mode, exported from a
// Claude Artifact and bundled fully offline. Its own manifest already embeds every asset
// (fonts, React itself) as base64 blobs unpacked client-side at load, so it needs no
// network access and no build step here -- see public/math-lab.html. Verified against the
// bundle's actual network traffic before wiring it in, not assumed: every asset it loads,
// including React itself, comes from local blob: URLs, not a live unpkg.com fetch (see
// DECISIONS.md).
//
// Rendered in an <iframe>, not inlined into the page's own DOM: the artifact ships its own
// extensive inline styling and a proprietary template runtime, and isolating it sidesteps
// any risk of it colliding with this app's Tailwind classes or vice versa -- same reasoning
// as why the mascot's Rive canvas is contained rather than painted into the shared page.
//
// No header/back-button of its own: rendered inside SubjectPage.tsx, which already
// supplies the subject header, and the redesign's persistent AppHeader nav is how a child
// leaves a subject -- there is no per-page back affordance anywhere else in the app either.
export default function MathPage() {
  return (
    <div className="mx-auto mt-4 h-[calc(100vh-var(--app-header-h)-7rem)] max-w-6xl px-6">
      {/* No `sandbox` attribute, deliberately: this bundle needs full page privileges
          (its own React tree, blob: URLs, real event handlers) to render at all, and it's
          trusted, same-origin content shipped with the app rather than arbitrary third-
          party content -- locking it down would just break it, not add real safety here. */}
      <iframe
        src="/math-lab.html"
        title="Math Lab"
        className="h-full w-full rounded-chunk-lg border-(length:--outline-chunk) border-white shadow-chunk"
      />
    </div>
  );
}
