#!/usr/bin/env python3
"""Generates content/hints/*.json -- the verified hint bank for all 25 levels.

Every string here is human-written. The model NEVER writes a hint; it only rephrases one
of these in the pet's voice (brief §11 -- Tom Lizard as of the character swap, see
DECISIONS.md), and if lookup or generation fails the child sees the string verbatim. So
these are the actual words a child reads when they are stuck, and they are the last line
of defence in the tutor pipeline.

Rules every line follows:
  * Point at the CONCEPT, never hand over the answer. "Count how many steps in total"
    is a hint; "use repeat 4 twice" is the solution.
  * Never state the level's required step count. That is the thing being learned.
  * Second person, warm, short. Coral means "try again", never "you failed" (§10).
  * No programming vocabulary beyond the words printed on the physical cards.

Kept in one generator rather than 25 hand-edited JSON files so the tone stays consistent
and the per-level differences are visible side by side. Prep-time tool, no runtime
dependency. content/hints/README.md's coverage table and internal/hints' bank_test.go
must agree with what this emits -- bank_test.go fails loudly if they drift.
"""

import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "content", "hints")

# Which signatures internal/hints.Classify can actually produce per concept group.
# Anything not listed here falls back to GenericFallback, per §11's absolute rule.
GROUP_SIGNATURES = {
    "move": ["empty_program", "unbalanced_block", "infinite_loop", "wrong_order"],
    "repeat": ["empty_program", "unbalanced_block", "infinite_loop",
               "hardcoded_no_loop", "off_by_one_repeat", "overshot_goal"],
    "nested_repeat": ["empty_program", "unbalanced_block", "infinite_loop",
                      "hardcoded_no_loop", "off_by_one_repeat", "overshot_goal"],
    "if_wall_ahead": ["empty_program", "unbalanced_block", "infinite_loop",
                      "no_condition_used", "missing_turn"],
    "while": ["empty_program", "unbalanced_block", "infinite_loop", "hardcoded_no_loop"],
    "composition": ["empty_program", "unbalanced_block", "infinite_loop",
                    "hardcoded_no_loop", "never_picked_up"],
}

# ---------------------------------------------------------------------------
# unbalanced_block, written most carefully per the queue.
#
# This is the single most common mistake in the game, because the cards are a FLAT stack
# (no physical nesting -- see DECISIONS.md), so every opener needs a closer the child has
# to remember to place. Each variant names the specific closing card that level's cards
# actually need, because "close your block" is useless if you don't know which card that
# means.
# ---------------------------------------------------------------------------
UNBALANCED = {
    "none": ("Every block card you open needs its matching end card underneath it. "
             "Look down your stack for one that never got closed."),
    "repeat": ("Every 'repeat' card needs an 'end repeat' card below it, with the steps "
               "you want repeated in between. Find the repeat that's still waiting for its "
               "partner."),
    "if": ("Every 'if wall ahead' needs an 'end if' below it. If you used 'else' too, it "
           "goes between them: if, then what to do, else, then what to do, end if."),
    "while": ("Every 'while not at goal' needs an 'end while' below it, wrapping the steps "
              "you want to keep doing. Check yours has one."),
    "all": ("Each opener card -- repeat, if, while -- needs its own matching end card. "
            "Start at the top and check each one has a partner below it."),
}

INFINITE = {
    "plain": ("Your program went round and round and never stopped. A 'while not at goal' "
              "only ends when you actually reach the goal -- check yours can get there."),
    "wall": ("Your program looped forever. That usually means it got stuck against a wall: "
             "if you never turn, you'll push at the same wall for ever."),
}

# ---------------------------------------------------------------------------
# Per-level text. Keys are signatures; anything omitted falls back to the group default
# built below. Written level by level so the words match what that level actually looks
# like -- a hint about "the long road" is wrong on a level with three corners.
# ---------------------------------------------------------------------------
LEVELS = {
    # ---- 1-4 sequences ----
    "level-1": {"group": "move", "unbalanced": "none",
        "empty_program": "Your workspace is empty! Drag a 'move forward' card in to take your first step, then add more until you reach the flag.",
        "wrong_order": "You've got the right cards! Try reading your stack from the top -- does each card happen in the same order you'd actually walk it?"},
    "level-2": {"group": "move", "unbalanced": "none",
        "empty_program": "Nothing here yet! This road goes straight and then bends. Start with the straight part -- add 'move forward' cards first.",
        "wrong_order": "All the right cards, just not quite in order! Walk the road in your head, step by step -- when exactly does it bend?"},
    "level-3": {"group": "move", "unbalanced": "none",
        "empty_program": "Empty workspace! This path zigzags, so you'll need to swap between moving and turning. Start with one 'move forward'.",
        "wrong_order": "You've got every card this path needs! Check where each turn happens -- a zigzag changes direction at a very specific spot each time."},
    "level-4": {"group": "move", "unbalanced": "none",
        "empty_program": "Nothing to run yet! This is a long winding path -- take it one corner at a time. Add the steps for the first straight bit.",
        "wrong_order": "Right cards, wrong order! This path has several corners -- try tracing it one straight bit and one turn at a time, in the order you'd actually walk it."},

    # ---- 5-9 single repeat ----
    "level-5": {"group": "repeat", "unbalanced": "repeat",
        "empty_program": "Your workspace is empty! Every step here is the same one, so this is a perfect place for a 'repeat' card.",
        "hardcoded_no_loop": "That works, but there's a tidier way! When you do the same step over and over, one 'repeat' card can do it for you.",
        "off_by_one_repeat": "So close -- you're one step out. Count the squares between you and the flag, then check your repeat number matches.",
        "overshot_goal": "You went past the flag! Count the squares to the flag and compare that with how many times your repeat runs."},
    "level-6": {"group": "repeat", "unbalanced": "repeat",
        "empty_program": "Empty! This road is long and every step is the same -- 'repeat' cards will save you a lot of dragging.",
        "hardcoded_no_loop": "That's a lot of cards for one straight road! A 'repeat' card does the same step again and again for you.",
        "off_by_one_repeat": "Nearly! Add up all the steps your repeat cards make together, and compare that with the squares to the flag.",
        "overshot_goal": "You overshot the flag. Add up the total steps your repeats make -- it's more than the road is long."},
    "level-7": {"group": "repeat", "unbalanced": "repeat",
        "empty_program": "Nothing yet! This road goes straight, turns one corner, then goes straight again. Try repeating each straight part.",
        "hardcoded_no_loop": "Both straight stretches repeat the same step. A 'repeat' card for each one is much less dragging than every step by hand.",
        "off_by_one_repeat": "One step out! Count each straight stretch separately -- the bit before the corner and the bit after.",
        "overshot_goal": "You went too far. Check each straight stretch on its own: how many squares before the corner, and how many after?"},
    "level-8": {"group": "repeat", "unbalanced": "repeat",
        "empty_program": "Empty workspace! This is the longest straight road yet -- exactly what repeat cards are for.",
        "hardcoded_no_loop": "That's a card for every single square! One repeat card can stand in for a whole run of the same step.",
        "off_by_one_repeat": "Just one out! Add up what all your repeats do together and compare it with the length of the road.",
        "overshot_goal": "Too far! Your repeats add up to more steps than there are squares. Total them up and compare."},
    "level-9": {"group": "repeat", "unbalanced": "repeat",
        "empty_program": "Nothing here yet! Look at the path -- the same little pattern of moves and turns happens again and again.",
        "hardcoded_no_loop": "Look closely at the path: the same short pattern repeats. A repeat card can hold that whole pattern, not just one card.",
        "off_by_one_repeat": "Almost! Work out the pattern that repeats, then count how many times it happens along the path.",
        "overshot_goal": "You've gone past the flag -- your pattern repeats more times than the staircase has steps."},

    # ---- 10-13 nested repeat ----
    "level-10": {"group": "nested_repeat", "unbalanced": "repeat",
        "empty_program": "Empty! Here's the new idea: a repeat card can go *inside* another repeat card. Try it on this straight road.",
        "hardcoded_no_loop": "Every step here is the same. Start with one repeat -- then see if a second repeat around it saves even more cards.",
        "off_by_one_repeat": "One step out! When repeats sit inside each other, the steps multiply: the inside count times the outside count.",
        "overshot_goal": "Too far! Remember nested repeats multiply -- inside count times outside count. Work out what yours comes to."},
    "level-11": {"group": "nested_repeat", "unbalanced": "repeat",
        "empty_program": "Nothing yet! This road is long, but nested repeats mean you only need a few cards.",
        "hardcoded_no_loop": "This road is long enough that repeats really pay off -- and a repeat inside a repeat pays off even more.",
        "off_by_one_repeat": "So close! Multiply your inside repeat count by your outside one, and compare that with the road's length.",
        "overshot_goal": "Past the flag! Multiply the two repeat numbers together -- that total is bigger than the road."},
    "level-12": {"group": "nested_repeat", "unbalanced": "repeat",
        "empty_program": "Empty workspace! Find the small pattern that repeats along this staircase, then wrap a repeat around a repeat.",
        "hardcoded_no_loop": "That's a lot of cards! There's a short pattern here that repeats -- put it in a repeat, then repeat that.",
        "off_by_one_repeat": "One step out! Count how many times the little pattern happens, then split that between your two repeats.",
        "overshot_goal": "Too far -- your two repeat numbers multiply to more patterns than the staircase actually has."},
    "level-13": {"group": "nested_repeat", "unbalanced": "repeat",
        "empty_program": "Nothing here yet! This is the longest staircase yet, but the pattern is the same small one repeating.",
        "hardcoded_no_loop": "Placing every card by hand would take ages here. Find the repeating pattern and let nested repeats do the counting.",
        "off_by_one_repeat": "Just one pattern out! Your two repeat numbers multiply together -- check that total against the staircase.",
        "overshot_goal": "You've gone past the end. The two repeat numbers multiply, so a small change makes a big difference."},

    # ---- 14-18 conditionals ----
    "level-14": {"group": "if_wall_ahead", "unbalanced": "if", "infinite": "wall",
        "empty_program": "Empty! Here's the new idea: instead of remembering where the corner is, you can *ask* whether a wall is in front of you.",
        "no_condition_used": "This level is about asking a question first. Try an 'if wall ahead' card so your program can notice the corner by itself.",
        "missing_turn": "Good -- you're checking for the wall! But noticing it isn't enough: put a turn card inside the if, so you actually turn when the answer is yes."},
    "level-15": {"group": "if_wall_ahead", "unbalanced": "if", "infinite": "wall",
        "empty_program": "Nothing yet! Same idea as before -- check for a wall, then step -- just on a longer road.",
        "no_condition_used": "Rather than counting squares to the corner, let the program find it: 'if wall ahead' asks the question for you.",
        "missing_turn": "You're asking the right question! Now put a turn card inside the if so something happens when the answer is yes."},
    "level-16": {"group": "if_wall_ahead", "unbalanced": "if", "infinite": "wall",
        "empty_program": "Empty workspace! This road has two corners -- but you don't need two different plans, just one rule repeated.",
        "no_condition_used": "Two corners, one rule: 'if wall ahead, turn'. Add an if card and let it handle both of them.",
        "missing_turn": "You're checking for walls -- now add a turn card inside the if, or you'll just keep pressing against them."},
    "level-17": {"group": "if_wall_ahead", "unbalanced": "if", "infinite": "wall",
        "empty_program": "Nothing here! This one introduces 'else' -- what to do when the answer to your question is no.",
        "no_condition_used": "This level is about if and else together. Start with 'if wall ahead' and think about what should happen when there isn't one.",
        "missing_turn": "You're asking about the wall, but nothing turns. What should happen when the answer is yes? Put that inside the if."},
    "level-18": {"group": "if_wall_ahead", "unbalanced": "if", "infinite": "wall",
        "empty_program": "Empty! This is a big loop of a road, but it's still the same small rule: look, then step.",
        "no_condition_used": "Don't try to remember every corner on this one. One 'if wall ahead' rule handles all of them.",
        "missing_turn": "The check is there, but nothing happens when it's true. Add a turn card inside the if."},

    # ---- 19-22 while ----
    "level-19": {"group": "while", "unbalanced": "while",
        "empty_program": "Empty! New idea: 'while not at goal' keeps going until you arrive, so you don't have to count the squares at all.",
        "hardcoded_no_loop": "That works, but you had to count every square. 'While not at goal' keeps stepping until you get there -- no counting."},
    "level-20": {"group": "while", "unbalanced": "while",
        "empty_program": "Nothing yet! This road is longer than the last one -- but with 'while not at goal' the length doesn't matter.",
        "hardcoded_no_loop": "Notice the road got longer but the while program wouldn't change at all. That's the whole point of while."},
    "level-21": {"group": "while", "unbalanced": "while", "infinite": "wall",
        "empty_program": "Empty workspace! This road bends. Try a while loop, with a wall check inside it to handle the corner.",
        "hardcoded_no_loop": "You can let the program work this out instead of counting: keep going while you're not at the goal."},
    "level-22": {"group": "while", "unbalanced": "while", "infinite": "wall",
        "empty_program": "Nothing here yet! Long road, several corners -- and still just one small while loop with a wall check inside.",
        "hardcoded_no_loop": "That's a lot of counting for a road this long. A while loop keeps going until you arrive, however far that is."},

    # ---- 23-25 composition ----
    "level-23": {"group": "composition", "unbalanced": "while",
        "empty_program": "Empty! There's something to collect on this road. You'll need to travel *and* pick it up along the way.",
        "hardcoded_no_loop": "You can count every square, or you can let a while loop carry you to the goal. Try the loop.",
        "never_picked_up": "You walked right past it! The flag won't open until you've collected everything. Add a 'pick up' card so you gather things as you go."},
    "level-24": {"group": "composition", "unbalanced": "while",
        "empty_program": "Nothing yet! Two things to collect on this road, and the flag stays shut until you have both.",
        "hardcoded_no_loop": "A while loop will carry you all the way along without you counting a single square.",
        "never_picked_up": "You passed both of them by! Nothing was collected, so the flag stayed shut. A 'pick up' card inside your loop gathers as you travel."},
    "level-25": {"group": "composition", "unbalanced": "all",
        "empty_program": "The final road! Corners to turn, things to collect, and a flag at the end. Everything you've learned, all at once.",
        "hardcoded_no_loop": "This road has corners and collectibles. A while loop with a wall check inside handles the whole thing.",
        "never_picked_up": "You made the journey but came back empty-handed -- the flag won't open until everything is collected. Add a 'pick up' card to your loop."},
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for old in os.listdir(OUT):
        if old.endswith(".json"):
            os.remove(os.path.join(OUT, old))

    total = 0
    for lid, spec in LEVELS.items():
        group = spec["group"]
        bank = {}
        for sig in GROUP_SIGNATURES[group]:
            if sig in spec:
                bank[sig] = spec[sig]
            elif sig == "unbalanced_block":
                bank[sig] = UNBALANCED[spec.get("unbalanced", "none")]
            elif sig == "infinite_loop":
                bank[sig] = INFINITE[spec.get("infinite", "plain")]
            else:
                raise ValueError("%s: no text for signature %s" % (lid, sig))
        with open(os.path.join(OUT, lid + ".json"), "w", encoding="utf-8") as f:
            json.dump(bank, f, indent=2, ensure_ascii=False)
            f.write("\n")
        total += len(bank)

    print("wrote %d hints across %d levels" % (total, len(LEVELS)))


if __name__ == "__main__":
    main()
