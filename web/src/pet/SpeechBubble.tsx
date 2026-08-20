// Renders whatever text it is given; the caller (PlayPage) supplies a real, rephrased,
// pre-verified hint from /api/hint whenever a run fails (brief §11).
//
// AUDIT P1-2: the default used to read "I'll have real hints for you soon — M3
// territory." That was an M2 placeholder that survived M3 shipping, and because it is the
// default it was on screen for every level load -- a judge's first impression of the game
// screen was Pip announcing the tutor wasn't built yet. The idle line is now in-character
// and says nothing about milestones.

interface SpeechBubbleProps {
  text?: string;
}

export const IDLE_LINE = "Hi! I'm Pip. Build your program, hit Run, and I'll help if you get stuck!";

export default function SpeechBubble({ text = IDLE_LINE }: SpeechBubbleProps) {
  return (
    <div className="relative max-w-xs rounded-3xl border-2 border-quest-sun bg-white px-4 py-3 text-sm font-medium text-quest-ink shadow-md">
      {text}
      <div className="absolute -bottom-2 left-8 h-4 w-4 rotate-45 border-b-2 border-r-2 border-quest-sun bg-white" />
    </div>
  );
}
