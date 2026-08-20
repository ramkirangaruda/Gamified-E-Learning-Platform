import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  MOOD_PRIORITY,
  SLEEPY_AFTER_MS,
  makeTransient,
  resolveMood,
  shouldReplaceTransient,
  type PetMood,
  type Transient,
} from "./mood";
import { applyPurchase, type Treat } from "./treats";
import { fetchLevels, fetchState, saveState, type GameState, type LevelDef } from "../api";
import type { ExecResult } from "../executorTypes";

// The pet's single source of truth, mounted once by App above everything else.
//
// This exists because of a structural problem, not a stylistic preference: the pet used
// to be a component inside PlayPage, so it was destroyed and rebuilt on every navigation.
// Mood, animation phase and the fetched game state all reset each time you went to the
// trail and back -- a companion that forgets itself twice a minute is not a companion.
// Because the provider sits above the page switch in App, none of its state unmounts and
// the pet genuinely persists.
//
// It also collapses a duplicated fetch: HomePage and PlayPage each used to pull
// /api/levels and /api/state independently, so the two screens could disagree about
// points and solved levels until whichever request landed last.

interface PetContextValue {
  state: GameState | null;
  levels: LevelDef[];
  error: string | null;

  mood: PetMood;
  speech: string | null;
  /** Increments on every feed; Pet re-keys its one-shot eat animation off it. */
  feedTick: number;

  activeLevel: LevelDef | null;
  setActiveLevelId: (id: string | null) => void;

  /** Push a transient reaction. Lower-priority pushes are dropped, not queued. */
  react: (mood: PetMood) => void;
  /** True while a program is running or a hint is in flight -> `thinking`. */
  setBusy: (busy: boolean) => void;
  say: (text: string | null) => void;
  /** Reads a finished run's trace and reacts: goal -> celebrating, bump -> confused. */
  reactToRun: (result: ExecResult) => void;

  /** Replaces game state and persists it (the reward write from PlayPage). */
  commitState: (next: GameState) => Promise<void>;

  shopOpen: boolean;
  setShopOpen: (open: boolean) => void;
  feed: (treat: Treat) => Promise<boolean>;
}

const PetContext = createContext<PetContextValue | null>(null);

export function usePet(): PetContextValue {
  const ctx = useContext(PetContext);
  if (!ctx) throw new Error("usePet must be used inside <PetProvider>");
  return ctx;
}

export function PetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState | null>(null);
  const [levels, setLevels] = useState<LevelDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeLevelId, setActiveLevelId] = useState<string | null>(null);

  const [transient, setTransient] = useState<Transient | null>(null);
  const [busy, setBusyState] = useState(false);
  const [speech, setSpeech] = useState<string | null>(null);
  const [feedTick, setFeedTick] = useState(0);
  const [shopOpen, setShopOpen] = useState(false);
  const [lastInteractionAt, setLastInteractionAt] = useState(() => Date.now());
  // Bumped purely to re-render when a deadline passes (the sleepy threshold). Never read.
  const [, setClock] = useState(0);

  useEffect(() => {
    fetchLevels().then(setLevels).catch(() => setError("levels"));
    fetchState().then(setState).catch(() => setError("state"));
  }, []);

  // --- Interaction tracking (feeds `sleepy`) -------------------------------
  // Coalesced to at most one state update per second so that ordinary clicking does not
  // re-render this provider on every pointer event. Waking from sleepy is still instant:
  // if the pet is asleep the last recorded interaction is by definition older than the
  // coalescing window, so the very first click gets through.
  const lastInteractionRef = useRef(lastInteractionAt);
  useEffect(() => {
    const bump = () => {
      const now = Date.now();
      if (now - lastInteractionRef.current < 1000) return;
      lastInteractionRef.current = now;
      setLastInteractionAt(now);
    };
    window.addEventListener("pointerdown", bump, { passive: true });
    window.addEventListener("keydown", bump, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, []);

  // One timer, rescheduled on interaction, that fires exactly when the pet becomes
  // eligible to doze off. Not an interval, and it depletes nothing -- `sleepy` is a mood
  // that one click reverses, not a resource.
  useEffect(() => {
    const id = setTimeout(() => setClock((c) => c + 1), SLEEPY_AFTER_MS);
    return () => clearTimeout(id);
  }, [lastInteractionAt]);

  // --- Transient expiry ----------------------------------------------------
  // celebrating deliberately settles into happy rather than dropping straight back to
  // idle: the drop from "you did it!" to nothing reads as the pet losing interest.
  useEffect(() => {
    if (!transient) return;
    const ms = Math.max(0, transient.expiresAt - Date.now());
    const id = setTimeout(() => {
      setTransient((current) => {
        if (current !== transient) return current; // already replaced by something newer
        return current.mood === "celebrating" ? makeTransient("happy", Date.now()) : null;
      });
    }, ms);
    return () => clearTimeout(id);
  }, [transient]);

  const react = useCallback((mood: PetMood) => {
    const now = Date.now();
    setTransient((current) => {
      if (!shouldReplaceTransient(current, mood, now)) return current;
      return makeTransient(mood, now) ?? current;
    });
  }, []);

  const setBusy = useCallback((next: boolean) => setBusyState(next), []);
  const say = useCallback((text: string | null) => setSpeech(text), []);

  const reactToRun = useCallback(
    (result: ExecResult) => {
      // Read the trace, not the outcome string: a run can reach the goal having bumped
      // on the way, and the goal is the higher-priority reaction either way. Priority in
      // mood.ts decides which one wins, so the order of these two calls doesn't matter.
      if (result.events.some((e) => e.type === "bump")) react("confused");
      if (result.outcome === "solved" || result.events.some((e) => e.type === "goal")) react("celebrating");
    },
    [react],
  );

  const commitState = useCallback(async (next: GameState) => {
    setState(next); // optimistic: points and the hunger bar move immediately
    try {
      // POST /api/state echoes back solved_levels read fresh from level_progress, which
      // /api/program has already written for this run. Adopting the response is what
      // keeps the trail's completion marks correct without re-fetching the whole state
      // on every navigation -- the old code only saw new solves after a page reload.
      const saved = await saveState(next);
      setState(saved);
    } catch {
      // A failed save must not take the UI down with it -- the child keeps playing and
      // the next successful write carries the same totals (they are absolute, not deltas).
      setError("save");
    }
  }, []);

  const feed = useCallback(
    async (treat: Treat) => {
      if (!state) return false;
      const result = applyPurchase({ points: state.learner.points, hunger: state.pet.hunger, treat });
      if (!result.ok) return false;

      const next: GameState = {
        ...state,
        // total_xp is untouched on purpose: it is the permanent record of everything
        // earned (§10 -- the pet never regresses), while `points` is the spendable
        // balance. Spending costs the balance, never the progress.
        learner: { ...state.learner, points: result.points },
        pet: { ...state.pet, hunger: result.hunger },
      };
      setFeedTick((t) => t + 1);
      setSpeech(treat.line);
      react("happy");
      await commitState(next);
      return true;
    },
    [state, react, commitState],
  );

  const activeLevel = useMemo(
    () => levels.find((l) => l.id === activeLevelId) ?? null,
    [levels, activeLevelId],
  );

  const mood = resolveMood({
    transient,
    busy,
    hunger: state?.pet.hunger ?? 100,
    lastInteractionAt,
    now: Date.now(),
  });

  // Debug/verification handle: lets the mood machine be driven directly from the console
  // when checking that all eight states render and interrupt cleanly, without having to
  // manufacture a bump or wait 45 seconds for sleepy. Dev builds only -- it is stripped
  // from the production bundle by the same `import.meta.env.DEV` gate Editor.tsx uses.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __pet: unknown }).__pet = { react, setBusy, say, priority: MOOD_PRIORITY };
  }, [react, setBusy, say]);

  const value: PetContextValue = {
    state,
    levels,
    error,
    mood,
    speech,
    feedTick,
    activeLevel,
    setActiveLevelId,
    react,
    setBusy,
    say,
    reactToRun,
    commitState,
    shopOpen,
    setShopOpen,
    feed,
  };

  return <PetContext.Provider value={value}>{children}</PetContext.Provider>;
}
