Human-written, verified hints, one file per level, keyed by the error signature from
`internal/hints.Classify` (brief §11). Never edited by the model — it only rephrases
whatever's in here (or `internal/hints.GenericFallback` if a signature isn't covered).

8 levels across 4 sections (each teaching a distinct concept, two levels per section —
see `web/src/Dashboard.tsx`'s `SECTIONS` for the section/animal-mascot mapping):
move (level-1, level-4), repeat (level-2, level-5), if_wall_ahead (level-3, level-6),
while (level-7, level-8).

**Which of brief §11's 10 signatures each level actually covers, and why not all 10:**

| Signature | move (1,4) | repeat (2,5) | if_wall_ahead (3,6) | while (7,8) | Why / why not |
|---|---|---|---|---|---|
| `empty_program` | ✓ | ✓ | ✓ | ✓ | Always possible — an empty workspace is an empty workspace regardless of level. |
| `unbalanced_block` | ✓ | ✓ | ✓ | ✓ | Always possible on any level with a repeat/if/while card in its toolbox — see `internal/hints.Classify`'s comment: written most carefully per explicit instruction, since flat stacks (no Blockly-native nesting, `DECISIONS.md`) make this the single most common mistake in the game. |
| `infinite_loop` | ✓ | ✓ | ✓ | ✓ | A `while` card is in every level's toolbox even when the level doesn't require one — a child can always add one that never terminates. |
| `hardcoded_no_loop` | — | ✓ | — | ✓ | Meaningful where the level *teaches* `repeat` or `while` — a `while`-teaching level also accepts a `repeat`-based solve as satisfying "used a loop" and vice versa (both are legitimate loops), so this one signature covers both sections rather than needing a second one. |
| `off_by_one_repeat` | — | ✓ | — | — | Only detectable/relevant where the intended solution is a fixed repeat-based move count — `while`'s "loop until condition" shape doesn't have a comparable "off by one" notion (see `internal/hints.Classify`'s `while` case). |
| `overshot_goal` | — | ✓ | — | — | Same axis as off-by-one, just further off; only checked where `teaches: "repeat"`, same reasoning as above for why `while` doesn't get this one. |
| `no_condition_used` | — | — | ✓ | — | Only meaningful where the level *teaches* `if_wall_ahead` (levels 3, 6). |
| `missing_turn` | — | — | ✓ | — | Same — needs a turn inside the `if`, specific to the if_wall_ahead levels. |
| `wrong_order` | — | — | — | — | **Gap, not implemented.** Would need diffing a child's program against a canonical per-level solution structure; nothing in the system tracks one yet. Logged in `DECISIONS.md`/`QUESTIONS.md`. |
| `never_picked_up` | — | — | — | — | **N/A for all 8 current levels** — none of them place an item to pick up (`content/levels/*.json` have no `items`). Not a gap, just not applicable yet. |

`internal/hints.Classify` only ever returns a signature a level can actually produce (the
table above is what it implements, not a promise about signatures it doesn't try to
detect) — anything else falls back to the generic encouraging line, per brief §11's
absolute rule.
