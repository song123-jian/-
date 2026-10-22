"""Render the editable SVG to the Windows ICO and a PNG preview."""
from __future__ import annotations

import argparse
import io
from pathlib import Path

from PIL import Image
from PySide6.QtCore import QBuffer, QIODevice, QSize
from PySide6.QtGui import QGuiApplication, QImage, QPainter
from PySide6.QtSvg import QSvgRenderer


def render(renderer, size):
    image = QImage(QSize(size, size), QImage.Format.Format_ARGB32_Premultiplied)
    image.fill(0)
    painter = QPainter(image)
    try:
        renderer.render(painter)
    finally:
        painter.end()
    return image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview', type=Path)
    args = parser.parse_args()
    application = QGuiApplication.instance() or QGuiApplication([])
    assets = Path(__file__).resolve().parent / 'assets'
    renderer = QSvgRenderer(str(assets / 'app-icon.svg'))
    if not renderer.isValid():
        raise RuntimeError('Invalid app-icon.svg')
    buffer = QBuffer()
    buffer.open(QIODevice.OpenModeFlag.WriteOnly)
    if not render(renderer, 256).save(buffer, 'PNG'):
        raise RuntimeError('Could not render the app icon')
    with Image.open(io.BytesIO(bytes(buffer.data()))) as image:
        image.convert('RGBA').save(assets / 'app-icon.ico', format='ICO', sizes=[
            (16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    if args.preview:
        args.preview.parent.mkdir(parents=True, exist_ok=True)
        if not render(renderer, 512).save(str(args.preview), 'PNG'):
            raise RuntimeError('Could not save the icon preview')
    print(assets / 'app-icon.ico')
    return 0 if application else 1


if __name__ == '__main__':
    raise SystemExit(main())
