// Ready for M3's tutor pipeline (brief §11): that milestone fills this with a rephrased,
// pre-verified hint keyed by the executor's error_signature. Nothing here should need to
// change when M3 lands -- it's already just "render whatever text I'm given" -- only the
// caller changes from a hardcoded placeholder to a real /api/hint response.

interface SpeechBubbleProps {
  text?: string;
}

const PLACEHOLDER = "Hi! I'm Pip. I'll have real hints for you soon — M3 territory.";

export default function SpeechBubble({ text = PLACEHOLDER }: SpeechBubbleProps) {
  return (
    <div className="relative max-w-xs rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm">
      {text}
      <div className="absolute -bottom-2 left-8 h-4 w-4 rotate-45 border-b border-r border-slate-300 bg-white" />
    </div>
  );
}
