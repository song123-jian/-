"""Generate Android launcher assets from the shared Windows app icon."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent
ICON_PATH = ROOT / "assets" / "app-icon.ico"
RESOURCES = ROOT / "android" / "app" / "src" / "main" / "res"
DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}


def main() -> int:
    with Image.open(ICON_PATH) as source:
        if source.size != (256, 256):
            raise RuntimeError(f"Expected the 256x256 desktop icon, got {source.size}")
        icon = source.convert("RGBA")

    for density, size in DENSITIES.items():
        target = RESOURCES / f"mipmap-{density}"
        target.mkdir(parents=True, exist_ok=True)
        resized = icon.resize((size, size), Image.Resampling.LANCZOS)
        for name in ("ic_launcher.webp", "ic_launcher_round.webp"):
            resized.save(target / name, format="WEBP", quality=100, method=6)

    mark = icon.crop((44, 41, 212, 215))
    scale = 4
    mask_large = Image.new("L", (mark.width * scale, mark.height * scale), 0)
    ImageDraw.Draw(mask_large).rounded_rectangle(
        (0, 0, mask_large.width - 1, mask_large.height - 1),
        radius=24 * scale,
        fill=255,
    )
    mask = mask_large.resize(mark.size, Image.Resampling.LANCZOS)
    mark.putalpha(ImageChops.multiply(mark.getchannel("A"), mask))

    foreground_size = (278, 288)
    mark = mark.resize(foreground_size, Image.Resampling.LANCZOS)
    foreground = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    foreground.alpha_composite(mark, ((432 - foreground_size[0]) // 2, 72))
    target = RESOURCES / "drawable-xxxhdpi" / "ic_launcher_mark.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    foreground.save(target, format="PNG", optimize=True)

    print(f"Generated Android launcher assets under {RESOURCES}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
