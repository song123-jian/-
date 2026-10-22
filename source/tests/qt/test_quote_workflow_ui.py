"""Qt interactions for readable tables and continuing a saved quote."""
from PySide6.QtCore import QDate, Qt
from PySide6.QtGui import QPalette
from PySide6.QtWidgets import QApplication

from ui.customer_dialogs import CustomerManagerDialog
from ui.dialogs import HistoryDialog, QuoteDialog
from ui.main_window import MainWindow
from ui.quote_table_model import PRICE_COLUMN
from ui.theme_tokens import COLORS, apply_theme


def open_window(qtbot, context):
    apply_theme(QApplication.instance())
    window = MainWindow(context)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitUntil(lambda: window.loaded and not window.tasks.jobs, timeout=10000)
    return window


def test_saved_window_can_fill_missing_fields_and_continue(qtbot, context):
    window = open_window(qtbot, context)
    dialog = QuoteDialog(window.prices, window.tasks, context.storage_generation, parent=window)
    qtbot.addWidget(dialog)
    dialog.open()
    for key, value in {"customer": "Qt补填客户", "grade": "UI-FILL", "price": "9.734513"}.items():
        dialog.fields[key].setText(value)
    dialog.fields["effective_date"].setDate(QDate(2026, 9, 1))
    with qtbot.waitSignal(dialog.saved, timeout=5000):
        qtbot.mouseClick(dialog.save, Qt.MouseButton.LeftButton)
    assert dialog.isVisible() and dialog.row["id"] and not dialog.fields["color"].isReadOnly()
    assert dialog.fields["tax_type"].isEnabled() and dialog.fields["grade"].isReadOnly()
    dialog.fields["color"].setText("本色")
    dialog.fields["tax_type"].setCurrentText("含税")
    dialog.fields["material"].setText("PA12")
    dialog.fields["note"].setPlainText("保存后补充")
    with qtbot.waitSignal(dialog.saved, timeout=5000):
        qtbot.mouseClick(dialog.save, Qt.MouseButton.LeftButton)
    assert dialog.isVisible() and dialog.fields["color"].isReadOnly() and not dialog.fields["tax_type"].isEnabled()
    current = context.store.list({"customer": "Qt补填客户"})["items"][0]
    assert (current["material"], current["color"], current["tax_type"], current["note"]) == ("PA12", "本色", "含税", "保存后补充")
    assert current["history_count"] == 2 and len({row["identity"] for row in context.store.history(current["id"])["items"]}) == 1
    dialog.fields["price"].setText("12")
    dialog.fields["reason"].setText("继续调价")
    with qtbot.waitSignal(dialog.saved, timeout=5000):
        qtbot.mouseClick(dialog.save, Qt.MouseButton.LeftButton)
    assert context.store.list({"customer": "Qt补填客户"})["items"][0]["price"] == "12"
    dialog.cancel.click()
    assert not dialog.isVisible()
    window.close()
    qtbot.waitUntil(lambda: not window.isVisible(), timeout=5000)


def test_nine_columns_and_selected_text_are_readable(qtbot, context):
    window = open_window(qtbot, context)
    assert window.model.headers == ("客户", "牌号", "材料", "颜色", "价格（元/kg）", "含税 / 未税", "更新日期", "备注", "操作")
    assert window.table.columnWidth(PRICE_COLUMN) >= 120 and window.table.verticalHeader().defaultSectionSize() == 46
    assert window.table.showGrid() and window.table.gridStyle() == Qt.PenStyle.SolidLine
    row = window.model.items[0]
    history = HistoryDialog(context.store.history(row["id"])["items"], window)
    qtbot.addWidget(history)
    history.show()
    history.table.selectRow(0)
    qtbot.wait(10)
    assert history.table.palette().color(QPalette.ColorRole.HighlightedText).name() == COLORS["ink900"]
    assert history.table.palette().color(QPalette.ColorRole.Highlight).name() == COLORS["g100"]
    history.accept()
    manager = CustomerManagerDialog(window.customer_service, window.tasks, context.storage_generation, parent=window)
    qtbot.addWidget(manager)
    manager.show()
    qtbot.waitUntil(lambda: bool(manager.items) and not window.tasks.jobs, timeout=5000)
    manager.table.selectRow(0)
    assert manager.table.palette().color(QPalette.ColorRole.HighlightedText).name() == COLORS["ink900"]
    assert manager.selected() and manager.details_button.isEnabled()
    manager.accept()
    window.close()
    qtbot.waitUntil(lambda: not window.isVisible(), timeout=5000)
