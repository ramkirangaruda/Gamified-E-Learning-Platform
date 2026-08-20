import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

// The one modal shell, shared by pet/TreatShop.tsx and pet/ClassroomPanel.tsx.
//
// It exists because of a bug neither panel could have fixed on its own. TreatShop is
// rendered by PetBar, which lives inside nav/AppHeader's fixed shell -- and that shell
// carries `backdrop-blur-sm`. A backdrop-filter makes an element the CONTAINING BLOCK for
// every fixed-position descendant, so the shop's `fixed inset-0` resolved against the
// 144px-tall header instead of the viewport: the dim backdrop covered only the header
// strip, and the panel, centred inside a box far shorter than itself, hung off both ends
// of it equally -- which is exactly why the top of the treat shop was cut off above the
// screen with no way to scroll to it. Portalling to document.body takes the panel out of
// the header entirely, so no ancestor's filter, transform, or containment can ever
// reposition a dialog again, wherever the button that opens it happens to live.
//
// The scroll shape is the second half of that fix, for the case the containing-block bug
// was masking anyway: a panel taller than a short window. `items-center` on its own
// overflows a flex container in BOTH directions, and the half that spills past the top
// edge is unreachable -- scrolling only ever reveals the bottom. So the scroll lives on
// the OUTER box and the centring on an inner `min-h-full` box: short panels still centre,
// tall ones scroll from their very first pixel.

interface ModalProps {
  /** Accessible name for the dialog. */
  label: string;
  onClose: () => void;
  /** Panel width cap -- the only thing the two call sites disagree on. */
  width?: string;
  children: ReactNode;
}

export default function Modal({ label, onClose, width = "max-w-lg", children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Click-outside closes, but only when the press STARTED outside too. Without this, a
  // child who drags across the panel's text and releases past its edge has the dialog
  // shut under them, and so does anyone who lets go of the overlay's own scrollbar.
  const pressedBackdrop = useRef(false);

  return createPortal(
    // Backdrop and scroller are the same element; overscroll-contain is what stops a
    // flick inside the dialog from scrolling the page behind it once it hits the end.
    <div
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-quest-ink/35"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      {/* The click target for "outside" is this centring box, not the scroller above it,
          so a click that lands on the scrollbar can never be mistaken for one. */}
      <div
        className="flex min-h-full items-center justify-center p-4"
        onMouseDown={(e) => {
          pressedBackdrop.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          if (pressedBackdrop.current && e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className={`w-full ${width} rounded-chunk-xl border-(length:--outline-chunk-thick) border-quest-ink/15 bg-quest-paper p-6 shadow-chunk-lg`}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
