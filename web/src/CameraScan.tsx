import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./icons/Icon";
import { CARDS } from "./blocks/cardBlocks";
import { detectMarkers, orderMarkers, pickStableReading, type Detection } from "./blocks/cardDetect";
import { compileCardIds, type CardCompileResult } from "./blocks/compileCardIds";
import { friendlyError } from "./friendlyError";

// In-app counterpart to hub/hub.py's live-camera mode: point THIS machine's webcam at
// a row of the same printed cards and read them without leaving the browser or running
// a separate Python process. Brief §6/M5's physical-cards input, previously reachable
// only via `python -m hub.hub`, now reachable from the play screen itself.
//
// Detection runs on a hidden native-resolution canvas every SAMPLE_INTERVAL_MS (ArUco
// decoding is pure-JS, not GPU/WASM-accelerated here -- sampling instead of running on
// every animation frame keeps this comfortable on modest hardware, matching the "cheap
// low tier" spirit the rest of this app already designs around). A rolling window of
// recent readings feeds pickStableReading() on capture -- the same burst-and-vote fix
// hub/detect.py's capture_frame() needed after live testing showed single-frame
// detection flickering by one marker even with the camera held steady (2026-08-20, see
// DECISIONS.md) -- so a single unlucky frame at the moment of capture can't lose a card.

const SAMPLE_INTERVAL_MS = 200;
const STABLE_WINDOW = 8;

const CARD_LABEL: Record<number, string> = Object.fromEntries(CARDS.map((c) => [c.id, c.label]));

interface CameraScanProps {
  onCaptured: (result: CardCompileResult, cardLabels: string[]) => void;
  /** True while the parent is already submitting a previous capture -- disables the
   *  button so a slow /api/program round trip can't be double-submitted. */
  disabled?: boolean;
}

export default function CameraScan({ onCaptured, disabled }: CameraScanProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recentReadingsRef = useRef<number[][]>([]);

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [liveIds, setLiveIds] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(friendlyError("camera", new Error("getUserMedia unavailable (insecure context or unsupported browser)")));
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch (e) {
        setError(friendlyError("camera", e));
      }
    }

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);

      let detections: Detection[];
      try {
        detections = detectMarkers(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } catch {
        // A torn/partial frame occasionally throws inside the pure-JS decoder --
        // treat exactly like "nothing detected this tick", not a fatal error.
        detections = [];
      }
      const ordered = orderMarkers(detections);

      recentReadingsRef.current = [...recentReadingsRef.current, ordered].slice(-STABLE_WINDOW);
      setLiveIds(ordered);

      // No id text drawn here: the canvas itself is mirrored on screen (see the
      // `-scale-x-100` on the <canvas> below) so the preview feels natural to look
      // into, like any front-facing camera -- text baked into the bitmap would come
      // out backwards. The chip row underneath already shows correct, readable
      // labels, so a plain circle is enough live feedback for "found a marker here".
      for (const d of detections) {
        ctx.beginPath();
        ctx.arc(d.cx, d.cy, Math.max(d.size / 2, 12), 0, Math.PI * 2);
        ctx.strokeStyle = "#4caf50";
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }, SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [ready]);

  const handleCapture = useCallback(() => {
    const stable = pickStableReading(recentReadingsRef.current);
    const result = compileCardIds(stable);
    const labels = stable.map((id) => CARD_LABEL[id] ?? `card ${id}`);
    onCaptured(result, labels);
  }, [onCaptured]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
      {error ? (
        <div className="flex flex-col items-center gap-2 text-center">
          <Icon name="camera" size={40} className="text-quest-ink/30" />
          <p className="max-w-xs text-sm font-medium text-quest-coral-dark">{error}</p>
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-2xl border-4 border-white bg-black shadow-md">
            {/* The video element is the actual camera source (needed for drawImage);
                the canvas is what's shown, composited every tick with detection
                overlays -- same "draw everything on the frame, show the frame"
                approach as hub/live_preview.py's OpenCV window. `-scale-x-100` flips
                the canvas for DISPLAY only (a CSS transform on the compositor output,
                not the pixel buffer) -- like any selfie camera, so left/right on
                screen matches the user's own left/right instead of the raw sensor's.
                Detection above reads ctx.getImageData() on the unmirrored buffer,
                untouched by this -- mirroring a real ArUco marker is not one of its
                valid rotations, so decoding would break if this flip reached the
                pixels detectMarkers() actually sees. */}
            <video ref={videoRef} className="hidden" muted playsInline />
            <canvas ref={canvasRef} className="max-h-[360px] w-auto -scale-x-100" />
            {!ready && <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-white/80">Starting camera…</div>}
          </div>

          <div className="flex min-h-8 flex-wrap justify-center gap-1.5">
            {liveIds.length === 0 ? (
              <p className="text-xs font-medium text-quest-ink/50">Hold a row of cards up to the camera…</p>
            ) : (
              liveIds.map((id, i) => (
                <span key={i} className="rounded-full bg-quest-sky/20 px-2.5 py-1 text-xs font-bold text-quest-ink">
                  {CARD_LABEL[id] ?? `card ${id}`}
                </span>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={handleCapture}
            disabled={!ready || liveIds.length === 0 || disabled}
            className="flex items-center gap-2 rounded-2xl border-b-4 border-quest-sky-dark bg-quest-sky px-5 py-2.5 font-display text-base font-bold text-white shadow-md transition-transform hover:-translate-y-0.5 active:translate-y-0 active:border-b-2 disabled:translate-y-0 disabled:opacity-40"
          >
            <Icon name="camera" size={20} />
            Use this program
          </button>
        </>
      )}
    </div>
  );
}
