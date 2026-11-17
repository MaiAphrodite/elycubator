"""Slice the delivered PinkEggs logo into web assets.

Source: a transparent RGBA lockup (mark above wordmark) in one cream ink.
Emits recolored single-ink PNGs so the mark can sit on light or dark
surfaces without a baked background.

Run: python3 scripts/build-brand-assets.py
"""
import os
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
# The artwork as delivered. Point BRAND_SOURCE at any copy of the lockup.
SRC = Path(os.environ.get("BRAND_SOURCE", ROOT / "brand-source/pinkeggs-lockup.png"))
OUT = ROOT / "apps" / "web" / "public" / "brand"

CREAM = (253, 228, 186)  # sampled from the artwork
INK = (38, 33, 26)  # cream at ~15%, the tile tone behind the mark
GAP = 8  # rows of empty space that separate mark from wordmark


def tight(img: Image.Image) -> Image.Image:
    box = img.getchannel("A").getbbox()
    if box is None:
        raise SystemExit("empty region")
    return img.crop(box)


def recolor(img: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    """Keep alpha coverage, replace the ink, drop any background."""
    out = Image.new("RGBA", img.size, (*rgb, 0))
    out.putalpha(img.getchannel("A"))
    return out


def save(img: Image.Image, name: str, width: int) -> None:
    height = round(img.height * width / img.width)
    img.resize((width, height), Image.LANCZOS).save(OUT / name, optimize=True)
    print(f"{name:24} {width}x{height}")


def split(src: Image.Image) -> tuple[Image.Image, Image.Image]:
    alpha = src.getchannel("A")
    rows = [y for y in range(src.height) if alpha.crop((0, y, src.width, y + 1)).getbbox()]
    breaks = [y for y in rows if y - 1 not in rows]
    if len(breaks) != 2:
        raise SystemExit(f"expected 2 bands, found {len(breaks)}")
    cut = breaks[1] - GAP
    return src.crop((0, 0, src.width, cut)), src.crop((0, cut, src.width, src.height))


def square_tile(mark: Image.Image, size: int, inset_ratio: float) -> Image.Image:
    """Full-bleed ink square with the mark centred, for maskable icons."""
    inset = round(size * inset_ratio)
    inner = mark.resize(
        (size - 2 * inset, round(mark.height * (size - 2 * inset) / mark.width)),
        Image.LANCZOS,
    )
    tile = Image.new("RGBA", (size, size), (*INK, 255))
    tile.alpha_composite(
        recolor(inner, CREAM),
        ((size - inner.width) // 2, (size - inner.height) // 2),
    )
    return tile


def rounded_tile(mark: Image.Image, size: int, radius_ratio: float = 0.22) -> Image.Image:
    """Ink tile with the cream mark centred, used for favicons."""
    inset = round(size * 0.14)
    inner = mark.resize(
        (size - 2 * inset, round(mark.height * (size - 2 * inset) / mark.width)),
        Image.LANCZOS,
    )
    tile = Image.new("RGBA", (size, size), (*INK, 255))
    mask = Image.new("L", (size, size), 0)
    from PIL import ImageDraw

    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=round(size * radius_ratio), fill=255
    )
    tile.putalpha(mask)
    tile.alpha_composite(
        recolor(inner, CREAM),
        ((size - inner.width) // 2, (size - inner.height) // 2),
    )
    return tile


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"logo source not found: {SRC}\nSet BRAND_SOURCE to the lockup PNG.")
    OUT.mkdir(parents=True, exist_ok=True)
    src = Image.open(SRC).convert("RGBA")
    mark, _wordmark = split(src)

    mark = tight(mark)
    lockup = tight(src)
    print(f"mark    {mark.width}x{mark.height}  ratio {mark.width / mark.height:.3f}")
    print(f"lockup  {lockup.width}x{lockup.height}  ratio {lockup.width / lockup.height:.3f}")

    save(recolor(mark, CREAM), "mark-cream.png", 512)
    save(recolor(mark, INK), "mark-ink.png", 512)
    save(recolor(lockup, CREAM), "lockup-cream.png", 1024)
    save(recolor(lockup, INK), "lockup-ink.png", 1024)

    for name, size in (("apple-touch-icon.png", 180),):
        rounded_tile(mark, size).save(OUT / name, optimize=True)
        print(f"{name:24} {size}x{size}")

    # Installable PWA icons. Maskable keeps the mark inside the 80% safe circle.
    for name, size, inset in (
        ("icon-192.png", 192, 0.14),
        ("icon-512.png", 512, 0.14),
        ("icon-maskable-512.png", 512, 0.22),
    ):
        square_tile(mark, size, inset).save(OUT / name, optimize=True)
        print(f"{name:24} {size}x{size}")

    # The tab icon is served from the site root.
    rounded_tile(mark, 512).save(ROOT / "apps" / "web" / "public" / "favicon.png", optimize=True)
    print("favicon.png              512x512")


if __name__ == "__main__":
    main()
