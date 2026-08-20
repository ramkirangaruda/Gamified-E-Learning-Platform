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

  it("spriteUrlFor points at the per-character public asset path", () => {
    expect(spriteUrlFor("rex")).toBe("/rex/spritesheet.webp");
  });
});
