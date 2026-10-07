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
// Deliberately session-scoped for the round/star counter itself, matching SandboxPage's
// own precedent for the same reason -- there's no per-sample "already solved" record on
// this drive. A correct guess DOES feed the real shared points/hunger economy though
// (see submitGuess), gated to once per round by `guess` blocking a second submission.
//
// Sits behind its own launcher screen (`started`) rather than dropping a child straight
// into the lab: a big "Guess the Compound" card with its own art, matching the "show
// what you're about to do before you commit to it" pattern the subject cards on the
// home screen already use.

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
  const { state, react, say, answerCorrect, answerIncorrect, commitState } = usePet();

  const [started, setStarted] = useState(false);
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
        // Feeds the same shared points/hunger economy Coding levels use -- a correct
        // guess is one gated attempt per round (the `guess` state above blocks a
        // second submission once set), so this can't be re-triggered by clicking
        // around within a session the way a naive "award on click" could.
        if (state) {
          void commitState({
            ...state,
            learner: { ...state.learner, points: state.learner.points + 8, total_xp: state.learner.total_xp + 8 },
            pet: { ...state.pet, hunger: Math.min(100, state.pet.hunger + 3) },
          });
        }
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
      <div className="flex flex-wrap items-center gap-4 rounded-chunk-lg border-[var(--outline-chunk)] border-white bg-quest-paper px-6 py-4 shadow-chunk">
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

  // ---- The launcher: a big, inviting card, not the lab itself ---------------------
  if (!started) {
    return (
      <div className="relative min-h-[calc(100vh-var(--app-header-h))] w-full overflow-x-hidden">
        <BackgroundScene solvedCount={stars} />
        <main className="relative mx-auto flex min-h-[calc(100vh-var(--app-header-h))] max-w-3xl flex-col items-center justify-center px-6 py-10 text-center">
          <div className="flex flex-col items-center gap-6 rounded-chunk-xl border-[var(--outline-chunk-thick)] border-quest-while bg-quest-paper px-10 py-12 shadow-chunk-lg">
            <span className="text-8xl" aria-hidden="true">
              🧪⚗️🔬
            </span>
            <h1 className="font-display text-4xl font-bold text-quest-ink">Guess the Compound</h1>
            <p className="max-w-md text-lg font-medium text-quest-ink-soft">
              A mystery chemical is waiting in the lab. Run real tests -- flame, pH, solubility, reactivity, smell --
              to gather clues, then guess what it is!
            </p>
            <ChunkyButton tone="while" size="lg" onClick={() => setStarted(true)} className="text-2xl">
              🔬 Start the Lab
            </ChunkyButton>
          </div>
        </main>
      </div>
    );
  }

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
          <div className="flex flex-col items-center gap-4 rounded-chunk-xl border-[var(--outline-chunk-thick)] border-quest-locked bg-quest-paper px-6 py-10 text-center shadow-chunk">
            <Pet state="playful" species={state?.pet.species} size={96} inventory={state?.inventory} />
            <h2 className="font-display text-2xl font-bold text-quest-ink">No samples in the lab yet</h2>
            <p className="max-w-md font-medium text-quest-ink-soft">
              This drive doesn't have any Chem Lab content loaded. Ask whoever set up your USB drive to add some.
            </p>
          </div>
        )}

        {sessionDone && (
          <div className="flex flex-col items-center gap-4 rounded-chunk-xl border-[var(--outline-chunk-thick)] border-quest-gold bg-quest-paper px-6 py-10 text-center shadow-chunk">
            <Pet state="celebrating" species={state?.pet.species} size={110} inventory={state?.inventory} />
            <h2 className="font-display text-2xl font-bold text-quest-ink">Lab session complete!</h2>
            <p className="max-w-md font-medium text-quest-ink-soft">
              You identified {stars} of {samples?.length ?? 0} mystery samples correctly.
            </p>
            <ChunkyButton tone="gold" size="lg" onClick={restart}>
              Run the lab again
            </ChunkyButton>
          </div>
        )}

        {sample && !sessionDone && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
            <div>
              {/* The mystery sample card. */}
              <div className="relative rounded-chunk-xl border-[var(--outline-chunk-thick)] border-quest-repeat bg-quest-cream px-6 py-6 shadow-chunk">
                <span className="absolute right-4 top-4 rounded-chunk-sm border-2 border-quest-repeat-dark bg-quest-repeat px-3 py-1.5 font-display text-sm font-bold uppercase tracking-wide text-white">
                  Mystery Sample
                </span>
                <div className="flex items-start gap-4">
                  <span className="mt-1 shrink-0 text-6xl" aria-hidden="true">
                    🔬
                  </span>
                  <div>
                    <h2 className="font-display text-2xl font-bold text-quest-ink">What is this chemical?</h2>
                    <p className="mt-1 text-lg font-medium text-quest-ink-soft">{sample.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sample.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-chunk-sm border-2 border-quest-locked bg-white px-3 py-1.5 font-display text-sm font-bold text-quest-ink-soft"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* The guess -- big, colorful, thumb-sized options. */}
              <div className="mt-6 rounded-chunk-xl border-[var(--outline-chunk-thick)] border-quest-locked bg-white p-5">
                <h3 className="mb-4 font-display text-xl font-bold text-quest-ink">Your Guess</h3>
                <div className="flex flex-col gap-3">
                  {sample.choices.map((choice) => {
                    const isGuessed = guess?.choiceId === choice.id;
                    const isAnswer = guess?.answer.id === choice.id;
                    let tone = "border-quest-locked bg-quest-cream";
                    if (guess) {
                      if (isAnswer) tone = "border-quest-cond-dark bg-quest-cond/30";
                      else if (isGuessed) tone = "border-quest-coral-dark bg-quest-coral/30";
                    }
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        disabled={!!guess || submitting}
                        onClick={() => submitGuess(choice.id)}
                        aria-label={`Guess ${choice.name}, ${choice.formula}`}
                        className={`flex items-center gap-4 rounded-chunk-lg border-[3px] px-4 py-4 text-left shadow-chunk transition-transform disabled:cursor-not-allowed ${!guess ? "hover:-translate-y-1 active:translate-y-[2px]" : ""} ${tone}`}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[3px] border-quest-ink/25 bg-quest-paper font-display text-lg font-bold text-quest-ink">
                          {choice.id}
                        </span>
                        <span>
                          <span className="block font-display text-lg font-bold text-quest-ink">{choice.name}</span>
                          <span className="block text-sm font-medium text-quest-ink-soft">{choice.formula}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {guess && (
                  <ChunkyButton tone="gold" size="lg" className="mt-5 w-full" onClick={nextRound}>
                    {roundIndex + 1 >= (samples?.length ?? 0) ? "See results" : "Next sample"}
                  </ChunkyButton>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-5">
              {/* Lab assistant. */}
              <div className={`rounded-chunk-xl border-[3px] ${t.border} ${t.soft} p-5`}>
                <div className={`mx-auto mb-3 w-fit rounded-chunk-sm border-2 ${t.border} ${t.bg} px-4 py-1.5 font-display text-sm font-bold uppercase tracking-wide ${t.text}`}>
                  Lab Assistant
                </div>
                <div className="flex flex-col items-center gap-3">
                  <Pet
                    state={guess ? (guess.correct ? "celebrating" : "confused") : "playful"}
                    species={state?.pet.species}
                    size={100}
                    inventory={state?.inventory}
                  />
                  <SpeechBubble text={assistantText} />
                </div>
              </div>

              {/* Lab tests -- big, bold, colorful cards, not small chips. Two columns here
                  rather than three: this column is the narrow 400px one, and three across
                  it would squeeze each card down to almost nothing. */}
              <div className="rounded-chunk-xl border-[var(--outline-chunk-thick)] border-quest-locked bg-white p-5">
                <h3 className="mb-4 font-display text-xl font-bold text-quest-ink">🔬 Lab Tests</h3>
                <div className="grid grid-cols-2 gap-3">
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
                        className={`flex flex-col items-center gap-2 rounded-chunk-xl border-[3px] px-3 py-5 text-center shadow-chunk transition-transform hover:-translate-y-1 active:translate-y-[2px] ${tone.bg} ${revealed ? tone.border : "border-quest-locked"}`}
                      >
                        <span className="text-5xl" aria-hidden="true">
                          {td.emoji}
                        </span>
                        <span className="font-display text-base font-bold text-white drop-shadow">{td.label}</span>
                        {revealed && clue && (
                          <p className="mt-1 rounded-chunk-sm bg-white/90 px-2 py-1 text-xs font-bold text-quest-ink">{clue.text}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
