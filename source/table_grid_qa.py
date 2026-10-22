"""Isolated actual Qt window acceptance for all seven business table grids."""
from __future__ import annotations

import json

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QColor
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

from qa_runner import PackagedSmoke
from services.inventory_service import InventoryPage, ReservePage
from ui.customer_dialogs import CustomerManagerDialog
from ui.dialogs import HistoryDialog, ImportPreviewDialog
from ui.inventory_dialog import InventoryDialog
from ui.quote_table_model import PRICE_COLUMN
from ui.theme_tokens import COLORS


class GridInventoryFixture:
    """Controlled rendering input; substitutes MES HTTP only in isolated QA."""

    def __init__(self):
        self.logged_in = False

    def login(self, username, password):
        self.logged_in = True
        return {"message": "网格验收受控样例"}

    def query(self, grade, page, *, search_by="material_code"):
        rows = tuple({"grade": "QA-AG6", "material": "PA6+GF30", "batch": f"GRID-{i:03}", "stock": "123.45",
                      "available": "100", "unit": "kg", "customer_code": "QA-CUSTOMER", "warehouse": "110-1064",
                      "site": "QA-01", "stock_date": "2026-10-11 08:30:05", "updated_date": "2026-10-11 09:30:10"}
                     for i in range(4))
        return InventoryPage(grade, page, 100, len(rows), rows, "受控样例", search_by)

    def query_reserve(self, batch, page):
        rows = tuple({"grade": "QA-AG6", "batch": batch, "stock": "88.5", "customer_code": "QA-CUSTOMER",
                      "stock_date": "2026-10-11 08:30:05", "delivery_date": "2026-10-20", "customer": "网格验收客户",
                      "quality": "合格", "quality_description": "渲染验收", "salesperson": "样例业务员",
                      "salesperson_code": "QA-01", "customer_tag": "QA.TAG", "warehouse": "110-1064"}
                     for _ in range(3))
        return ReservePage(batch, page, 100, len(rows), rows, "受控样例")

    def logout(self):
        self.logged_in = False

    def close(self):
        self.logout()


class PackagedTableGridSmoke(PackagedSmoke):
    def __init__(self, window, output):
        super().__init__(window, output)
        marker = json.loads((window.context.folder / "acceptance-table-grid.json").read_text(encoding="utf-8"))
        self.restart = bool(marker.get("restart"))
        self.inventory_only = bool(marker.get("inventory_only"))
        self.report.update(restart=self.restart, inventory_input="controlled fixture; MES HTTP replaced",
                           production_or_cloud_writes=False, tables={}, inventory_only=self.inventory_only)

    def baseline(self):
        assert self.window.loaded and self.window.context.store.backend == "sqlite"
        self.before = (self.window.context.store.all(), self.window.context.store.customer_states())
        assert self.window.table.columnWidth(PRICE_COLUMN) == (150 if self.restart else 120)
        self.report["checks"]["price_width_first_or_cross_process_persisted"] = True
        if self.inventory_only:
            self.open_inventory()
            return
        self.window.resize(1440, 860)
        QTimer.singleShot(100, lambda: self.safe(self.main_grid))

    def grid(self, table, name):
        assert table.isVisible() and table.model().rowCount() > 0, name
        assert table.showGrid() and table.gridStyle() == Qt.PenStyle.SolidLine, name
        table.selectRow(0)
        table.setFocus()
        QApplication.processEvents()
        viewport = table.viewport().grab().toImage()
        rect = table.visualRect(table.model().index(0, 0))
        ratio = viewport.devicePixelRatio()
        expected = QColor(COLORS["tableGrid"]).rgb()

        def near(image, x, y, vertical):
            hits = 0
            # Check every physical pixel; logical steps can skip the 1px grid
            # at fractional scale factors such as 150%.
            cx, cy = round(x * ratio), round(y * ratio)
            for offset in range(-4, 5):
                for shift in range(-round(12 * ratio), round(12 * ratio) + 1):
                    px, py = ((cx + offset, cy + shift) if vertical else (cx + shift, cy + offset))
                    if 0 <= px < image.width() and 0 <= py < image.height() and image.pixelColor(px, py).rgb() == expected:
                        hits += 1
            return hits >= 8

        assert near(viewport, rect.right() + 1, rect.center().y(), True), name + " vertical cell grid"
        assert near(viewport, rect.center().x(), rect.bottom() + 1, False), name + " horizontal cell grid"
        header = table.horizontalHeader()
        header_image = header.viewport().grab().toImage()
        assert near(header_image, header.sectionViewportPosition(0) + header.sectionSize(0) - 1, header.height() // 2, True), name + " header divider"
        assert near(header_image, header.sectionViewportPosition(0) + header.sectionSize(0) // 2, header.height() - 1, False), name + " header bottom"
        self.report["tables"][name] = {"rows": table.model().rowCount(), "columns": table.model().columnCount(),
                                      "solid_grid": True, "horizontal_pixels": True, "vertical_pixels": True,
                                      "header_divider_pixels": True, "selected_row_checked": True}

    def main_grid(self):
        self.grid(self.window.table, "quote")
        self.capture(self.window, "main-grid.png")
        self.window.resize(960, 640)
        QTimer.singleShot(80, lambda: self.safe(self.compact_grid))

    def compact_grid(self):
        self.grid(self.window.table, "quote")
        assert self.window.table.horizontalScrollBar().maximum() > 0 and self.window.search_button.isVisible()
        self.capture(self.window, "compact-grid.png")
        self.report["checks"]["compact_horizontal_scroll_and_grid"] = True
        self.window.resize(1440, 860)
        row = self.window.selected()
        self.dialog = HistoryDialog(self.window.context.store.history(row["id"])["items"], self.window)
        self.window.show_dialog(self.dialog)
        QTimer.singleShot(80, lambda: self.safe(self.history_grid))

    def history_grid(self):
        self.grid(self.dialog.table, "history")
        self.capture(self.dialog, "history-grid.png")
        self.dialog.accept()
        self.manager = CustomerManagerDialog(self.window.customer_service, self.window.tasks,
                                             self.window.context.storage_generation, parent=self.window)
        self.window.show_dialog(self.manager)
        self.await_idle(self.manager_grid)

    def manager_grid(self):
        self.grid(self.manager.table, "customer_manager")
        self.capture(self.manager, "customer-manager-grid.png")
        QTest.mouseClick(self.manager.details_button, Qt.MouseButton.LeftButton)
        self.await_idle(lambda: QTimer.singleShot(80, lambda: self.safe(self.detail_grid)))

    def detail_grid(self):
        detail = self.manager.detail_dialog
        self.grid(detail.table, "customer_detail")
        self.capture(detail, "customer-detail-grid.png")
        detail.accept()
        self.manager.accept()
        path = self.window.context.folder / "grid-preview.csv"
        path.write_text("客户,牌号,材料,颜色,价格,税口径,备注\n网格验收客户,QA-GRID-1,PA6,黑色,12.123456,含税,仅预览\n"
                        "网格验收客户,QA-GRID-2,PP,本色,9.5,未税,仅预览\n", encoding="utf-8")
        preview = self.window.prices.preview_import(path, self.window.context.storage_generation)
        assert preview["error_count"] == 0 and preview["total"] == 2
        self.dialog = ImportPreviewDialog(preview, self.window.prices, self.window.tasks, self.window)
        self.window.show_dialog(self.dialog)
        QTimer.singleShot(80, lambda: self.safe(self.import_grid))

    def import_grid(self):
        self.grid(self.dialog.table, "import_preview")
        self.capture(self.dialog, "import-preview-grid.png")
        QTest.mouseClick(self.dialog.cancel, Qt.MouseButton.LeftButton)
        self.open_inventory()

    def open_inventory(self):
        self.inventory = InventoryDialog(parent=self.window, service=GridInventoryFixture())
        self.window.show_dialog(self.inventory)
        self.inventory.username.setText("grid-render-qa")
        self.inventory.password.setText("grid-render-qa")
        QTest.keyClick(self.inventory.password, Qt.Key.Key_Return)
        self.inventory_idle(self.inventory_login)

    def inventory_idle(self, continuation):
        if not self.finished:
            if self.inventory.tasks.jobs:
                QTimer.singleShot(30, lambda: self.inventory_idle(continuation))
            else:
                QTimer.singleShot(60, lambda: self.safe(continuation))

    def inventory_login(self):
        assert self.inventory.service.logged_in
        self.inventory.grade.setText("QA-AG6")
        QTest.keyClick(self.inventory.grade, Qt.Key.Key_Return)
        self.inventory_idle(self.inventory_grid)

    def inventory_grid(self):
        self.grid(self.inventory.table, "inventory")
        self.capture(self.inventory, "inventory-grid.png")
        QTest.mouseClick(self.inventory.reserve_selected_button, Qt.MouseButton.LeftButton)
        self.inventory_idle(self.reserve_grid)

    def reserve_grid(self):
        self.grid(self.inventory.reserve_table, "reserve")
        self.capture(self.inventory, "reserve-grid.png")
        self.inventory.reserve_table.horizontalScrollBar().setValue(self.inventory.reserve_table.horizontalScrollBar().maximum())
        QTimer.singleShot(80, lambda: self.safe(self.reserve_right))

    def reserve_right(self):
        table = self.inventory.reserve_table
        assert table.visualItemRect(table.item(0, 12)).intersects(table.viewport().rect())
        self.capture(self.inventory, "reserve-grid-right.png")
        self.inventory.reject()
        assert len(self.report["tables"]) == (2 if self.inventory_only else 7)
        assert (self.window.context.store.all(), self.window.context.store.customer_states()) == self.before
        self.report["checks"].update(affected_tables_pixels=True, ledger_unchanged=True, reserve_right_columns_visible=True)
        if not self.restart:
            self.window.table.setColumnWidth(PRICE_COLUMN, 150)
        self.report["status"] = "passed"
        self.write_report()
        self.finished = True
        self.timeout.stop()
        self.window.close()
