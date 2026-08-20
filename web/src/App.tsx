import { useEffect, useState } from "react";
import CompareView from "./CompareView";
import HomePage from "./HomePage";
import { applyLite, setOverride, storedOverride } from "./lite";
import { fetchTierInfo } from "./api";
import AppHeader from "./nav/AppHeader";
import ClassroomPanel from "./pet/ClassroomPanel";
import { PetProvider } from "./pet/PetProvider";
import ProgressPage from "./ProgressPage";
import { HOME, type Route } from "./routes";
import StyleGuide from "./StyleGuide";
import PlayPage from "./PlayPage";
import SandboxPage from "./SandboxPage";
import SettingsPage from "./SettingsPage";
import SubjectPage from "./SubjectPage";

// ?compare=1 is a demo asset (brief §8/queue item 6), not a dev flag someone stumbles
// into by accident -- still gated behind an explicit query param since it's not part of
// the normal child-facing flow.
//
// Still not a router, for the reason this file has always given: one offline binary, no
// URL bar worth addressing, and a routing dependency would buy nothing a switch doesn't
// already do (brief's "minimal dependencies", DECISIONS.md). What the dashboard redesign
// DID change is that the several independent booleans this file used to keep --
// sandboxOpen, settingsOpen, selectedLevelId -- became one `Route` value (routes.ts).
// Those booleans could encode impossible states (settings and sandbox open at once, a
// level selected underneath both) and the union simply cannot.
function App() {
  const params = new URLSearchParams(window.location.search);
  const isCompareView = params.get("compare") === "1";
  const isStyleGuide = params.get("styleguide") === "1";
  const [route, setRoute] = useState<Route>(HOME);
  // App owns lite state because App is what resolves it. HomePage used to keep its own
  // copy seeded from the DOM attribute, which raced: a component initializer runs before
  // any effect has applied the server's decision, so the toggle rendered "off" on a
  // machine that had already been put into lite mode.
  const [lite, setLite] = useState(false);

  // Decide lite mode once, as early as possible, so the Pi never plays an animation
  // even briefly before being told not to. A session override always wins over the
  // server's decision; if the request fails we simply keep whatever is already set
  // (prefers-reduced-motion still applies regardless -- that lives in CSS).
  useEffect(() => {
    const override = storedOverride();
    if (override !== null) {
      applyLite(override);
      setLite(override);
      return;
    }
    fetchTierInfo()
      .then((t) => {
        applyLite(!!t.lite);
        setLite(!!t.lite);
      })
      .catch(() => {});
  }, []);

  function toggleLite() {
    const next = !lite;
    setLite(next);
    setOverride(next);
  }

  // Dev review surface, same gating rationale as ?compare=1: reachable on purpose, never
  // stumbled into by a child. Both sit outside the pet shell -- neither is a place a
  // child is playing, so a companion bar on top of them would be noise.
  if (isStyleGuide) return <StyleGuide />;
  if (isCompareView) return <CompareView />;

  /** Leaving a level or the sandbox returns to the subject they belong to, not to the
   *  app's front door -- a child who finishes level 7 wants the trail with level 8 on it,
   *  not to start navigating again from the subject cards. */
  const backToSubject = () => setRoute({ name: "subject", subjectId: "coding" });

  function page() {
    switch (route.name) {
      case "subject":
        return <SubjectPage subjectId={route.subjectId} onNavigate={setRoute} />;
      case "play":
        return <PlayPage initialLevelId={route.levelId} onBackToDashboard={backToSubject} />;
      case "sandbox":
        return <SandboxPage onBackToDashboard={backToSubject} />;
      case "settings":
        return <SettingsPage onBack={() => setRoute(HOME)} />;
      case "progress":
        return <ProgressPage />;
      // Classroom stays the modal it has always been (same convention as PetShop:
      // reached by a button, closed by Escape or a click outside) -- it is a short
      // two-field errand, not somewhere to be. Giving it a route rather than a boolean
      // only changes what lights up in the nav; the panel itself is untouched, and it
      // overlays the home screen so there is always something behind it.
      case "classroom":
        return (
          <>
            <HomePage onNavigate={setRoute} />
            <ClassroomPanel onClose={() => setRoute(HOME)} />
          </>
        );
      default:
        return <HomePage onNavigate={setRoute} />;
    }
  }

  // The shell. PetProvider and the header (which contains PetBar) are mounted ONCE,
  // outside the page switch below, which is the whole of what makes the pet persistent:
  // switching pages replaces only what is inside <main>, so the pet's state, mood and
  // animation phase are never torn down. Putting the bar inside any page -- even
  // identically in all of them -- would remount it on every navigation and reset all
  // three. The redesign added a navigation row above the pet, inside that same
  // mounted-once header, for the same reason.
  return (
    <PetProvider lite={lite}>
      <AppHeader route={route} onNavigate={setRoute} lite={lite} onToggleLite={toggleLite} />
      <main className="pt-[var(--app-header-h)]">{page()}</main>
    </PetProvider>
  );
}

export default App;
