import { describe, expect, it } from "vitest";
import { ALL_MASCOT_STATES, type MascotState } from "../mascot/state";
import { CHARACTER_CLIPS, ROWS, STATE_CLIP, resolveClip, type RowName } from "./spriteLayout";

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
// matters is the one that erodes silently: someone adds a drifting cloud, a pulsing badge,
// a shimmering button, and the Pi pays for it forever while nobody notices. This file is
// that edge. It has already caught one real violation (BackgroundScene shipped with a sun
// pulse and three cloud drifts running behind every screen).
//
// WHERE THE TEETH MOVED, AND WHY. This used to work entirely by parsing index.css for
// `infinite` and checking the SELECTOR spelled out a mood the pet was allowed to loop in
// (`[data-mood="idle"]` and friends). That worked while every clip was its own hand-written
// keyframe block naming its own mood. It cannot work now: there is one generic keyframe and
// the repeat count arrives as a custom property, so the stylesheet no longer knows which
// states loop -- pet/spriteLayout.ts's table does. Reading CSS for the answer would have
// silently stopped checking the pet at all, which is the worst possible failure for a test
// whose entire job is to notice silence.
//
// So the pet half of the budget is asserted against the clip table directly, which is
// stricter than the old selector matching (it can see `sleepy`, per-character overrides,
// and unbounded transients, none of which a CSS selector ever revealed), and the CSS half
// still guards the world-ambient loops that really are declared in the stylesheet.

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

// .quest-cloud and .quest-node-pointed have no state attribute to match on -- both are
// gated by React conditionally applying the class, not by CSS -- so every ambient loop is
// named explicitly here rather than matched by a pattern. Anything added later must be
// added by hand, which is the point: it forces the budget conversation to happen here.
const AMBIENT_LOOPS = new Set([
  ".quest-cloud",
  ".quest-node-pointed",
  ".quest-sun-rays",
  ".quest-kite-inner",
  ".quest-pinwheel-blades",
  ".quest-balloon-inner",
]);

describe("the idle animation budget: the world", () => {
  const infiniteRules = rules(css)
    .filter((r) => !isKeyframeStep(r.selector))
    .filter((r) => INFINITE.test(r.body));

  it("loops nothing in CSS beyond the named world-ambient set", () => {
    const offenders = infiniteRules.filter((r) => !AMBIENT_LOOPS.has(r.selector));
    expect(offenders.map((r) => r.selector)).toEqual([]);
  });

  it("keeps the looping set small enough to stay free on a Pi", () => {
    // Six, pinned exactly: cloud drift and the trail's pointing pulse, plus the playground
    // redesign's sun-ray turn, kite sway, pinwheel spin and balloon bob. The pet's own
    // loops are budgeted separately below, against the clip table. If this number grows,
    // the conversation happens here rather than after someone notices the fan spinning.
    expect(infiniteRules.length).toBeLessThanOrEqual(6);
  });

  it("steps every looping animation instead of easing it", () => {
    // The measured lever, and the one that mattered most. A browser repaints when the
    // computed value CHANGES, so an eased loop costs 60 repaints a second while a stepped
    // one costs as many as it has steps. Eased breathing measured +14 points of one CPU
    // core; the same breath stepped measured +0.0.
    expect(infiniteRules.length).toBeGreaterThan(0);
    for (const r of infiniteRules) {
      expect(r.body, `${r.selector} loops forever and must use steps(), not an easing curve`).toMatch(/steps\(/);
    }
  });
});

describe("the idle animation budget: the pet", () => {
  /** Which states may cycle without end. Every other state must be bounded, so its motion
   *  stops on its own without anything having to cancel it.
   *
   *  All three describe a world that is still changing with a child in front of it:
   *  `thinking` is on screen exactly while a program or hint is in flight, `hungry` is
   *  something the child is meant to notice and act on, and `idle` is the pet's own
   *  budgeted breathing. Crucially, none of them can outlive the child leaving the room --
   *  mascot/state.ts resolves `sleepy` ahead of all of them after 45 seconds. */
  const MAY_CYCLE_FOREVER: MascotState[] = ["idle", "thinking", "hungry"];

  it("goes completely still once nobody is there", () => {
    // The measured cost is dominated by whether ANYTHING is animating, not by what. An
    // unattended hub -- a classroom at lunch, a judge's table before the demo -- must
    // therefore animate nothing at all, and `sleepy` is exactly the state reached after
    // 45s without a pointer or key event. There is a perfectly good sleep row in every
    // character's sheet and it is deliberately not used: this is the one state whose whole
    // value is costing nothing.
    expect(STATE_CLIP.sleepy).toBeNull();
    expect(resolveClip("sleepy")).toBeNull();
    for (const [species, overrides] of Object.entries(CHARACTER_CLIPS)) {
      expect(resolveClip("sleepy", species), `${species} must not animate while asleep`).toBeNull();
      expect(overrides.sleepy ?? null).toBeNull();
    }
  });

  it("cycles forever only in the states that mean someone is there", () => {
    const forever = ALL_MASCOT_STATES.filter((s) => resolveClip(s)?.plays === undefined && STATE_CLIP[s] !== null);
    expect(forever.sort()).toEqual([...MAY_CYCLE_FOREVER].sort());
  });

  it("never lets a per-character override smuggle in an unbounded clip", () => {
    // The override table is the easy place to lose this: it is edited per character, far
    // from the budget, and a stray `sustained: true` there would loop forever for exactly
    // one child's chosen pet -- the hardest possible version of this bug to notice.
    for (const [species, overrides] of Object.entries(CHARACTER_CLIPS)) {
      for (const state of Object.keys(overrides) as MascotState[]) {
        const clip = resolveClip(state, species);
        if (clip && clip.plays === undefined) {
          expect(MAY_CYCLE_FOREVER, `${species} cycles forever in "${state}"`).toContain(state);
        }
      }
    }
  });

  it("gives every state that can be pushed as a reaction a real duration", () => {
    // react("pointing") was a silent no-op once already, because `pointing` reads like a
    // sustained state and got left out of the duration table -- makeTransient returned
    // null and nothing happened. Anything bounded must have a positive duration, or it is
    // dead on arrival in exactly that invisible way.
    for (const state of ALL_MASCOT_STATES) {
      const clip = resolveClip(state);
      if (!clip || clip.plays === undefined) continue;
      expect(clip.durationMs, `"${state}" must last a measurable amount of time`).toBeGreaterThan(0);
    }
  });

  it("never freezes on a column that has no art in it", () => {
    // The subtlest failure mode in the whole mechanism, and one this rework shipped for a
    // few minutes before it was caught by reading the rendered output rather than the code.
    //
    // A one-shot row travels `frames - 1` columns and ends ON its last drawing, so freezing
    // there is exactly right. A cycling row travels all `frames` columns and ends one
    // column PAST its last drawing -- a position a loop only occupies for the instant it
    // wraps. Freeze that and the sprite window shows an empty cell.
    //
    // `pointing` made it visible: a bounded clip on the cycling walk row, and a SUSTAINED
    // state, so it held its end value for the full thirty-three seconds before `sleepy`.
    // The pet simply disappeared after nudging you toward the next level.
    const species = [undefined, ...Object.keys(CHARACTER_CLIPS)];
    for (const sp of species) {
      for (const state of ALL_MASCOT_STATES) {
        const clip = resolveClip(state, sp);
        const decl = (sp && CHARACTER_CLIPS[sp][state]) || STATE_CLIP[state];
        if (!clip || !decl) continue;
        const row = ROWS[decl.row];
        const endsOnRealFrame = clip.steps === row.frames - 1;
        expect(
          clip.holdsLastFrame,
          `"${state}"${sp ? ` (${sp})` : ""} walks ${clip.steps} of ${row.frames} columns; ` +
            `holding is ${endsOnRealFrame ? "required" : "an empty cell"}`,
        ).toBe(endsOnRealFrame);
      }
    }
  });

  it("only asks for step counts the stylesheet actually provides", () => {
    // The seam between the table and the CSS. Step counts come from the table but the
    // timing function is a static `.pet-steps-N` class, so a row with a frame count
    // outside that set would render with NO timing function -- a smooth slide across the
    // whole sheet instead of a frame animation. Nothing else would fail.
    const provided = new Set(
      [...css.matchAll(/\.pet-steps-(\d+)\s*\{[^}]*steps\((\d+)\)/g)].map((m) => {
        expect(m[1], "a .pet-steps-N class must use steps(N)").toBe(m[2]);
        return Number(m[1]);
      }),
    );
    expect(provided.size, "index.css must define .pet-steps-N classes").toBeGreaterThan(0);

    const species = [undefined, ...Object.keys(CHARACTER_CLIPS)];
    for (const s of species) {
      for (const state of ALL_MASCOT_STATES) {
        const clip = resolveClip(state, s);
        if (!clip) continue;
        expect(provided, `"${state}"${s ? ` (${s})` : ""} needs .pet-steps-${clip.steps}`).toContain(clip.steps);
      }
    }
  });

  it("animates only compositor-friendly properties in the clip it loops", () => {
    // transform and opacity are the only two a browser can animate without laying out or
    // painting. The pet now has exactly ONE keyframe block for every state, so this is a
    // single check rather than one per animation -- but it is also the only one left
    // guarding the pet's own motion, so it matters more than it used to.
    const keyframeBlocks = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)];
    const looping = ["pet-frames", "quest-cloud-drift", "quest-node-pulse", "quest-sun-rays-spin", "quest-kite-sway", "quest-pinwheel-spin", "quest-balloon-bob"];
    for (const name of looping) {
      const block = keyframeBlocks.find((k) => k[1] === name);
      expect(block, `missing @keyframes ${name}`).toBeTruthy();
      const props = [...block![2].matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      const disallowed = props.filter((p) => p !== "transform" && p !== "opacity");
      expect(disallowed, `${name} animates ${disallowed.join(", ")}`).toEqual([]);
    }
  });

  it("defines the hold opt-in the clip table depends on", () => {
    expect(css, "index.css must define .pet-hold").toMatch(/\.pet-hold\s*\{[^}]*animation-fill-mode:\s*forwards/);
    // ...and must NOT apply it unconditionally, which is what made the pet vanish.
    const base = /\.pet-frames\s*\{([^}]*)\}/g;
    for (const m of css.matchAll(base)) {
      expect(m[1], ".pet-frames must not set animation-fill-mode itself").not.toMatch(/animation-fill-mode/);
    }
  });

  it("keeps the frame stepping on the HTML wrapper, never an SVG group", () => {
    // The expensive mistake, pinned so it cannot come back: a transform animation on an
    // SVG child repaints its subtree every frame, because SVG content gets no compositor
    // layer. Measured at +41 points of one CPU core when the old mascot's breathing lived
    // on a <g>; ~1 point on the wrapping div.
    const petRules = rules(css).filter((r) => /animation-name:\s*pet-frames/.test(r.body));
    expect(petRules.length, "the pet's clip must be applied somewhere").toBeGreaterThan(0);
    for (const r of petRules) {
      expect(r.selector, "the pet's clip must sit on .pet-frames, the HTML wrapper").toContain(".pet-frames");
    }
  });
});

describe("the clip table", () => {
  it("covers every mascot state", () => {
    // `null` is a legal value (sleepy), so the Record type alone does not prove a state
    // was actually considered -- a missing key and a deliberate null look the same to
    // anyone reading, but only one of them is a decision.
    for (const state of ALL_MASCOT_STATES) {
      expect(Object.prototype.hasOwnProperty.call(STATE_CLIP, state), `no clip decision for "${state}"`).toBe(true);
    }
  });

  it("names only rows that exist in the sheet", () => {
    const rowNames = new Set(Object.keys(ROWS));
    const check = (clip: { row: RowName } | null, where: string) => {
      if (clip) expect(rowNames, `${where} names row "${clip.row}"`).toContain(clip.row);
    };
    for (const state of ALL_MASCOT_STATES) check(STATE_CLIP[state], `STATE_CLIP.${state}`);
    for (const [species, overrides] of Object.entries(CHARACTER_CLIPS)) {
      for (const [state, clip] of Object.entries(overrides)) check(clip ?? null, `${species}.${state}`);
    }
  });

  it("gives the fourteen states more than a handful of distinct reads", () => {
    // The regression this whole rework exists to prevent. Eight of the fourteen states
    // used to render the identical `waving` clip, so a milestone and a block drag looked
    // the same. Nine rows cannot give fourteen states nine rows' worth of variety, but a
    // state's row PLUS its playback must be distinctive: no two states may resolve to the
    // exact same animation.
    const signatures = ALL_MASCOT_STATES.map((s) => {
      const c = resolveClip(s);
      return c ? `${c.rowIndex}:${c.steps}:${c.durationMs}:${c.plays ?? "loop"}:${c.fx}` : "still";
    });
    expect(new Set(signatures).size).toBe(ALL_MASCOT_STATES.length);
  });
});
