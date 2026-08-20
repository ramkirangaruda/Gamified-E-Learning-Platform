import { useEffect, useRef, useState } from "react";
import { Fit, Layout, Rive } from "@rive-app/canvas";
import { configureRiveWasm } from "./riveLoader";
import { resolveRiveCue } from "./riveMapping";
import { gateCssEffect } from "./calmMode";
import { mascotStateToLegacyMood, type MascotState } from "./state";
import Pet from "../pet/Pet";

const RIVE_SRC = "/mascot.riv";
const STATE_MACHINE = "State Machine 1";

// How long a sustained `sleepy` state runs before Rive's own render loop is paused
// outright -- steps()-CSS budgets (idleAnimation.test.ts) only govern the DOM, Rive
// advancing/redrawing every frame is a real, separate CPU cost worth stopping on a Pi.
const PAUSE_AFTER_SLEEPY_MS = 10_000;

interface MascotCanvasProps {
  state: MascotState;
  evolutionStage?: number;
  /** Bumped by the provider on every feed; forwarded to the fallback Pet.tsx so its
   *  one-shot eat animation still replays if Rive isn't available. */
  feedTick?: number;
  /** Rendered pixel size (square). */
  size?: number;
  /** Calm Mode (App.tsx's `lite`) -- suppresses the biggest/most sudden cssEffects. See
   *  mascot/calmMode.ts. Passed explicitly rather than read via a hook so this component
   *  stays easy to render/test outside the provider tree if that's ever useful. */
  calm?: boolean;
  onClick?: () => void;
  className?: string;
}

/** Renders the Rive mascot, falling back to the existing inline-SVG Pet.tsx if the .riv
 *  asset or wasm runtime fails to load for any reason -- Pet.tsx is kept, not deleted,
 *  specifically to be this fallback (see DECISIONS.md). */
export function MascotCanvas({ state, evolutionStage, feedTick, size = 96, calm = false, onClick, className }: MascotCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const riveRef = useRef<Rive | null>(null);
  const inputsRef = useRef<ReturnType<Rive["stateMachineInputs"]> | null>(null);
  const effectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepyPauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(false);

  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [cssEffect, setCssEffect] = useState<string | null>(null);

  useEffect(() => {
    configureRiveWasm();
    if (!canvasRef.current) return;

    const r = new Rive({
      src: RIVE_SRC,
      canvas: canvasRef.current,
      stateMachines: STATE_MACHINE,
      autoplay: true,
      enableRiveAssetCDN: false, // offline-only app -- never let Rive implicitly fetch anything
      layout: new Layout({ fit: Fit.Contain }),
      onLoad: () => {
        try {
          inputsRef.current = r.stateMachineInputs(STATE_MACHINE);
          setReady(true);
        } catch {
          setFailed(true);
        }
      },
      onLoadError: () => setFailed(true),
    });
    riveRef.current = r;

    return () => {
      if (effectTimeoutRef.current) clearTimeout(effectTimeoutRef.current);
      if (sleepyPauseTimeoutRef.current) clearTimeout(sleepyPauseTimeoutRef.current);
      r.cleanup();
      riveRef.current = null;
      inputsRef.current = null;
    };
    // Constructed once; `state` changes are handled by the effect below via the live
    // instance, not by tearing down and recreating the canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire the trigger for the new state, apply its CSS effect, and manage the
  // pause-when-long-sleepy behavior.
  useEffect(() => {
    if (!ready || !riveRef.current) return;
    const rive = riveRef.current;

    if (pausedRef.current) {
      rive.play();
      pausedRef.current = false;
    }
    if (sleepyPauseTimeoutRef.current) {
      clearTimeout(sleepyPauseTimeoutRef.current);
      sleepyPauseTimeoutRef.current = null;
    }

    const cue = resolveRiveCue(state);
    if (cue.trigger && inputsRef.current) {
      const input = inputsRef.current.find((i) => i.name === cue.trigger);
      input?.fire();
    }

    if (effectTimeoutRef.current) clearTimeout(effectTimeoutRef.current);
    setCssEffect(null);
    const gatedEffect = gateCssEffect(cue.cssEffect, calm);
    if (gatedEffect) {
      // Force a reflow so re-triggering the same effect twice in a row still restarts
      // the CSS animation, instead of a no-op class-already-present.
      requestAnimationFrame(() => {
        setCssEffect(gatedEffect);
        effectTimeoutRef.current = setTimeout(() => setCssEffect(null), 900);
      });
    }

    if (state === "sleepy") {
      sleepyPauseTimeoutRef.current = setTimeout(() => {
        rive.pause();
        pausedRef.current = true;
      }, PAUSE_AFTER_SLEEPY_MS);
    }
  }, [state, ready, calm]);

  if (failed) {
    return <Pet mood={mascotStateToLegacyMood(state)} evolutionStage={evolutionStage} size={size} feedTick={feedTick} />;
  }

  return (
    <div
      className={`mascot-shell quest-decorative${cssEffect ? ` mascot-fx-${cssEffect}` : ""} ${className ?? ""}`}
      data-mascot-state={state}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? "Pip, your learning companion" : undefined}
    >
      <div className="mascot-tilt">
        <canvas ref={canvasRef} width={size} height={size} style={{ width: size, height: size }} />
      </div>
    </div>
  );
}

