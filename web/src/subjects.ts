import type { ChunkyTone } from "./ui/Chunky";

// The subject registry -- the top level of the dashboard's information architecture, and
// the one place the set of subjects lives. The nav tabs, the home cards, and the progress
// table all read this list, so none of them can disagree about what exists.
//
// WHY MOST OF THESE ARE `available: false`
//
// Tessera Quest started as a coding platform (README): 25 levels, one executor, one AST.
// The four science subjects below were originally sketched as real product intent, not
// decoration, but with no content built for any of them yet -- so they rendered (and
// still render, for physics/math/biology) as honest "coming soon" cards with no progress
// bar, no stars and no fake counts. Nothing on screen claims progress a child has not
// made, which is the same rule §10 applies to levels.
//
// Chemistry (Chem Lab, ChemLabPage.tsx) is the first of the four to actually ship: a
// mystery-sample deduction game, not a level trail, built against a design the user
// supplied. `available: true` here does NOT mean "has levels" -- it never did for
// Coding-shaped content, but it's worth saying explicitly now that a second subject uses
// it: `levelsForSubject` still returns [] for "chem", and HomePage/ProgressPage derive
// their own `hasLevels` (available && has a level list) rather than reusing `available`
// for both questions, specifically so a subject that's real but not level-based doesn't
// inherit Coding's level count or render a false "0 of 0" bar.
//
// Turning phys/math/bio on later is the same one-line change here, but each will need
// its OWN case in whatever it plays through -- there is no longer a single `levelsFor`
// case that covers "every available subject", because Chemistry already proved that
// assumption wrong.

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
}

export const SUBJECTS: Subject[] = [
  { id: "coding", letter: "Cd", title: "Coding", desc: "Programs & logic", tone: "move", available: true },
  { id: "chem", letter: "Ch", title: "Chemistry", desc: "Atoms to reactions", tone: "while", available: true },
  { id: "phys", letter: "Ph", title: "Physics", desc: "Forces & energy", tone: "repeat", available: false },
  { id: "math", letter: "Mt", title: "Math", desc: "Numbers & patterns", tone: "coral", available: false },
  { id: "bio", letter: "Bi", title: "Biology", desc: "Life & living systems", tone: "cond", available: false },
];

/** The subject a child is in by default, and the one every "start playing" path lands on. */
export const DEFAULT_SUBJECT_ID = "coding";

export function subjectById(id: string | null | undefined): Subject {
  return SUBJECTS.find((s) => s.id === id) ?? SUBJECTS[0];
}

/** Which levels belong to a subject. Only `coding` has any today -- every other subject
 *  returns [], including Chemistry, which is available but plays through its own
 *  /api/chemistry/samples content, not this level list. HomePage/ProgressPage read this
 *  (not `available`) to decide whether to show a real progress bar. */
export function levelsForSubject<T>(subjectId: string, codingLevels: T[]): T[] {
  return subjectId === DEFAULT_SUBJECT_ID ? codingLevels : [];
}
