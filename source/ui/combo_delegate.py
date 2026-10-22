"""Bounded popup rows for long material/customer names."""
from PySide6.QtCore import QSize, Qt
from PySide6.QtWidgets import QAbstractItemView, QStyledItemDelegate


class ElidedComboDelegate(QStyledItemDelegate):
    def sizeHint(self, option, index):
        return QSize(0, max(32, option.fontMetrics.height() + 12))

    def paint(self, painter, option, index):
        option.textElideMode = Qt.TextElideMode.ElideRight
        super().paint(painter, option, index)


def configure_combo_popup(combo):
    view = combo.view()
    view.setItemDelegate(ElidedComboDelegate(view))
    view.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
    view.setVerticalScrollMode(QAbstractItemView.ScrollMode.ScrollPerPixel)
    view.setTextElideMode(Qt.TextElideMode.ElideRight)
    view.setUniformItemSizes(True)
    return combo
