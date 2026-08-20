import { describe, expect, it } from "vitest";
import { CHARACTERS, characterById, spriteUrlFor } from "./characters";

describe("characters", () => {
  it("has a unique, non-empty id for every character", () => {
    const ids = CHARACTERS.map((c) => c.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.length).toBeGreaterThan(0);
  });

  it("never lists xiaoxin-static -- see DECISIONS.md, it's a copyrighted character", () => {
    expect(CHARACTERS.some((c) => c.id === "xiaoxin-static")).toBe(false);
  });

  it("includes Tom Lizard, the default companion", () => {
    expect(CHARACTERS.some((c) => c.id === "tom-lizard")).toBe(true);
  });

  it("characterById finds a real entry by id", () => {
    const rex = characterById("rex");
    expect(rex.id).toBe("rex");
    expect(rex.displayName).toBe("Rex");
  });

  it("characterById falls back to the first roster entry for an unknown or missing id", () => {
    expect(characterById("not-a-real-pet").id).toBe(CHARACTERS[0].id);
    expect(characterById(undefined).id).toBe(CHARACTERS[0].id);
  });

  it("spriteUrlFor points into the single shared pets/ folder", () => {
    expect(spriteUrlFor("rex")).toBe("/pets/rex/spritesheet.webp");
  });

  // The roster and the art on disk must agree. This is not hypothetical: the roster
  // carried an entry whose folder sat outside web/public/pets/ until every character was
  // consolidated there, and a mismatch is invisible in code review -- it shows up as a
  // child picking a pet and getting a blank box.
  //
  // import.meta.glob rather than node:fs deliberately: tsconfig.app.json scopes src/ to
  // ["vite/client"] types, and widening that to include "node" would let real browser
  // code reach for node APIs that don't exist in the bundle. Vite resolves this glob
  // against the real filesystem at transform time, so it is still a genuine on-disk
  // check, just one the app's own type boundary already allows.
  it("every rostered character has a spritesheet on disk under web/public/pets/", () => {
    const onDisk = new Set(
      Object.keys(import.meta.glob("../../public/pets/*/spritesheet.webp"))
        .map((path) => path.split("/").at(-2))
        .filter((id): id is string => Boolean(id)),
    );
    expect(onDisk.size, "no spritesheets found -- did web/public/pets/ move?").toBeGreaterThan(0);

    const missing = CHARACTERS.filter((c) => !onDisk.has(c.id)).map((c) => c.id);
    expect(missing, `rostered but no art under web/public/pets/: ${missing.join(", ")}`).toEqual([]);

    // And the reverse: art sitting in the folder that no roster entry points at is dead
    // weight shipped to every pendrive, so surface it here rather than letting it rot.
    const rostered = new Set(CHARACTERS.map((c) => c.id));
    const orphaned = [...onDisk].filter((id) => !rostered.has(id));
    expect(orphaned, `art under web/public/pets/ with no roster entry: ${orphaned.join(", ")}`).toEqual([]);
  });
});
