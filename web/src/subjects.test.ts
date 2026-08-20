import { describe, expect, it } from "vitest";
import { DEFAULT_SUBJECT_ID, SUBJECTS, levelsForSubject, subjectById } from "./subjects";
import { HOME, activeSubjectId, type Route } from "./routes";

// The subject registry is the top of the dashboard's information architecture, and the
// one place that decides what the home cards, the nav tabs and the progress table all
// show. Two of the rules it encodes are worth pinning, because both fail silently and
// both would be a lie told to a child rather than a crash someone would notice.

describe("the subject registry", () => {
  it("marks Coding available, and it stays the default", () => {
    const available = SUBJECTS.filter((s) => s.available);
    expect(available.map((s) => s.id)).toContain(DEFAULT_SUBJECT_ID);
    expect(DEFAULT_SUBJECT_ID).toBe("coding");
  });

  it("gives every subject a distinct id and badge letter", () => {
    // ids key React lists and route values; letters are what a child actually tells the
    // locked science cards apart by, since none of them has any progress to show.
    expect(new Set(SUBJECTS.map((s) => s.id)).size).toBe(SUBJECTS.length);
    expect(new Set(SUBJECTS.map((s) => s.letter)).size).toBe(SUBJECTS.length);
  });

  it("never lets a non-default subject silently inherit Coding's levels", () => {
    // Not a style preference: HomePage/ProgressPage hand `levels` (which is the CODING
    // level list, the only one levelsForSubject serves) to whichever subject reads it. A
    // subject flipped to available=true without wiring its own content through -- or,
    // like Physics, its own dedicated page (PhysicsQuest, via SubjectPage's isPhysics
    // branch) entirely -- would otherwise silently show Coding's levels under, say,
    // Chemistry. This holds for every subject but the default, available or not: an
    // unavailable one gets the empty list that makes its card render "coming soon" rather
    // than a 0% bar, and Physics gets the empty list because its real content never comes
    // through this function at all.
    const levels = [{ id: "level-1" }, { id: "level-2" }];
    expect(levelsForSubject(DEFAULT_SUBJECT_ID, levels)).toHaveLength(2);
    for (const s of SUBJECTS.filter((s) => s.id !== DEFAULT_SUBJECT_ID)) {
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
