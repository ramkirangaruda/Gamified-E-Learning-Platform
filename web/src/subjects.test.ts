import { describe, expect, it } from "vitest";
import { DEFAULT_SUBJECT_ID, SUBJECTS, levelsForSubject, subjectById } from "./subjects";
import { HOME, activeSubjectId, type Route } from "./routes";

// The subject registry is the top of the dashboard's information architecture, and the
// one place that decides what the home cards, the nav tabs and the progress table all
// show. Two of the rules it encodes are worth pinning, because both fail silently and
// both would be a lie told to a child rather than a crash someone would notice.

describe("the subject registry", () => {
  it("has Coding and Chemistry available today, and Coding is the default", () => {
    // Chem Lab (ChemLabPage.tsx) is real, playable content -- but it isn't level-based,
    // so it deliberately does NOT appear in this list's levelsForSubject expectations
    // below: available and "has levels" are two different questions now, which is why
    // HomePage/ProgressPage derive a separate hasLevels flag rather than reusing
    // `available` for both (see their own comments for the bug that distinction fixed).
    const available = SUBJECTS.filter((s) => s.available);
    expect(available.map((s) => s.id).sort()).toEqual(["chem", DEFAULT_SUBJECT_ID].sort());
  });

  it("gives every subject a distinct id and badge letter", () => {
    // ids key React lists and route values; letters are what a child actually tells the
    // two locked science cards apart by, since neither has any progress to show.
    expect(new Set(SUBJECTS.map((s) => s.id)).size).toBe(SUBJECTS.length);
    expect(new Set(SUBJECTS.map((s) => s.letter)).size).toBe(SUBJECTS.length);
  });

  it("hands levels only to a subject that actually has content", () => {
    const levels = [{ id: "level-1" }, { id: "level-2" }];
    expect(levelsForSubject(DEFAULT_SUBJECT_ID, levels)).toHaveLength(2);
    // Every OTHER subject gets none -- including Chemistry, which is available but plays
    // through ChemLabPage's own /api/chemistry/samples, never through this level list.
    for (const s of SUBJECTS.filter((s) => s.id !== DEFAULT_SUBJECT_ID)) {
      // An empty list is what makes the card render "coming soon" (unavailable) or
      // "ready to play" (available, not level-tracked) rather than a 0% progress bar --
      // an empty meter reads as "you have done none of this", untrue either way.
      expect(levelsForSubject(s.id, levels), s.id).toEqual([]);
    }
  });

  it("falls back to the default subject for an unknown id", () => {
    expect(subjectById("no-such-subject").id).toBe(DEFAULT_SUBJECT_ID);
    expect(subjectById(undefined).id).toBe(DEFAULT_SUBJECT_ID);
  });
});

describe("which nav tab reads as current", () => {
  it("keeps the Coding tab lit while inside a level or the sandbox", () => {
    // Both belong to Coding. Without this the nav would show nothing selected for the
    // entire time a child is actually playing, which is most of their session.
    expect(activeSubjectId({ name: "play", levelId: "level-3" })).toBe("coding");
    expect(activeSubjectId({ name: "sandbox" })).toBe("coding");
    expect(activeSubjectId({ name: "subject", subjectId: "bio" })).toBe("bio");
  });

  it("lights no subject tab on the whole-app destinations", () => {
    const elsewhere: Route[] = [HOME, { name: "settings" }, { name: "classroom" }, { name: "progress" }];
    for (const r of elsewhere) expect(activeSubjectId(r), r.name).toBeNull();
  });
});
