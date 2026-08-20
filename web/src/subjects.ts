import type { ChunkyTone } from "./ui/Chunky";

// The subject registry -- the top level of the dashboard's information architecture, and
// the one place the set of subjects lives. The nav tabs, the home cards, and the progress
// table all read this list, so none of them can disagree about what exists.
//
// WHY MOST OF THESE ARE `available: false`
//
// Tessera Quest is a coding platform (README): 25 levels, one executor, one AST. The four
// science subjects below are real product intent, not decoration -- but no content,
// executor or schema exists for them yet, so they render as honest "coming soon" cards
// with no progress bar, no stars and no fake counts. Nothing on screen claims progress a
// child has not made, which is the same rule §10 applies to levels.
//
// Turning one on later is a one-line change here plus a `levelsFor` case: the shell,
// nav, routing, cards and progress table are already subject-generic and need no edits.

export interface Subject {
  id: string;
  /** Two-letter badge, periodic-table style -- reads as a subject marker at card size. */
  letter: string;
  title: string;
  /** One line, child-facing: what you actually do in here. */
  desc: string;
  /** Drawn from the printed-card palette (tokens.css) so the screen and the cards on the
   *  desk stay one system -- see ui/Chunky.tsx's TONE table. */
  tone: ChunkyTone;
  /** False = no content exists yet; the UI must not imply progress. */
  available: boolean;
  /** True for an available subject whose content isn't measured in levels/stars at all
   *  (Math's four mini-games, not a trail). `levelsForSubject` already returns [] for
   *  any subject but `coding`, so a standalone subject's card/progress-row would
   *  otherwise show a literal "0 of 0 done" -- which reads as "you have done nothing
   *  here" on a subject that is genuinely playable. Cards/ProgressPage show a "Play now"
   *  badge instead for these. Absent (falsy) for every levels-based subject. */
  standalone?: boolean;
}

export const SUBJECTS: Subject[] = [
  { id: "coding", letter: "Cd", title: "Coding", desc: "Programs & logic", tone: "move", available: true },
  { id: "chem", letter: "Ch", title: "Chemistry", desc: "Atoms to reactions", tone: "while", available: false },
  { id: "phys", letter: "Ph", title: "Physics", desc: "Forces & energy", tone: "repeat", available: false },
  {
    id: "math",
    letter: "Mt",
    title: "Math",
    desc: "Numbers & patterns",
    tone: "coral",
    available: true,
    standalone: true,
  },
  { id: "bio", letter: "Bi", title: "Biology", desc: "Life & living systems", tone: "cond", available: false },
];

/** The subject a child is in by default, and the one every "start playing" path lands on. */
export const DEFAULT_SUBJECT_ID = "coding";

export function subjectById(id: string | null | undefined): Subject {
  return SUBJECTS.find((s) => s.id === id) ?? SUBJECTS[0];
}

/** Which levels belong to a subject. Only `coding` has any today -- every other subject
 *  returns [], including `math` (its content is four standalone mini-games, not a level
 *  trail): callers must key off `available`/`standalone`, not level count, to tell "no
 *  content yet" apart from "real content that isn't levels-shaped" (see HomePage /
 *  ProgressPage). */
export function levelsForSubject<T>(subjectId: string, codingLevels: T[]): T[] {
  return subjectId === DEFAULT_SUBJECT_ID ? codingLevels : [];
}
