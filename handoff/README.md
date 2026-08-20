# Parallel work briefs

All six are done and merged to `master` — this file is kept as a record of the original
scoping and for anyone who wants the full reasoning behind each fix (every entry below
links to the exact `DECISIONS.md` writeup).

| # | Task | Why it matters | Status |
|---|------|----------------|--------|
| 01 | [Hub Mode: camera reads the cards](01-hub-mode-camera.md) | §13 step 3. The biggest gap in the demo, and the moment the physical-cards premise lands | ✅ Merged, verified for real (`DECISIONS.md` 2026-08-18) |
| 02 | [Key hot-swap and crash-safe writes](02-key-hot-swap.md) | §13 step 6. Yanking a live key on stage is the most memorable beat in the script | ✅ Merged, verified with a reproduced-then-fixed test (`DECISIONS.md` 2026-08-19) |
| 03 | [README and an honest demo script](03-readme-and-demo-script.md) | A judge's first contact with a public repo, and there wasn't one | ✅ Merged (`README.md`, `DEMO.md`) |
| 04 | [Stars, end to end](04-stars.md) | A dead schema column; the trail under-reported on purpose until it was wired | ✅ Merged, verified live against a real server (`DECISIONS.md` 2026-08-19) |
| 05 | [Pet evolution art](05-pet-evolution-art.md) | §13 step 2. Visible growth is what sells the companion idea | ✅ Merged, verified live in a real browser (`DECISIONS.md` 2026-08-19) |
| 06 | [Windows parent-crash orphan](06-windows-orphan.md) | Robustness. Invisible to judges, real for users | ✅ Merged, verified with a real hard-kill test (`DECISIONS.md` 2026-08-19) |

One more real gap was found and closed along the way, not originally on this list: the
`wrong_order` hint signature (brief §11's last undetected one) now has a detector,
scoped to the `move` concept group — see `DECISIONS.md`'s 2026-08-19 entry.

## Rules for every one of these

- **Branch per task** (`hub-mode`, `key-hotswap`, …) and open a PR. Do not push to master —
  the main workstream is pushing there and neither of you wants that fight.
- **Do not change the AST contract (`packages/ast/`) or the key protocol (§7 schema).**
  Everything plugs into those. Task 02 is the single exception and says so explicitly.
- **No new runtime dependencies** in the web bundle or the launcher. Prep-time Python
  tooling is fine — OpenCV is already used by the print pipeline.
- **Offline.** No CDN, no Google Fonts, no remote images, no cloud APIs. Everything
  self-hosted or vendored.
- **No copyrighted or brand assets.** All illustration is original SVG.
- **Every fix needs a test**, or it does not land.
- Log decisions in `DECISIONS.md`, open questions in `QUESTIONS.md`, appending at the end.
  Expect merge conflicts there and nowhere else; keep to your own section.
- **Never add yourself or Claude as a commit co-author.**

## Collision map

These files are actively edited by the main workstream. Avoid unless your brief says
otherwise:

`web/src/pet/*`, `web/src/App.tsx`, `web/src/PlayPage.tsx`, `web/src/HomePage.tsx`,
`web/src/index.css`, `web/src/tokens.css`, `cmd/server/main.go`, `internal/paths/*`,
`internal/store/*`.

Task 02 owns `internal/store/*` and task 05 owns `web/src/pet/*` — coordinate before
starting either, and do not run them at the same time as each other.

## Sequencing

01, 03 and 06 are safe to run concurrently with everything.
02 and 04 both touch the store; run 02 first, then 04 on top.
05 should wait until 01 has merged, to keep the pet files quiet.
