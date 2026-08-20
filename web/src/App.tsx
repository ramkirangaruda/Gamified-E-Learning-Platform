import { useEffect, useState } from "react";
import CompareView from "./CompareView";
import HomePage from "./HomePage";
import { applyLite, setOverride, storedOverride } from "./lite";
import { fetchTierInfo } from "./api";
import PetBar from "./pet/PetBar";
import { PetProvider } from "./pet/PetProvider";
import StyleGuide from "./StyleGuide";
import PlayPage from "./PlayPage";
import SandboxPage from "./SandboxPage";

// ?compare=1 is a demo asset (brief §8/queue item 6), not a dev flag someone stumbles
// into by accident -- still gated behind an explicit query param since it's not part of
// the normal child-facing flow.
//
// Dashboard <-> PlayPage is simple state, not a router: this app has exactly two real
// screens (the third, ?compare=1, is judge-facing and separate), so pulling in a router
// dependency for one back-and-forth transition would be the kind of thing this project
// deliberately avoids elsewhere (brief's "minimal dependencies," DECISIONS.md).
function App() {
  const params = new URLSearchParams(window.location.search);
  const isCompareView = params.get("compare") === "1";
  const isStyleGuide = params.get("styleguide") === "1";
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [sandboxOpen, setSandboxOpen] = useState(false);
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

  // The shell. PetProvider and PetBar are mounted ONCE, outside the page switch below,
  // which is the whole of what makes the pet persistent: switching pages replaces only
  // what is inside <main>, so the pet's state, mood and animation phase are never torn
  // down. Putting the bar inside either page -- even identically in both -- would remount
  // it on every navigation and reset all three.
  return (
    <PetProvider>
      <PetBar />
      <main className="pt-[var(--pet-bar-h)]">
        {sandboxOpen ? (
          <SandboxPage onBackToDashboard={() => setSandboxOpen(false)} />
        ) : selectedLevelId ? (
          <PlayPage initialLevelId={selectedLevelId} onBackToDashboard={() => setSelectedLevelId(null)} />
        ) : (
          <HomePage
            onSelectLevel={setSelectedLevelId}
            onOpenSandbox={() => setSandboxOpen(true)}
            lite={lite}
            onToggleLite={toggleLite}
          />
        )}
      </main>
    </PetProvider>
  );
}

export default App;
