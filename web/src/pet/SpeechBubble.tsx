// Renders whatever text it is given; the caller (PlayPage) supplies a real, rephrased,
// pre-verified hint from /api/hint whenever a run fails (brief §11).
//
// AUDIT P1-2: the default used to read "I'll have real hints for you soon — M3
// territory." That was an M2 placeholder that survived M3 shipping, and because it is the
// default it was on screen for every level load -- a judge's first impression of the game
// screen was the pet announcing the tutor wasn't built yet. The idle line is now in-character
// and says nothing about milestones.

type Tail = "up" | "down" | "left";

interface SpeechBubbleProps {
  text?: string;
  /** Which way the tail points -- i.e. where the speaker is relative to the bubble.
   *  Defaults to "down" (bubble sits above the pet), which is what the bubble always
   *  drew, whether or not it was true of the layout it was dropped into. */
  tail?: Tail;
}

export const IDLE_LINE = "Hi! I'm Tom. Build your program, hit Run, and I'll help if you get stuck!";

// The tail is one square rotated 45°, keeping only the TWO borders that face away from
// the bubble -- those two edges become the "V" of the tail while the other two sit under
// the bubble's own background, which is what makes it read as the outline continuing
// rather than a diamond stuck on the side. Which two depends on which way it points, and
// getting that pairing wrong is exactly what made the pet's bubble look inside-out: it
// hangs BELOW the pet bar, so its tail has to rise to meet the pet, not drop away from it.
//
// (Rotating clockwise 45° swings each edge's outward normal by the same 45°: the top and
// left edges end up facing up-right and up-left, so they are the pair that forms an
// upward point; bottom+right form a downward one; bottom+left, a leftward one.)
// Every offset below is >= 28px for the same reason: rounded-chunk-lg is a 1.75rem
// radius, so the bubble's edges only run straight once you are past the corner. A tail
// planted inside the curve sits off the outline instead of growing out of it.
const TAIL: Record<Tail, string> = {
  // left-8 lines the point up with the pet sprite in nav/AppHeader's pet row; the same
  // offset serves "down" so a bubble placed above the pet stays aimed at the same spot.
  up: "-top-2 left-8 border-l-(length:--outline-chunk) border-t-(length:--outline-chunk)",
  down: "-bottom-2 left-8 border-b-(length:--outline-chunk) border-r-(length:--outline-chunk)",
  left: "-left-2 top-8 border-b-(length:--outline-chunk) border-l-(length:--outline-chunk)",
};

export default function SpeechBubble({ text = IDLE_LINE, tail = "down" }: SpeechBubbleProps) {
  // key on the text so React remounts the node when a new hint arrives -- that restart
  // is what re-triggers the one-shot entrance animation. quest-decorative marks it as
  // something lite mode switches off. The entrance travels from wherever the speaker is,
  // so a bubble that hangs below the pet drops in from above instead of rising past it.
  return (
    <div
      key={text}
      className={`quest-decorative ${tail === "up" ? "quest-bubble-in-down" : "quest-bubble-in"} relative max-w-xs rounded-chunk-lg border-(length:--outline-chunk) border-quest-repeat bg-white px-4 py-3 text-sm font-medium text-quest-ink shadow-chunk`}
    >
      {text}
      <div className={`absolute h-4 w-4 rotate-45 border-quest-repeat bg-white ${TAIL[tail]}`} />
    </div>
  );
}
