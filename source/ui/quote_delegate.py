"""Paint dense quote rows; actions emit IDs, never view row positions."""
from PySide6.QtCore import QEvent, QRect, Qt, Signal
from PySide6.QtGui import QColor, QPen
from PySide6.QtWidgets import QStyle, QStyledItemDelegate

from .quote_table_model import ACTION_COLUMN, DATE_COLUMN, PRICE_COLUMN, ROW_ROLE
from .theme_tokens import COLORS, font


class QuoteDelegate(QStyledItemDelegate):
    historyRequested = Signal(int)
    editRequested = Signal(int)

    @staticmethod
    def action_rects(rect):
        width = max(1, (rect.width() - 12) * 3 // 5)
        return (QRect(rect.left() + 4, rect.top() + 4, width, rect.height() - 8),
                QRect(rect.left() + width + 8, rect.top() + 4, rect.width() - width - 12, rect.height() - 8))

    def paint(self, painter, option, index):
        row = index.data(ROW_ROLE)
        if not row:
            return
        painter.save()
        selected = bool(option.state & QStyle.StateFlag.State_Selected)
        hover = bool(option.state & QStyle.StateFlag.State_MouseOver)
        painter.fillRect(option.rect, QColor(COLORS["g100" if selected else "g50" if hover else "card"]))
        if option.state & QStyle.StateFlag.State_HasFocus:
            painter.setPen(QPen(QColor(COLORS["g700"]), 1))
            painter.drawRect(option.rect.adjusted(1, 1, -1, -1))
        rect, col = option.rect.adjusted(8, 0, -8, 0), index.column()

        def text(value, target, color="ink700", size=13, bold=False, mono=False, align=Qt.AlignmentFlag.AlignLeft):
            painter.setFont(font(size, bold, mono))
            painter.setPen(QColor(COLORS[color]))
            value = painter.fontMetrics().elidedText(str(value), Qt.TextElideMode.ElideRight, target.width())
            painter.drawText(target, int(align | Qt.AlignmentFlag.AlignVCenter), value)

        if col == 0:
            text(row["customer"], rect)
        elif col == 1:
            text(row["grade"], rect, "price", 13, True)
        elif col == 2:
            text(row["material"] or "—", rect)
        elif col == 3:
            text(row["color"] or "—", rect)
        elif col == PRICE_COLUMN:
            text(index.data(), rect, "price", 15, True, True, Qt.AlignmentFlag.AlignRight)
        elif col == 5:
            bg, ink = {"含税": ("g100", "g600"), "未税": ("taxExBg", "taxEx"), "未注明": ("taxUnknownBg", "taxUnknown")}[row["tax_type"]]
            badge = QRect(rect.left(), rect.center().y() - 13, min(rect.width(), 72), 26)
            painter.setPen(Qt.PenStyle.NoPen)
            painter.setBrush(QColor(COLORS[bg]))
            painter.drawRoundedRect(badge, 6, 6)
            text(row["tax_type"], badge, ink, 11, align=Qt.AlignmentFlag.AlignCenter)
        elif col == DATE_COLUMN:
            text(row["effective_date"], rect, "future" if row["scheduled"] or row["stale"] else "ink700", 12, mono=True)
        elif col == 7:
            text(row["note"] or "—", rect)
        else:
            first, second = self.action_rects(option.rect)
            text(f"历史({row['history_count']})", first, "g700", 12)
            text("更新", second, "g700", 12)
        painter.restore()

    def editorEvent(self, event, model, option, index):
        if index.column() != ACTION_COLUMN or event.type() != QEvent.Type.MouseButtonRelease or event.button() != Qt.MouseButton.LeftButton:
            return False
        row = index.data(ROW_ROLE)
        first, second = self.action_rects(option.rect)
        position = event.position().toPoint()
        if first.contains(position):
            self.historyRequested.emit(row["id"])
            return True
        if second.contains(position):
            self.editRequested.emit(row["id"])
            return True
        return False
