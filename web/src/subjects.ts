import type { ChunkyTone } from "./ui/Chunky";

// The subject registry -- the top level of the dashboard's information architecture, and
// the one place the set of subjects lives. The nav tabs, the home cards, and the progress
// table all read this list, so none of them can disagree about what exists.
//
// WHY MATH AND BIOLOGY ARE STILL `available: false`
//
// Tessera Quest started as a coding platform (README): 25 levels, one executor, one AST.
// The four science subjects below were originally sketched as real product intent, not
// decoration, but with no content built for any of them yet -- so they all rendered as
// honest "coming soon" cards with no progress bar, no stars and no fake counts. Nothing
// on screen claims progress a child has not made, which is the same rule §10 applies to
// levels. Math and Biology still render that way, for the same reason.
//
// Chemistry (Chem Lab, ChemLabPage.tsx) and Physics (PhysicsQuest.tsx) are the first two
// to actually ship, and neither is a level trail -- Chemistry is a mystery-sample
// deduction game, Physics a five-round canvas simulation, and each keeps progress its own
// way (Chemistry: session-only React state, no persistence; Physics: localStorage, not
// pet.db). `available: true` here does NOT mean "has levels" -- it never did for
// Coding-shaped content, but it's worth saying explicitly now that three subjects use it
// three different ways: `levelsForSubject` returns [] for both "chem" and "phys", and
// HomePage/ProgressPage derive their own per-subject total/solved (reading each subject's
// own progress source) rather than assuming everything available shares Coding's model.
//
// Turning math/bio on later is the same one-line change here, but each will need its OWN
// case in whatever it plays through and its own progress source -- there is no single
// case that covers "every available subject" anymore, because Chemistry and Physics
// already proved that assumption wrong in two different directions.

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
  // Physics doesn't run on the AST/executor the way Coding does -- it's a self-contained
  // canvas mini-game (PhysicsQuest.tsx) with its own five levels and its own progress
  // storage (localStorage, not pet.db). SubjectPage special-cases subjectId === "phys" to
  // render it instead of the Trail/LevelGrid pair every other available subject gets.
  { id: "phys", letter: "Ph", title: "Physics", desc: "Forces & energy", tone: "repeat", available: true },
  { id: "math", letter: "Mt", title: "Math", desc: "Numbers & patterns", tone: "coral", available: false },
  { id: "bio", letter: "Bi", title: "Biology", desc: "Life & living systems", tone: "cond", available: false },
];

/** The subject a child is in by default, and the one every "start playing" path lands on. */
export const DEFAULT_SUBJECT_ID = "coding";

export function subjectById(id: string | null | undefined): Subject {
  return SUBJECTS.find((s) => s.id === id) ?? SUBJECTS[0];
}

/** Which levels belong to a subject. Only `coding` has any today -- every other subject
 *  returns [], including Chemistry and Physics, both available but each playing through
 *  its own content/progress source instead of this level list. HomePage/ProgressPage read
 *  each subject's own progress (not `available`, and not this alone) to decide what to
 *  show. */
export function levelsForSubject<T>(subjectId: string, codingLevels: T[]): T[] {
  return subjectId === DEFAULT_SUBJECT_ID ? codingLevels : [];
}
