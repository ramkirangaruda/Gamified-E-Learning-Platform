import { useState } from "react";
import Pet from "../pet/Pet";
import SpeechBubble from "../pet/SpeechBubble";
import { usePet } from "../pet/PetProvider";
import { ChunkyButton } from "../ui/Chunky";
import { generateClueQuestion } from "./detectiveGenerator";
import { nextStateForCorrectAnswer } from "./reward";

const CLUES = 4;
const WELCOME_LINE = "A mystery to solve! Answer each clue to fill in the board.";

interface Guess {
  picked: number;
  correct: boolean;
}

export default function MathDetective({ onSolved }: { onSolved: () => void }) {
  const { state, react, say, answerCorrect, answerIncorrect, commitState } = usePet();

  const [clueIndex, setClueIndex] = useState(0);
  const [question, setQuestion] = useState(() => generateClueQuestion(0));
  const [guess, setGuess] = useState<Guess | null>(null);
  const [solvedValues, setSolvedValues] = useState<(number | null)[]>([null, null, null, null]);
  const [solvedByChild, setSolvedByChild] = useState(0);
  const [assistantText, setAssistantText] = useState(WELCOME_LINE);

  const done = clueIndex >= CLUES;

  function pick(option: number) {
    if (guess) return;
    const correct = option === question.answer;
    setGuess({ picked: option, correct });
    setSolvedValues((prev) => {
      const next = [...prev];
      next[clueIndex] = question.answer;
      return next;
    });

    if (correct) {
      const line = "Got it! That clue checks out.";
      setAssistantText(line);
      say(line);
      answerCorrect();
      setSolvedByChild((n) => n + 1);
      onSolved();
      if (state) void commitState(nextStateForCorrectAnswer(state));
    } else {
      const line = `Not quite — but the real answer was ${question.answer}. On to the next clue!`;
      setAssistantText(line);
      say(line);
      answerIncorrect();
    }
  }

  function nextClue() {
    const next = clueIndex + 1;
    setClueIndex(next);
    setQuestion(generateClueQuestion(next));
    setGuess(null);
    setAssistantText(WELCOME_LINE);
    react("playful");
  }

  function restart() {
    setClueIndex(0);
    setQuestion(generateClueQuestion(0));
    setGuess(null);
    setSolvedValues([null, null, null, null]);
    setSolvedByChild(0);
    setAssistantText(WELCOME_LINE);
  }

  if (done) {
    const [time, trail, bag, code] = solvedValues;
    return (
      <div className="flex flex-col items-center gap-4 rounded-chunk-xl border-(length:--outline-chunk-thick) border-quest-repeat bg-quest-paper px-6 py-10 text-center shadow-chunk">
        <Pet state="celebrating" species={state?.pet.species} size={110} inventory={state?.inventory} />
        <h2 className="font-display text-2xl font-bold text-quest-ink">Case Solved! 🎉</h2>
        <p className="max-w-lg font-medium text-quest-ink-soft">
          At {time}pm, the crumb trail led {trail} steps to a bag of {bag} marbles, and the vault code's last digit was {code}.
          Mystery solved!
        </p>
        <p className="font-display text-sm font-bold text-quest-ink-soft">You cracked {solvedByChild} of {CLUES} clues yourself!</p>
        <ChunkyButton tone="repeat" size="lg" onClick={restart}>
          Solve another mystery
        </ChunkyButton>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-quest-ink">Math Detective</h2>
          <span className="rounded-chunk-sm border-2 border-quest-repeat-dark bg-quest-repeat/15 px-3 py-1.5 font-display text-sm font-bold text-quest-repeat-dark">
            Clue {clueIndex + 1} of {CLUES}
          </span>
        </div>
        <p className="mt-1 font-medium text-quest-ink-soft">The Missing Birthday Cake</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_220px]">
          <div className="rounded-chunk-xl border-[3px] border-quest-repeat bg-white px-6 py-6 shadow-chunk">
            <p className="text-sm font-bold uppercase tracking-wide text-quest-repeat-dark">Clue {clueIndex + 1}: {question.clueLabel}</p>
            <p className="mt-2 font-medium text-quest-ink">{question.flavor}</p>
            <p className="mt-3 font-display text-2xl font-bold text-quest-ink">{question.prompt}</p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {question.options.map((opt) => {
                const isPicked = guess?.picked === opt;
                const isAnswer = guess && opt === question.answer;
                let tone = "border-quest-locked bg-quest-cream";
                if (guess) {
                  if (isAnswer) tone = "border-quest-move-dark bg-quest-move/25";
                  else if (isPicked) tone = "border-quest-coral-dark bg-quest-coral/25";
                }
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={!!guess}
                    onClick={() => pick(opt)}
                    className={`rounded-chunk-lg border-[3px] px-4 py-4 text-center font-display text-xl font-bold text-quest-ink shadow-chunk transition-transform disabled:cursor-not-allowed ${!guess ? "hover:-translate-y-1 active:translate-y-[2px]" : ""} ${tone}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>

            {guess && (
              <ChunkyButton tone="gold" size="lg" className="mt-5 w-full" onClick={nextClue}>
                {clueIndex + 1 >= CLUES ? "See the solution" : "Next Clue →"}
              </ChunkyButton>
            )}
          </div>

          <div className="rounded-chunk-xl border-(length:--outline-chunk) border-quest-locked bg-quest-cream p-4">
            <h3 className="font-display text-sm font-bold text-quest-ink">🔍 Clue Board</h3>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {["Time", "Trail", "Bag", "Code"].map((label, i) => (
                <li key={label} className="rounded-chunk-sm border-2 border-quest-locked bg-white px-3 py-2">
                  <span className="block font-display font-bold text-quest-ink">Clue {i + 1}: {label}</span>
                  <span className="text-quest-ink-soft">{solvedValues[i] ?? "???"}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-chunk-xl border-[3px] border-quest-repeat bg-quest-repeat/12 p-5">
        <div className="mx-auto w-fit rounded-chunk-sm border-2 border-quest-repeat-dark bg-quest-repeat px-4 py-1.5 font-display text-sm font-bold uppercase tracking-wide text-white">
          Math Buddy
        </div>
        <Pet
          state={guess ? (guess.correct ? "celebrating" : "confused") : "playful"}
          species={state?.pet.species}
          size={100}
          inventory={state?.inventory}
        />
        <SpeechBubble text={assistantText} />
      </div>
    </div>
  );
}
