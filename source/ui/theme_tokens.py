"""The 松烟绿 design palette; all painter and QSS colors share these tokens."""
from functools import lru_cache
from pathlib import Path

from PySide6.QtGui import QFont, QFontDatabase
from PySide6.QtSvg import QSvgRenderer  # noqa: F401 - load SVG engine before QIcon construction
from PySide6.QtWidgets import QApplication

COLORS = {
    "g900": "#202e28", "g850": "#26382f", "g800": "#2f4a3e",
    "g700": "#2f6b54", "g600": "#285a47", "g500": "#234f3e",
    "g200": "#b9d6c7", "g100": "#e8f2ec", "g50": "#f3f8f5",
    "ink900": "#202e28", "ink700": "#44534a", "ink500": "#5e6e64",
    "ink400": "#7f8e84", "ink300": "#aab8af", "bg": "#eef3ef", "card": "#ffffff",
    "line": "#c7d3cb", "lineStrong": "#aebeb4", "price": "#1d5a42",
    "tableGrid": "#718879", "tableHeader": "#e5eee8",
    "up": "#b0442d", "upBg": "#f8ece8", "down": "#2c8357", "downBg": "#e7f3ec",
    "future": "#97651a", "futureBg": "#faf0d8", "danger": "#a23b2c", "dangerBg": "#fbeeea",
    "success": "#2d6943", "successBg": "#e9f3ec", "successLine": "#c9e2d3",
    "taxExBg": "#edf1ef", "taxEx": "#4a5f55", "taxUnknownBg": "#eef1ef", "taxUnknown": "#627068",
    "buttonHoverLine": "#8fa99a", "errorLine": "#efc9c1", "sidebarSelectedLine": "#486557",
    "sidebarBadge": "#3a5447", "sidebarLine": "#385043", "sidebarText": "#cfe0d6",
    "sidebarMuted": "#93ab9d", "ready": "#6fc79b",
}
SIZES = {"radius_panel": 12, "radius_control": 8, "radius_badge": 6, "row_height": 64}


@lru_cache(maxsize=40)
def font(size=13, bold=False, mono=False):
    candidates = ("Consolas", "Cascadia Mono", "Courier New") if mono else ("Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI")
    available = set(QFontDatabase.families())
    result = QFont(next((name for name in candidates if name in available), candidates[-1]))
    result.setPixelSize(size)
    result.setBold(bold)
    return result


@lru_cache(maxsize=1)
def form_font():
    """Quote forms explicitly prefer 微软雅黑 over Microsoft YaHei UI."""
    result = QFont(font())
    available = set(QFontDatabase.families())
    for name in ("Microsoft YaHei", "Microsoft YaHei UI", "Segoe UI"):
        if name in available:
            result.setFamily(name)
            break
    return result


def apply_theme(app: QApplication):
    from PySide6.QtCore import QFile, QIODevice

    from . import resources_rc  # noqa: F401
    resource = QFile(":/theme.qss")
    if resource.open(QIODevice.OpenModeFlag.ReadOnly):
        theme = bytes(resource.readAll()).decode("utf-8")
    else:
        theme = Path(__file__).with_name("theme.qss").read_text(encoding="utf-8")
    for name, color in COLORS.items():
        theme = theme.replace("{{" + name + "}}", color)
    app.setFont(font())
    app.setStyle("Fusion")
    app.setStyleSheet(theme)
