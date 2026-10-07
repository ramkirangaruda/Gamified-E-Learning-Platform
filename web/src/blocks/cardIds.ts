// Named card ids for compileCardIds.ts, derived from cardBlocks.ts's CARDS table --
// the single source of truth for id<->card mapping (its own comment already notes
// `id` doubles as "the ArUco marker index"). Deliberately not a second hardcoded
// table: a future card reorder in CARDS is automatically reflected here instead of
// silently drifting out of sync, the same reasoning hub/card_table.py's docstring
// gives for why it's the one place these ids live on the Python side.
import { CARDS } from "./cardBlocks";

function idFor(type: string): number {
  const card = CARDS.find((c) => c.type === type);
  if (!card) throw new Error(`cardBlocks.ts: no card with type "${type}"`);
  return card.id;
}

export const MOVE_FORWARD = idFor("card_move_forward");
export const TURN_LEFT = idFor("card_turn_left");
export const TURN_RIGHT = idFor("card_turn_right");
export const PICK_UP = idFor("card_pick_up");
export const WAIT = idFor("card_wait");
export const REPEAT_2 = idFor("card_repeat_2");
export const REPEAT_3 = idFor("card_repeat_3");
export const REPEAT_4 = idFor("card_repeat_4");
export const END_REPEAT = idFor("card_end_repeat");
export const IF_WALL_AHEAD = idFor("card_if_wall_ahead");
export const ELSE = idFor("card_else");
export const END_IF = idFor("card_end_if");
export const WHILE_NOT_GOAL = idFor("card_while_not_goal");
export const END_WHILE = idFor("card_end_while");
