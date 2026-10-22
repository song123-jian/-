"""Focused Qt rendering and saved-layout migration checks for table borders."""
from PySide6.QtCore import QSettings, Qt
from PySide6.QtGui import QColor
from PySide6.QtWidgets import QApplication

from services.app_context import AppContext
from storage.sqlite_store import SQLiteStore
from ui.customer_dialogs import CustomerDetailDialog, CustomerManagerDialog
from ui.dialogs import HistoryDialog, ImportPreviewDialog
from ui.inventory_dialog import InventoryDialog
from ui.main_window import MainWindow
from ui.quote_table_model import PRICE_COLUMN
from ui.theme_tokens import COLORS, apply_theme


def open_main(qtbot, context):
    apply_theme(QApplication.instance())
    window = MainWindow(context)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitUntil(lambda: window.loaded and not window.tasks.jobs, timeout=5000)
    return window


def close_main(qtbot, window):
    window.close()
    qtbot.waitUntil(lambda: not window.isVisible(), timeout=5000)


def test_old_user_widths_migrate_once_and_new_resize_persists(qtbot, context):
    window = open_main(qtbot, context)
    window.table.setColumnWidth(1, 248)
    window.table.setColumnWidth(2, 132)
    window.table.setColumnWidth(PRICE_COLUMN, 210)
    old_columns = window.table.horizontalHeader().saveState()
    close_main(qtbot, window)
    settings = QSettings(str(context.folder / "ui.ini"), QSettings.Format.IniFormat)
    settings.remove("columns-v164")
    settings.setValue("columns-v160", old_columns)
    settings.sync()
    migrated = open_main(qtbot, AppContext(SQLiteStore(context.folder), context.folder))
    assert migrated.table.columnWidth(1) == 248 and migrated.table.columnWidth(2) == 132
    assert migrated.table.columnWidth(PRICE_COLUMN) == 140
    migrated.table.setColumnWidth(PRICE_COLUMN, 60)
    assert migrated.table.columnWidth(PRICE_COLUMN) == 120
    migrated.table.setColumnWidth(PRICE_COLUMN, 150)
    close_main(qtbot, migrated)
    reopened = open_main(qtbot, AppContext(SQLiteStore(context.folder), context.folder))
    assert reopened.table.columnWidth(PRICE_COLUMN) == 150
    assert reopened.table.columnWidth(1) == 248
    close_main(qtbot, reopened)


def test_seven_business_tables_render_horizontal_and_vertical_grid(qtbot, context, tmp_path):
    window = open_main(qtbot, context)
    tables = {"quote": window.table}
    row = window.model.items[0]
    history = HistoryDialog(context.store.history(row["id"])["items"], window)
    qtbot.addWidget(history)
    history.show()
    tables["history"] = history.table
    history.accept()
    manager = CustomerManagerDialog(window.customer_service, window.tasks, context.storage_generation, parent=window)
    qtbot.addWidget(manager)
    manager.show()
    qtbot.waitUntil(lambda: bool(manager.items) and not window.tasks.jobs, timeout=5000)
    tables["customer_manager"] = manager.table
    detail = CustomerDetailDialog(context.store.customer_details(manager.items[0]["customer_key"]), manager)
    qtbot.addWidget(detail)
    detail.show()
    tables["customer_detail"] = detail.table
    detail.accept()
    manager.accept()
    path = tmp_path / "grid-preview.csv"
    path.write_text("客户,牌号,材料,颜色,价格,税口径\n网格预览客户,GRID-PP,PP,本色,12,含税\n", encoding="utf-8")
    preview = window.prices.preview_import(path, context.storage_generation)
    dialog = ImportPreviewDialog(preview, window.prices, window.tasks, window)
    qtbot.addWidget(dialog)
    dialog.show()
    tables["import_preview"] = dialog.table
    dialog.reject()
    inventory = InventoryDialog(parent=window)
    qtbot.addWidget(inventory)
    inventory.show()
    tables.update(inventory=inventory.table, reserve=inventory.reserve_table)
    for name, table in tables.items():
        assert table.showGrid() and table.gridStyle() == Qt.PenStyle.SolidLine, name
    inventory.reject()
    assert COLORS["tableGrid"] == "#718879"
    assert "gridline-color: " + COLORS["tableGrid"] in QApplication.instance().styleSheet()
    assert "border-right: 1px solid " + COLORS["tableGrid"] in QApplication.instance().styleSheet()
    window.table.selectRow(0)
    qtbot.wait(10)
    image = window.table.viewport().grab().toImage()
    rect = window.table.visualRect(window.proxy.index(0, 0))
    ratio = image.devicePixelRatio()
    grid = QColor(COLORS["tableGrid"])
    def matches(x, y):
        return image.pixelColor(round(x * ratio), round(y * ratio)).rgb() == grid.rgb()
    assert any(matches(rect.right() + dx, rect.center().y()) for dx in range(3))
    assert any(matches(rect.center().x(), rect.bottom() + dy) for dy in range(3))
    close_main(qtbot, window)
