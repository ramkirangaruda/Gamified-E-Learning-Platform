# Handoff: Hub Mode — camera reads the cards (§13 step 3)

**Paste this whole file into Claude Code on your machine.** It is written to be run
independently, in parallel, without touching anything the other workstream is editing.

## Why this one

Of the eight steps in the demo script (brief §13), only steps 4 and 7 are built. Step 3 —
*point the camera at a row of printed cards and watch the robot run the program* — is the
single biggest gap, and it is the moment the whole physical-cards premise either lands or
doesn't. It is also completely isolated: it needs no file that the other workstream has
open.

## What already exists (do not rebuild any of it)

- **All 14 printed cards, with ArUco markers, verified decodable.** `print/composited/`
  holds `card-00-move-forward.png` … `card-13-end-while.png`, and
  `print/tessera-quest-cards.pdf` is the print run. Markers are **DICT_4X4_50**, and the
  marker id **is** the card id.
- **`scripts/test-detect-cards.py`** already decodes every card with `cv2.aruco` and exits
  non-zero if any fails. Read it first — it is a working example of the exact detection
  call you need.
- **The card id → operation table**, in `web/src/blocks/cardBlocks.ts`:

  | id | card | id | card |
  |----|------|----|------|
  | 0 | move forward | 7 | repeat 4 |
  | 1 | turn left | 8 | end repeat |
  | 2 | turn right | 9 | if wall ahead |
  | 3 | pick up | 10 | else |
  | 4 | wait | 11 | end if |
  | 5 | repeat 2 | 12 | while not at goal |
  | 6 | repeat 3 | 13 | end while |

- **The AST contract, frozen, and it already reserves this input.** `packages/ast/schema.json`
  plus fixtures; note `"source": "cards"` is already a legal value and is exactly what you
  emit. `packages/ast/validate.go` is the authority on what is valid.
- **The running API.** `POST /api/program?level_id=<id>` with body
  `{"ast": <envelope>, "client_problems": []}` runs a program through the real executor and
  returns the trace. Your output goes in there unchanged.

## The job

A camera pipeline that turns a row of physical cards into a valid AST envelope and runs it.

1. Capture a frame from the webcam.
2. Detect ArUco markers (DICT_4X4_50).
3. **Order them left to right by marker centre x** — this is the program order. (Consider
   what should happen with two rows; simplest defensible rule is to sort by y into rows
   first, then x within a row, and say so in DECISIONS.md.)
4. Map ids to ops and build the nested AST — `repeat`/`end repeat`, `if`/`else`/`end if`,
   `while`/`end while` nest exactly like the Blockly compiler does. Read
   `web/src/blocks/compileAst.ts` for the semantics that already exist; match them,
   including how an **unbalanced** opener is handled (brief §6: unbalanced is a normal
   teaching moment, never an error).
5. POST it and show the result.

## Hard constraints — these are not negotiable

- **Do not change the AST contract or the key protocol.** Everything plugs into those.
  Emit the existing envelope; add nothing to it.
- **Do not use gocv or any CGO-dependent Go binding.** The launcher builds with
  `CGO_ENABLED=0` specifically so it cross-compiles to the Pi trivially, and gocv would
  destroy that. **Write this as a Python sidecar** that talks to the existing HTTP API —
  OpenCV is already a prep-time dependency of the print pipeline, so it costs nothing new.
- **Offline.** No CDN, no cloud vision API, no model download at runtime.
- **New files only.** Put it in `hub/` (new directory) plus new scripts. See the
  "no collisions" list below.
- **Every claim tested.** Detection must be verified against the real card images in
  `print/composited/`, not just against a live camera you can see working.

## Do not touch these files — they are being actively edited

`web/src/pet/*`, `web/src/App.tsx`, `web/src/PlayPage.tsx`, `web/src/HomePage.tsx`,
`web/src/index.css`, `web/src/tokens.css`, `cmd/server/main.go`, `internal/paths/*`,
`internal/store/*`.

If you genuinely need a server-side endpoint, say so in `QUESTIONS.md` and post to the
existing `/api/program` in the meantime rather than editing `internal/api`.

## Working rules for this repo

- Log decisions in `DECISIONS.md` and open questions in `QUESTIONS.md`, appending to the
  end. Both files are append-heavy and shared, so keep to your own section and expect to
  resolve a merge conflict there rather than anywhere else.
- **Work on a branch** (`hub-mode`) and open a PR rather than pushing to master, so the two
  streams never fight over the same history.
- Commit per milestone with a real message explaining *why*.
- **Never add yourself or Claude as a commit co-author.**

## Acceptance — you are done when

1. A photo of a real printed row of cards produces the correct AST, verified against a
   hand-written expected envelope in a test.
2. That AST posts to `/api/program` and solves an actual level.
3. Detection is proven against all 14 images in `print/composited/`.
4. An unbalanced program (a `repeat 3` with no `end repeat`) degrades the way §6 requires,
   rather than throwing.
5. It runs on a plain laptop webcam. The Pi camera comes later — do not block on hardware.
