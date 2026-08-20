import { useState } from "react";
import BackgroundScene from "./BackgroundScene";
import EscapeRoom from "./mathlab/EscapeRoom";
import FixTheMachine from "./mathlab/FixTheMachine";
import GamePicker, { type MathGameId } from "./mathlab/GamePicker";
import MathDetective from "./mathlab/MathDetective";
import MathTetris from "./mathlab/MathTetris";
import { ChunkyButton } from "./ui/Chunky";
import { toneClasses } from "./ui/tone";

// Math Lab's own shell -- same non-trail shape as ChemLabPage.tsx: it owns its full
// header (never SubjectPage's generic one, which is built from Coding-level counts that
// don't apply here) and a session-only "⭐ N" tally, exactly like Chemistry's round
// counter. Replaces the old <iframe src="/math-lab.html"> (MathPage.tsx, deleted): that
// bundle had its own hardcoded mascot and its own disconnected star count, which is
// exactly the "window within the section, with its own pet and stars" this rebuild
// removes -- every game below renders the SAME shared <Pet> the rest of the app does and
// pays into the SAME points economy via usePet().commitState() (see mathlab/reward.ts).
//
// `activeGame` switches content in place rather than navigating -- the direct equivalent
// of the old bundle's "Back to Lab" -- so the session tally survives switching games. It
// resets only when this page itself unmounts (leaving the Math subject entirely).

interface MathLabPageProps {
  subjectLetter: string;
  subjectTitle: string;
}

export default function MathLabPage({ subjectLetter, subjectTitle }: MathLabPageProps) {
  const [activeGame, setActiveGame] = useState<MathGameId | null>(null);
  const [stars, setStars] = useState(0);

  const t = toneClasses("coral");

  function handleSolved() {
    setStars((s) => s + 1);
  }

  return (
    <div className="relative min-h-[calc(100vh-var(--app-header-h))] w-full overflow-x-hidden">
      <BackgroundScene solvedCount={stars} />

      <header className="relative mx-auto max-w-6xl px-6 pt-6">
        <div className="flex flex-wrap items-center gap-4 rounded-chunk-lg border-(length:--outline-chunk) border-white bg-quest-paper px-6 py-4 shadow-chunk">
          <span
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-b-[3px] font-display text-xl font-bold shadow-chunk-sm ${t.bg} ${t.border} ${t.text}`}
            aria-hidden="true"
          >
            {subjectLetter}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-bold text-quest-ink">{subjectTitle} Lab</h1>
            <p className="font-medium text-quest-ink-soft">Games with numbers</p>
          </div>
          <span className="rounded-chunk-sm border-2 border-quest-gold-dark bg-quest-gold/20 px-3 py-1.5 font-display text-sm font-bold text-quest-gold-dark">
            ⭐ {stars}
          </span>
        </div>
      </header>

      <main className="relative mx-auto mt-6 max-w-6xl px-6 pb-24">
        {activeGame !== null && (
          <ChunkyButton tone="neutral" className="mb-4" onClick={() => setActiveGame(null)}>
            ← Back to Lab
          </ChunkyButton>
        )}

        {activeGame === null && <GamePicker onSelect={setActiveGame} />}
        {activeGame === "machine" && <FixTheMachine onSolved={handleSolved} />}
        {activeGame === "detective" && <MathDetective onSolved={handleSolved} />}
        {activeGame === "tetris" && <MathTetris onSolved={handleSolved} />}
        {activeGame === "escape" && <EscapeRoom onSolved={handleSolved} />}
      </main>
    </div>
  );
}
