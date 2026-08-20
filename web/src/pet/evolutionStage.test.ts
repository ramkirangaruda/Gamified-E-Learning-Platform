import { describe, expect, it } from "vitest";

// Same file-read trick idleAnimation.test.ts uses -- see its comment for why (Vite's
// Tailwind plugin claims .css imports first, and the app's tsconfig deliberately omits
// node types). No dependency added.
const fs = (await import(/* @vite-ignore */ "node:" + "fs")) as {
  readFileSync(path: URL, encoding: "utf8"): string;
};
const css = fs.readFileSync(new URL("../index.css", import.meta.url), "utf8");

/** Every rule in the file, as [selector, body] pairs -- same shape as
 *  idleAnimation.test.ts's local helper, duplicated rather than shared across two files
 *  for one small parser. */
function rules(source: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  source = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const selector = m[1].trim().replace(/\s+/g, " ");
    if (selector.startsWith("@")) continue;
    out.push({ selector, body: m[2] });
  }
  return out;
}

/** True if any rule whose selector list includes a `[data-stage="N"]` clause for the
 *  given stage sets `part` visible (opacity: 1) -- i.e. this stage shows that part. */
function stageShows(all: Array<{ selector: string; body: string }>, stage: number, part: string): boolean {
  const stageClause = `[data-stage="${stage}"]`;
  return all.some(
    (r) =>
      r.selector.split(",").some((s) => s.includes(stageClause) && s.trim().endsWith(part)) &&
      /opacity:\s*1\b/.test(r.body),
  );
}

// handoff/05-pet-evolution-art.md's exact flagged bug: stage 2 and stage 3 used to
// render identically, because both only ever turned on the same two stand-in shapes
// (a dashed ring, a small crown) at the same time. This pins the fix: every adjacent
// pair of stages must show something the previous stage did not.
describe("pet evolution stage art", () => {
  const all = rules(css);

  it("stage 0 shows neither the hat, the badge, nor the aura", () => {
    expect(stageShows(all, 0, ".pet-hat")).toBe(false);
    expect(stageShows(all, 0, ".pet-hat-badge")).toBe(false);
    expect(stageShows(all, 0, ".pet-stage-aura")).toBe(false);
  });

  it("stage 1 shows the hat, but not the badge or the aura", () => {
    expect(stageShows(all, 1, ".pet-hat")).toBe(true);
    expect(stageShows(all, 1, ".pet-hat-badge")).toBe(false);
    expect(stageShows(all, 1, ".pet-stage-aura")).toBe(false);
  });

  it("stage 2 adds the badge on top of the hat, but not the aura -- and so differs from stage 1", () => {
    expect(stageShows(all, 2, ".pet-hat")).toBe(true);
    expect(stageShows(all, 2, ".pet-hat-badge")).toBe(true);
    expect(stageShows(all, 2, ".pet-stage-aura")).toBe(false);
  });

  it("stage 3 adds the aura on top of everything stage 2 has -- and so differs from stage 2", () => {
    expect(stageShows(all, 3, ".pet-hat")).toBe(true);
    expect(stageShows(all, 3, ".pet-hat-badge")).toBe(true);
    expect(stageShows(all, 3, ".pet-stage-aura")).toBe(true);
  });

  // A body recolor test used to live here (Pip's stage 1 recolored orange). Tom Lizard
  // is a raster sprite, not an SVG with fillable paths, so that specific mechanism
  // doesn't apply -- "stage 1 is visible without close inspection" is now covered by
  // the hat test above instead: a hat appearing on top of the character's head is its
  // own obvious-at-a-glance signal, which was the actual property this test cared
  // about, not recoloring specifically.
});
