import { describe, expect, it } from "vitest";

// Reading the stylesheet needs a file read, and the two obvious routes are both closed:
// Vite's `?raw` import returns an empty string here because the Tailwind plugin claims
// every .css file first, and the app's tsconfig deliberately sets types: ["vite/client"],
// so node's own types are not in scope. Adding "node" to the app's types field to satisfy
// one test would widen the type surface of the whole application, which is the wrong
// trade; building the specifier instead keeps the resolution at runtime, where vitest is
// already running on node. No dependency is added.
const fs = (await import(/* @vite-ignore */ "node:" + "fs")) as {
  readFileSync(path: URL, encoding: "utf8"): string;
};
const css = fs.readFileSync(new URL("../index.css", import.meta.url), "utf8");

// The pet's idle life is a deliberate, budgeted exception to "nothing animates while
// idle". An exception is only a budget if something enforces its edges, and the edge that
// matters is the one that erodes silently: someone adds a drifting cloud, a pulsing
// badge, a shimmering button, and the Pi pays for it forever while nobody notices.
//
// This test is that edge. It reads the stylesheet and asserts that every infinitely
// repeating animation belongs to a small, named allowlist -- the pet, the Rive mascot
// shell, and the two deliberately-reinstated world-ambient selectors (cloud drift, the
// trail's "pointing" pulse) -- and only in the moods/states where the thing is genuinely
// idle. It has already caught one real violation: BackgroundScene shipped with a sun
// pulse and three cloud drifts running behind every screen; that cloud drift is now back,
// on purpose, budgeted and counted here rather than sitting outside anyone's ledger.

/** Every rule in the file, as [selector, body] pairs, ignoring @-rule headers. */
function rules(source: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  // Comments first, or a rule's selector arrives with the paragraph above it attached.
  source = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const selector = m[1].trim().replace(/\s+/g, " ");
    if (selector.startsWith("@")) continue; // @media / @keyframes headers
    out.push({ selector, body: m[2] });
  }
  return out;
}

/** Keyframe percentage steps ("0%, 100% { ... }") are rules too -- skip them. */
function isKeyframeStep(selector: string): boolean {
  return /^(\d+%|from|to)(\s*,\s*(\d+%|from|to))*$/.test(selector);
}

const INFINITE = /animation(-iteration-count)?\s*:[^;]*\binfinite\b/;

describe("the idle animation budget", () => {
  const infiniteRules = rules(css)
    .filter((r) => !isKeyframeStep(r.selector))
    .filter((r) => INFINITE.test(r.body));

  it("only ever loops an animation on the pet, the mascot shell, or a named world exception", () => {
    // .quest-cloud and .quest-node-pointed have no mood/state attribute to match on --
    // both are gated by React conditionally applying the class, not by CSS -- so they're
    // named explicitly here rather than matched by a general pattern. Any THIRD ambient
    // selector added later must be added to this list by hand, which is the point: it
    // forces the budget conversation to happen here, not silently.
    const onBudget = /^\.(quest-pet(-shell)?|mascot-shell)[[.\s]/;
    const namedExceptions = new Set([
      ".quest-cloud",
      ".quest-node-pointed",
      ".quest-sun-rays",
      ".quest-kite-inner",
      ".quest-pinwheel-blades",
      ".quest-balloon-inner",
    ]);
    const offenders = infiniteRules.filter((r) => !onBudget.test(r.selector) && !namedExceptions.has(r.selector));
    expect(offenders.map((r) => r.selector)).toEqual([]);
  });

  it("only loops while genuinely idle/thinking, or is one of the two named world exceptions", () => {
    // thinking is not idle: it is on screen exactly while a program or hint is in
    // flight, which is the one moment a child needs to see that something is happening.
    const allowed = /\[data-(pet-)?mood="(idle|sleepy|thinking)"\]|\[data-mascot-state="(idle|sleepy|thinking)"\]/;
    const namedExceptions = new Set([
      ".quest-cloud",
      ".quest-node-pointed",
      ".quest-sun-rays",
      ".quest-kite-inner",
      ".quest-pinwheel-blades",
      ".quest-balloon-inner",
    ]);
    const offenders = infiniteRules.filter((r) => !allowed.test(r.selector) && !namedExceptions.has(r.selector));
    expect(offenders.map((r) => r.selector)).toEqual([]);
  });

  it("the idle loop sits on the HTML wrapper, never an SVG group", () => {
    // The expensive mistake, pinned so it cannot come back: a transform animation on an
    // SVG child repaints its subtree every frame, because SVG content gets no compositor
    // layer. Measured at +41 points of one CPU core when Pip's old breathing lived on a
    // <g>; ~1 point on the wrapping div. Same motion, two orders of magnitude apart.
    // Every roster character's idle frame-stepping is a `transform` on a plain <div>
    // (.pet-anim-idle -- one shared class, not per-character) rather than the old
    // `quest-pet-breathe`, but the property this test actually cares about -- does it
    // live where the browser can composite it, not repaint it -- is unchanged by the
    // character swap, and is the same for all seven.
    const idleLoop = infiniteRules.filter((r) => /pet-anim-idle/.test(r.selector));
    expect(idleLoop.length).toBeGreaterThan(0);
    for (const r of idleLoop) {
      expect(r.selector, "the idle loop must sit on .quest-pet-shell, the HTML wrapper").toContain(
        ".quest-pet-shell",
      );
    }
  });

  it("the mascot also breathes on its HTML wrapper, never inside the canvas", () => {
    // The canvas itself can't be selectively animated (see MascotCanvas.tsx) so this is
    // structurally guaranteed rather than a real risk, but pinned anyway for symmetry
    // with the pet's own rule above.
    const breathing = infiniteRules.filter((r) => /mascot-breathe/.test(r.body));
    expect(breathing.length).toBeGreaterThan(0);
    for (const r of breathing) {
      expect(r.selector, "the mascot's breathe must sit on .mascot-shell").toContain(".mascot-shell");
    }
  });

  it("steps every looping animation instead of easing it", () => {
    // The measured lever, and the one that mattered most. A browser repaints when the
    // computed value CHANGES, so an eased loop costs 60 repaints a second while a stepped
    // one costs as many as it has steps. Eased breathing measured +14 points of one CPU
    // core; the same breath stepped measured +0.0. Any new looping animation here must be
    // stepped, or it silently reintroduces that cost. A sprite-frame animation is stepped
    // by nature -- there is nothing to ease between two different frames of art -- so this
    // is not a budget concession for the sprite characters the way it was for the old
    // mascot's breathing, just the same rule holding for a different reason.
    expect(infiniteRules.length).toBeGreaterThan(0);
    for (const r of infiniteRules) {
      expect(r.body, `${r.selector} loops forever and must use steps(), not an easing curve`).toMatch(/steps\(/);
    }
  });

  it("keeps the looping set small enough to stay free on a Pi", () => {
    // Ten, pinned exactly: Tom's idle/"waiting" sprite cycles (2), the mascot's
    // breathe/tilt (2, currently parked -- see PetBar.tsx -- but still budgeted since the
    // CSS ships either way), cloud drift and the trail's pointing pulse (2), and the
    // playground redesign's sun-ray turn, kite sway, pinwheel spin, and balloon bob (4).
    // If this number grows, the budget conversation happens here rather than after
    // someone notices the fan spinning.
    expect(infiniteRules.length).toBeLessThanOrEqual(10);
  });

  it("goes completely still once nobody is there", () => {
    // The measured cost is dominated by whether ANYTHING is animating, not by what. An
    // unattended hub -- a classroom at lunch, a judge's table before the demo -- must
    // therefore animate nothing at all, and `sleepy` is exactly the state reached after
    // 45s without a pointer or key event.
    const whileAsleep = infiniteRules.filter((r) => /"sleepy"/.test(r.selector));
    expect(whileAsleep.map((r) => r.selector)).toEqual([]);
  });

  it("animates only compositor-friendly properties in its looping keyframes", () => {
    // transform and opacity are the only two a browser can animate without laying out
    // or painting. Anything else here would mean real CPU work every frame, forever.
    const keyframeBlocks = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)];
    const idleLoops = [
      "pet-anim-idle",
      "pet-anim-waiting",
      "mascot-breathe",
      "mascot-tilt",
      "quest-cloud-drift",
      "quest-node-pulse",
      "quest-sun-rays-spin",
      "quest-kite-sway",
      "quest-pinwheel-spin",
      "quest-balloon-bob",
    ];
    for (const name of idleLoops) {
      const block = keyframeBlocks.find((k) => k[1] === name);
      expect(block, `missing @keyframes ${name}`).toBeTruthy();
      const props = [...block![2].matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      const disallowed = props.filter((p) => p !== "transform" && p !== "opacity");
      expect(disallowed, `${name} animates ${disallowed.join(", ")}`).toEqual([]);
    }
  });
});
