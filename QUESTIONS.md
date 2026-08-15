# QUESTIONS.md

Things logged instead of stopping to ask, per the unsupervised-run instruction. One line
of context each — should be answerable in one line when you're back.

## Top of list

- **GitHub repo privacy**: already confirmed private earlier in this same session — I hit
  the API unauthenticated after you flipped it, got a 404 (private repos 404 rather than
  403 for non-collaborators), and it hasn't been touched since. Should still be private.
  Flagging per your note in case you want a second confirmation when you're back — say
  the word and I'll re-check.

## Item 1 (ArUco compositing)

- **"Single A4 sheet with all 14" isn't geometrically possible.** 14 cards at 9x5cm =
  630 cm² of card area; an A4 sheet is 21x29.7cm = 623.7 cm² total — smaller than the
  raw card area alone, before any cut margin. Chose: keep cards at spec size (9x5cm,
  non-negotiable per the detection-reliability requirement) and split across 2 pages
  (10 + 4) instead of shrinking cards to fit one sheet. `scripts/make-print-sheet.py`
  emits a multi-page PDF. Say if you'd rather trim the physical size instead.
- **Added Pillow as a Python dependency**, tooling-only (print-sheet PDF export —
  OpenCV can composite images but can't write PDF; Pillow's `Image.save(...,
  save_all=True)` does multi-page PDF in one call). Not part of the shipped
  Pi/laptop runtime, only this prep script. Already present on this machine; not
  yet added to any requirements file since the project doesn't have a scripts-specific
  one — flagging in case you want it pinned somewhere.

