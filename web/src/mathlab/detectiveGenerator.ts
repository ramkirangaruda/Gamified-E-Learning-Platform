import { randInt, shuffle } from "./rng";

export interface DetectiveQuestion {
  clueIndex: number;
  clueLabel: string;
  flavor: string;
  prompt: string;
  options: number[];
  answer: number;
}

interface ClueTemplate {
  label: string;
  op: "+" | "-";
  flavor: (a: number, b: number) => string;
}

const CLUE_TEMPLATES: ClueTemplate[] = [
  { label: "Time", op: "+", flavor: (a, b) => `The cake vanished between ${a}pm and ${a + b}pm.` },
  { label: "Trail", op: "-", flavor: (a, b) => `Crumbs led ${a} steps out, then back ${b}.` },
  { label: "Bag", op: "+", flavor: (a, b) => `The bag has ${a} red marbles and ${b} blue ones.` },
  { label: "Code", op: "-", flavor: (a, b) => `The vault dial passed ${a}, then dropped back ${b}.` },
];

/** One "Math Detective" clue (0-3): a small word problem with 4 multiple-choice options,
 *  exactly one of which is the true answer. */
export function generateClueQuestion(clueIndex: number, rng: () => number = Math.random): DetectiveQuestion {
  const t = CLUE_TEMPLATES[clueIndex % CLUE_TEMPLATES.length];
  const a = randInt(2, 6 + clueIndex, rng);
  const b = randInt(1, t.op === "-" ? Math.max(1, a - 1) : 6, rng);
  const answer = t.op === "+" ? a + b : a - b;

  const distractors = new Set<number>();
  let guard = 0;
  while (distractors.size < 3 && guard < 50) {
    guard++;
    const d = answer + randInt(1, 3, rng) * (rng() < 0.5 ? 1 : -1);
    if (d >= 0 && d !== answer) distractors.add(d);
  }
  // Guarantee 3 distinct distractors even if the loop above ran out of luck.
  let filler = answer + 4;
  while (distractors.size < 3) {
    if (filler !== answer && !distractors.has(filler)) distractors.add(filler);
    filler++;
  }

  const options = shuffle([answer, ...distractors], rng);
  return { clueIndex, clueLabel: t.label, flavor: t.flavor(a, b), prompt: `What is ${a} ${t.op} ${b}?`, options, answer };
}
