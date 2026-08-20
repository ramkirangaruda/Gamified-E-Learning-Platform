// Where the child is. One discriminated union, owned by App and threaded to the header,
// so "which nav tab is lit" and "which page is rendered" are read from the same value and
// cannot disagree.
//
// Still not a router, for the reason App.tsx has always given: this ships as one offline
// binary with no URL bar worth addressing, and a routing dependency would buy nothing a
// switch statement doesn't already do. What changed with the dashboard redesign is only
// that there are now more than two destinations, so the pile of independent booleans App
// used to keep (sandboxOpen, settingsOpen, selectedLevelId) became a single route value:
// those booleans could represent impossible states -- settings and sandbox both open, a
// level selected underneath both -- and the union simply cannot.

export type Route =
  | { name: "home" }
  /** A subject's own page: its trail/levels, or its "coming soon" panel. */
  | { name: "subject"; subjectId: string }
  | { name: "play"; levelId: string }
  | { name: "sandbox" }
  | { name: "settings" }
  | { name: "classroom" }
  | { name: "progress" };

export const HOME: Route = { name: "home" };

/** Which subject tab should read as current, including while inside a level or the
 *  sandbox -- both of which belong to Coding, so the tab stays lit rather than the nav
 *  appearing to have nothing selected while a child is mid-level. */
export function activeSubjectId(route: Route): string | null {
  switch (route.name) {
    case "subject":
      return route.subjectId;
    case "play":
    case "sandbox":
      return "coding";
    default:
      return null;
  }
}
