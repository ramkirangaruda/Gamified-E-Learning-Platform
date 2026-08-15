import CompareView from "./CompareView";
import PlayPage from "./PlayPage";

// ?compare=1 is a demo asset (brief §8/queue item 6), not a dev flag someone stumbles
// into by accident -- still gated behind an explicit query param since it's not part of
// the normal child-facing flow.
function App() {
  const isCompareView = new URLSearchParams(window.location.search).get("compare") === "1";
  return isCompareView ? <CompareView /> : <PlayPage />;
}

export default App;
