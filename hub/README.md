# hub/ -- Hub Mode camera pipeline (HANDOFF-hub-mode.md)

Point a webcam at a row of printed cards; this turns the photo into a valid
`packages/ast/schema.json` envelope (`"source": "cards"`) and POSTs it to the already-running
server's `POST /api/program`. Python sidecar, not a Go/gocv addition -- see
`DECISIONS.md`: the launcher builds with `CGO_ENABLED=0` for trivial Pi cross-compilation,
and gocv needs CGO.

## Modules

- `card_table.py` -- the 14 card id -> label table, one source of truth mirroring
  `web/src/blocks/cardBlocks.ts`'s `CARDS` array.
- `detect.py` -- `detect_markers()` (ArUco DICT_4X4_50 decode, same call as
  `scripts/test-detect-cards.py`) and `order_markers()` (reading order: rows by centre y,
  then left-to-right by centre x within a row -- see `DECISIONS.md` for why).
- `ast_builder.py` -- `compile_row()`, the same open/close stack-parse as
  `web/src/blocks/compileAst.ts`, ported from a Blockly block chain to a flat ordered id
  list. Never raises on malformed input; an unbalanced program (brief §6: a normal
  teaching moment) comes back as a best-effort AST plus a `problems` list.
- `client.py` -- `post_program()`, a thin `POST /api/program` wrapper. Emits the existing
  envelope unchanged.
- `hub.py` -- CLI entrypoint tying the above together. `python -m hub.hub --help`.

## Running it

```
pip install -r hub/requirements.txt

# live webcam, run against level-1, actually POST:
python -m hub.hub --level-id level-1

# a still photo instead of a live camera:
python -m hub.hub --image photo.png --level-id level-1

# just print the AST envelope, don't POST anything:
python -m hub.hub --image photo.png --dry-run
```

## Tests

```
pip install -r hub/requirements.txt
python -m pytest hub/tests
```

`hub/tests/test_detect_composited.py` generates its own print-ready composited cards
(reusing `scripts/compose-card.py`'s exact `compose_card()`/marker-generation code, with
placeholder glyph art since `print/cards/*.png` -- the real Blockly gallery export -- is
gitignored and not checked into this branch) and verifies detection against all 14, plus
multi-card and multi-row synthetic photos. `hub/tests/test_integration.py` starts the real
Go server (`go run ./cmd/server`) and posts a solved level-1 program end to end; it
`pytest.skip`s if `go` isn't on `PATH` -- see `QUESTIONS.md`, this couldn't be run in the
prep environment used to write this branch and needs a sign-off run on a machine with the
Go toolchain.
