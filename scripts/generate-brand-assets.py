#!/usr/bin/env python3
"""Generate KN GOLD brand assets: black logo on cream with rounded icon corners."""

from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/brand/logo-source.png"
OUT = ROOT / "public"
APP = ROOT / "src/app"

CREAM = (246, 243, 236, 255)  # #f6f3ec
INK = (21, 19, 17, 255)  # #151311


def load_black_logo() -> Image.Image:
    src = Image.open(SOURCE).convert("RGBA")
    px = src.load()
    w, h = src.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 16:
                out.putpixel((x, y), INK)
    return out


def trim_alpha(im: Image.Image, pad: int = 0) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    left, top, right, bottom = bbox
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(im.width, right + pad)
    bottom = min(im.height, bottom + pad)
    return im.crop((left, top, right, bottom))


def fit_inside(im: Image.Image, size: int, scale: float = 0.82) -> Image.Image:
    target = int(size * scale)
    fitted = im.copy()
    fitted.thumbnail((target, target), Image.Resampling.LANCZOS)
    return fitted


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def compose_icon(logo: Image.Image, size: int, *, maskable: bool = False) -> Image.Image:
    radius = max(8, round(size * 0.22))
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg = Image.new("RGBA", (size, size), CREAM)
    mask = rounded_mask(size, radius)
    canvas.paste(bg, (0, 0), mask)

    scale = 0.68 if maskable else 0.82
    mark = fit_inside(logo, size, scale=scale)
    x = (size - mark.width) // 2
    y = (size - mark.height) // 2
    canvas.alpha_composite(mark, (x, y))
    return canvas


def compose_logo_png(logo: Image.Image, size: int = 512) -> Image.Image:
    mark = fit_inside(logo, size, scale=0.86)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - mark.width) // 2
    y = (size - mark.height) // 2
    canvas.alpha_composite(mark, (x, y))
    return canvas


def compose_og(logo: Image.Image) -> Image.Image:
    w, h = 1200, 630
    canvas = Image.new("RGBA", (w, h), CREAM)
    mark = fit_inside(logo, min(w, h), scale=0.42)
    x = (w - mark.width) // 2
    y = int(h * 0.28) - mark.height // 2
    canvas.alpha_composite(mark, (x, y))

    draw = ImageDraw.Draw(canvas)
    subtitle = "Control de inventario"
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf", 42)
    except OSError:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), subtitle, font=font)
    tw = bbox[2] - bbox[0]
    draw.text(((w - tw) // 2, y + mark.height + 36), subtitle, fill=INK[:3], font=font)
    return canvas


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, optimize=True)


def save_ico(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sizes = [(16, 16), (32, 32), (48, 48)]
    icons = [im.resize(s, Image.Resampling.LANCZOS) for s in sizes]
    icons[0].save(path, format="ICO", sizes=[(s.width, s.height) for s in icons])


def main() -> None:
    logo = trim_alpha(load_black_logo(), pad=8)

    save_png(compose_logo_png(logo), OUT / "brand/logo.png")

    icon32 = compose_icon(logo, 32)
    icon192 = compose_icon(logo, 192)
    icon512 = compose_icon(logo, 512)
    icon_maskable = compose_icon(logo, 512, maskable=True)
    apple = compose_icon(logo, 180)

    save_png(icon32, OUT / "icons/icon-32.png")
    save_png(icon192, OUT / "icons/icon-192.png")
    save_png(icon512, OUT / "icons/icon-512.png")
    save_png(icon_maskable, OUT / "icons/icon-512-maskable.png")
    save_png(apple, OUT / "icons/apple-touch-icon.png")
    save_png(icon32, OUT / "favicon.png")
    save_ico(icon32.convert("RGBA"), OUT / "favicon.ico")

    og = compose_og(logo)
    save_png(og, OUT / "brand/og.png")

    # Next.js metadata files take precedence over public/ on Vercel.
    save_png(icon192, APP / "icon.png")
    save_png(apple, APP / "apple-icon.png")
    save_png(og, APP / "opengraph-image.png")
    save_ico(icon32.convert("RGBA"), APP / "favicon.ico")

    print("Generated brand assets with black logo on cream (#f6f3ec).")


if __name__ == "__main__":
    main()
