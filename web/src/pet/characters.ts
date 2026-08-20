// The roster of selectable companions (settings screen: "choose your pet"). Every entry
// shares the exact same sprite grid (spriteLayout.ts) -- only the id (and therefore the
// asset folder under web/public/pets/<id>/) and the display copy differ. `species` on
// the saved pet state IS this id; PetProvider/Pet.tsx read it straight through with no
// translation table to keep in sync.
//
// All seven characters live under ONE folder, web/public/pets/, each in its own
// <id>/ directory holding spritesheet.webp plus the pet.json it was delivered with
// (frame/sheet dimensions and per-row animation semantics -- documentation for whoever
// adds character eight, not read at runtime; spriteLayout.ts is the runtime authority).
// The art used to be committed twice -- once as a delivery drop at the repo root with
// inconsistent nesting (carrot-bouncer/carrot-bouncer/ but tom-lizard/), once under
// web/public/ -- and the two copies were verified byte-identical before the root ones
// were deleted. Adding a character is now: drop <id>/ into web/public/pets/, add an
// entry below. Nothing else.
//
// One character dropped deliberately: a "xiaoxin-static" asset was supplied alongside
// this batch but turned out to be Crayon Shin-chan, a copyrighted commercial character --
// left untracked at the repo root, never copied into web/public, never listed here.
export interface CharacterDef {
  id: string;
  displayName: string;
  description: string;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: "tom-lizard",
    displayName: "Tom",
    description: "A cheerful green clay-toy lizard with big eyes and a curled tail.",
  },
  {
    id: "yi-bu",
    displayName: "YiBu",
    description: "A bear and a panda who stick together through everything.",
  },
  {
    id: "momo",
    displayName: "Momo",
    description: "A shy baby monkey who never lets go of a bright green fruit.",
  },
  {
    id: "pebble-otter",
    displayName: "Pebble",
    description: "An otter who floats on its back, playing with a favorite rock.",
  },
  {
    id: "rex",
    displayName: "Rex",
    description: "A clever mechanical wolf who rides a beat-up red motorcycle.",
  },
  {
    id: "carrot-bouncer",
    displayName: "Bobo",
    description: "A round, bouncy carrot with a leafy green top and a big smile.",
  },
  {
    id: "yeelight-knob-dance-disk",
    displayName: "Dial",
    description: "A round little robot who loves to spin, click, and dance.",
  },
];

export function characterById(id: string | undefined): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

export function spriteUrlFor(id: string | undefined): string {
  // Resolve through characterById rather than interpolating the raw id, so an id with no
  // folder under /pets falls back to the roster default instead of requesting a sprite
  // sheet that 404s and rendering an INVISIBLE pet -- the character silently disappears,
  // taking the hunger badge's anchor with it, and nothing in the UI says why.
  //
  // Not hypothetical: a drive saved before the sprite roster existed still holds
  // pet.species = "pip" (the original inline-SVG mascot, see DECISIONS.md), and every one
  // of those children would open the app to an empty pet bar. characterById has always
  // had this fallback; this function is simply catching up to it, which also means the
  // caption and the sprite can no longer disagree about which character is on screen.
  return `/pets/${characterById(id).id}/spritesheet.webp`;
}
