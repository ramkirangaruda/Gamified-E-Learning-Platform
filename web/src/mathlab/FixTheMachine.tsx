import { useState } from "react";
import Pet from "../pet/Pet";
import SpeechBubble from "../pet/SpeechBubble";
import { usePet } from "../pet/PetProvider";
import { ChunkyButton } from "../ui/Chunky";
import { generateSequenceQuestion } from "./machineGenerator";
import { nextStateForCorrectAnswer } from "./reward";

const ROUNDS = 5;
const MAX_WRONG = 3;
const WELCOME_LINE = "Oh no, the machines are broken! Figure out the pattern to fix them.";

type Status = "answering" | "correct" | "revealed";

export default function FixTheMachine({ onSolved }: { onSolved: () => void }) {
  const { state, react, say, answerCorrect, answerIncorrect, commitState } = usePet();

  const [roundIndex, setRoundIndex] = useState(0);
  const [question, setQuestion] = useState(() => generateSequenceQuestion(0));
  const [digits, setDigits] = useState("");
  const [wrongCount, setWrongCount] = useState(0);
  const [status, setStatus] = useState<Status>("answering");
  const [fixedCount, setFixedCount] = useState(0);
  const [assistantText, setAssistantText] = useState(WELCOME_LINE);

  const sessionDone = roundIndex >= ROUNDS;

  function pressDigit(d: string) {
    if (status !== "answering" || digits.length >= 4) return;
    setDigits((s) => s + d);
  }

  function backspace() {
    if (status !== "answering") return;
    setDigits((s) => s.slice(0, -1));
  }

  function submit() {
    if (status !== "answering" || digits === "") return;
    const correct = Number(digits) === question.answer;
    if (correct) {
      setStatus("correct");
      setFixedCount((n) => n + 1);
      const line = "Great job! You fixed it!";
      setAssistantText(line);
      say(line);
      answerCorrect();
      onSolved();
      if (state) void commitState(nextStateForCorrectAnswer(state));
      return;
    }

    const nextWrong = wrongCount + 1;
    setWrongCount(nextWrong);
    setDigits("");
    answerIncorrect();
    if (nextWrong >= MAX_WRONG) {
      setStatus("revealed");
      const line = `The answer was ${question.answer}. Let's try the next one!`;
      setAssistantText(line);
      say(line);
    } else {
      const line = "Not quite — look closely at what happens between each number.";
      setAssistantText(line);
      say(line);
    }
  }

  function nextMachine() {
    const next = roundIndex + 1;
    setRoundIndex(next);
    setQuestion(generateSequenceQuestion(next));
    setDigits("");
    setWrongCount(0);
    setStatus("answering");
    setAssistantText(WELCOME_LINE);
    react("playful");
  }

  function restart() {
    setRoundIndex(0);
    setQuestion(generateSequenceQuestion(0));
    setDigits("");
    setWrongCount(0);
    setStatus("answering");
    setFixedCount(0);
    setAssistantText(WELCOME_LINE);
  }

  if (sessionDone) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-chunk-xl border-(length:--outline-chunk-thick) border-quest-move bg-quest-paper px-6 py-10 text-center shadow-chunk">
        <Pet state="celebrating" species={state?.pet.species} size={110} inventory={state?.inventory} />
        <h2 className="font-display text-2xl font-bold text-quest-ink">All machines fixed!</h2>
        <p className="max-w-md font-medium text-quest-ink-soft">
          You repaired {fixedCount} of {ROUNDS} machines.
        </p>
        <ChunkyButton tone="move" size="lg" onClick={restart}>
          Fix them again
        </ChunkyButton>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-quest-ink">Fix the Broken Machine</h2>
          <span className="rounded-chunk-sm border-2 border-quest-move-dark bg-quest-move/15 px-3 py-1.5 font-display text-sm font-bold text-quest-move-dark">
            Machine {roundIndex + 1} of {ROUNDS}
          </span>
        </div>

        <div className="mt-4 rounded-chunk-xl border-(length:--outline-chunk-thick) border-quest-move bg-white px-6 py-8 text-center shadow-chunk">
          <p className="font-medium text-quest-ink-soft">What number completes the pattern?</p>
          <p className="mt-3 font-display text-4xl font-bold text-quest-ink">{question.prompt}</p>

          <div className="mx-auto mt-6 flex h-16 w-40 items-center justify-center rounded-chunk-lg border-(length:--outline-chunk) border-quest-locked bg-quest-cream font-display text-3xl font-bold text-quest-ink">
            {digits || <span className="text-quest-locked-deep">?</span>}
          </div>

          {status === "correct" && (
            <p className="mt-4 font-display text-xl font-bold text-quest-move-dark">Machine Repaired! ✨</p>
          )}
          {status === "revealed" && (
            <p className="mt-4 font-display text-lg font-bold text-quest-coral-dark">The answer was {question.answer}.</p>
          )}

          {status === "answering" ? (
            <div className="mx-auto mt-6 grid max-w-xs grid-cols-5 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => pressDigit(d)}
                  className="rounded-chunk-sm border-2 border-quest-locked bg-quest-paper py-3 font-display text-lg font-bold text-quest-ink shadow-chunk-sm transition-transform hover:-translate-y-0.5 active:translate-y-[2px]"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={backspace}
                className="rounded-chunk-sm border-2 border-quest-locked bg-quest-cream py-3 font-display text-lg font-bold text-quest-ink-soft shadow-chunk-sm"
                aria-label="Backspace"
              >
                ⌫
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={digits === ""}
                className="col-span-4 rounded-chunk-sm border-2 border-quest-move-dark bg-quest-move py-3 font-display text-lg font-bold text-white shadow-chunk-sm transition-transform hover:-translate-y-0.5 active:translate-y-[2px] disabled:pointer-events-none disabled:opacity-45"
                aria-label="Submit answer"
              >
                ✓
              </button>
            </div>
          ) : (
            <ChunkyButton tone="move" size="lg" className="mt-6" onClick={nextMachine}>
              Next Machine →
            </ChunkyButton>
          )}
        </div>

        <div className="mt-4 h-3 overflow-hidden rounded-full border-2 border-quest-ink/15 bg-quest-cream" role="progressbar" aria-valuenow={roundIndex} aria-valuemin={0} aria-valuemax={ROUNDS}>
          <div className="h-full origin-left rounded-full bg-quest-move transition-transform duration-500 ease-out" style={{ transform: `scaleX(${roundIndex / ROUNDS})` }} />
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-chunk-xl border-[3px] border-quest-move bg-quest-move/12 p-5">
        <div className="mx-auto w-fit rounded-chunk-sm border-2 border-quest-move-dark bg-quest-move px-4 py-1.5 font-display text-sm font-bold uppercase tracking-wide text-white">
          Math Buddy
        </div>
        <Pet
          state={status === "correct" ? "celebrating" : status === "revealed" ? "confused" : "playful"}
          species={state?.pet.species}
          size={100}
          inventory={state?.inventory}
        />
        <SpeechBubble text={assistantText} />
      </div>
    </div>
  );
}
