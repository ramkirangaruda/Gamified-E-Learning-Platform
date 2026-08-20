#!/usr/bin/env python3
"""Generates content/levels/*.json for the 25-level curriculum.

Levels are authored here as ASCII maps rather than hand-written wall matrices, because a
4x4 array of booleans is unreviewable and a picture is not. Legend:

    #  wall
    .  open floor
    S  start (open)
    G  goal  (open)
    *  collectible (open)

Everything else in a level (par, difficulty, concept, start direction) sits next to its
map so a level is one readable block.

This is a PREP-TIME tool, not a runtime dependency -- same category as compose-card.py.
Re-run it after editing a map, then let internal/levels' TestLevelsAreSolvable prove every
level is still solvable against the real Go executor. A level that this script emits but
that test cannot solve does not ship.

Hard constraints this file must respect (from the build queue):
  * Only the 14 printed cards. Loop counts are 2, 3 and 4 -- those are the only repeat
    cards that physically exist, so every iteration count below factors into 2/3/4.
  * AST max nesting depth 4 (packages/ast: program array is depth 1).
  * 500-tick executor budget.
  * On repeat levels the naive unlooped solution must exceed par, so the under-par bonus
    actually rewards the intended learning.
"""

import json
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "content", "levels")

# (id, name, difficulty, concept, start_dir, par, map)
LEVELS = [
    # ---- 1-4  Sequences: move and turn only. Order matters. -------------------
    ("level-1", "First Steps", "easy",
     "Cards run from top to bottom, one after another.", "right", 5, """
S....G
"""),

    ("level-2", "Round the Corner", "easy",
     "Turning changes which way 'forward' points.", "right", 6, """
S..#
##.#
##.#
##G#
"""),

    ("level-3", "Zigzag", "easy",
     "Turn left and turn right send you opposite ways.", "right", 8, """
S.##
#..#
##.#
##G#
"""),

    ("level-4", "The Long Way", "medium",
     "A long path is just many small steps in the right order.", "right", 15, """
S...#
###.#
#...#
#.###
#..G#
"""),

    # ---- 5-9  Repetition: one repeat card. Hardcoding must be tedious. --------
    # Naive block counts are noted per level; par sits strictly between the looped
    # solution and the naive one.
    # par 3, not 4: at four moves the looped solution (3 cards) and the naive one (4)
    # are only one card apart, so there is no integer par that is both reachable by the
    # loop AND above the hardcoded version. Par 3 keeps the rule that matters -- writing
    # every step out never earns the under-par bonus.
    ("level-5", "Four in a Row", "easy",
     "One repeat card does the same step again and again.", "right", 3, """
S...G
"""),

    ("level-6", "Eight in a Row", "easy",
     "Two repeat cards beat writing every step by hand.", "right", 7, """
S.......G
"""),

    ("level-7", "Around the Block", "medium",
     "Repeat each straight stretch, then turn once between them.", "right", 12, """
S......
######.
######.
######.
######.
######.
######G
"""),

    ("level-8", "Twelve Steps", "medium",
     "The longer the road, the more a repeat card saves you.", "right", 10, """
S...........G
"""),

    ("level-9", "Step Pattern", "medium",
     "A repeat can hold a whole pattern, not just one card.", "right", 9, """
S.##
#..#
##..
###G
"""),

    # ---- 10-13  Nested repeat: the hardest conceptual jump. One idea per level.
    ("level-10", "Repeat Inside Repeat", "medium",
     "A repeat card can go inside another repeat card.", "right", 6, """
S.......G
"""),

    ("level-11", "Twelve, Nested", "medium",
     "Four groups of three is twelve -- let the cards do the counting.", "right", 8, """
S...........G
"""),

    ("level-12", "Nested Steps", "hard",
     "Nest a repeat around a pattern to repeat the whole pattern.", "right", 12, """
S.#####
#..####
##..###
###..##
####..#
#####..
######G
"""),

    ("level-13", "Sixteen Steps, Nested", "hard",
     "Nest a repeat around a pattern and a few cards go a very long way.", "right", 12, """
S.#######
#..######
##..#####
###..####
####..###
#####..##
######..#
#######..
########G
"""),

    # ---- 14-18  Conditionals: if wall ahead / else. -----------------------------
    # These five share one program shape -- "look before you step" inside a loop --
    # applied to different maps and start positions, which is the whole point: the
    # same program keeps working when the map changes.
    ("level-14", "Wall Ahead", "easy",
     "Ask if a wall is in front of you before you step.", "right", 6, """
S..
##.
##G
"""),

    ("level-15", "Look Before You Step", "medium",
     "The same look-then-step idea, on a longer road.", "right", 9, """
S.....
#####.
#####.
#####G
"""),

    ("level-16", "Two Corners", "medium",
     "One rule -- turn when blocked -- handles every corner.", "right", 10, """
S...
G##.
....
####
"""),

    ("level-17", "This Way or That", "medium",
     "Else is what to do when the answer is no.", "right", 7, """
S.#
#.#
#G#
"""),

    ("level-18", "The Big Ring", "hard",
     "The same small rule solves a much bigger maze.", "right", 12, """
S....
####.
####.
####.
G....
"""),

    # ---- 19-22  While: you don't always know the count in advance. --------------
    ("level-19", "Until the Goal", "easy",
     "While keeps going until you arrive -- no counting needed.", "right", 5, """
S......G
"""),

    ("level-20", "However Far It Takes", "easy",
     "The same while program works however long the road is.", "right", 5, """
S..........G
"""),

    ("level-21", "While Around the Bend", "medium",
     "Combine while with a wall check to handle corners.", "right", 8, """
S....
####.
####.
####G
"""),

    ("level-22", "The Winding Road", "hard",
     "One small loop, however long and however many corners.", "right", 10, """
S.....
#####.
#####.
#####.
#####.
G.....
"""),

    # ---- 23-25  Composition: everything together, plus pickup. -----------------
    # Collectibles are required: internal/executor only counts the goal as reached
    # once every item is collected, so a pickup card in the loop is part of the
    # solution rather than decoration.
    ("level-23", "Pick It Up", "medium",
     "Collect what you pass, then head for the goal.", "right", 7, """
S.*..G
"""),

    ("level-24", "Gather and Go", "hard",
     "Collect everything on the way -- the goal won't open until you do.", "right", 9, """
S.*...*..G
"""),

    ("level-25", "The Full Quest", "hard",
     "Everything you have learned, in one road.", "right", 11, """
S.*..
####.
####.
####.
G...*
"""),
]


def parse_map(text):
    rows = [r for r in text.strip("\n").split("\n") if r.strip()]
    width = max(len(r) for r in rows)
    rows = [r.ljust(width, "#") for r in rows]
    height = len(rows)

    walls, start, goal, items = [], None, None, []
    for y, row in enumerate(rows):
        wall_row = []
        for x, ch in enumerate(row):
            wall_row.append(ch == "#")
            if ch == "S":
                start = [x, y]
            elif ch == "G":
                goal = [x, y]
            elif ch == "*":
                items.append([x, y])
        walls.append(wall_row)

    if start is None:
        raise ValueError("map has no S")
    if goal is None:
        raise ValueError("map has no G")
    if goal in items:
        # Would deadlock: stepping on the goal ends a `while not at goal` loop, but the
        # goal does not count as reached while an item is uncollected.
        raise ValueError("a collectible may not sit on the goal cell")
    return width, height, walls, start, goal, items


def main():
    os.makedirs(OUT, exist_ok=True)
    for old in os.listdir(OUT):
        if old.endswith(".json"):
            os.remove(os.path.join(OUT, old))

    for lid, name, difficulty, concept, start_dir, par, text in LEVELS:
        width, height, walls, start, goal, items = parse_map(text)
        level = {
            "id": lid,
            "name": name,
            "teaches": TEACHES[lid],
            "difficulty": difficulty,
            "concept": concept,
            "parBlocks": par,
            "startPos": start,
            "startDir": start_dir,
            "grid": {
                "width": width,
                "height": height,
                "walls": walls,
                "goal": goal,
            },
        }
        if items:
            level["grid"]["items"] = items

        path = os.path.join(OUT, lid + ".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(level, f, indent=2)
            f.write("\n")
    print(f"wrote {len(LEVELS)} levels to {OUT}")


# `teaches` drives internal/hints.Classify's per-level signature scoping and the
# dashboard's concept grouping, so it stays a small closed vocabulary.
TEACHES = {
    "level-1": "move", "level-2": "move", "level-3": "move", "level-4": "move",
    "level-5": "repeat", "level-6": "repeat", "level-7": "repeat", "level-8": "repeat",
    "level-9": "repeat",
    "level-10": "nested_repeat", "level-11": "nested_repeat", "level-12": "nested_repeat",
    "level-13": "nested_repeat",
    "level-14": "if_wall_ahead", "level-15": "if_wall_ahead", "level-16": "if_wall_ahead",
    "level-17": "if_wall_ahead", "level-18": "if_wall_ahead",
    "level-19": "while", "level-20": "while", "level-21": "while", "level-22": "while",
    "level-23": "composition", "level-24": "composition", "level-25": "composition",
}

if __name__ == "__main__":
    main()
