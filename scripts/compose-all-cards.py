#!/usr/bin/env python3
"""
Batch version of compose-card.py: composites all 14 print-ready cards from
print/cards/*.png (the Blockly gallery export) into print/composited/*.png.

Card id is parsed from the filename Blockly's gallery export already uses
(card-<NN>-<slug>.png, see web/src/CardGallery.tsx) -- one source of truth for the
id<->card mapping instead of a second hardcoded list here that could drift out of sync
with web/src/blocks/cardBlocks.ts.

Usage:
    python compose-all-cards.py [cards_dir] [out_dir]
    (defaults: print/cards -> print/composited, relative to the repo root)
"""
import importlib.util
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent

# compose-card.py has a dash in its name (matches this repo's script-naming
# convention), so it can't be `import`ed normally -- load it by path instead.
spec = importlib.util.spec_from_file_location("compose_card_mod", SCRIPT_DIR / "compose-card.py")
compose_card_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compose_card_mod)

CARD_FILENAME_RE = re.compile(r"^card-(\d\d)-")


def main() -> None:
    cards_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO_ROOT / "print" / "cards"
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else REPO_ROOT / "print" / "composited"
    out_dir.mkdir(parents=True, exist_ok=True)

    card_files = sorted(cards_dir.glob("card-*.png"))
    if not card_files:
        sys.exit(f"no card-*.png files found in {cards_dir} -- run the web gallery export first")

    written = []
    for card_path in card_files:
        m = CARD_FILENAME_RE.match(card_path.name)
        if not m:
            sys.exit(f"{card_path.name}: doesn't match card-<NN>-<slug>.png, refusing to guess an id")
        marker_id = int(m.group(1))

        canvas = compose_card_mod.compose_card(str(card_path), marker_id)
        out_path = out_dir / card_path.name
        compose_card_mod.save_card_png(canvas, str(out_path))
        written.append((marker_id, out_path))
        print(f"  card {marker_id:02d}: {out_path}")

    if len(written) != 14:
        print(f"WARNING: expected 14 cards (brief §6), found {len(written)} -- check {cards_dir}", file=sys.stderr)

    print(f"wrote {len(written)} composited cards to {out_dir}")


if __name__ == "__main__":
    main()
