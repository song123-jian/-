"""Desktop dialog implementation module."""
from __future__ import annotations

import json

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QGuiApplication, QKeySequence, QShortcut
from PySide6.QtWidgets import QAbstractItemView, QPlainTextEdit, QTableView

from domain import display_price

from .dialog_base import BaseDialog, button, label
from .quote_table_model import ROW_ROLE, HistoryTableModel
from .trend_widget import TrendWidget


class HistoryDialog(BaseDialog):
    editRequested = Signal(int)

    def __init__(self, items, parent=None):
        super().__init__("价格历史", 1160, 720, parent)
        row = items[0]
        current = next((item for item in items if item["is_current"]), row)
        self.content.insertWidget(0, label("价格历史", "title"))
        subtitle = label(f"{row['customer']}  /  {row['grade']}  ·  {row['material']}  ·  {row['color'] or '未注明颜色'}  ·  {row['tax_type']}")
        subtitle.setWordWrap(True)
        self.content.addWidget(subtitle)
        self.content.addWidget(label(f"{'待生效报价' if current['scheduled'] else '当前价'}  {display_price(current['price'])} 元/kg   ·   {current['effective_date']}", "heading"))
        self.trend = TrendWidget(items)
        self.content.addWidget(self.trend)
        self.table = QTableView()
        self.table.setObjectName("HistoryTable")
        self.model = HistoryTableModel(items, self)
        self.table.setModel(self.model)
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setShowGrid(True)
        self.table.setGridStyle(Qt.PenStyle.SolidLine)
        self.table.setWordWrap(False)
        self.table.verticalHeader().hide()
        self.table.verticalHeader().setDefaultSectionSize(62)
        for column, width in enumerate((150, 180, 180, 230, 290)):
            self.table.setColumnWidth(column, width)
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.setMinimumHeight(210)
        self.content.addWidget(self.table, 1)
        self.content.addWidget(label(f"共 {len(items)} 条历史记录 · 来源及完整内容见记录详情", "muted"))
        self.table.doubleClicked.connect(self.details)
        self.copy_shortcut = QShortcut(QKeySequence.StandardKey.Copy, self.table)
        self.copy_shortcut.activated.connect(self.copy_row)
        self.footer.addWidget(button("复制记录", self.copy_row))
        self.footer.addWidget(button("更新价格", lambda: self.editRequested.emit(current["id"]), True))
        self.footer.addWidget(button("关闭", self.accept))

    def selected(self):
        index = self.table.currentIndex()
        return index.data(ROW_ROLE) if index.isValid() else None

    def copy_row(self):
        row = self.selected()
        if row:
            QGuiApplication.clipboard().setText(json.dumps(row, ensure_ascii=False, indent=2))

    def details(self):
        row = self.selected()
        if row:
            dialog = BaseDialog("历史记录详情", 680, 580, self)
            text = QPlainTextEdit()
            text.setReadOnly(True)
            text.setPlainText(json.dumps(row, ensure_ascii=False, indent=2))
            dialog.content.addWidget(text, 1)
            dialog.footer.addWidget(button("关闭", dialog.accept))
            dialog.exec()
