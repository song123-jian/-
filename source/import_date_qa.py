"""Exercise import dates through real Qt forms in explicit isolated smoke mode."""
from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
from pathlib import Path
from unittest.mock import patch

from PySide6.QtCore import Qt, QTimer
from PySide6.QtTest import QTest

from domain import today
from qa_runner import PackagedSmoke
from ui.dialogs import ImportPreviewDialog, PdfImportOptionsDialog


class PackagedImportDateSmoke(PackagedSmoke):
    def baseline(self):
        assert self.window.loaded and self.window.context.store.backend == "sqlite"
        self.folder = self.window.context.folder
        fixture = json.loads((self.folder / "acceptance-import-date.json").read_text(encoding="utf-8"))
        self.cases = fixture["cases"]
        self.report["original_available"] = next(case["original_available"] for case in self.cases if "original_available" in case)
        self.expected_count = fixture["expected_count"]
        self.report.update(backend="isolated SQLite", production_or_cloud_writes=False,
                           import_date=today(), file_picker="Fixture paths substituted; real Qt forms, parsing, preview, save and SQLite readback")
        self.report["restart"] = len(self.window.context.store.all()) == self.expected_count
        if self.report["frozen"]:
            self.report["binary_sha256"] = hashlib.sha256(Path(sys.executable).read_bytes()).hexdigest()
        self.case_index = 0
        self.next_case()

    def next_case(self):
        if self.case_index == len(self.cases):
            self.finish_dates()
            return
        self.case = self.cases[self.case_index]
        customer = self.case.get("selected_customer", "")
        index = next(self.window.customer_model.index(row, 0) for row in range(self.window.customer_model.rowCount())
                     if (self.window.customer_model.index(row, 0).data(Qt.ItemDataRole.UserRole) or "") == customer)
        QTest.mouseClick(self.window.customers.viewport(), Qt.MouseButton.LeftButton,
                         pos=self.window.customers.visualRect(index).center())
        assert self.window.import_customer == customer
        self.await_idle(self.open_case)

    def open_case(self):
        path = Path(self.case["path"])
        if self.case.get("sha256"):
            assert hashlib.sha256(path.read_bytes()).hexdigest() == self.case["sha256"]
        with patch("ui.main_window.QFileDialog.getOpenFileName", return_value=(str(path), "")):
            self.window.import_file()
        QTimer.singleShot(50, lambda: self.safe(self.options_ready))

    def options_ready(self):
        dialogs = [dialog for dialog in self.window.dialogs if isinstance(dialog, PdfImportOptionsDialog)]
        if not dialogs:
            QTimer.singleShot(50, lambda: self.safe(self.options_ready))
            return
        options = dialogs[0]
        assert options.date.text() == ""
        assert "北京时间" in options.date.placeholderText()
        assert options.mode == ("selected" if self.case.get("selected_customer") else "all")
        if self.case_index == 0:
            self.capture(options, "date-options.png")
        QTest.mouseClick(options.preview, Qt.MouseButton.LeftButton)
        QTimer.singleShot(50, lambda: self.await_idle(self.preview_ready))

    def preview_ready(self):
        dialog = next(dialog for dialog in self.window.dialogs if isinstance(dialog, ImportPreviewDialog))
        preview = dialog.preview
        if self.case.get("invalid"):
            assert preview["error_count"] == 1 and not dialog.commit.isEnabled()
            assert "日期" in preview["errors"][0]["message"]
            self.report["checks"]["invalid_date_blocks_commit"] = True
            dialog.reject()
            self.advance()
            return
        self.expected = [[self.report["import_date"] if value == "TODAY" else value for value in row]
                         for row in self.case["expected"]]
        actual = self.project(preview["samples"])
        assert actual == self.expected, (self.case["name"], actual, self.expected)
        assert preview["error_count"] == 0
        assert (preview["added"], preview["skipped"]) == ((0, len(self.expected)) if self.report["restart"] else (len(self.expected), 0))
        self.report["checks"][self.case["name"] + "_preview"] = True
        if self.case_index == 0:
            self.capture(dialog, "mixed-date-preview.png")
        dialog.imported.connect(lambda result: QTimer.singleShot(50, lambda: self.await_idle(self.case_saved)))
        QTest.mouseClick(dialog.commit, Qt.MouseButton.LeftButton)

    @staticmethod
    def project(records):
        return [[row[key] for key in ("customer", "grade", "tax_type", "price", "effective_date")] for row in records]

    def case_saved(self):
        expected = {tuple(row) for row in self.expected}
        records = self.window.context.store.all()
        assert expected.issubset({tuple(row) for row in self.project(records)})
        options = {"customer_mode": "all", "core_only": True}
        if self.case.get("selected_customer"):
            options.update(customer_mode="selected", selected_customer=self.case["selected_customer"])
        repeated = self.window.prices.preview_import(self.case["path"], self.window.context.storage_generation, options)
        assert (repeated["added"], repeated["skipped"], repeated["error_count"]) == (0, len(expected), 0)
        assert self.project(repeated["samples"]) == self.expected
        self.report["checks"][self.case["name"] + "_saved_and_repeated"] = True
        self.advance()

    def advance(self):
        self.case_index += 1
        self.await_idle(self.next_case)

    def finish_dates(self):
        with sqlite3.connect(self.window.context.store.path) as db:
            assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            assert db.execute("SELECT COUNT(*) FROM quotes").fetchone()[0] == self.expected_count
        assert not self.window.context.store.list({"customer": "不该创建的客户"})["items"]
        self.report["checks"]["exact_history_count_and_integrity"] = True
        self.report["checks"]["selected_customer_stays_locked"] = True
        self.complete()
