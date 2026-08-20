import { useEffect, useState } from "react";
import BackgroundScene from "./BackgroundScene";
import Pet from "./pet/Pet";
import SpeechBubble from "./pet/SpeechBubble";
import { usePet } from "./pet/PetProvider";
import { toneClasses, type ChunkyTone } from "./ui/tone";
import { ChunkyButton } from "./ui/Chunky";
import {
  fetchChemistrySamples,
  guessChemistrySample,
  type ChemistryChoice,
  type ChemistryClue,
  type ChemistrySample,
  type ChemistryTest,
} from "./api";

// Chem Lab: identify a mystery chemical sample from clues revealed by five lab tests,
// then guess which of four candidates it is -- built against a Claude Design mockup the
// user supplied. The server is the only thing that ever knows the right answer
// (chemistrySampleResponse omits it; handleChemistryGuess grades it) -- the same
// "server is authoritative" rule /api/program already applies to a coding level's goal,
// so nothing here is a client-side trust boundary.
//
// Deliberately session-scoped, not persisted, matching SandboxPage's own precedent for
// exactly the same reason: there's no per-sample "already solved" record on this drive
// (that would need a new store table this session doesn't build), and awarding real,
// permanent points for an activity a child could otherwise reload and replay forever
// would be the exact economy-farming hole Sandbox's own design entry closed off. The
// star count here is real feedback, not a fake progress claim -- it's just honest about
// living only as long as the tab does, the same as mascot/progress.ts's session streak.

const WELCOME_LINE = "Welcome to the lab! Click on a test to examine the mystery sample. Each test reveals a clue!";

interface TestDef {
  test: ChemistryTest;
  label: string;
  emoji: string;
  tone: ChunkyTone;
}

const TESTS: TestDef[] = [
  { test: "flame", label: "Flame Test", emoji: "🔥", tone: "coral" },
  { test: "ph", label: "pH Test", emoji: "🧪", tone: "cond" },
  { test: "solubility", label: "Solubility", emoji: "💧", tone: "move" },
  { test: "reactivity", label: "Reactivity", emoji: "⚡", tone: "repeat" },
  { test: "smell", label: "Smell Test", emoji: "👃", tone: "while" },
];

interface ChemLabPageProps {
  subjectLetter: string;
  subjectTitle: string;
}

export default function ChemLabPage({ subjectLetter, subjectTitle }: ChemLabPageProps) {
  const { state, react, say, answerCorrect, answerIncorrect } = usePet();

  const [samples, setSamples] = useState<ChemistrySample[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [roundIndex, setRoundIndex] = useState(0);
  const [revealedTests, setRevealedTests] = useState<Set<ChemistryTest>>(new Set());
  const [guess, setGuess] = useState<{ choiceId: string; correct: boolean; answer: ChemistryChoice } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [stars, setStars] = useState(0);
  const [assistantText, setAssistantText] = useState(WELCOME_LINE);

  useEffect(() => {
    fetchChemistrySamples()
      .then(setSamples)
      .catch(() => setLoadError(true));
  }, []);

  const t = toneClasses("while");
  const sample = samples?.[roundIndex] ?? null;
  const sessionDone = samples !== null && roundIndex >= samples.length;

  function revealTest(clue: ChemistryClue) {
    setRevealedTests((prev) => new Set(prev).add(clue.test));
    setAssistantText(clue.text);
    say(clue.text);
    react("playful");
  }

  async function submitGuess(choiceId: string) {
    if (!sample || guess || submitting) return;
    setSubmitting(true);
    try {
      const result = await guessChemistrySample(sample.id, choiceId);
      setGuess({ choiceId, correct: result.correct, answer: result.answer });
      const line = result.correct
        ? `Yes! It's ${result.answer.name} (${result.answer.formula}). Great detective work!`
        : `Not quite -- it was actually ${result.answer.name} (${result.answer.formula}). Look at the clues next time!`;
      setAssistantText(line);
      say(line);
      if (result.correct) {
        setStars((s) => s + 1);
        answerCorrect();
      } else {
        answerIncorrect();
      }
    } catch {
      const line = "Hmm, I couldn't check that guess just now. Try again?";
      setAssistantText(line);
      say(line);
    } finally {
      setSubmitting(false);
    }
  }

  function nextRound() {
    setRoundIndex((i) => i + 1);
    setRevealedTests(new Set());
    setGuess(null);
    setAssistantText(WELCOME_LINE);
  }

  function restart() {
    setRoundIndex(0);
    setRevealedTests(new Set());
    setGuess(null);
    setStars(0);
    setAssistantText(WELCOME_LINE);
  }

  const header = (
    <header className="relative mx-auto max-w-6xl px-6 pt-6">
      <div className="flex flex-wrap items-center gap-4 rounded-chunk-lg border-[var(--outline-chunk)] border-white bg-quest-paper/80 px-6 py-4 shadow-chunk backdrop-blur-sm">
        <span
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-b-[3px] font-display text-xl font-bold shadow-chunk-sm ${t.bg} ${t.border} ${t.text}`}
          aria-hidden="true"
        >
          {subjectLetter}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-bold text-quest-ink">Chem Lab</h1>
          <p className="font-medium text-quest-ink-soft">Identify the Mystery Chemical</p>
        </div>
        <span className="rounded-chunk-sm border-2 border-quest-gold-dark bg-quest-gold/20 px-3 py-1.5 font-display text-sm font-bold text-quest-gold-dark">
          ⭐ {stars}
        </span>
        {samples && samples.length > 0 && (
          <span className={`rounded-chunk-sm border-2 ${t.border} ${t.soft} px-3 py-1.5 font-display text-sm font-bold ${t.ink}`}>
            Round {Math.min(roundIndex + 1, samples.length)} / {samples.length}
          </span>
        )}
      </div>
    </header>
  );

  return (
    <div className="relative min-h-[calc(100vh-var(--app-header-h))] w-full overflow-x-hidden">
      <BackgroundScene solvedCount={stars} />
      {header}

      <main className="relative mx-auto mt-6 max-w-6xl px-6 pb-24">
        {loadError && (
          <p className="font-medium text-quest-coral-dark">
            I couldn't load the {subjectTitle.toLowerCase()} lab just now. Try starting Tessera Quest again.
          </p>
        )}

        {!loadError && samples === null && (
          <p className="text-center font-medium text-quest-ink-soft">Setting up the lab…</p>
        )}

        {!loadError && samples !== null && samples.length === 0 && (
          <div className="flex flex-col items-center gap-4 rounded-chunk-xl border-[var(--outline-chunk-thick)] border-quest-locked bg-quest-paper/85 px-6 py-10 text-center shadow-chunk backdrop-blur-sm">
            <Pet mood="curious" species={state?.pet.species} size={96} />
            <h2 className="font-display text-2xl font-bold text-quest-ink">No samples in the lab yet</h2>
            <p className="max-w-md font-medium text-quest-ink-soft">
              This drive doesn't have any Chem Lab content loaded. Ask whoever set up your USB drive to add some.
            </p>
          </div>
        )}

        {sessionDone && (
          <div className="flex flex-col items-center gap-4 rounded-chunk-xl border-[var(--outline-chunk-thick)] border-quest-gold bg-quest-paper/85 px-6 py-10 text-center shadow-chunk backdrop-blur-sm">
            <Pet mood="celebrating" species={state?.pet.species} size={110} />
            <h2 className="font-display text-2xl font-bold text-quest-ink">Lab session complete!</h2>
            <p className="max-w-md font-medium text-quest-ink-soft">
              You identified {stars} of {samples?.length ?? 0} mystery samples correctly.
            </p>
            <ChunkyButton tone="gold" onClick={restart}>
              Run the lab again
            </ChunkyButton>
          </div>
        )}

        {sample && !sessionDone && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <div>
              {/* The mystery sample card. */}
              <div className="relative rounded-chunk-xl border-[var(--outline-chunk)] border-quest-repeat bg-quest-cream/80 px-6 py-5 shadow-chunk">
                <span className="absolute right-4 top-4 rounded-chunk-sm border-2 border-quest-repeat-dark bg-quest-repeat px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wide text-white">
                  Mystery Sample
                </span>
                <div className="flex items-start gap-4">
                  <span className="mt-1 shrink-0 text-4xl" aria-hidden="true">
                    🔬
                  </span>
                  <div>
                    <h2 className="font-display text-xl font-bold text-quest-ink">What is this chemical?</h2>
                    <p className="mt-1 font-medium text-quest-ink-soft">{sample.description}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {sample.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-chunk-sm border-2 border-quest-locked bg-white px-2.5 py-1 font-display text-xs font-bold text-quest-ink-soft"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Lab tests. */}
              <h3 className="mt-6 font-display text-lg font-bold text-quest-ink">🔬 Lab Tests</h3>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {TESTS.map((td) => {
                  const clue = sample.clues.find((c) => c.test === td.test);
                  const revealed = revealedTests.has(td.test);
                  const tone = toneClasses(td.tone);
                  return (
                    <button
                      key={td.test}
                      type="button"
                      disabled={!clue}
                      onClick={() => clue && revealTest(clue)}
                      aria-label={revealed ? `${td.label}, clue revealed: ${clue?.text}` : `${td.label}, click to reveal a clue`}
                      className={`flex flex-col items-center gap-1 rounded-chunk-lg border-2 px-4 py-4 text-center shadow-chunk-sm transition-transform hover:-translate-y-0.5 ${tone.soft} ${revealed ? tone.border : "border-quest-locked"}`}
                    >
                      <span className="text-3xl" aria-hidden="true">
                        {td.emoji}
                      </span>
                      <span className={`font-display text-sm font-bold ${tone.ink}`}>{td.label}</span>
                      {revealed && clue && <p className="mt-1 text-xs font-medium text-quest-ink-soft">{clue.text}</p>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {/* Lab assistant. */}
              <div className={`rounded-chunk-xl border-2 ${t.border} ${t.soft} p-4`}>
                <div className={`mx-auto mb-3 w-fit rounded-chunk-sm border-2 ${t.border} ${t.bg} px-3 py-1 font-display text-xs font-bold uppercase tracking-wide ${t.text}`}>
                  Lab Assistant
                </div>
                <div className="flex flex-col items-center gap-3">
                  <Pet mood={guess ? (guess.correct ? "celebrating" : "confused") : "curious"} species={state?.pet.species} size={80} />
                  <SpeechBubble text={assistantText} />
                </div>
              </div>

              {/* The guess. */}
              <div className="rounded-chunk-xl border-[var(--outline-chunk)] border-quest-locked bg-white/80 p-4">
                <h3 className="mb-3 font-display text-base font-bold text-quest-ink">Your Guess</h3>
                <div className="flex flex-col gap-2">
                  {sample.choices.map((choice) => {
                    const isGuessed = guess?.choiceId === choice.id;
                    const isAnswer = guess?.answer.id === choice.id;
                    let tone = "border-quest-locked bg-quest-cream/60";
                    if (guess) {
                      if (isAnswer) tone = "border-quest-cond-dark bg-quest-cond/20";
                      else if (isGuessed) tone = "border-quest-coral-dark bg-quest-coral/20";
                    }
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        disabled={!!guess || submitting}
                        onClick={() => submitGuess(choice.id)}
                        aria-label={`Guess ${choice.name}, ${choice.formula}`}
                        className={`flex items-center gap-3 rounded-chunk border-2 px-3 py-2.5 text-left shadow-chunk-sm transition-transform disabled:cursor-not-allowed ${!guess ? "hover:-translate-y-0.5" : ""} ${tone}`}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-quest-ink/25 bg-quest-paper font-display text-xs font-bold text-quest-ink">
                          {choice.id}
                        </span>
                        <span>
                          <span className="block font-display text-sm font-bold text-quest-ink">{choice.name}</span>
                          <span className="block text-xs font-medium text-quest-ink-soft">{choice.formula}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {guess && (
                  <ChunkyButton tone="gold" className="mt-4 w-full" onClick={nextRound}>
                    {roundIndex + 1 >= (samples?.length ?? 0) ? "See results" : "Next sample"}
                  </ChunkyButton>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
