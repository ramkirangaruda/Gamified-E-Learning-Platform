// The roster of selectable companions (settings screen: "choose your pet"). Every entry
// shares the exact same sprite grid (spriteLayout.ts) -- only the id (and therefore the
// spritesheet.webp under web/public/<id>/) and the display copy differ. `species` on the
// saved pet state IS this id; PetProvider/Pet.tsx read it straight through with no
// translation table to keep in sync.
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

export function spriteUrlFor(id: string): string {
  return `/${id}/spritesheet.webp`;
}
