"""Real business dates and exact Decimal labels; floats only for coordinates."""
import datetime as dt
from decimal import Decimal

from PySide6.QtCore import QPointF, QRectF, Qt
from PySide6.QtGui import QColor, QPainter, QPen
from PySide6.QtWidgets import QToolTip, QWidget

from domain import display_price

from .theme_tokens import COLORS, font


class TrendWidget(QWidget):
    def __init__(self, items, parent=None):
        super().__init__(parent)
        self.items = sorted(items, key=lambda row: (row["effective_date"], row["id"]))
        self.points = []
        self.setMinimumHeight(170)
        self.setMouseTracking(True)
        self.setAccessibleName("真实价格历史趋势，准确数值见下方历史表")

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.fillRect(self.rect(), QColor(COLORS["g50"]))
        painter.setFont(font(11, mono=True))
        self.points = []
        if not self.items:
            painter.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter, "没有历史记录")
            return
        prices = [Decimal(row["price"]) for row in self.items]
        low, high = min(prices), max(prices)
        axis_width = max(painter.fontMetrics().horizontalAdvance(format(value, "f")) for value in (low, high)) + 10
        area = QRectF(axis_width + 12, 22, max(20, self.width() - axis_width - 52), max(40, self.height() - 65))
        spread = high - low
        span = spread or max(abs(low) * Decimal("0.05"), Decimal("0.01"))
        lower, upper = low - span * Decimal("0.2"), high + span * Decimal("0.2")
        dates = [dt.date.fromisoformat(row["effective_date"]).toordinal() for row in self.items]
        first, last = min(dates), max(dates)
        painter.setPen(QPen(QColor(COLORS["line"]), 1))
        for y in (area.top(), area.center().y(), area.bottom()):
            painter.drawLine(QPointF(area.left(), y), QPointF(area.right(), y))
        painter.setPen(QColor(COLORS["ink500"]))
        for value in {low, high}:
            y = area.bottom() - float((value - lower) / (upper - lower)) * area.height()
            painter.drawText(QRectF(0, y - 10, axis_width, 20), Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter, format(value, "f"))
        dates_seen = {}
        date_counts = {day: dates.count(day) for day in set(dates)}
        for row, day, value in zip(self.items, dates, prices):
            x = area.center().x() if first == last else area.left() + (day - first) / (last - first) * area.width()
            offset = dates_seen.get(day, 0)
            dates_seen[day] = offset + 1
            x += (offset - (date_counts[day] - 1) / 2) * min(6, area.width() / max(len(self.items), 1))
            x = min(area.right(), max(area.left(), x))
            y = area.bottom() - float((value - lower) / (upper - lower)) * area.height()
            point = QPointF(x, y)
            if self.points:
                painter.setPen(QPen(QColor(COLORS["g700"]), 1.8, Qt.PenStyle.DashLine if row["scheduled"] else Qt.PenStyle.SolidLine))
                painter.drawLine(self.points[-1][0], point)
            painter.setPen(Qt.PenStyle.NoPen)
            painter.setBrush(QColor(COLORS["future" if row["scheduled"] else "g700"]))
            painter.drawEllipse(point, 4, 4)
            if len(self.items) <= 6:
                painter.setPen(QColor(COLORS["price"]))
                price_text = display_price(row["price"])
                label_width = painter.fontMetrics().horizontalAdvance(price_text) + 12
                label_x = min(self.width() - label_width - 4, max(4, x - label_width / 2))
                painter.drawText(QRectF(label_x, y - 25, label_width, 20), Qt.AlignmentFlag.AlignCenter, price_text)
            self.points.append((point, row))
        painter.setPen(QColor(COLORS["ink500"]))
        painter.drawText(QRectF(area.left(), area.bottom() + 13, 120, 22), self.items[0]["effective_date"])
        if first != last:
            painter.drawText(QRectF(area.right() - 120, area.bottom() + 13, 120, 22), Qt.AlignmentFlag.AlignRight, self.items[-1]["effective_date"])
        if len(self.items) == 1:
            painter.drawText(QRectF(area.center().x() - 110, area.bottom() + 13, 220, 22), Qt.AlignmentFlag.AlignCenter, "只有一条真实报价记录")

    def mouseMoveEvent(self, event):
        nearest = min(self.points, key=lambda entry: (entry[0] - event.position()).manhattanLength(), default=None)
        if nearest and (nearest[0] - event.position()).manhattanLength() < 18:
            row = nearest[1]
            state = "待生效" if row["scheduled"] else "当前价" if row["is_current"] else "历史价"
            QToolTip.showText(event.globalPosition().toPoint(), f"{row['effective_date']} · {display_price(row['price'])} 元/kg\n{state} · 录入顺序 #{row['id']}", self)
        else:
            QToolTip.hideText()
