import { useEffect, useRef, useState } from "react";
import {
  loadPhysicsSolved,
  savePhysicsSolved,
  physicsXp,
  type PhysicsLevelKey,
  type PhysicsSolved,
} from "./physics/progress";
import { ChunkyButton } from "./ui/Chunky";
import { toneClasses } from "./ui/tone";

// Physics, as a real playable subject rather than a "coming soon" card. Five hands-on
// simulations -- a cannon, a spring launcher, a balance beam, a simple circuit, a mirror
// maze -- each with three rounds. Everything here runs on real formulas (see each level's
// `formula`/`explain`), the same "no faked progress" rule subjects.ts applies everywhere
// else: a round is marked solved only once its actual physics check passes.
//
// Unlike Coding, there is no executor, no AST, and no server involved -- this is a
// self-contained canvas mini-game, closer in spirit to the sandbox than to a level. Stars
// and XP are tracked in the browser (localStorage), not in pet.db on the USB drive, which
// is a real and known gap: progress here does not survive a drive swap the way Coding's
// does. Honest about it rather than quietly pretending otherwise (see subjects.ts).

const WIDTH = 760;
const HEIGHT = 440;
const G1 = 560; // px/s^2, cannon level (screen-space gravity, not metric)
const PPM = 30; // px per metre, spring level
const G2 = 9.8 * PPM;

type LevelKey = PhysicsLevelKey;

interface PhysLevel {
  key: LevelKey;
  number: number;
  short: string;
  title: string;
  topic: string;
  formula: string;
  explain: string;
}

const LEVELS: PhysLevel[] = [
  { key: "proj", number: 1, short: "Pr", title: "Cannon Cove", topic: "Projectile Motion",
    formula: "range = v² sin 2θ / g",
    explain: "A launched ball has two independent motions: steady sideways travel and falling. 45° gives the longest range in still air." },
  { key: "spring", number: 2, short: "Sp", title: "Spring Launch", topic: "Elastic Energy",
    formula: "½kx² = ½mv²",
    explain: "A squeezed spring stores energy. It all becomes movement energy at release -- heavier balls leave slower." },
  { key: "lever", number: 3, short: "Lv", title: "Balance Bridge", topic: "Torque & Levers",
    formula: "τ = m × d",
    explain: "Turning effect is mass times distance from the pivot. A small crate far out balances a big crate sitting close in." },
  { key: "circuit", number: 4, short: "Ci", title: "Circuit Spark", topic: "Current & Resistance",
    formula: "I = V / R",
    explain: "Resistors in a line add up. Side by side they let more current through than either alone -- so parallel means brighter." },
  { key: "mirror", number: 5, short: "Mr", title: "Mirror Maze", topic: "Reflection of Light",
    formula: "angle in = angle out",
    explain: "Light bounces off a mirror at the same angle it arrives. A 45° mirror turns a beam by exactly a quarter turn." },
];

interface ProjRound { goal: string; targets: { x: number; y: number }[]; wall: { x: number; h: number } | null; wind: number; shots: number }
const PROJ_ROUNDS: ProjRound[] = [
  { goal: "Pop both balloons over the cove. Five cannonballs, still air.", targets: [{ x: 520, y: 296 }, { x: 648, y: 232 }], wall: null, wind: 0, shots: 5 },
  { goal: "A rock stack blocks the low road -- arc the shot over it.", targets: [{ x: 596, y: 184 }, { x: 690, y: 318 }], wall: { x: 414, h: 158 }, wind: 0, shots: 5 },
  { goal: "A sea breeze is pushing back. Aim into it.", targets: [{ x: 566, y: 150 }, { x: 704, y: 262 }], wall: { x: 400, h: 112 }, wind: -70, shots: 6 },
];

interface SpringRound { goal: string; basket: { x: number; y: number } }
const SPRING_ROUNDS: SpringRound[] = [
  { goal: "Land the ball in the near basket. Any spring will do -- find one that fits.", basket: { x: 470, y: 330 } },
  { goal: "Farther and higher. More stored energy, or a lighter ball.", basket: { x: 614, y: 246 } },
  { goal: "The high shelf. You will need the stiff spring, fully squeezed.", basket: { x: 700, y: 158 } },
];

interface LeverRound { goal: string; fixed: { m: number; d: number }[]; crates: number[] }
const LEVER_ROUNDS: LeverRound[] = [
  { goal: "Balance the plank: place both crates so the turning effects cancel.", fixed: [{ m: 4, d: -2 }], crates: [2, 3] },
  { goal: "The heavy crate is already out on the right. Cancel it from the left.", fixed: [{ m: 3, d: 3 }], crates: [1, 4] },
  { goal: "Two fixed loads, three crates. Every crate must go on the plank.", fixed: [{ m: 5, d: -1 }, { m: 2, d: 4 }], crates: [4, 2, 1] },
];

interface CircuitRound { goal: string; lo: number; hi: number }
const CIRCUIT_ROUNDS: CircuitRound[] = [
  { goal: "Light the bulb gently: get the current between 0.20 and 0.30 A.", lo: 0.2, hi: 0.3 },
  { goal: "Full brightness: 0.55 to 0.70 A -- without burning the bulb out.", lo: 0.55, hi: 0.7 },
  { goal: "A steady 0.35 to 0.45 A. There is more than one way in.", lo: 0.35, hi: 0.45 },
];

type MirrorOrient = "/" | "\\";
interface MirrorCell { c: number; r: number; o: MirrorOrient }
interface MirrorRound {
  goal: string;
  src: { c: number; r: number };
  dir: [number, number];
  sensor: { c: number; r: number };
  mirrors: MirrorCell[];
  walls: { c: number; r: number }[];
}
const MIRROR_ROUNDS: MirrorRound[] = [
  { goal: "Turn the beam into the sensor with two mirrors.", src: { c: 0, r: 2 }, dir: [1, 0], sensor: { c: 8, r: 4 },
    mirrors: [{ c: 5, r: 2, o: "/" }, { c: 5, r: 4, o: "/" }], walls: [{ c: 8, r: 2 }] },
  { goal: "Three mirrors, and a wall that eats the beam.", src: { c: 0, r: 5 }, dir: [1, 0], sensor: { c: 7, r: 4 },
    mirrors: [{ c: 2, r: 5, o: "\\" }, { c: 2, r: 1, o: "\\" }, { c: 7, r: 1, o: "/" }], walls: [{ c: 4, r: 3 }, { c: 9, r: 2 }] },
  { goal: "Thread the whole board. Four mirrors, one exact path.", src: { c: 0, r: 0 }, dir: [1, 0], sensor: { c: 10, r: 5 },
    mirrors: [{ c: 4, r: 0, o: "/" }, { c: 4, r: 3, o: "/" }, { c: 8, r: 3, o: "/" }, { c: 8, r: 5, o: "/" }],
    walls: [{ c: 6, r: 0 }, { c: 10, r: 3 }, { c: 2, r: 3 }] },
];

// ---- canvas drawing helpers (pure functions -- no React here) -------------------------

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}
function label(c: CanvasRenderingContext2D, t: string, x: number, y: number) {
  c.font = "700 13px Nunito, sans-serif"; c.textAlign = "left";
  c.fillStyle = "rgba(255,255,255,0.78)"; rr(c, x - 8, y - 15, c.measureText(t).width + 16, 22, 8); c.fill();
  c.fillStyle = "#3d3328"; c.fillText(t, x, y);
}
function tree(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.fillStyle = "#8a5a3a"; rr(c, x - 5 * s, y, 10 * s, 26 * s, 3); c.fill();
  c.fillStyle = "#4caf50";
  c.beginPath(); c.arc(x, y - 8 * s, 24 * s, 0, 7); c.fill();
  c.beginPath(); c.arc(x - 15 * s, y + 2 * s, 17 * s, 0, 7); c.fill();
  c.beginPath(); c.arc(x + 16 * s, y + 2 * s, 17 * s, 0, 7); c.fill();
}
function sky(c: CanvasRenderingContext2D, top: string, bot: string, phase: number) {
  const g = c.createLinearGradient(0, 0, 0, HEIGHT);
  g.addColorStop(0, top); g.addColorStop(1, bot);
  c.fillStyle = g; c.fillRect(0, 0, WIDTH, HEIGHT);
  c.fillStyle = "#ffd166"; c.beginPath(); c.arc(660, 66, 34, 0, 7); c.fill();
  c.globalAlpha = 0.5; c.fillStyle = "#fff";
  const dx = (phase * 9) % 900;
  for (const [x, y, r] of [[120, 74, 30], [400, 52, 22]] as [number, number, number][]) {
    const cx = ((x + dx) % 900) - 70;
    c.beginPath();
    c.arc(cx, y, r, 0, 7);
    c.arc(cx + r, y + 6, r * 0.8, 0, 7);
    c.arc(cx - r, y + 8, r * 0.7, 0, 7);
    c.fill();
  }
  c.globalAlpha = 1;
}
function scenery(c: CanvasRenderingContext2D, y: number) {
  c.fillStyle = "#bfe0a8";
  c.beginPath(); c.moveTo(0, y - 12);
  c.quadraticCurveTo(180, y - 62, 360, y - 14);
  c.quadraticCurveTo(540, y + 18, 760, y - 34);
  c.lineTo(760, y + 60); c.lineTo(0, y + 60); c.closePath(); c.fill();
  tree(c, 30, y - 14, 0.85);
  tree(c, 268, y - 20, 0.65);
  tree(c, 742, y - 12, 0.95);
}
function flowers(c: CanvasRenderingContext2D, y: number) {
  c.fillStyle = "#6fae3e";
  for (const [x, s] of [[130, 1], [455, 0.8], [630, 0.9]] as [number, number][]) {
    c.beginPath(); c.arc(x - 12 * s, y, 10 * s, 0, 7); c.arc(x + 12 * s, y, 10 * s, 0, 7); c.arc(x, y - 8, 12 * s, 0, 7); c.fill();
  }
  for (const [x, col] of [[210, "#ff6b6b"], [520, "#ffb703"], [700, "#3bb4e5"]] as [number, string][]) {
    c.fillStyle = col;
    for (const [dx, dy] of [[0, -6], [-5, 0], [5, 0], [0, 6]]) { c.beginPath(); c.arc(x + dx, y + 16 + dy, 4.5, 0, 7); c.fill(); }
    c.fillStyle = "#fff8ec"; c.beginPath(); c.arc(x, y + 16, 2.6, 0, 7); c.fill();
  }
}
function ground(c: CanvasRenderingContext2D, y: number, fill: string) {
  c.fillStyle = fill; c.beginPath(); c.moveTo(0, y + 6);
  for (let x = 0; x <= WIDTH; x += 40) c.lineTo(x, y + Math.sin(x / 90) * 5);
  c.lineTo(WIDTH, HEIGHT); c.lineTo(0, HEIGHT); c.closePath(); c.fill();
  c.fillStyle = "rgba(61,51,40,0.10)"; c.fillRect(0, y + 6, WIDTH, 3);
}

// ---- simulation types (imperative, kept in refs so they never trigger re-renders) -----

interface ProjSim { kind: "proj"; x: number; y: number; vx: number; vy: number; wind: number; trail: [number, number][] }
interface BallSim { kind: "ball"; x: number; y: number; vx: number; vy: number; trail: [number, number][] }
type Sim = ProjSim | BallSim | null;

interface Result {
  ok: boolean;
  title: string;
  msg: string;
  next?: string;
  toTrail?: boolean;
  retry?: boolean;
}

function netTorque(round: LeverRound, placed: { m: number; d: number }[]): number {
  let n = 0;
  for (const f of round.fixed) n += f.m * f.d;
  for (const p of placed) n += p.m * p.d;
  return n;
}

function circuitCalc(volts: number, res: boolean[], wiring: "series" | "parallel") {
  const vals = [10, 20, 30];
  const on = vals.filter((_, i) => res[i]);
  let extra = 0;
  if (on.length) extra = wiring === "series" ? on.reduce((a, b) => a + b, 0) : 1 / on.reduce((a, b) => a + 1 / b, 0);
  const R = 10 + extra;
  return { R: Math.round(R * 10) / 10, I: Math.round((volts / R) * 1000) / 1000, on };
}

function beamPath(round: MirrorRound, mirrors: MirrorCell[]) {
  let [dc, dr] = round.dir;
  let c = round.src.c, rw = round.src.r;
  const pts: [number, number][] = [[c, rw]];
  let bounces = 0, ok = false;
  for (let step = 0; step < 90; step++) {
    c += dc; rw += dr;
    if (c < 0 || c > 10 || rw < 0 || rw > 5) break;
    if (round.walls.some((w) => w.c === c && w.r === rw)) { pts.push([c, rw]); break; }
    const m = mirrors.find((m) => m.c === c && m.r === rw);
    if (m) {
      pts.push([c, rw]); bounces++;
      if (m.o === "/") { const t = dc; dc = -dr; dr = -t; } else { const t = dc; dc = dr; dr = t; }
      continue;
    }
    if (round.sensor.c === c && round.sensor.r === rw) { pts.push([c, rw]); ok = true; break; }
  }
  if (!ok) pts.push([c, rw]);
  return { pts, bounces, ok };
}

export default function PhysicsQuest() {
  const [view, setView] = useState<"trail" | "play">("trail");
  const [li, setLi] = useState(0);
  const [round, setRound] = useState(0);
  const [solved, setSolved] = useState<PhysicsSolved>(loadPhysicsSolved);
  const [result, setResult] = useState<Result | null>(null);

  const [angle, setAngle] = useState(45);
  const [power, setPower] = useState(60);
  const [shotsUsed, setShotsUsed] = useState(0);

  const [pull, setPull] = useState(60);
  const [k, setK] = useState(90);
  const [mass, setMass] = useState(1);
  const [launchAngle, setLaunchAngle] = useState(45);

  const [picked, setPicked] = useState(0);
  const [placed, setPlaced] = useState<{ i: number; m: number; d: number }[]>([]);

  const [volts, setVolts] = useState(6);
  const [res, setRes] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [wiring, setWiring] = useState<"series" | "parallel">("series");

  const [mirrors, setMirrors] = useState<MirrorCell[] | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const phaseRef = useRef(0);
  const flashRef = useRef(0);
  const simRef = useRef<Sim>(null);
  const tiltRef = useRef(0);
  const tiltVRef = useRef(0);
  const popRef = useRef<number[]>([]);
  const missesRef = useRef(0);
  const eposRef = useRef(0);
  const busyRef = useRef(false);

  // Always-current snapshot of the controlled values the rAF loop needs, without putting
  // the loop itself in a dependency array that would tear it down every slider tick.
  const live = { view, li, round, angle, power, shotsUsed, pull, k, mass, launchAngle, placed, volts, res, wiring, mirrors };
  const liveRef = useRef(live);
  liveRef.current = live;

  const lvl = LEVELS[li];
  const t = toneClasses("repeat");

  useEffect(() => {
    savePhysicsSolved(solved);
  }, [solved]);

  function resetRound() {
    simRef.current = null;
    flashRef.current = 0;
    popRef.current = [];
    missesRef.current = 0;
    busyRef.current = false;
    setResult(null);
    if (lvl.key === "proj") setShotsUsed(0);
    if (lvl.key === "lever") { tiltRef.current = 0; tiltVRef.current = 0; setPlaced([]); setPicked(0); }
    if (lvl.key === "circuit") { setRes([false, false, false]); setWiring("series"); setVolts(6); }
    if (lvl.key === "mirror") setMirrors(MIRROR_ROUNDS[round].mirrors.map((m) => ({ ...m })));
  }

  function openLevel(i: number) {
    const key = LEVELS[i].key;
    const done = solved[key];
    let r = done.findIndex((v) => !v); if (r < 0) r = 0;
    setLi(i); setRound(r); setView("play");
  }
  function gotoRound(r: number) { setRound(r); }
  // Every level/round switch starts from a clean simulation -- resetRound reads `lvl` and
  // `round` off the closure, so it only needs to re-run when either of those change.
  useEffect(() => {
    resetRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [li, round]);

  function win(bonus: string) {
    const key = lvl.key, r = round;
    const misses = missesRef.current;
    const stars = misses === 0 ? 3 : misses <= 2 ? 2 : 1;
    setSolved((prev) => {
      const arr: [number, number, number] = [...prev[key]] as [number, number, number];
      arr[r] = Math.max(arr[r], stars);
      return { ...prev, [key]: arr };
    });
    const last = r === 2;
    const doneAll = (() => {
      const arr = [...solved[key]] as [number, number, number]; arr[r] = Math.max(arr[r], stars);
      return arr.every((v) => v > 0);
    })();
    flashRef.current = 1;
    setResult({
      ok: true,
      title: last && doneAll ? "Level cleared! " + "★".repeat(stars) : "Round solved! " + "★".repeat(stars),
      msg: bonus,
      next: last ? (doneAll ? "Back to the trail" : "Pick an unsolved round") : "Next round →",
      toTrail: last,
    });
  }
  function fail(msg: string) { missesRef.current += 1; setResult({ ok: false, title: "Not quite", msg, retry: true }); }
  function miss(title: string, msg: string) { missesRef.current += 1; setResult({ ok: false, title, msg }); }

  function onNext() {
    if (result?.toTrail) { setView("trail"); return; }
    setRound(Math.min(2, round + 1));
  }

  // ---- level 1: projectile -------------------------------------------------------------
  function fire() {
    if (simRef.current || busyRef.current) return;
    const r = PROJ_ROUNDS[round];
    if (shotsUsed >= r.shots) { fail("Out of cannonballs. Reset the round and try a new angle."); return; }
    const a = (angle * Math.PI) / 180, v = power * 6.4;
    simRef.current = { kind: "proj", x: 86, y: 360, vx: Math.cos(a) * v, vy: -Math.sin(a) * v, wind: r.wind, trail: [] };
    setShotsUsed((n) => n + 1);
    setResult(null);
  }
  function stepProj(dt: number) {
    const s = simRef.current; if (!s || s.kind !== "proj") return;
    const r = PROJ_ROUNDS[round];
    s.vy += G1 * dt; s.vx += s.wind * dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.trail.push([s.x, s.y]); if (s.trail.length > 160) s.trail.shift();
    for (let i = 0; i < r.targets.length; i++) {
      const tg = r.targets[i];
      if (popRef.current.includes(i)) continue;
      if (Math.hypot(s.x - tg.x, s.y - tg.y) < 24) {
        popRef.current.push(i); flashRef.current = 1;
        simRef.current = null;
        if (popRef.current.length === r.targets.length) win("Both balloons popped with " + (r.shots - liveRef.current.shotsUsed) + " shots to spare.");
        return;
      }
    }
    if (r.wall && s.x > r.wall.x && s.x < r.wall.x + 20 && s.y > 372 - r.wall.h) { simRef.current = null; endShot("Thud -- the rock stack. Try a steeper angle."); return; }
    if (s.y > 372 || s.x > 780 || s.x < -20) {
      simRef.current = null;
      endShot(s.x > 780 ? "Sailed clean over. Ease off the power." : "Splash. A little more power or a lower angle.");
    }
  }
  function endShot(msg: string) {
    const r = PROJ_ROUNDS[round];
    if (liveRef.current.shotsUsed >= r.shots) fail("Out of cannonballs -- " + msg.toLowerCase());
    else miss("Missed", msg);
  }

  // ---- level 2: spring ------------------------------------------------------------------
  function launch() {
    if (simRef.current) return;
    const x = pull / 100, v = Math.sqrt((k * x * x) / mass);
    const a = (launchAngle * Math.PI) / 180;
    simRef.current = { kind: "ball", x: 170, y: 352, vx: Math.cos(a) * v * PPM, vy: -Math.sin(a) * v * PPM, trail: [] };
    setResult(null);
  }
  function stepBall(dt: number) {
    const s = simRef.current; if (!s || s.kind !== "ball") return;
    const b = SPRING_ROUNDS[round].basket;
    s.vy += G2 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
    s.trail.push([s.x, s.y]); if (s.trail.length > 200) s.trail.shift();
    if (s.vy > 0 && s.y >= b.y && s.y <= b.y + 16 && Math.abs(s.x - b.x) < 34) {
      simRef.current = null; flashRef.current = 1;
      win("Energy in the spring became exactly the speed you needed.");
      return;
    }
    if (s.y > 380 || s.x > 780) {
      const over = s.x > b.x + 34;
      simRef.current = null;
      miss("Missed the basket", over ? "Overshot -- less compression, a lighter spring, or a heavier ball." : "Fell short -- squeeze further, stiffen the spring, or lighten the ball.");
    }
  }

  // ---- level 3: lever ---------------------------------------------------------------------
  function place(d: number) {
    const r = LEVER_ROUNDS[round];
    if (placed.some((p) => p.d === d) || r.fixed.some((f) => f.d === d)) return;
    let i = picked;
    if (placed.some((p) => p.i === i)) {
      const next = r.crates.findIndex((_, j) => !placed.some((p) => p.i === j));
      if (next < 0) return;
      i = next;
    }
    const nextPlaced = [...placed, { i, m: r.crates[i], d }];
    const nextPick = r.crates.findIndex((_, j) => !nextPlaced.some((p) => p.i === j));
    setPlaced(nextPlaced);
    setPicked(nextPick < 0 ? i : nextPick);
    if (nextPlaced.length === r.crates.length) {
      const net = netTorque(r, nextPlaced);
      if (Math.abs(net) < 0.01) win("Perfectly level -- the two turning effects are equal and opposite.");
      else miss("It tips " + (net > 0 ? "right" : "left"), "Net torque is " + (net > 0 ? "+" : "") + net + ". Move a crate closer to or further from the pivot.");
    }
  }

  // ---- level 4: circuit -------------------------------------------------------------------
  function checkCircuit(nextVolts: number, nextRes: boolean[], nextWiring: "series" | "parallel") {
    const r = CIRCUIT_ROUNDS[round];
    const cc = circuitCalc(nextVolts, nextRes, nextWiring);
    if (cc.I > 1.2) { fail("Too much current -- the filament burned out. Add resistance."); return; }
    if (cc.I >= r.lo && cc.I <= r.hi) win("I = " + cc.I.toFixed(2) + " A through a " + cc.R + " Ω loop.");
    else setResult((prev) => (prev?.ok ? null : prev));
  }

  // ---- level 5: mirrors --------------------------------------------------------------------
  function flipMirror(c: number, r: number) {
    const cur = mirrors ?? MIRROR_ROUNDS[round].mirrors;
    const hit = cur.find((m) => m.c === c && m.r === r);
    if (!hit) return;
    const next = cur.map((m) => (m === hit ? { ...m, o: (m.o === "/" ? "\\" : "/") as MirrorOrient } : { ...m }));
    setMirrors(next);
    const b = beamPath(MIRROR_ROUNDS[round], next);
    if (b.ok) win("The beam turns a right angle at every 45° mirror.");
    else setResult((prev) => (prev?.ok ? null : prev));
  }

  function handleCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const cv = canvasRef.current; if (!cv) return;
    const b = cv.getBoundingClientRect();
    const x = ((e.clientX - b.left) * WIDTH) / b.width;
    const y = ((e.clientY - b.top) * HEIGHT) / b.height;
    if (lvl.key === "mirror") {
      const c = Math.floor((x - 50) / 60), r = Math.floor((y - 62) / 60);
      flipMirror(c, r);
    } else if (lvl.key === "lever") {
      const d = Math.round((x - 380) / 46);
      if (d !== 0 && Math.abs(d) <= 5 && y > 150) place(d);
    } else if (lvl.key === "proj") {
      const dx = x - 86, dy = 360 - y;
      if (dx > 4 && dy > -40) setAngle(Math.max(10, Math.min(85, Math.round((Math.atan2(dy, dx) * 180) / Math.PI))));
    }
  }

  // ---- draw + physics loop -----------------------------------------------------------------
  useEffect(() => {
    function ctxFor(): CanvasRenderingContext2D | null {
      const cv = canvasRef.current; if (!cv) return null;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = WIDTH * dpr, h = HEIGHT * dpr;
      if (cv.width !== w) { cv.width = w; cv.height = h; }
      const c = cv.getContext("2d"); if (!c) return null;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, WIDTH, HEIGHT);
      return c;
    }

    function drawProj(c: CanvasRenderingContext2D) {
      const s = liveRef.current;
      const r = PROJ_ROUNDS[s.round];
      sky(c, "#bfe6f5", "#fff8ec", phaseRef.current);
      scenery(c, 372); ground(c, 372, "#8bc34a"); flowers(c, 404);
      if (r.wall) {
        c.fillStyle = "#a1887f"; rr(c, r.wall.x, 372 - r.wall.h, 20, r.wall.h, 6); c.fill();
        c.fillStyle = "rgba(0,0,0,0.12)"; rr(c, r.wall.x, 372 - r.wall.h, 8, r.wall.h, 6); c.fill();
      }
      if (r.wind) {
        c.strokeStyle = "#6b5d4d"; c.lineWidth = 3; c.beginPath(); c.moveTo(730, 372); c.lineTo(730, 300); c.stroke();
        c.fillStyle = "#ef476f"; c.beginPath(); c.moveTo(730, 302);
        const sgn = Math.sign(r.wind) * 34;
        c.lineTo(730 + sgn, 312 + Math.sin(phaseRef.current * 4) * 3); c.lineTo(730, 326); c.closePath(); c.fill();
      }
      r.targets.forEach((tg, i) => {
        if (popRef.current.includes(i)) return;
        const bob = Math.sin(phaseRef.current * 1.6 + i) * 5;
        c.strokeStyle = "rgba(61,51,40,0.35)"; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(tg.x, tg.y + 20 + bob); c.lineTo(tg.x, 372); c.stroke();
        c.fillStyle = i % 2 ? "#ef476f" : "#ffb703";
        c.beginPath(); c.ellipse(tg.x, tg.y + bob, 18, 21, 0, 0, 7); c.fill();
        c.fillStyle = "rgba(255,255,255,0.55)"; c.beginPath(); c.ellipse(tg.x - 6, tg.y - 7 + bob, 5, 7, -0.4, 0, 7); c.fill();
      });
      if (!simRef.current) {
        const a = (s.angle * Math.PI) / 180, v = s.power * 6.4;
        let x = 86, y = 360, vx = Math.cos(a) * v, vy = -Math.sin(a) * v;
        c.fillStyle = "rgba(61,51,40,0.28)";
        for (let i = 0; i < 240; i++) {
          vy += G1 * 0.016; vx += r.wind * 0.016; x += vx * 0.016; y += vy * 0.016;
          if (y > 372 || x > 760) break;
          if (i % 8 === 0) { c.beginPath(); c.arc(x, y, 2.4, 0, 7); c.fill(); }
        }
      }
      const a = (s.angle * Math.PI) / 180;
      c.save(); c.translate(78, 366); c.rotate(-a);
      c.fillStyle = "#4f4436"; rr(c, -6, -11, 62, 22, 8); c.fill();
      c.fillStyle = "#6b5d4d"; rr(c, 40, -11, 14, 22, 5); c.fill();
      c.restore();
      c.fillStyle = "#3d3328"; c.beginPath(); c.arc(72, 372, 15, Math.PI, 0); c.fill();
      const sim = simRef.current;
      if (sim && sim.kind === "proj") {
        c.strokeStyle = "rgba(61,51,40,0.30)"; c.lineWidth = 2; c.beginPath();
        sim.trail.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
        c.fillStyle = "#3d3328"; c.beginPath(); c.arc(sim.x, sim.y, 8, 0, 7); c.fill();
      }
      if (flashRef.current > 0) { c.fillStyle = "rgba(255,255,255," + flashRef.current * 0.5 + ")"; c.fillRect(0, 0, WIDTH, HEIGHT); }
      label(c, s.angle + "°  ·  power " + s.power + "%", 18, 30);
    }

    function drawSpring(c: CanvasRenderingContext2D) {
      const s = liveRef.current;
      const b = SPRING_ROUNDS[s.round].basket;
      sky(c, "#bfe6f5", "#fff8ec", phaseRef.current);
      scenery(c, 372); ground(c, 372, "#8bc34a"); flowers(c, 404);
      c.fillStyle = "#c68642"; rr(c, b.x - 36, b.y, 72, 40, 8); c.fill();
      c.fillStyle = "rgba(255,255,255,0.35)"; rr(c, b.x - 30, b.y + 6, 60, 8, 4); c.fill();
      c.strokeStyle = "rgba(61,51,40,0.25)"; c.lineWidth = 2;
      c.beginPath(); c.moveTo(b.x, b.y + 40); c.lineTo(b.x, 372); c.stroke();
      const comp = s.pull * 0.9;
      const baseY = 372, coilTop = baseY - (120 - comp * 0.7);
      c.strokeStyle = "#8a7d6c"; c.lineWidth = 5; c.lineJoin = "round";
      c.beginPath();
      const turns = 7;
      for (let i = 0; i <= turns * 2; i++) {
        const tt = i / (turns * 2), y = baseY - (baseY - coilTop) * tt;
        c.lineTo(140 + (i % 2 ? 18 : -18), y);
      }
      c.stroke();
      c.fillStyle = "#6b5d4d"; rr(c, 112, coilTop - 12, 56, 12, 5); c.fill();
      const la = (s.launchAngle * Math.PI) / 180;
      c.strokeStyle = "rgba(61,51,40,0.35)"; c.lineWidth = 3; c.setLineDash([7, 7]);
      c.beginPath(); c.moveTo(170, 352); c.lineTo(170 + Math.cos(la) * 90, 352 - Math.sin(la) * 90); c.stroke();
      c.setLineDash([]);
      if (!simRef.current) {
        const x0 = s.pull / 100, v = Math.sqrt((s.k * x0 * x0) / s.mass);
        let x = 170, y = 352, vx = Math.cos(la) * v * PPM, vy = -Math.sin(la) * v * PPM;
        c.fillStyle = "rgba(59,130,246,0.35)";
        for (let i = 0; i < 340; i++) {
          vy += G2 * 0.016; x += vx * 0.016; y += vy * 0.016;
          if (y > 380 || x > 760) break;
          if (i % 9 === 0) { c.beginPath(); c.arc(x, y, 2.6, 0, 7); c.fill(); }
        }
        c.fillStyle = "#3b82f6"; c.beginPath(); c.arc(170, 352, 9 + s.mass * 2, 0, 7); c.fill();
      } else {
        const sim = simRef.current;
        if (sim.kind === "ball") {
          c.strokeStyle = "rgba(59,130,246,0.45)"; c.lineWidth = 2; c.beginPath();
          sim.trail.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
          c.fillStyle = "#3b82f6"; c.beginPath(); c.arc(sim.x, sim.y, 9 + s.mass * 2, 0, 7); c.fill();
          c.fillStyle = "rgba(255,255,255,0.5)"; c.beginPath(); c.arc(sim.x - 3, sim.y - 3, 3, 0, 7); c.fill();
        }
      }
      if (flashRef.current > 0) { c.fillStyle = "rgba(34,197,94," + flashRef.current * 0.35 + ")"; c.fillRect(0, 0, WIDTH, HEIGHT); }
      label(c, "k = " + s.k + " N/m  ·  x = " + (s.pull / 100).toFixed(2) + " m  ·  m = " + s.mass + " kg", 18, 30);
    }

    function drawLever(c: CanvasRenderingContext2D) {
      const s = liveRef.current;
      const r = LEVER_ROUNDS[s.round];
      sky(c, "#bfe6f5", "#fff8ec", phaseRef.current);
      scenery(c, 396); ground(c, 396, "#8bc34a");
      const px = 380, py = 250;
      c.textAlign = "center"; c.font = "600 11px Nunito, sans-serif"; c.fillStyle = "rgba(61,51,40,0.5)";
      for (let d = -5; d <= 5; d++) if (d) c.fillText(String(d), px + d * 46, py + 46);
      c.save(); c.translate(px, py); c.rotate(tiltRef.current);
      c.fillStyle = "#c68642"; rr(c, -256, -9, 512, 18, 6); c.fill();
      c.fillStyle = "rgba(61,51,40,0.18)";
      for (let d = -5; d <= 5; d++) if (d) c.fillRect(d * 46 - 1, -9, 2, 18);
      const all = [...r.fixed.map((f) => ({ ...f, fixed: true })), ...s.placed.map((p) => ({ m: p.m, d: p.d, fixed: false }))];
      all.forEach((o) => {
        const size = 22 + o.m * 5;
        c.fillStyle = o.fixed ? "#8a7d6c" : "#3b82f6";
        rr(c, o.d * 46 - size / 2, -9 - size, size, size, 5); c.fill();
        c.fillStyle = "#fff"; c.font = "700 12px Nunito, sans-serif"; c.textAlign = "center";
        c.fillText(String(o.m), o.d * 46, -9 - size / 2 + 4);
      });
      c.restore();
      c.fillStyle = "#4f4436"; c.beginPath(); c.moveTo(px, py + 6); c.lineTo(px - 34, py + 96); c.lineTo(px + 34, py + 96); c.closePath(); c.fill();
      const net = netTorque(r, s.placed);
      c.fillStyle = "rgba(61,51,40,0.10)"; rr(c, 280, 380, 200, 12, 6); c.fill();
      c.fillStyle = Math.abs(net) < 0.01 ? "#22c55e" : "#ef476f";
      const w = Math.max(4, Math.min(100, Math.abs(net) * 8));
      rr(c, net >= 0 ? 380 : 380 - w, 380, w, 12, 6); c.fill();
      c.fillStyle = "rgba(61,51,40,0.6)"; c.fillRect(379, 376, 2, 20);
      if (flashRef.current > 0) { c.fillStyle = "rgba(34,197,94," + flashRef.current * 0.3 + ")"; c.fillRect(0, 0, WIDTH, HEIGHT); }
      label(c, "net torque " + (net > 0 ? "+" : "") + net, 18, 30);
    }

    function zig(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, val: number) {
      c.strokeStyle = "#1d4ed8";
      c.beginPath(); c.moveTo(x0, y0);
      const seg = (x1 - x0) / 8;
      for (let i = 0; i < 8; i++) c.lineTo(x0 + seg * (i + 0.5), y0 + (i % 2 ? 13 : -13));
      c.lineTo(x1, y0); c.stroke();
      c.fillStyle = "#1d4ed8"; c.textAlign = "center"; c.font = "700 12px Nunito, sans-serif";
      c.fillText(val + " Ω", (x0 + x1) / 2, y0 - 22);
    }
    function drawCircuit(c: CanvasRenderingContext2D) {
      const s = liveRef.current;
      const r = CIRCUIT_ROUNDS[s.round];
      const cc = circuitCalc(s.volts, s.res, s.wiring);
      sky(c, "#bfe6f5", "#fff8ec", phaseRef.current);
      c.fillStyle = "rgba(255,255,255,0.72)"; rr(c, 26, 56, 708, 320, 18); c.fill();
      c.strokeStyle = "#3d3328"; c.lineWidth = 4; c.lineJoin = "round";
      const L = 90, R = 670, T = 120, B = 340;
      c.beginPath(); c.moveTo(L, B); c.lineTo(L, 260); c.stroke();
      c.beginPath(); c.moveTo(L, 200); c.lineTo(L, T); c.stroke();
      for (let i = 0; i < 2; i++) {
        const y = 214 + i * 22;
        c.lineWidth = 5; c.beginPath(); c.moveTo(L - 20, y); c.lineTo(L + 20, y); c.stroke();
        c.lineWidth = 3; c.beginPath(); c.moveTo(L - 11, y + 11); c.lineTo(L + 11, y + 11); c.stroke();
      }
      c.font = "700 13px Nunito, sans-serif"; c.fillStyle = "#3d3328"; c.textAlign = "right";
      c.fillText(s.volts + " V", L - 26, 234);
      c.lineWidth = 4;
      const vals = [10, 20, 30];
      const on = vals.map((v, i) => ({ v, i })).filter((o) => s.res[o.i]);
      if (!on.length) {
        c.strokeStyle = "#3d3328"; c.beginPath(); c.moveTo(L, T); c.lineTo(400, T); c.stroke();
        c.fillStyle = "rgba(61,51,40,0.45)"; c.textAlign = "center"; c.font = "600 12px Nunito, sans-serif";
        c.fillText("plain wire -- no extra resistance", 260, T - 22);
      } else if (s.wiring === "series" || on.length === 1) {
        const span = 300 / on.length;
        c.beginPath(); c.moveTo(L, T); c.lineTo(120, T); c.stroke();
        on.forEach((o, i) => zig(c, 120 + i * span, T, 120 + (i + 1) * span - 20, o.v));
        c.strokeStyle = "#3d3328"; c.beginPath(); c.moveTo(120 + on.length * span - 20, T); c.lineTo(400, T); c.stroke();
      } else {
        c.strokeStyle = "#3d3328";
        c.beginPath(); c.moveTo(L, T); c.lineTo(180, T); c.stroke();
        const gap = 44;
        on.forEach((o, i) => {
          const y = T + (i - (on.length - 1) / 2) * gap;
          c.strokeStyle = "#3d3328";
          c.beginPath(); c.moveTo(180, T); c.lineTo(180, y); c.lineTo(200, y); c.stroke();
          zig(c, 200, y, 320, o.v);
          c.strokeStyle = "#3d3328";
          c.beginPath(); c.moveTo(320, y); c.lineTo(340, y); c.lineTo(340, T); c.stroke();
        });
        c.beginPath(); c.moveTo(340, T); c.lineTo(400, T); c.stroke();
        c.fillStyle = "rgba(61,51,40,0.45)"; c.textAlign = "center"; c.font = "600 11px Nunito, sans-serif";
        c.fillText("parallel", 260, T + 88);
      }
      c.strokeStyle = "#3d3328"; c.beginPath(); c.moveTo(400, T); c.lineTo(R - 60, T); c.stroke();
      const bx = R - 20, by = T;
      const glow = Math.max(0, Math.min(1, cc.I / 0.8));
      if (glow > 0.02) {
        const g = c.createRadialGradient(bx, by, 4, bx, by, 90);
        g.addColorStop(0, "rgba(255,201,60," + 0.85 * glow + ")"); g.addColorStop(1, "rgba(255,201,60,0)");
        c.fillStyle = g; c.beginPath(); c.arc(bx, by, 90, 0, 7); c.fill();
      }
      c.beginPath(); c.moveTo(R - 60, T); c.lineTo(bx - 22, T); c.stroke();
      c.fillStyle = cc.I > 1.2 ? "#6b5d4d" : "rgba(255,201,60," + (0.25 + 0.75 * glow) + ")";
      c.beginPath(); c.arc(bx, by, 24, 0, 7); c.fill();
      c.strokeStyle = "#3d3328"; c.lineWidth = 3; c.beginPath(); c.arc(bx, by, 24, 0, 7); c.stroke();
      c.beginPath(); c.moveTo(bx - 9, by + 8); c.lineTo(bx - 3, by - 6); c.lineTo(bx + 3, by + 6); c.lineTo(bx + 9, by - 8); c.stroke();
      c.lineWidth = 4;
      c.beginPath(); c.moveTo(bx, by + 24); c.lineTo(bx, B); c.lineTo(L, B); c.stroke();
      c.fillStyle = "#3d3328"; c.font = "700 12px Nunito, sans-serif"; c.textAlign = "center";
      c.fillText("bulb 10 Ω", bx, by + 48);
      const speed = cc.I * 120;
      eposRef.current = (eposRef.current + speed * 0.016) % 1200;
      c.fillStyle = "#3b82f6";
      for (let i = 0; i < 14; i++) {
        const tt = ((eposRef.current + i * 86) % 1200) / 1200;
        let x: number, y: number;
        if (tt < 0.45) { x = L + (bx - L) * (tt / 0.45); y = T; }
        else if (tt < 0.55) { x = bx; y = T + (B - T) * ((tt - 0.45) / 0.1); }
        else if (tt < 0.95) { x = bx - (bx - L) * ((tt - 0.55) / 0.4); y = B; }
        else { x = L; y = B - (B - T) * ((tt - 0.95) / 0.05); }
        c.beginPath(); c.arc(x, y, 3.4, 0, 7); c.fill();
      }
      c.textAlign = "left"; c.font = "700 13px Nunito, sans-serif"; c.fillStyle = "#3d3328";
      c.fillText("target " + r.lo.toFixed(2) + "-" + r.hi.toFixed(2) + " A", 18, 410);
      const inBand = cc.I >= r.lo && cc.I <= r.hi;
      c.fillStyle = "rgba(61,51,40,0.10)"; rr(c, 200, 398, 400, 14, 7); c.fill();
      c.fillStyle = "rgba(34,197,94,0.35)"; rr(c, 200 + 400 * (r.lo / 1.3), 398, 400 * ((r.hi - r.lo) / 1.3), 14, 4); c.fill();
      c.fillStyle = inBand ? "#22c55e" : "#ef476f";
      c.beginPath(); c.arc(200 + Math.min(400, 400 * (cc.I / 1.3)), 405, 9, 0, 7); c.fill();
      label(c, "R = " + cc.R + " Ω   ·   I = " + cc.I.toFixed(2) + " A", 18, 30);
    }

    function drawMirror(c: CanvasRenderingContext2D) {
      const s = liveRef.current;
      const r = MIRROR_ROUNDS[s.round];
      const ms = s.mirrors ?? r.mirrors;
      const b = beamPath(r, ms);
      const X = 50, Y = 62, S = 60;
      const g = c.createLinearGradient(0, 0, 0, HEIGHT);
      g.addColorStop(0, "#20325c"); g.addColorStop(1, "#3d2b56");
      c.fillStyle = g; c.fillRect(0, 0, WIDTH, HEIGHT);
      c.fillStyle = "#ffe6a0";
      for (let i = 0; i < 26; i++) {
        const sx = (i * 137) % 750 + 5, sy = (i * 53) % 420 + 8;
        const tw = 0.5 + 0.5 * Math.sin(phaseRef.current * 2 + i);
        c.globalAlpha = 0.25 + 0.45 * tw;
        c.beginPath(); c.arc(sx, sy, 1.6, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
      c.fillStyle = "#ffdb70"; c.beginPath(); c.arc(700, 54, 22, 0, 7); c.fill();
      c.fillStyle = "#20325c"; c.beginPath(); c.arc(690, 48, 19, 0, 7); c.fill();
      c.strokeStyle = "rgba(255,255,255,0.10)"; c.lineWidth = 1;
      for (let i = 0; i <= 11; i++) { c.beginPath(); c.moveTo(X + i * S, Y); c.lineTo(X + i * S, Y + 6 * S); c.stroke(); }
      for (let j = 0; j <= 6; j++) { c.beginPath(); c.moveTo(X, Y + j * S); c.lineTo(X + 11 * S, Y + j * S); c.stroke(); }
      const cx = (col: number) => X + col * S + S / 2, cy = (row: number) => Y + row * S + S / 2;
      r.walls.forEach((w) => { c.fillStyle = "#3a4a68"; rr(c, X + w.c * S + 6, Y + w.r * S + 6, S - 12, S - 12, 8); c.fill(); });
      c.strokeStyle = "rgba(239,71,111,0.30)"; c.lineWidth = 14; c.lineCap = "round"; c.beginPath();
      b.pts.forEach((p, i) => (i ? c.lineTo(cx(p[0]), cy(p[1])) : c.moveTo(cx(p[0]), cy(p[1])))); c.stroke();
      c.strokeStyle = "#ff5c8a"; c.lineWidth = 4; c.beginPath();
      b.pts.forEach((p, i) => (i ? c.lineTo(cx(p[0]), cy(p[1])) : c.moveTo(cx(p[0]), cy(p[1])))); c.stroke();
      c.lineCap = "butt";
      ms.forEach((m) => {
        const x = cx(m.c), y = cy(m.r), d = 20;
        c.strokeStyle = "#bfe6f5"; c.lineWidth = 7; c.lineCap = "round";
        c.beginPath();
        if (m.o === "/") { c.moveTo(x - d, y + d); c.lineTo(x + d, y - d); } else { c.moveTo(x - d, y - d); c.lineTo(x + d, y + d); }
        c.stroke();
        c.strokeStyle = "rgba(255,255,255,0.22)"; c.lineWidth = 1.5;
        rr(c, x - 26, y - 26, 52, 52, 10); c.stroke();
        c.lineCap = "butt";
      });
      c.fillStyle = "#ffc93c"; rr(c, X + r.src.c * S + 10, Y + r.src.r * S + 16, 40, 28, 7); c.fill();
      c.fillStyle = "#1b2740"; c.font = "800 11px Nunito, sans-serif"; c.textAlign = "center"; c.fillText("LSR", cx(r.src.c), cy(r.src.r) + 4);
      const hot = b.ok;
      c.fillStyle = hot ? "#22c55e" : "#4a5d80";
      c.beginPath(); c.arc(cx(r.sensor.c), cy(r.sensor.r), 20, 0, 7); c.fill();
      c.fillStyle = hot ? "rgba(34,197,94,0.35)" : "rgba(255,255,255,0.10)";
      c.beginPath(); c.arc(cx(r.sensor.c), cy(r.sensor.r), 20 + (hot ? 12 + Math.sin(phaseRef.current * 5) * 4 : 8), 0, 7); c.fill();
      c.fillStyle = "#fff"; c.font = "800 11px Nunito, sans-serif"; c.fillText("●", cx(r.sensor.c), cy(r.sensor.r) + 4);
      c.textAlign = "left"; c.fillStyle = "rgba(255,255,255,0.7)"; c.font = "700 13px Nunito, sans-serif";
      c.fillText(hot ? "sensor lit" : b.bounces + " bounce" + (b.bounces === 1 ? "" : "s") + " -- beam lost", 18, 30);
    }

    function draw() {
      const c = ctxFor(); if (!c) return;
      const key = LEVELS[liveRef.current.li].key;
      if (key === "proj") drawProj(c);
      else if (key === "spring") drawSpring(c);
      else if (key === "lever") drawLever(c);
      else if (key === "circuit") drawCircuit(c);
      else drawMirror(c);
    }

    let mounted = true;
    function tick(now: number) {
      if (!mounted) return;
      const dt = lastRef.current ? Math.min(0.032, (now - lastRef.current) / 1000) : 0.016;
      lastRef.current = now;
      phaseRef.current += dt;
      flashRef.current = Math.max(0, flashRef.current - dt * 1.6);
      const sim = simRef.current;
      if (sim) {
        if (sim.kind === "proj") stepProj(dt);
        else stepBall(dt);
      }
      if (LEVELS[liveRef.current.li].key === "lever") {
        const target = Math.max(-0.3, Math.min(0.3, netTorque(LEVER_ROUNDS[liveRef.current.round], liveRef.current.placed) / 30));
        tiltVRef.current += (target - tiltRef.current) * 26 * dt; tiltVRef.current *= 0.9; tiltRef.current += tiltVRef.current * dt;
      }
      if (liveRef.current.view === "play") draw();
      rafRef.current = requestAnimationFrame(tick);
    }
    draw();
    rafRef.current = requestAnimationFrame(tick);
    return () => { mounted = false; cancelAnimationFrame(rafRef.current); };
    // stepProj/stepBall close over state setters that are stable across renders (React
    // guarantees this), so the loop is set up once and reads everything live via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- trail (level select) ----------------------------------------------------------------
  if (view === "trail") {
    const solvedTotal = LEVELS.filter((l) => solved[l.key].every((v) => v > 0)).length;
    return (
      <div className="mx-auto max-w-5xl px-6 pb-24">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className={`rounded-chunk-sm border-2 ${t.border} ${t.soft} px-3 py-1.5 font-display text-sm font-bold ${t.ink}`}>
            {solvedTotal} of {LEVELS.length} levels cleared
          </p>
          <p className="font-display text-sm font-bold text-quest-ink-soft">{physicsXp(solved)} XP</p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {LEVELS.map((l, i) => {
            const stars = solved[l.key].filter((v) => v > 0).length;
            const done = stars === 3;
            return (
              <button
                key={l.key}
                type="button"
                onClick={() => openLevel(i)}
                className={`flex flex-col gap-2 rounded-chunk-lg border-(length:--outline-chunk-thick) ${
                  done ? "border-quest-repeat-dark bg-quest-repeat/10" : "border-quest-locked bg-quest-paper"
                } p-4 text-left shadow-chunk transition-transform duration-100 hover:-translate-y-1 active:translate-y-[3px] active:shadow-chunk-sm`}
              >
                <div className="flex items-center justify-between">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-full border-b-[3px] font-display text-lg font-bold shadow-chunk-sm ${t.bg} ${t.border} ${t.text}`}>
                    {l.short}
                  </span>
                  <span className="font-display text-xs font-bold uppercase tracking-wide text-quest-ink-soft">Level {l.number}</span>
                </div>
                <span className="font-display text-xl font-bold text-quest-ink">{l.title}</span>
                <p className="text-sm text-quest-ink-soft">{l.topic}</p>
                <span className="mt-1 text-base tracking-widest text-quest-gold">
                  {"★".repeat(stars)}
                  <span className="text-quest-locked">{"★".repeat(3 - stars)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- play (one level, one round) ----------------------------------------------------------
  const cc = lvl.key === "circuit" ? circuitCalc(volts, res, wiring) : null;
  const beam = lvl.key === "mirror" ? beamPath(MIRROR_ROUNDS[round], mirrors ?? MIRROR_ROUNDS[round].mirrors) : null;
  const optClass = (active: boolean) =>
    `rounded-chunk-sm border-2 px-3 py-1.5 font-display text-sm font-bold shadow-chunk-sm transition-transform active:translate-y-[2px] ${
      active ? `${t.bg} ${t.border} ${t.text}` : "border-quest-locked bg-quest-paper text-quest-ink"
    }`;

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24">
      <button type="button" onClick={() => setView("trail")} className="mb-4 font-display text-sm font-bold text-quest-repeat-dark hover:underline">
        ← Back to Physics trail
      </button>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-chunk-lg border-(length:--outline-chunk) border-quest-locked bg-quest-paper shadow-chunk overflow-hidden">
          <div className="flex items-center gap-3 border-b border-quest-locked/60 px-4 py-3">
            <span className={`flex h-11 w-11 items-center justify-center rounded-full font-display text-base font-bold ${t.bg} ${t.text}`}>{lvl.short}</span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[10px] font-bold uppercase tracking-wide text-quest-repeat-dark">
                Level {lvl.number} · {lvl.topic}
              </p>
              <p className="truncate font-display text-lg font-bold text-quest-ink">{lvl.title}</p>
            </div>
            <div className="text-right">
              <p className="font-display text-[10px] font-bold uppercase tracking-wide text-quest-ink-soft">Round</p>
              <p className="font-display text-base font-bold text-quest-ink">{round + 1} / 3</p>
            </div>
          </div>

          <div className="p-3">
            <canvas
              ref={canvasRef}
              onPointerDown={handleCanvasPointerDown}
              className="block w-full rounded-chunk cursor-crosshair"
              style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
            />
          </div>

          <div className="space-y-3 px-4 pb-4">
            {lvl.key === "proj" && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <label className="text-sm">
                    <span className="flex justify-between font-display text-xs text-quest-ink-soft"><span>Angle θ</span><span>{angle}°</span></span>
                    <input type="range" min={10} max={85} value={angle} onChange={(e) => setAngle(Number(e.target.value))} className="w-full accent-quest-repeat" />
                  </label>
                  <label className="text-sm">
                    <span className="flex justify-between font-display text-xs text-quest-ink-soft"><span>Power</span><span>{power}%</span></span>
                    <input type="range" min={20} max={100} value={power} onChange={(e) => setPower(Number(e.target.value))} className="w-full accent-quest-repeat" />
                  </label>
                  <ChunkyButton tone="repeat" onClick={fire} disabled={!!simRef.current}>Fire!</ChunkyButton>
                </div>
                <p className="font-display text-xs text-quest-ink-soft">
                  shots left {Math.max(0, PROJ_ROUNDS[round].shots - shotsUsed)}
                  {PROJ_ROUNDS[round].wind !== 0 && (PROJ_ROUNDS[round].wind < 0 ? " · headwind" : " · tailwind")}
                </p>
              </>
            )}

            {lvl.key === "spring" && (
              <>
                <label className="block text-sm">
                  <span className="flex justify-between font-display text-xs text-quest-ink-soft"><span>Compression x</span><span>{(pull / 100).toFixed(2)} m</span></span>
                  <input type="range" min={20} max={100} value={pull} onChange={(e) => setPull(Number(e.target.value))} className="w-full accent-quest-repeat" />
                </label>
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <p className="mb-1 font-display text-xs text-quest-ink-soft">Spring stiffness k</p>
                    <div className="flex gap-2">
                      {[40, 90, 160].map((v) => (
                        <button key={v} type="button" className={optClass(k === v)} onClick={() => setK(v)}>{v} N/m</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 font-display text-xs text-quest-ink-soft">Launch angle</p>
                    <div className="flex gap-2">
                      {[30, 45, 60].map((a) => (
                        <button key={a} type="button" className={optClass(launchAngle === a)} onClick={() => setLaunchAngle(a)}>{a}°</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 font-display text-xs text-quest-ink-soft">Ball mass m</p>
                    <div className="flex gap-2">
                      {[0.5, 1, 2].map((m) => (
                        <button key={m} type="button" className={optClass(mass === m)} onClick={() => setMass(m)}>{m} kg</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <ChunkyButton tone="repeat" onClick={launch} disabled={!!simRef.current}>Release!</ChunkyButton>
                  <p className="font-display text-xs text-quest-ink-soft">
                    stored energy ½kx² = {(0.5 * k * (pull / 100) * (pull / 100)).toFixed(1)} J
                  </p>
                </div>
              </>
            )}

            {lvl.key === "lever" && (
              <>
                <div>
                  <p className="mb-1 font-display text-xs text-quest-ink-soft">Crates -- pick one, then tap a plank slot (or the plank itself)</p>
                  <div className="flex flex-wrap gap-2">
                    {LEVER_ROUNDS[round].crates.map((m, i) => {
                      const used = placed.some((p) => p.i === i);
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={used}
                          className={`${optClass(picked === i && !used)} disabled:opacity-45`}
                          onClick={() => setPicked(i)}
                        >
                          {m} kg{used ? " ✓" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="font-display text-xs text-quest-ink-soft">
                    net torque {(() => { const n = netTorque(LEVER_ROUNDS[round], placed); return (n > 0 ? "+" : "") + n; })()}
                  </p>
                  <ChunkyButton tone="neutral" size="md" onClick={resetRound}>Clear plank</ChunkyButton>
                </div>
              </>
            )}

            {lvl.key === "circuit" && cc && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <p className="mb-1 font-display text-xs text-quest-ink-soft">Battery</p>
                    <div className="flex flex-wrap gap-2">
                      {[3, 6, 9, 12].map((v) => (
                        <button key={v} type="button" className={optClass(volts === v)} onClick={() => { setVolts(v); checkCircuit(v, res, wiring); }}>{v} V</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 font-display text-xs text-quest-ink-soft">Resistors in the loop</p>
                    <div className="flex flex-wrap gap-2">
                      {[10, 20, 30].map((v, i) => (
                        <button
                          key={v}
                          type="button"
                          className={optClass(res[i])}
                          onClick={() => {
                            const next = [...res] as [boolean, boolean, boolean];
                            next[i] = !next[i];
                            setRes(next);
                            checkCircuit(volts, next, wiring);
                          }}
                        >
                          {v} Ω
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 font-display text-xs text-quest-ink-soft">Wiring</p>
                    <div className="flex gap-2">
                      {(["series", "parallel"] as const).map((w) => (
                        <button key={w} type="button" className={optClass(wiring === w)} onClick={() => { setWiring(w); checkCircuit(volts, res, w); }}>
                          {w === "series" ? "In a line" : "Side by side"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="font-display text-xs text-quest-ink-soft">
                  total R {cc.R} Ω · current I = V/R {cc.I.toFixed(2)} A
                </p>
              </>
            )}

            {lvl.key === "mirror" && beam && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-display text-xs text-quest-ink-soft">
                  {beam.ok ? "sensor lit" : beam.bounces + " bounce" + (beam.bounces === 1 ? "" : "s") + " -- beam lost"}
                </p>
                <p className="font-display text-xs text-quest-ink-soft">Click any mirror on the board to flip it between / and \</p>
                <ChunkyButton tone="neutral" onClick={resetRound}>Reset mirrors</ChunkyButton>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-chunk-lg border-(length:--outline-chunk) border-quest-locked bg-quest-paper p-4 shadow-chunk">
            <p className="font-display text-[10px] font-bold uppercase tracking-wide text-quest-repeat-dark">Your goal</p>
            <p className="mt-2 text-sm text-quest-ink">
              {lvl.key === "proj" && PROJ_ROUNDS[round].goal}
              {lvl.key === "spring" && SPRING_ROUNDS[round].goal}
              {lvl.key === "lever" && LEVER_ROUNDS[round].goal}
              {lvl.key === "circuit" && CIRCUIT_ROUNDS[round].goal}
              {lvl.key === "mirror" && MIRROR_ROUNDS[round].goal}
            </p>
            <div className="my-3 h-px bg-quest-locked/60" />
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  type="button"
                  className={optClass(i === round)}
                  onClick={() => gotoRound(i)}
                >
                  Round {i + 1}{solved[lvl.key][i] ? " ✓" : ""}
                </button>
              ))}
            </div>
            <p className="mt-2 text-base tracking-widest text-quest-gold">
              {"★".repeat(solved[lvl.key].filter((v) => v > 0).length)}
              <span className="text-quest-locked">{"★".repeat(3 - solved[lvl.key].filter((v) => v > 0).length)}</span>
            </p>
          </div>

          {result && (
            <div
              className={`rounded-chunk-lg border-2 p-4 ${
                result.ok ? "border-green-300 bg-green-50 text-green-800" : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              <p className="font-display text-lg font-bold">{result.title}</p>
              <p className="mt-1 text-sm">{result.msg}</p>
              {result.ok && (
                <ChunkyButton tone="repeat" className="mt-3" onClick={onNext}>
                  {result.next ?? "Next"}
                </ChunkyButton>
              )}
              {result.retry && (
                <ChunkyButton tone="neutral" className="mt-3" onClick={resetRound}>
                  Try the round again
                </ChunkyButton>
              )}
            </div>
          )}

          <div className={`rounded-chunk-lg border-2 ${t.border} ${t.soft} p-4`}>
            <p className={`font-display text-[10px] font-bold uppercase tracking-wide ${t.ink}`}>The physics</p>
            <p className={`mt-2 font-display text-xl font-bold ${t.ink}`}>{lvl.formula}</p>
            <p className="mt-2 text-sm text-quest-ink">{lvl.explain}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
