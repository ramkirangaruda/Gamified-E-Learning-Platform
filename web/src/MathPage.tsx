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
//
// The iframe itself carries no border/shadow/rounded-box framing and math-lab.html's own
// background is transparent -- both deliberately, so the app's shared BackgroundScene
// (rendered by SubjectPage, behind this iframe) shows straight through and the game cards
// read as sitting directly on the page, the same way PhysicsQuest's do, rather than as a
// separate "window" floating inside the app. See DECISIONS.md for the "window inside a
// window" fix this was.
//
// A fixed-height iframe with its own overflow reads as a second scrollable page nested
// inside this one -- two scrollbars, two "pages". Since math-lab.html is same-origin, its
// contentDocument is readable directly (no postMessage handshake needed), so the iframe's
// own height can be kept in sync with its actual content height and it never has anything
// to scroll -- the outer page's scrollbar ends up the only one.
//
// Polling rather than ResizeObserver: a ResizeObserver watching an element in a *different*
// document than the one it's constructed in does not reliably fire here (verified live --
// zero callbacks after 1s on a stable, already-loaded body, despite the spec calling for an
// initial notification). A 250ms poll is imperceptible for a child navigating between the
// game selector and a level, and it needs no cross-document API to trust.
import { useEffect, useRef, useState } from "react";

export default function MathPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const measure = () => {
      const h = iframe.contentDocument?.body?.scrollHeight;
      if (h) setHeight((prev) => (prev === h ? prev : h));
    };

    const id = window.setInterval(measure, 250);
    iframe.addEventListener("load", measure);
    measure();

    return () => {
      window.clearInterval(id);
      iframe.removeEventListener("load", measure);
    };
  }, []);

  return (
    <div className="relative mx-auto mt-2 max-w-6xl">
      {/* No `sandbox` attribute, deliberately: this bundle needs full page privileges
          (its own React tree, blob: URLs, real event handlers) to render at all, and it's
          trusted, same-origin content shipped with the app rather than arbitrary third-
          party content -- locking it down would just break it, not add real safety here. */}
      <iframe
        ref={iframeRef}
        src="/math-lab.html"
        title="Math Lab"
        className="block w-full overflow-hidden"
        style={{ height: height || "calc(100vh - var(--app-header-h) - 5rem)" }}
        scrolling="no"
      />
    </div>
  );
}
