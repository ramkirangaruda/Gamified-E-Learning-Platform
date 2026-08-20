// Renders whatever text it is given; the caller (PlayPage) supplies a real, rephrased,
// pre-verified hint from /api/hint whenever a run fails (brief §11).
//
// AUDIT P1-2: the default used to read "I'll have real hints for you soon — M3
// territory." That was an M2 placeholder that survived M3 shipping, and because it is the
// default it was on screen for every level load -- a judge's first impression of the game
// screen was the pet announcing the tutor wasn't built yet. The idle line is now in-character
// and says nothing about milestones.

interface SpeechBubbleProps {
  text?: string;
}

export const IDLE_LINE = "Hi! I'm Tom. Build your program, hit Run, and I'll help if you get stuck!";

export default function SpeechBubble({ text = IDLE_LINE }: SpeechBubbleProps) {
  // key on the text so React remounts the node when a new hint arrives -- that restart
  // is what re-triggers the one-shot entrance animation. quest-decorative marks it as
  // something lite mode switches off.
  return (
    <div
      key={text}
      className="quest-decorative quest-bubble-in relative max-w-xs rounded-chunk-lg border-[var(--outline-chunk)] border-quest-repeat bg-white px-4 py-3 text-sm font-medium text-quest-ink shadow-chunk">
      {text}
      <div className="absolute -bottom-2 left-8 h-4 w-4 rotate-45 border-b-[var(--outline-chunk)] border-r-[var(--outline-chunk)] border-quest-repeat bg-white" />
    </div>
  );
}
