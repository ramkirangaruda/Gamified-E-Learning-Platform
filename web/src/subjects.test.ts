import { describe, expect, it } from "vitest";
import { DEFAULT_SUBJECT_ID, SUBJECTS, levelsForSubject, subjectById } from "./subjects";
import { HOME, activeSubjectId, type Route } from "./routes";

// The subject registry is the top of the dashboard's information architecture, and the
// one place that decides what the home cards, the nav tabs and the progress table all
// show. Two of the rules it encodes are worth pinning, because both fail silently and
// both would be a lie told to a child rather than a crash someone would notice.

describe("the subject registry", () => {
  it("has exactly the available subjects it means to today, and Coding is the default", () => {
    // Not a style preference: HomePage/ProgressPage hand `levelsForSubject(id, levels)`
    // to whichever subject is available, and that function only special-cases "coding" --
    // any OTHER available subject must either be `standalone` (skips the levels/stars UI
    // entirely -- Chemistry and Math) or bring its own real total/solved the way Physics
    // does, or it would silently render Coding's levels under its own header, or an
    // empty "0 of 0" that lies about a subject with real, playable content having
    // nothing to show.
    const available = SUBJECTS.filter((s) => s.available);
    expect(available.map((s) => s.id).sort()).toEqual(["chem", "coding", "math", "phys"]);
    expect(DEFAULT_SUBJECT_ID).toBe("coding");
    // Chemistry and Math are standalone (nothing counted at all); Physics deliberately
    // is not, since it has a real total HomePage/ProgressPage compute from localStorage.
    expect(SUBJECTS.find((s) => s.id === "chem")?.standalone).toBe(true);
    expect(SUBJECTS.find((s) => s.id === "math")?.standalone).toBe(true);
    expect(SUBJECTS.find((s) => s.id === "phys")?.standalone).toBeFalsy();
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
    // subject flipped to available=true without wiring its own content through -- its own
    // dedicated page and progress source, the way Chemistry/Physics/Math each do -- would
    // otherwise silently show Coding's levels under a science subject's own header.
    const levels = [{ id: "level-1" }, { id: "level-2" }];
    expect(levelsForSubject(DEFAULT_SUBJECT_ID, levels)).toHaveLength(2);
    // Every OTHER subject gets none -- including Chemistry, Physics and Math, all
    // available but each playing through its own content/progress source, never through
    // this level list. An empty list is what makes the card render "coming soon"
    // (unavailable), "Play now" (available, standalone, nothing to count), or a real bar
    // sourced elsewhere (available, not standalone -- Physics) rather than a false 0%
    // progress bar -- an empty meter reads as "you have done none of this", untrue in
    // every one of those cases.
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
