Human-written, verified hints, one file per level, keyed by the error signature from
`internal/hints.Classify` (brief §11). Never edited by the model — it only rephrases
whatever's in here (or `internal/hints.GenericFallback` if a signature isn't covered).

Generated from `scripts/gen-hints.py`, which is where the text actually lives so the tone
stays consistent and the per-level differences are visible side by side. Edit the
generator, re-run it, then let `internal/hints`' `bank_test.go` prove the banks still
match the table below.

**126 hints across 25 levels**, grouped by the six concept groups (see
`scripts/gen-levels.py` for the curriculum itself).

## Which signatures each concept group can produce

| Signature | move (1–4) | repeat (5–9) | nested (10–13) | if/else (14–18) | while (19–22) | composition (23–25) |
|---|---|---|---|---|---|---|
| `empty_program` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `unbalanced_block` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `infinite_loop` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `hardcoded_no_loop` | — | ✓ | ✓ | — | ✓ | ✓ |
| `off_by_one_repeat` | — | ✓ | ✓ | — | — | — |
| `overshot_goal` | — | ✓ | ✓ | — | — | — |
| `no_condition_used` | — | — | — | ✓ | — | — |
| `missing_turn` | — | — | — | ✓ | — | — |
| `never_picked_up` | — | — | — | — | — | ✓ |
| `wrong_order` | ✓ | — | — | — | — | — |
| **per level** | **4** | **6** | **6** | **5** | **4** | **5** |

Notes on the shape of that table:

- **`empty_program` / `unbalanced_block` / `infinite_loop` are universal.** Every level's
  toolbox contains every card, so a child can always leave the workspace empty, open a
  block without closing it, or write a `while` that never finishes — regardless of what
  the level is teaching.
- **`unbalanced_block` is the most common mistake in the game** and is written most
  carefully, per explicit instruction. The cards are a *flat* stack (no physical nesting —
  see `DECISIONS.md`), so every opener needs a closer the child has to remember to place.
  The text is varied per concept group to name the specific closing card that level needs
  (`end repeat` / `end if` / `end while`), because "close your block" is useless if you
  don't know which card that means.
- **`off_by_one_repeat` is the other carefully-written one.** It never states the required
  step count — that is the thing being learned. On nested levels it points at the
  multiply (inside count × outside count), which is where the off-by-one actually comes
  from.
- **`hardcoded_no_loop` covers `while` and `composition` too**, not just `repeat`:
  `Classify` treats a repeat-based solve on a while level (and vice versa) as a legitimate
  loop, so the signature only fires when the child used no loop at all.
- **`off_by_one_repeat`/`overshot_goal` don't extend to `while`.** Both compare a fixed
  static move count against the distance to the goal; "loop until a condition is true"
  has no comparable notion of being one off.
- **`never_picked_up` now has a detector.** `internal/executor` only opens the goal once
  every collectible is gathered, so on levels 23–25 walking past the items is a real,
  detectable failure rather than a silent non-event.
- **`wrong_order` now has a detector, scoped to `move`.** `move` levels have no
  branching, so `levels.Solutions` gives exactly one intended sequence per level; a
  program with the identical move-step/turn-direction multiset as that solution, which
  still fails, can only have the cards in the wrong order. Not extended to any other
  group: every other group either already has richer detectors, or (like `repeat`'s
  `off_by_one_repeat`) a comparable "close but reordered" case doesn't really apply once
  loops are involved. Full reasoning in `DECISIONS.md`.

`internal/hints.Classify` only ever returns a signature a level can actually produce (the
table above is what it implements, not a promise about signatures it doesn't try to
detect) — anything else falls back to the generic encouraging line, per brief §11's
absolute rule.
