#!/usr/bin/env python3
"""icon_idea/staging.png を PWA 用 192 / 512 にリサイズして staging/ に出力する。"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent
STAGING = Path(__file__).resolve().parent
SRC = ROOT / "icon_idea" / "staging.png"
SIZES = (192, 512)


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"source not found: {SRC}")
    im = Image.open(SRC).convert("RGBA")
    for size in SIZES:
        out = im.resize((size, size), Image.Resampling.LANCZOS)
        path = STAGING / f"icon_pwa_{size}.png"
        out.save(path, format="PNG", optimize=True)
        print("wrote", path)


if __name__ == "__main__":
    main()
