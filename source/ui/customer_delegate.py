"""Keep customer names and specification counts inside the directory viewport."""
from PySide6.QtCore import QRect, QSize, Qt
from PySide6.QtGui import QColor, QPen
from PySide6.QtWidgets import QStyle, QStyledItemDelegate

from .theme_tokens import COLORS

COUNT_ROLE = Qt.ItemDataRole.UserRole + 2


class CustomerDelegate(QStyledItemDelegate):
    def sizeHint(self, option, index):
        # A long name must never request a wider item or horizontal scrolling.
        return QSize(0, 42)

    @staticmethod
    def text_rects(option, count):
        inner = option.rect.adjusted(10, 0, -10, 0)
        metrics = option.fontMetrics
        badge_width = max(28, metrics.horizontalAdvance(str(count)) + 14)
        badge = QRect(inner.right() - badge_width + 1, inner.center().y() - 11, badge_width, 22)
        name = QRect(inner.left(), inner.top(), max(0, inner.width() - badge_width - 8), inner.height())
        return name, badge

    def paint(self, painter, option, index):
        painter.save()
        selected = bool(option.state & QStyle.StateFlag.State_Selected)
        hover = bool(option.state & QStyle.StateFlag.State_MouseOver)
        row_rect = option.rect.adjusted(0, 2, -1, -2)
        painter.setRenderHint(painter.RenderHint.Antialiasing)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor(COLORS["g800" if selected else "g850" if hover else "g900"]))
        painter.drawRoundedRect(row_rect, 8, 8)
        if option.state & QStyle.StateFlag.State_HasFocus:
            painter.setBrush(Qt.BrushStyle.NoBrush)
            painter.setPen(QPen(QColor(COLORS["sidebarSelectedLine"]), 1))
            painter.drawRoundedRect(row_rect.adjusted(1, 1, -1, -1), 8, 8)
        painter.setFont(option.font)
        count = index.data(COUNT_ROLE) or 0
        name_rect, badge = self.text_rects(option, count)
        painter.setPen(QColor("white" if selected else COLORS["sidebarText"]))
        name = option.fontMetrics.elidedText(str(index.data() or ""), Qt.TextElideMode.ElideRight, name_rect.width())
        painter.drawText(name_rect, Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft, name)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor(COLORS["sidebarBadge" if selected else "g850"]))
        painter.drawRoundedRect(badge, 6, 6)
        painter.setPen(QColor(COLORS["sidebarText" if selected else "sidebarMuted"]))
        painter.drawText(badge, Qt.AlignmentFlag.AlignCenter, str(count))
        painter.restore()
