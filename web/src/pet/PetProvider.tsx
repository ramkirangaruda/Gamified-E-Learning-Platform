import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  POINTING_AFTER_MS,
  SLEEPY_AFTER_MS,
  STATE_PRIORITY,
  makeTransient,
  resolveMascotState,
  shouldReplaceTransient,
  type MascotState,
  type Transient,
} from "../mascot/state";
import { canSpeak, LOCKED_LINES, pickLine, SPEECH_LINES, UNLOCK_LINES } from "../mascot/speech";
import {
  detectNewMilestones,
  detectNewlyUnlockedLevel,
  findCurrentLevelIndex,
  hasRecommendedLevel as computeHasRecommendedLevel,
  type Milestone,
} from "../mascot/progress";
import { applyPurchase, type Treat } from "./treats";
import { fetchLevels, fetchState, fetchSuggestion, saveState, type GameState, type LevelDef, type Suggestion } from "../api";
import type { ExecResult } from "../executorTypes";

// The mascot's single source of truth, mounted once by App above everything else.
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
//
// Extended (not replaced) from the original 8-mood engine to the 14-state Hub-Mode-mascot
// vocabulary in mascot/state.ts -- see that file for why this is one engine, not two, and
// DECISIONS.md for the reasoning log.

// A rotating (not purely random) reaction cycle for direct mascot clicks -- guarantees
// variety across repeated clicks rather than "usually random, occasionally repeats twice
// by chance."
const CLICK_REACTIONS: MascotState[] = ["playful", "happy", "excited"];

interface MascotEvents {
  sessionStart(): void;
  levelHovered(level: LevelDef): void;
  levelSelected(level: LevelDef): void;
  levelLocked(level: LevelDef): void;
  answerCorrect(): void;
  answerIncorrect(): void;
  levelCompleted(level: LevelDef): void;
  streakIncreased(streak: number): void;
  milestoneReached(milestone: Milestone): void;
  levelUnlocked(level: LevelDef): void;
  mascotClicked(): void;
}

interface PetContextValue extends MascotEvents {
  state: GameState | null;
  levels: LevelDef[];
  error: string | null;
  /** "Pip suggests" -- null until the first fetch resolves. Refreshed after every
   *  commitState, so a solve/loss immediately reflects in the next suggestion. */
  suggestion: Suggestion | null;

  mood: MascotState;
  speech: string | null;
  /** Increments on every feed; Pet re-keys its one-shot eat animation off it. */
  feedTick: number;

  activeLevel: LevelDef | null;
  setActiveLevelId: (id: string | null) => void;
  /** The level a just-completed celebration should render near on the trail, or null.
   *  Short-lived (~2.5s), separate from activeLevel which clears on PlayPage unmount. */
  celebratingLevelId: string | null;

  /** Push a transient reaction directly. Lower-priority pushes are dropped, not queued.
   *  Prefer the named MascotEvents methods above at real call sites -- this stays exposed
   *  for the dev debug hook and for reactToRun's fine-grained trace reading. */
  react: (state: MascotState) => void;
  /** True while a program is running or a hint is in flight -> `thinking`. */
  setBusy: (busy: boolean) => void;
  say: (text: string | null) => void;
  /** Reads a finished run's trace and reacts: goal -> celebrating, bump -> confused. */
  reactToRun: (result: ExecResult) => void;

  /** Replaces game state and persists it (the reward write from PlayPage). Also diffs
   *  the result for newly-crossed XP/level-count milestones. */
  commitState: (next: GameState) => Promise<void>;
  /** Re-fetches state from the server without writing anything -- for a write that
   *  happened through a different endpoint entirely (classroom restore) and needs the
   *  provider's copy to catch up, rather than the optimistic-then-echo shape
   *  commitState uses for the reward path. */
  refreshState: () => Promise<void>;

  shopOpen: boolean;
  setShopOpen: (open: boolean) => void;
  feed: (treat: Treat) => Promise<boolean>;

  /** Calm Mode -- owned by App.tsx (see lite.ts), threaded down rather than re-read from
   *  the DOM a second way. Gates reaction intensity/frequency, never removed. */
  lite: boolean;
}

const PetContext = createContext<PetContextValue | null>(null);

export function usePet(): PetContextValue {
  const ctx = useContext(PetContext);
  if (!ctx) throw new Error("usePet must be used inside <PetProvider>");
  return ctx;
}

export function PetProvider({ children, lite = false }: { children: ReactNode; lite?: boolean }) {
  const [state, setState] = useState<GameState | null>(null);
  const [levels, setLevels] = useState<LevelDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [activeLevelId, setActiveLevelId] = useState<string | null>(null);
  const [celebratingLevelId, setCelebratingLevelId] = useState<string | null>(null);

  const [transient, setTransient] = useState<Transient | null>(null);
  const [busy, setBusyState] = useState(false);
  const [speech, setSpeech] = useState<string | null>(null);
  const [feedTick, setFeedTick] = useState(0);
  const [shopOpen, setShopOpen] = useState(false);
  const [lastInteractionAt, setLastInteractionAt] = useState(() => Date.now());
  // Bumped purely to re-render when a deadline passes (the sleepy/pointing thresholds).
  // Never read.
  const [, setClock] = useState(0);

  // Session-scoped streak (mascot/progress.ts: no per-solve timestamp exists to build a
  // real cross-session day-streak from without a backend change, so this resets on
  // reload by design -- see DECISIONS.md).
  const streakRef = useRef(0);
  const lastSpokenAtRef = useRef(0);
  const lastLineByStateRef = useRef<Partial<Record<MascotState, string>>>({});
  const clickCycleRef = useRef(0);
  const prevXpRef = useRef<number | null>(null);
  const prevSolvedCountRef = useRef<number | null>(null);
  const prevCurrentIndexRef = useRef<number | null>(null);
  const sessionStartedRef = useRef(false);

  useEffect(() => {
    fetchLevels().then(setLevels).catch(() => setError("levels"));
    fetchState().then(setState).catch(() => setError("state"));
    // Best-effort, deliberately no setError: a missing suggestion just means the callout
    // doesn't render (HomePage already guards on suggestion !== null) -- it's a nice-to-
    // have on top of the trail, not something that should surface as a page-level error.
    fetchSuggestion()
      .then(setSuggestion)
      .catch(() => {});
  }, []);

  // --- Interaction tracking (feeds `sleepy`/`pointing`) --------------------
  // Coalesced to at most one state update per second so that ordinary clicking does not
  // re-render this provider on every pointer event. Waking from sleepy is still instant:
  // if the mascot is asleep the last recorded interaction is by definition older than the
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

  // Two timers, rescheduled on interaction, that fire exactly when the mascot becomes
  // eligible to point, then to doze off. Not intervals, and neither depletes anything --
  // one click reverses either.
  useEffect(() => {
    const pointingId = setTimeout(() => setClock((c) => c + 1), POINTING_AFTER_MS);
    const sleepyId = setTimeout(() => setClock((c) => c + 1), SLEEPY_AFTER_MS);
    return () => {
      clearTimeout(pointingId);
      clearTimeout(sleepyId);
    };
  }, [lastInteractionAt]);

  // --- Transient expiry ----------------------------------------------------
  // celebrating deliberately settles into happy rather than dropping straight back to
  // idle: the drop from "you did it!" to nothing reads as the mascot losing interest.
  useEffect(() => {
    if (!transient) return;
    const ms = Math.max(0, transient.expiresAt - Date.now());
    const id = setTimeout(() => {
      setTransient((current) => {
        if (current !== transient) return current; // already replaced by something newer
        return current.state === "celebrating" ? makeTransient("happy", Date.now()) : null;
      });
    }, ms);
    return () => clearTimeout(id);
  }, [transient]);

  // Clears the trail's celebration marker independently of the transient mood settling.
  useEffect(() => {
    if (!celebratingLevelId) return;
    const id = setTimeout(() => setCelebratingLevelId(null), 2500);
    return () => clearTimeout(id);
  }, [celebratingLevelId]);

  const react = useCallback((next: MascotState) => {
    const now = Date.now();
    setTransient((current) => {
      if (!shouldReplaceTransient(current, next, now)) return current;
      return makeTransient(next, now) ?? current;
    });
  }, []);

  const setBusy = useCallback((next: boolean) => setBusyState(next), []);
  const say = useCallback((text: string | null) => setSpeech(text), []);

  // Speaks `text` for `mascotState`, subject to the anti-spam throttle -- unsolicited
  // event-driven lines only, never the real hint text from /api/hint (PlayPage calls
  // `say()` directly for that, bypassing this gate entirely).
  const speakFor = useCallback(
    (mascotState: MascotState, pool: readonly string[] | undefined) => {
      const now = Date.now();
      if (!canSpeak(lastSpokenAtRef.current, now, lite)) return;
      const line = pickLine(pool, lastLineByStateRef.current[mascotState] ?? null);
      if (!line) return;
      lastSpokenAtRef.current = now;
      lastLineByStateRef.current[mascotState] = line;
      setSpeech(line);
    },
    [lite],
  );

  const reactToRun = useCallback(
    (result: ExecResult) => {
      // Read the trace, not the outcome string: a run can reach the goal having bumped
      // on the way, and the goal is the higher-priority reaction either way. Priority in
      // mascot/state.ts decides which one wins, so the order of these two calls doesn't
      // matter.
      if (result.events.some((e) => e.type === "bump")) react("confused");
      if (result.outcome === "solved" || result.events.some((e) => e.type === "goal")) react("celebrating");
    },
    [react],
  );

  // --- Mascot event-bus API (see mascot/events.ts's public re-export) ------
  // Thin calls into react()/speakFor() -- callers (Trail, PlayPage, App, ...) never touch
  // Rive/animation types, matching the brief's "component should not need to know every
  // detail of the application's business logic."

  const sessionStart = useCallback(() => {
    if (sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    react("welcome");
    speakFor("welcome", SPEECH_LINES.welcome);
  }, [react, speakFor]);

  const levelHovered = useCallback(
    (_level: LevelDef) => {
      react("pointing");
      // No speech: hover reactions are the most frequent event in the app, and the brief
      // is explicit that a level node/hover reaction must never obscure content -- a
      // silent acknowledgement (motion only) is the safe default here.
    },
    [react],
  );

  const levelSelected = useCallback(
    (_level: LevelDef) => {
      react("excited");
    },
    [react],
  );

  const levelLocked = useCallback(
    (_level: LevelDef) => {
      react("encouraging");
      speakFor("encouraging", LOCKED_LINES);
    },
    [react, speakFor],
  );

  const answerCorrect = useCallback(() => {
    react("excited");
    speakFor("excited", SPEECH_LINES.excited);
  }, [react, speakFor]);

  const answerIncorrect = useCallback(() => {
    streakRef.current = 0;
    react("confused");
    // Deliberately no speech here -- PlayPage's existing say(hint.hint) call supplies the
    // real, pre-verified hint text once it arrives, and that must be the thing on screen,
    // not a generic line racing it.
  }, [react]);

  const streakIncreased = useCallback(
    (streak: number) => {
      react("streak");
      speakFor("streak", SPEECH_LINES.streak);
      void streak; // not shown in the line itself yet -- reserved for a future "N in a row!" copy pass
    },
    [react, speakFor],
  );

  const levelCompleted = useCallback(
    (level: LevelDef) => {
      react("celebrating");
      speakFor("celebrating", SPEECH_LINES.celebrating);
      setCelebratingLevelId(level.id);

      streakRef.current += 1;
      const streak = streakRef.current;
      // Only notable streaks get their own reaction -- every completion already gets a
      // celebration, so announcing every single increment would be noise on top of noise.
      if (streak === 3 || streak === 5 || (streak >= 10 && streak % 5 === 0)) {
        streakIncreased(streak);
      }
    },
    [react, speakFor, streakIncreased],
  );

  const milestoneReached = useCallback(
    (_milestone: Milestone) => {
      react("milestone");
      speakFor("milestone", SPEECH_LINES.milestone);
    },
    [react, speakFor],
  );

  const levelUnlocked = useCallback(
    (_level: LevelDef) => {
      react("pointing");
      speakFor("pointing", UNLOCK_LINES);
    },
    [react, speakFor],
  );

  const mascotClicked = useCallback(() => {
    const next = CLICK_REACTIONS[clickCycleRef.current % CLICK_REACTIONS.length];
    clickCycleRef.current += 1;
    react(next);
    speakFor(next, SPEECH_LINES[next]);
  }, [react, speakFor]);

  // Fires once, on mount -- the provider is mounted exactly once for the life of the tab
  // (App.tsx), so "session start" and "provider mount" are the same moment. sessionStart
  // is also guarded by sessionStartedRef itself, defensively, against StrictMode's
  // double-invoke of effects in development.
  useEffect(() => {
    sessionStart();
  }, [sessionStart]);

  const commitState = useCallback(
    async (next: GameState) => {
      setState(next); // optimistic: points and the hunger bar move immediately
      try {
        // POST /api/state echoes back solved_levels read fresh from level_progress, which
        // /api/program has already written for this run. Adopting the response is what
        // keeps the trail's completion marks correct without re-fetching the whole state
        // on every navigation -- the old code only saw new solves after a page reload.
        const saved = await saveState(next);
        setState(saved);
        // A solve (or a fresh set of stars) can change what Tom should suggest next --
        // best-effort, same as the initial fetch above.
        fetchSuggestion()
          .then(setSuggestion)
          .catch(() => {});

        const prevXp = prevXpRef.current;
        const prevSolvedCount = prevSolvedCountRef.current;
        if (prevXp !== null && prevSolvedCount !== null) {
          const milestones = detectNewMilestones(prevXp, saved.learner.total_xp, prevSolvedCount, saved.solved_levels.length);
          for (const m of milestones) milestoneReached(m);
        }
        prevXpRef.current = saved.learner.total_xp;
        prevSolvedCountRef.current = saved.solved_levels.length;
      } catch {
        // A failed save must not take the UI down with it -- the child keeps playing and
        // the next successful write carries the same totals (they are absolute, not deltas).
        setError("save");
      }
    },
    [milestoneReached],
  );

  const refreshState = useCallback(async () => {
    const [fresh] = await Promise.all([
      fetchState(),
      fetchSuggestion()
        .then(setSuggestion)
        .catch(() => {}),
    ]);
    setState(fresh);
  }, []);

  const feed = useCallback(
    async (treat: Treat) => {
      if (!state) return false;
      const result = applyPurchase({ points: state.learner.points, hunger: state.pet.hunger, treat });
      if (!result.ok) return false;

      const next: GameState = {
        ...state,
        // total_xp is untouched on purpose: it is the permanent record of everything
        // earned (§10 -- the mascot never regresses), while `points` is the spendable
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

  // Newly-unlocked-level detection: compares the "current" (first unsolved) index across
  // renders, firing levelUnlocked exactly once per real advance rather than once per
  // render. Runs whenever levels/state change, i.e. after every commitState resolves.
  useEffect(() => {
    if (levels.length === 0 || !state) return;
    const currentIndex = findCurrentLevelIndex(levels, state.solved_levels);
    const prev = prevCurrentIndexRef.current;
    if (prev !== null) {
      const unlocked = detectNewlyUnlockedLevel(levels, prev, currentIndex);
      if (unlocked) levelUnlocked(unlocked);
    }
    prevCurrentIndexRef.current = currentIndex;
  }, [levels, state, levelUnlocked]);

  const activeLevel = useMemo(
    () => levels.find((l) => l.id === activeLevelId) ?? null,
    [levels, activeLevelId],
  );

  const mood = resolveMascotState({
    transient,
    busy,
    hunger: state?.pet.hunger ?? 100,
    lastInteractionAt,
    // Calm Mode: no proactive guiding motion -- the mascot still reacts to real events,
    // it just never nudges the child toward the next level on its own initiative.
    hasRecommendedLevel: lite ? false : computeHasRecommendedLevel(levels, state),
    now: Date.now(),
  });

  // Debug/verification handle: lets the state machine be driven directly from the console
  // when checking that all fourteen states render and interrupt cleanly, without having to
  // manufacture a bump or wait 45 seconds for sleepy. Dev builds only -- stripped from the
  // production bundle by the same `import.meta.env.DEV` gate Editor.tsx uses.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __pet: unknown }).__pet = {
      react,
      setBusy,
      say,
      priority: STATE_PRIORITY,
      events: {
        sessionStart,
        levelHovered,
        levelSelected,
        levelLocked,
        answerCorrect,
        answerIncorrect,
        levelCompleted,
        streakIncreased,
        milestoneReached,
        levelUnlocked,
        mascotClicked,
      },
    };
  }, [
    react,
    setBusy,
    say,
    sessionStart,
    levelHovered,
    levelSelected,
    levelLocked,
    answerCorrect,
    answerIncorrect,
    levelCompleted,
    streakIncreased,
    milestoneReached,
    levelUnlocked,
    mascotClicked,
  ]);

  const value: PetContextValue = {
    state,
    levels,
    error,
    suggestion,
    mood,
    speech,
    feedTick,
    activeLevel,
    setActiveLevelId,
    celebratingLevelId,
    react,
    setBusy,
    say,
    reactToRun,
    commitState,
    refreshState,
    shopOpen,
    setShopOpen,
    feed,
    lite,
    sessionStart,
    levelHovered,
    levelSelected,
    levelLocked,
    answerCorrect,
    answerIncorrect,
    levelCompleted,
    streakIncreased,
    milestoneReached,
    levelUnlocked,
    mascotClicked,
  };

  return <PetContext.Provider value={value}>{children}</PetContext.Provider>;
}
