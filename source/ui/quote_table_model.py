"""Readable quote columns and a Decimal-aware proxy retaining stable record IDs."""
from decimal import Decimal

from PySide6.QtCore import QAbstractTableModel, QModelIndex, QSortFilterProxyModel, Qt
from PySide6.QtGui import QColor

from domain import display_price

from .theme_tokens import COLORS, font

ROW_ROLE = Qt.ItemDataRole.UserRole + 1
SORT_ROLE = Qt.ItemDataRole.UserRole + 2
PRICE_COLUMN = 4
DATE_COLUMN = 6
ACTION_COLUMN = 8


class QuoteTableModel(QAbstractTableModel):
    headers = ("客户", "牌号", "材料", "颜色", "价格（元/kg）", "含税 / 未税", "更新日期", "备注", "操作")

    def __init__(self, parent=None):
        super().__init__(parent)
        self.items = []

    def set_items(self, items):
        self.beginResetModel()
        self.items = [dict(item) for item in items]
        self.endResetModel()

    def rowCount(self, parent=QModelIndex()):
        return 0 if parent.isValid() else len(self.items)

    def columnCount(self, parent=QModelIndex()):
        return 0 if parent.isValid() else len(self.headers)

    def headerData(self, section, orientation, role=Qt.ItemDataRole.DisplayRole):
        if orientation == Qt.Orientation.Horizontal and role == Qt.ItemDataRole.DisplayRole:
            return self.headers[section]
        return super().headerData(section, orientation, role)

    def data(self, index, role=Qt.ItemDataRole.DisplayRole):
        if not index.isValid() or not 0 <= index.row() < len(self.items):
            return None
        row, column = self.items[index.row()], index.column()
        if role == ROW_ROLE:
            return row
        if role == SORT_ROLE:
            return (row["customer"], row["grade"], row["material"], row["color"], row["price"], row["tax_type"], row["effective_date"], row["note"], row["history_count"])[column]
        if role == Qt.ItemDataRole.DisplayRole:
            return (row["customer"], row["grade"], row["material"], row["color"] or "—",
                    display_price(row["price"]), row["tax_type"], row["effective_date"], row["note"],
                    f"价格历史（{row['history_count']}）\n更新价格")[column]
        if role == Qt.ItemDataRole.ToolTipRole:
            if column == DATE_COLUMN:
                return row["effective_date"] + ("\n待生效" if row["scheduled"] else "\n当前报价") + ("\n超过60天未更新" if row["stale"] else "")
            return self.data(index)
        if role == Qt.ItemDataRole.TextAlignmentRole:
            return int(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter) if column == PRICE_COLUMN else int(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
        if role == Qt.ItemDataRole.FontRole:
            return font(15, True, True) if column == PRICE_COLUMN else font(13)
        if role == Qt.ItemDataRole.ForegroundRole:
            return QColor(COLORS["price"] if column == PRICE_COLUMN else COLORS["ink700"])
        return None


class QuoteProxyModel(QSortFilterProxyModel):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setSortRole(SORT_ROLE)

    def lessThan(self, left, right):
        lhs, rhs = left.data(SORT_ROLE), right.data(SORT_ROLE)
        if left.column() == PRICE_COLUMN:
            return Decimal(lhs) < Decimal(rhs)
        return lhs < rhs


class HistoryTableModel(QAbstractTableModel):
    headers = ("业务日期 / 状态", "价格（元/kg）", "较上一条", "原因 / 备注", "录入时间 / 来源")

    def __init__(self, items, parent=None):
        super().__init__(parent)
        self.items = items

    def rowCount(self, parent=QModelIndex()):
        return 0 if parent.isValid() else len(self.items)

    def columnCount(self, parent=QModelIndex()):
        return 0 if parent.isValid() else len(self.headers)

    def headerData(self, section, orientation, role=Qt.ItemDataRole.DisplayRole):
        if orientation == Qt.Orientation.Horizontal and role == Qt.ItemDataRole.DisplayRole:
            return self.headers[section]
        return super().headerData(section, orientation, role)

    def data(self, index, role=Qt.ItemDataRole.DisplayRole):
        if not index.isValid():
            return None
        row, column = self.items[index.row()], index.column()
        delta = row.get("delta")
        delta_text = "首条记录" if delta is None else ("▲ +" + delta if Decimal(delta) > 0 else "▼ " + delta if Decimal(delta) < 0 else "持平 0")
        state = "待生效" if row["scheduled"] else "当前价" if row["is_current"] else "历史价"
        origin = f"{row['source_file']} · {row['source_sheet']} · 第{row['source_row']}行" if row["source_file"] else "手工录入"
        values = (row["effective_date"] + "\n" + state, display_price(row["price"]), delta_text,
                  (row["reason"] or "原始报价") + "\n" + row["note"], row["created_at"] + "\n" + origin)
        if role in (Qt.ItemDataRole.DisplayRole, Qt.ItemDataRole.ToolTipRole):
            return values[column]
        if role == ROW_ROLE:
            return row
        if role == Qt.ItemDataRole.TextAlignmentRole:
            return int(Qt.AlignmentFlag.AlignVCenter | (Qt.AlignmentFlag.AlignRight if column in (1, 2) else Qt.AlignmentFlag.AlignLeft))
        if role == Qt.ItemDataRole.FontRole:
            return font(13, column == 1, column in (1, 2))
        if role == Qt.ItemDataRole.ForegroundRole:
            if column == 2 and delta is not None and Decimal(delta) != 0:
                return QColor(COLORS["up" if Decimal(delta) > 0 else "down"])
            return QColor(COLORS["price"] if column == 1 else COLORS["ink700"])
        return None
