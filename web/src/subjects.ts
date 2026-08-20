import type { ChunkyTone } from "./ui/Chunky";

// The subject registry -- the top level of the dashboard's information architecture, and
// the one place the set of subjects lives. The nav tabs, the home cards, and the progress
// table all read this list, so none of them can disagree about what exists.
//
// WHY BIOLOGY IS STILL `available: false`
//
// Tessera Quest started as a coding platform (README): 25 levels, one executor, one AST.
// The four science subjects below were originally sketched as real product intent, not
// decoration, but with no content built for any of them yet -- so they all rendered as
// honest "coming soon" cards with no progress bar, no stars and no fake counts. Nothing
// on screen claims progress a child has not made, which is the same rule §10 applies to
// levels. Biology still renders that way, for the same reason.
//
// Chemistry (ChemLabPage.tsx), Physics (PhysicsQuest.tsx) and Math (MathPage.tsx, an
// offline-bundled iframe) are the first three to actually ship, and none of them is a
// level trail -- each keeps progress its own way: Chemistry in session-only React state
// (no persistence), Physics in localStorage (survives a reload, not a drive swap), Math
// not tracked at all (its iframe exposes no progress signal to the host app). `available:
// true` here does NOT mean "has levels" -- it never did for Coding-shaped content, but
// it's worth saying explicitly now that four subjects use it four different ways.
// `levelsForSubject` returns [] for every one of "chem"/"phys"/"math"; `standalone`
// (true for chem and math, absent for phys) is the second axis HomePage/ProgressPage
// read to tell "real content with nothing to count" apart from "real, countable
// progress" -- see the Subject interface below for the full three-way split.
//
// Turning Biology on later is the same one-line change here, but it will need its own
// case in whatever it plays through and its own progress source -- there is no single
// case that covers "every available subject" anymore, because Chemistry, Physics and
// Math already proved that assumption wrong in three different directions.

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
  // Chem Lab (ChemLabPage.tsx): a mystery-sample deduction game, session-scoped React
  // state, no persistence -- see ChemLabPage.tsx and DECISIONS.md.
  { id: "chem", letter: "Ch", title: "Chemistry", desc: "Atoms to reactions", tone: "while", available: true, standalone: true },
  // Physics doesn't run on the AST/executor the way Coding does -- it's a self-contained
  // canvas mini-game (PhysicsQuest.tsx) with its own five levels and its own progress
  // storage (localStorage, not pet.db). Deliberately NOT `standalone`: it has a real,
  // countable total (5 levels x 3 rounds) and a real bar is more honest than "Play now"
  // once there's something to actually measure -- see HomePage/ProgressPage's own
  // Physics special-case.
  { id: "phys", letter: "Ph", title: "Physics", desc: "Forces & energy", tone: "repeat", available: true },
  // Math Lab (MathPage.tsx, an offline-bundled iframe): four mini-games with no progress
  // signal exposed to the host app at all, so `standalone` here isn't a choice the way
  // Chemistry's is -- there is nothing to count even in principle.
  { id: "math", letter: "Mt", title: "Math", desc: "Numbers & patterns", tone: "coral", available: true, standalone: true },
  { id: "bio", letter: "Bi", title: "Biology", desc: "Life & living systems", tone: "cond", available: false },
];

/** The subject a child is in by default, and the one every "start playing" path lands on. */
export const DEFAULT_SUBJECT_ID = "coding";

export function subjectById(id: string | null | undefined): Subject {
  return SUBJECTS.find((s) => s.id === id) ?? SUBJECTS[0];
}

/** Which levels belong to a subject. Only `coding` has any today -- every other subject
 *  returns [], including Chemistry, Physics and Math, all available but each playing
 *  through its own content/progress source instead of this level list. HomePage/
 *  ProgressPage key off `available`/`standalone` together (not level count alone) to
 *  tell "no content yet", "real content with nothing to count" and "real, countable
 *  progress" apart. */
export function levelsForSubject<T>(subjectId: string, codingLevels: T[]): T[] {
  return subjectId === DEFAULT_SUBJECT_ID ? codingLevels : [];
}
