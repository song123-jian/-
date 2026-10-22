"""Native, isolated EXE acceptance for customer-scoped import; never use live data."""
from __future__ import annotations

import json
import sqlite3
from unittest.mock import patch

from PySide6.QtCore import Qt, QTimer
from PySide6.QtTest import QTest

from qa_runner import PackagedSmoke
from ui.dialogs import ImportPreviewDialog, PdfImportOptionsDialog


class PackagedCustomerImportSmoke(PackagedSmoke):
    def baseline(self):
        assert self.window.loaded and self.window.context.store.backend == "sqlite"
        self.customer = "金华领先"
        self.report["backend"] = "isolated SQLite"
        self.report["production_or_cloud_writes"] = False
        self.report["file_picker"] = "Injected fixture path; native directory, forms, preview, commit and persistence are real"
        self.folder = self.window.context.folder
        self.csv_path = self.folder / "acceptance-customer.csv"
        self.fixture = self.folder / "customer-fixture.json"
        self.data = json.loads(self.fixture.read_text(encoding="utf-8"))
        self.report["restart"] = bool(self.window.context.store.list({"q": "QA-CUSTOMER-NEW"})["items"])
        index = next(self.window.customer_model.index(row, 0) for row in range(self.window.customer_model.rowCount())
                     if self.window.customer_model.index(row, 0).data(Qt.ItemDataRole.UserRole) == self.customer)
        QTest.mouseClick(self.window.customers.viewport(), Qt.MouseButton.LeftButton,
                         pos=self.window.customers.visualRect(index).center())
        assert self.window.import_customer == self.customer
        self.report["checks"]["directory_click_selects_customer"] = True
        self.await_idle(self.open_import)

    def open_import(self):
        # Only substitute the OS path chooser. The installed application performs
        # parsing, matching, native confirmation and the SQLite transaction.
        with patch("ui.main_window.QFileDialog.getOpenFileName", return_value=(str(self.csv_path), "")):
            self.window.import_file()
        dialog = next(dialog for dialog in self.window.dialogs if isinstance(dialog, PdfImportOptionsDialog))
        assert dialog.customer.currentText() == self.customer and not dialog.customer.isEnabled()
        assert dialog.date.text() == ""
        dialog.date.setText(self.data["effective_date"])
        dialog.tax.setCurrentText(self.data["tax_type"])
        self.report["checks"]["customer_is_locked_heading_ignored"] = True
        QTest.mouseClick(dialog.preview, Qt.MouseButton.LeftButton)
        QTimer.singleShot(50, lambda: self.await_idle(self.preview_ready))

    def preview_ready(self):
        dialog = next(dialog for dialog in self.window.dialogs if isinstance(dialog, ImportPreviewDialog))
        preview = dialog.preview
        assert preview["error_count"] == 0 and preview["new_customers"] == 0
        expected = (0, 2) if self.report["restart"] else (2, 0)
        assert (preview["added"], preview["skipped"]) == expected
        if not self.report["restart"]:
            assert (preview["created"], preview["updated"]) == (1, 1)
        self.report["checks"]["preview_classifies_update_and_new_grade"] = True
        self.capture(dialog, "selected-import-preview.png")
        dialog.imported.connect(lambda result: QTimer.singleShot(50, lambda: self.await_idle(self.saved)))
        QTest.mouseClick(dialog.commit, Qt.MouseButton.LeftButton)

    def saved(self):
        store = self.window.context.store
        history = store.history(self.data["base_id"])["items"]
        assert len(history) == 2
        assert history[0]["price"] == "13.123456" and history[1]["price"] == self.data["original_price"]
        assert not store.list({"customer": "不该创建的文件客户"})["items"]
        assert store.list({"q": "QA-CUSTOMER-NEW"})["items"][0]["customer"] == self.customer
        assert self.window.import_customer == self.customer
        self.report["checks"]["update_history_and_merge_persisted"] = True
        repeated = self.window.prices.preview_import(self.csv_path, self.window.context.storage_generation,
                                                    {"customer_mode": "selected", "selected_customer": self.customer,
                                                     "core_only": True, "effective_date": self.data["effective_date"],
                                                     "tax_type": self.data["tax_type"]})
        assert (repeated["added"], repeated["skipped"], repeated["error_count"]) == (0, 2, 0)
        self.report["checks"]["repeat_skips_both_records"] = True
        self.window.select_customer(self.window.customer_model.index(0, 0))
        self.await_idle(self.all_customer_error)

    def all_customer_error(self):
        missing = self.folder / "missing-customer.csv"
        missing.write_text("牌号,含税价格\nQA-MISSING,12\n", encoding="utf-8")
        with patch("ui.main_window.QFileDialog.getOpenFileName", return_value=(str(missing), "")):
            self.window.import_file()
        dialog = next(dialog for dialog in self.window.dialogs if isinstance(dialog, PdfImportOptionsDialog))
        assert dialog.mode == "all"
        dialog.date.setText(self.data["effective_date"])
        QTest.mouseClick(dialog.preview, Qt.MouseButton.LeftButton)
        QTimer.singleShot(50, lambda: self.await_idle(self.error_ready))

    def error_ready(self):
        dialog = next(dialog for dialog in self.window.dialogs if isinstance(dialog, ImportPreviewDialog))
        assert not dialog.commit.isEnabled() and dialog.preview["error_count"] == 1
        assert "客户" in dialog.preview["errors"][0]["message"]
        self.report["checks"]["all_customer_missing_client_blocks_commit"] = True
        dialog.reject()
        path = self.folder / "new-customer.csv"
        path.write_text("客户,牌号,含税价格\nQA全部客户模式新客户,QA-ALL,12\n", encoding="utf-8")
        with patch("ui.main_window.QFileDialog.getOpenFileName", return_value=(str(path), "")):
            self.window.import_file()
        options = next(dialog for dialog in self.window.dialogs if isinstance(dialog, PdfImportOptionsDialog))
        options.date.setText(self.data["effective_date"])
        QTest.mouseClick(options.preview, Qt.MouseButton.LeftButton)
        QTimer.singleShot(50, lambda: self.await_idle(self.new_customer_ready))

    def new_customer_ready(self):
        dialog = next(dialog for dialog in self.window.dialogs if isinstance(dialog, ImportPreviewDialog))
        assert dialog.preview["new_customers"] == (0 if self.report["restart"] else 1)
        dialog.imported.connect(lambda result: QTimer.singleShot(50, lambda: self.await_idle(self.finish_customer_import)))
        QTest.mouseClick(dialog.commit, Qt.MouseButton.LeftButton)

    def finish_customer_import(self):
        assert self.window.context.store.list({"customer": "QA全部客户模式新客户"})["items"][0]["price"] == "12"
        self.report["checks"]["all_customer_can_create_explicit_client"] = True
        with sqlite3.connect(self.window.context.store.path) as db:
            assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            assert db.execute("SELECT COUNT(*) FROM quotes").fetchone()[0] == 44
        self.report["checks"]["sqlite_integrity_and_row_count"] = True
        self.window.resize(960, 640)
        self.window.select_customer(next(self.window.customer_model.index(row, 0) for row in range(self.window.customer_model.rowCount())
                                         if self.window.customer_model.index(row, 0).data(Qt.ItemDataRole.UserRole) == self.customer))
        QTimer.singleShot(100, lambda: self.await_idle(self.complete))
