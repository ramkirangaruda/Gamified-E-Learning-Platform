import * as Blockly from "blockly/core";

// These 14 block definitions ARE the print cards (brief §6: "Each card is a printed
// screenshot of the corresponding Blockly block"). That constrains the design in one
// important way: no Blockly-native C-shaped/mutator nesting. A physical card can't
// contain other cards, so these blocks only stack (previousStatement/nextStatement),
// exactly like the physical vocabulary's explicit repeat/end-repeat, if/else/end-if,
// while/end-while pairs. The upside: the "blocks" source's AST compiler can reuse the
// exact same open/close stack-parse the "cards" source needs for the camera pipeline
// (brief §6's "Nesting is expressed by explicit open/close cards, not by physical
// indentation" applies here too), instead of writing two different compilers.
//
// Colour groups same-family open/close pairs so a repeat's end-card is visually
// distinct from a while's end-card, even before any validation runs — reduces the most
// common child mistake (brief §6) rather than just handling it after the fact.

export const CARD_STMT_CHECK = "QUEST_STMT";

// Plain union + const object, not `const enum` — this project's tsconfig sets
// erasableSyntaxOnly (type-stripping-only transpilation), which const enum violates.
export type CardCategory = "movement" | "repeat" | "conditional" | "while";

export const CardCategory = {
  Movement: "movement",
  Repeat: "repeat",
  Conditional: "conditional",
  While: "while",
} as const satisfies Record<string, CardCategory>;

const COLOUR: Record<CardCategory, string> = {
  [CardCategory.Movement]: "#3B82F6", // blue — move, turn, wait, pick up
  [CardCategory.Repeat]: "#F59E0B", // amber — repeat 2/3/4, end repeat
  [CardCategory.Conditional]: "#22C55E", // green — if wall ahead, else, end if
  [CardCategory.While]: "#A855F7", // purple — while not at goal, end while
};

export interface CardDef {
  id: number; // brief §6 table ID — also the ArUco marker index (DICT_4X4_50) at M5
  type: string; // Blockly block type
  label: string; // exact card text, brief §6
  category: CardCategory;
}

export const CARDS: CardDef[] = [
  { id: 0, type: "card_move_forward", label: "move forward", category: CardCategory.Movement },
  { id: 1, type: "card_turn_left", label: "turn left", category: CardCategory.Movement },
  { id: 2, type: "card_turn_right", label: "turn right", category: CardCategory.Movement },
  { id: 3, type: "card_pick_up", label: "pick up", category: CardCategory.Movement },
  { id: 4, type: "card_wait", label: "wait", category: CardCategory.Movement },
  { id: 5, type: "card_repeat_2", label: "repeat 2", category: CardCategory.Repeat },
  { id: 6, type: "card_repeat_3", label: "repeat 3", category: CardCategory.Repeat },
  { id: 7, type: "card_repeat_4", label: "repeat 4", category: CardCategory.Repeat },
  { id: 8, type: "card_end_repeat", label: "end repeat", category: CardCategory.Repeat },
  { id: 9, type: "card_if_wall_ahead", label: "if wall ahead", category: CardCategory.Conditional },
  { id: 10, type: "card_else", label: "else", category: CardCategory.Conditional },
  { id: 11, type: "card_end_if", label: "end if", category: CardCategory.Conditional },
  { id: 12, type: "card_while_not_goal", label: "while not at goal", category: CardCategory.While },
  { id: 13, type: "card_end_while", label: "end while", category: CardCategory.While },
];

let registered = false;

export function registerCardBlocks() {
  if (registered) return;
  registered = true;

  const jsonDefs = CARDS.map((card) => ({
    type: card.type,
    message0: card.label,
    previousStatement: CARD_STMT_CHECK,
    nextStatement: CARD_STMT_CHECK,
    colour: COLOUR[card.category],
    tooltip: card.label,
  }));

  Blockly.defineBlocksWithJsonArray(jsonDefs);
}
