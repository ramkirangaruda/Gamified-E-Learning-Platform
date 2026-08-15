import { useState } from "react";
import CompareView from "./CompareView";
import Dashboard from "./Dashboard";
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
  const isCompareView = new URLSearchParams(window.location.search).get("compare") === "1";
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);

  if (isCompareView) return <CompareView />;

  if (selectedLevelId) {
    return <PlayPage initialLevelId={selectedLevelId} onBackToDashboard={() => setSelectedLevelId(null)} />;
  }
  return <Dashboard onSelectLevel={setSelectedLevelId} />;
}

export default App;
