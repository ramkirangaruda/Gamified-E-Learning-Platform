import { useEffect, useState } from "react";
import CompareView from "./CompareView";
import HomePage from "./HomePage";
import { applyLite, storedOverride } from "./lite";
import { fetchTierInfo } from "./api";
import StyleGuide from "./StyleGuide";
import PlayPage from "./PlayPage";

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

  // Decide lite mode once, as early as possible, so the Pi never plays an animation
  // even briefly before being told not to. A session override always wins over the
  // server's decision; if the request fails we simply keep whatever is already set
  // (prefers-reduced-motion still applies regardless -- that lives in CSS).
  useEffect(() => {
    const override = storedOverride();
    if (override !== null) {
      applyLite(override);
      return;
    }
    fetchTierInfo()
      .then((t) => applyLite(!!t.lite))
      .catch(() => {});
  }, []);

  // Dev review surface, same gating rationale as ?compare=1: reachable on purpose, never
  // stumbled into by a child.
  if (isStyleGuide) return <StyleGuide />;
  if (isCompareView) return <CompareView />;

  if (selectedLevelId) {
    return <PlayPage initialLevelId={selectedLevelId} onBackToDashboard={() => setSelectedLevelId(null)} />;
  }
  return <HomePage onSelectLevel={setSelectedLevelId} />;
}

export default App;
