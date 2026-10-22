"""Real application acceptance, guarded by an isolated workflow marker."""
from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
import traceback
from pathlib import Path
from unittest.mock import patch

from PySide6.QtCore import QDate, Qt, QTimer
from PySide6.QtGui import QGuiApplication, QImage, QPalette
from PySide6.QtTest import QTest

from domain import today
from qa_runner import PackagedSmoke
from ui.customer_dialogs import CustomerManagerDialog
from ui.dialogs import HistoryDialog, ImportPreviewDialog, PdfImportOptionsDialog, QuoteDialog
from ui.quote_table_model import ACTION_COLUMN, PRICE_COLUMN, ROW_ROLE
from ui.theme_tokens import COLORS


class PackagedQuoteWorkflowSmoke(PackagedSmoke):
    customer = "布局补填验收客户"

    def safe(self, function):
        try:
            function()
        except Exception as exc:
            self.report["failure_traceback"] = traceback.format_exc()
            self.fail(f"{type(exc).__name__}: {exc}")

    def baseline(self):
        self.customer = "布局补填验收客户"
        self.folder = self.window.context.folder
        assert self.window.context.store.backend == "sqlite" and self.window.loaded
        self.fixture = json.loads((self.folder / "acceptance-workflow.json").read_text(encoding="utf-8"))
        self.report.update(backend="isolated SQLite", production_or_cloud_writes=False, computer_use_verified=False,
                           file_picker="Return path substituted; actual Qt forms, services, transactions and restart")
        if self.report["frozen"]:
            self.report["binary_sha256"] = hashlib.sha256(Path(sys.executable).read_bytes()).hexdigest()
        self.window.resize(1440, 840)
        self.report["restart"] = bool(self.window.context.store.list({"customer": self.customer})["items"])
        self.report["checks"]["nine_columns"] = self.window.model.columnCount() == 9
        assert self.window.table.columnWidth(PRICE_COLUMN) >= 120
        self.select_customer("")
        self.await_idle(self.start_quote)

    def select_customer(self, name):
        view = self.window.customers
        index = next(self.window.customer_model.index(row, 0) for row in range(self.window.customer_model.rowCount())
                     if (self.window.customer_model.index(row, 0).data(Qt.ItemDataRole.UserRole) or "") == name)
        view.scrollTo(index)
        QTest.mouseClick(view.viewport(), Qt.MouseButton.LeftButton, pos=view.visualRect(index).center())
        assert self.window.import_customer == name

    def start_quote(self):
        if self.report["restart"]:
            self.verify_records()
            base = self.current("QA-FILL")
            self.dialog = QuoteDialog(self.window.prices, self.window.tasks, self.window.context.storage_generation, row=base, parent=self.window)
            self.window.show_dialog(self.dialog)
            self.report["checks"]["restart_edit_fields"] = (self.dialog.values()["note"] == "保存后补充备注"
                and self.dialog.values()["color"] == "白色" and self.dialog.fields["color"].isReadOnly())
            self.capture(self.dialog, "restart-edit.png")
            self.dialog.accept()
            self.open_history()
            return
        self.window.new_button.click()
        self.dialog = next(dialog for dialog in self.window.dialogs if isinstance(dialog, QuoteDialog))
        for key, value in {"customer": self.customer, "grade": "QA-FILL", "price": "9.734513"}.items():
            self.dialog.fields[key].setText(value)
        self.dialog.fields["effective_date"].setDate(QDate(2026, 9, 1))
        self.dialog.saved.connect(self.quote_signal)
        self.stage = 1
        QTest.mouseClick(self.dialog.save, Qt.MouseButton.LeftButton)

    def quote_signal(self, result):
        QTimer.singleShot(50, lambda: self.await_idle(self.quote_saved))

    def quote_saved(self):
        assert self.dialog.isVisible() and self.dialog.row
        if self.stage == 1:
            self.report["checks"]["save_keeps_same_window"] = True
            assert not self.dialog.fields["color"].isReadOnly() and self.dialog.fields["tax_type"].isEnabled()
            self.dialog.fields["color"].setText("白色")
            self.dialog.fields["tax_type"].setCurrentText("含税")
            self.stage = 2
            QTest.mouseClick(self.dialog.save, Qt.MouseButton.LeftButton)
        elif self.stage == 2:
            base = self.current("QA-FILL")
            assert base["color"] == "白色" and base["tax_type"] == "含税" and base["history_count"] == 1
            self.report["checks"]["fill_color_tax_without_duplicate_history"] = True
            self.dialog.fields["material"].setText("PA12")
            self.dialog.fields["note"].setPlainText("保存后补充备注")
            self.stage = 3
            QTest.mouseClick(self.dialog.save, Qt.MouseButton.LeftButton)
        else:
            base = self.current("QA-FILL")
            assert base["material"] == "PA12" and base["note"] == "保存后补充备注" and base["history_count"] == 2
            self.report["checks"]["same_window_material_note_save"] = True
            self.capture(self.dialog, "saved-fill.png")
            self.dialog.cancel.click()
            assert not self.dialog.isVisible()
            self.select_customer(self.customer)
            self.await_idle(self.import_file)

    def import_file(self):
        path = self.folder / "future.csv"
        with patch("ui.main_window.QFileDialog.getOpenFileName", return_value=(str(path), "")):
            self.window.import_file()
        self.options = next(dialog for dialog in self.window.dialogs if isinstance(dialog, PdfImportOptionsDialog))
        assert self.options.customer.currentText() == self.customer
        assert not self.options.date.text()
        self.options.preview.click()
        self.await_idle(self.preview_ready)

    def preview_ready(self):
        self.preview = next(dialog for dialog in self.window.dialogs if isinstance(dialog, ImportPreviewDialog))
        assert self.preview.preview["error_count"] == 0 and self.preview.preview["added"] == 2
        assert {row["effective_date"] for row in self.preview.preview["samples"]} == {"2199-01-01", today()}
        self.capture(self.preview, "import-preview.png")
        self.preview.imported.connect(lambda result: QTimer.singleShot(50, lambda: self.await_idle(self.imported)))
        self.preview.commit.click()

    def imported(self):
        self.verify_records()
        self.report["checks"]["import_future_immediate_original_date_and_today_fallback"] = True
        again = self.window.prices.preview_import(self.folder / "future.csv", self.window.context.storage_generation,
                   {"customer_mode": "selected", "selected_customer": self.customer, "core_only": True})
        assert (again["added"], again["skipped"], again["error_count"]) == (0, 2, 0)
        self.report["checks"]["repeat_import_deduplicates"] = True
        self.open_history()

    def current(self, grade):
        return next(row for row in self.window.context.store.list({"customer": self.customer})["items"] if row["grade"] == grade)

    def verify_records(self):
        expected = 5 if self.report["restart"] else 4
        assert len(self.window.context.store.all()) == self.fixture["seed_count"] + expected
        fill, future, blank = self.current("QA-FILL"), self.current("QA-FUTURE"), self.current("QA-TODAY")
        assert fill["price"] == "9.734513" and fill["note"] == "保存后补充备注" and fill["history_count"] == 2
        assert future["effective_date"] == "2199-01-01" and not future["scheduled"] and future["note"] == "保留文件备注"
        assert blank["effective_date"] == self.fixture["today"] and not blank["scheduled"]
        self.report["checks"]["persisted_fields_dates_histories"] = True
        with sqlite3.connect(self.folder / "prices.sqlite3") as db:
            assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"

    def open_history(self):
        self.history = HistoryDialog(self.window.context.store.history(self.current("QA-FUTURE")["id"])["items"], self.window)
        self.window.show_dialog(self.history)
        self.history.table.selectRow(0)
        QTimer.singleShot(80, lambda: self.safe(self.history_ready))

    def history_ready(self):
        assert "当前价" in self.history.model.index(0, 0).data()
        assert self.history.table.palette().color(QPalette.ColorRole.HighlightedText).name() == COLORS["ink900"]
        self.report["checks"]["history_selected_dark_text_immediate_status"] = True
        self.capture(self.history, "history-selected.png")
        self.history.accept()
        self.manager = CustomerManagerDialog(self.window.customer_service, self.window.tasks, self.window.context.storage_generation, parent=self.window)
        self.window.show_dialog(self.manager)
        self.await_idle(self.manager_ready)

    def manager_ready(self):
        assert self.manager.items
        self.manager.table.selectRow(0)
        assert self.manager.table.palette().color(QPalette.ColorRole.HighlightedText).name() == COLORS["ink900"]
        self.report["checks"]["customer_selected_readable_actions_enabled"] = self.manager.details_button.isEnabled()
        self.capture(self.manager, "customer-selected.png")
        self.manager.accept()
        if not self.report["restart"]:
            self.select_customer("")
            self.await_idle(self.open_image)
        else:
            self.show_table()

    def open_image(self):
        self.window.new_button.click()
        self.image_dialog = next(dialog for dialog in self.window.dialogs if isinstance(dialog, QuoteDialog))
        clipboard = QGuiApplication.clipboard()
        previous = clipboard.image().copy() if clipboard.mimeData().hasImage() else clipboard.text()
        clipboard.setImage(QImage(str(self.folder / "future-image.png")))
        self.image_dialog.image_panel.paste.click()
        if isinstance(previous, QImage):
            clipboard.setImage(previous)
        else:
            clipboard.setText(previous)
        self.await_idle(self.image_ready)

    def image_ready(self):
        dialog = self.image_dialog
        assert dialog.values()["customer"] == "图片未来验收客户" and dialog.values()["grade"] == "QA-IMAGE"
        assert dialog.values()["price"] == "9.734513" and dialog.values()["effective_date"] == "2198-01-01", dialog.notice.text.text()
        dialog.image_review.setChecked(True)
        dialog.saved.connect(lambda result: QTimer.singleShot(50, lambda: self.await_idle(self.image_saved)))
        dialog.save.click()

    def image_saved(self):
        assert self.image_dialog.isVisible()
        row = self.window.context.store.list({"customer": "图片未来验收客户"})["items"][0]
        assert row["source_type"] == "图片导入" and row["effective_date"] == "2198-01-01" and not row["scheduled"]
        assert row["source_file"] and row["source_sheet"] == "图片识别"
        self.report["checks"]["real_ocr_clipboard_future_image_immediate_saved_window"] = True
        self.image_dialog.cancel.click()
        self.show_table()

    def show_table(self):
        self.window.proxy.sort(PRICE_COLUMN, Qt.SortOrder.AscendingOrder)
        self.window.customer.setText(self.customer)
        self.window.query()
        self.await_idle(self.table_ready)

    def table_ready(self):
        index = self.window.proxy.index(0, ACTION_COLUMN)
        assert index.data(ROW_ROLE) and self.window.table.viewport().height() >= 150
        self.window.table.scrollTo(index)
        self.report["checks"]["stable_action_id_after_numeric_sort"] = bool(index.data(ROW_ROLE)["id"])
        path = self.output / "template.csv"
        self.window.prices.save_import_template(path)
        assert path.read_text(encoding="utf-8-sig").strip() == "客户,牌号,材料,颜色,价格,税口径,备注"
        self.report["checks"]["seven_column_template"] = True
        self.capture(self.window, "main-wide.png")
        self.window.resize(960, 640)
        QTimer.singleShot(80, lambda: self.safe(self.compact_ready))

    def compact_ready(self):
        assert self.window.table.viewport().height() >= 120 and self.window.search_button.isVisible()
        self.report["checks"]["compact_spacing_and_usable_table"] = True
        self.capture(self.window, "main-compact.png")
        self.report["status"] = "passed"
        self.write_report()
        self.finished = True
        self.timeout.stop()
        self.window.close()
