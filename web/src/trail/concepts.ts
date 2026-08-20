import type { AnimalKind } from "../animals/AnimalMascot";
import type { ChunkyTone } from "../ui/Chunky";

// The six concept groups, in curriculum order. This is the ONE place the grouping lives:
// the trail clusters by it, the grid filters by it, and both read the same list so they
// can never disagree about which levels belong together.
//
// `teaches` values come straight from the level JSON (scripts/gen-levels.py), so a level
// declares its own group rather than being assigned one here by index -- reordering or
// inserting levels can't silently mis-group them.

export interface ConceptGroup {
  teaches: string;
  title: string;
  blurb: string;
  tone: ChunkyTone;
  /** Each group has a character, so a child can navigate by who rather than by topic --
   *  the same "browse by character" affordance the reference sites lean on. */
  animal: AnimalKind;
}

export const CONCEPT_GROUPS: ConceptGroup[] = [
  { teaches: "move", title: "Sequences", blurb: "One step after another", tone: "move", animal: "monkey" },
  { teaches: "repeat", title: "Repetition", blurb: "Do it again, and again", tone: "repeat", animal: "rabbit" },
  { teaches: "nested_repeat", title: "Loops in Loops", blurb: "A repeat inside a repeat", tone: "repeat", animal: "rabbit" },
  { teaches: "if_wall_ahead", title: "Choices", blurb: "Look, then decide", tone: "cond", animal: "owl" },
  { teaches: "while", title: "Until Done", blurb: "Keep going until you arrive", tone: "while", animal: "turtle" },
  { teaches: "composition", title: "All Together", blurb: "Everything you have learned", tone: "gold", animal: "owl" },
];

export function groupFor(teaches: string): ConceptGroup {
  return CONCEPT_GROUPS.find((g) => g.teaches === teaches) ?? CONCEPT_GROUPS[0];
}

/** Pet evolution stages, marked on the trail at the level where each was reached.
 *  Thresholds are counts of levels solved, so they can only ever move forwards (§10). */
export const EVOLUTION_MARKERS: { afterSolved: number; label: string }[] = [
  { afterSolved: 5, label: "Tom grew!" },
  { afterSolved: 13, label: "Tom grew again!" },
  { afterSolved: 22, label: "Tom is fully grown!" },
];
