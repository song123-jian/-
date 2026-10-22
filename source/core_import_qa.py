"""Run the actual import UI and persistence only in explicit isolated smoke mode."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import sqlite3
import sys
from pathlib import Path
from unittest.mock import patch

from PySide6.QtCore import Qt, QTimer
from PySide6.QtTest import QTest

from qa_runner import PackagedSmoke
from ui.dialogs import ImportPreviewDialog, PdfImportOptionsDialog


class PackagedCoreImportSmoke(PackagedSmoke):
    def baseline(self):
        assert self.window.loaded and self.window.context.store.backend == "sqlite"
        self.folder = self.window.context.folder
        self.fixture = json.loads((self.folder / "acceptance-core-import.json").read_text(encoding="utf-8"))
        self.original = Path(self.fixture["input"])
        self.customer = self.fixture["customer"]
        self.report["backend"] = "isolated SQLite"
        self.report["production_or_cloud_writes"] = False
        self.report["input_sha256"] = hashlib.sha256(self.original.read_bytes()).hexdigest()
        assert self.report["input_sha256"] == self.fixture["input_sha256"]
        if self.report["frozen"]:
            self.report["binary_sha256"] = hashlib.sha256(Path(sys.executable).read_bytes()).hexdigest()
        self.report["file_picker"] = "Fixture path substituted; native forms, preview, matching, commit, refresh and persistence are real"
        self.report["restart"] = bool(self.window.context.store.list({"customer": self.customer})["items"])
        self.select_customer("")
        self.await_idle(self.open_original)

    def select_customer(self, customer):
        index = next(self.window.customer_model.index(row, 0) for row in range(self.window.customer_model.rowCount())
                     if (self.window.customer_model.index(row, 0).data(Qt.ItemDataRole.UserRole) or "") == customer)
        QTest.mouseClick(self.window.customers.viewport(), Qt.MouseButton.LeftButton,
                         pos=self.window.customers.visualRect(index).center())
        assert self.window.import_customer == customer

    def open_file(self, path, continuation):
        with patch("ui.main_window.QFileDialog.getOpenFileName", return_value=(str(path), "")):
            self.window.import_file()
        options = next(dialog for dialog in self.window.dialogs if isinstance(dialog, PdfImportOptionsDialog))
        assert options.split_color.isChecked()
        if path != self.original:
            options.date.setText("2026-10-10")
        QTest.mouseClick(options.preview, Qt.MouseButton.LeftButton)
        QTimer.singleShot(50, lambda: self.await_idle(continuation))

    def preview(self):
        return next(dialog for dialog in self.window.dialogs if isinstance(dialog, ImportPreviewDialog))

    def open_original(self):
        self.open_file(self.original, self.original_ready)

    def original_ready(self):
        dialog = self.preview()
        preview = dialog.preview
        assert preview["error_count"] == 0 and preview["total"] == 4
        assert (preview["added"], preview["skipped"]) == ((0, 4) if self.report["restart"] else (4, 0))
        assert [row["price"] for row in preview["samples"]] == ["12", "11", "14.89", "14.51"]
        assert {row["tax_type"] for row in preview["samples"]} == {"含税"}
        assert [row["grade"] for row in preview["samples"]] == ["PM4BK-S04", "PM6-S01", "BG6BK", "BG10BK"]
        assert [row["material"] for row in preview["samples"]] == ["PP-TD20", "PP-TD30", "PA6-GF30", "PA6-GF50"]
        assert [row["effective_date"] for row in preview["samples"]] == ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"]
        self.report["checks"]["original_four_prices_and_dates_preview"] = True
        dialog.imported.connect(lambda result: QTimer.singleShot(50, lambda: self.await_idle(self.original_saved)))
        QTest.mouseClick(dialog.commit, Qt.MouseButton.LeftButton)

    def original_saved(self):
        store = self.window.context.store
        # all() includes future quotations independently of the query's current-price view.
        records = [row for row in store.all() if row["customer"] == self.customer]
        assert len(records) == 4 and {row["price"] for row in records} == {"12", "11", "14.89", "14.51"}
        assert all(len(store.history(row["id"])["items"]) == 1 for row in records)
        self.report["checks"]["original_commit_and_history_readback"] = True
        repeated = self.window.prices.preview_import(self.original, self.window.context.storage_generation,
                                                    {"customer_mode": "all", "core_only": True})
        assert (repeated["added"], repeated["skipped"], repeated["error_count"]) == (0, 4, 0)
        self.report["checks"]["original_repeat_is_idempotent"] = True
        self.base = next(row for row in store.all() if row["customer"] == "金华领先" and row["grade"] == "BG3(BL13662D)")
        self.selected_path = self.folder / "core-selected.csv"
        stream = io.StringIO(newline="")
        writer = csv.writer(stream)
        writer.writerow(["客户", "客户名称", "牌号/产品名称", "材料/颜色", "含税价格", "含税价格"])
        writer.writerow(["不该创建的客户", "另一个抬头", "BG3(BL13662D) | PA6+GF15", "PA6+GF15 松露蓝", "13.123456", ""])
        writer.writerow(["不该创建的客户", "另一个抬头", "QA-CORE-NEW | PC/ABS", "PC/ABS 黑色", "12", "12.00"])
        self.selected_path.write_text(stream.getvalue(), encoding="utf-8")
        self.select_customer("金华领先")
        self.await_idle(lambda: self.open_file(self.selected_path, self.selected_ready))

    def selected_ready(self):
        dialog = self.preview()
        preview = dialog.preview
        assert preview["error_count"] == 0 and preview["new_customers"] == 0
        assert (preview["added"], preview["skipped"]) == ((0, 2) if self.report["restart"] else (2, 0))
        assert {row["color"] for row in preview["samples"]} == {"松露蓝", "黑色"}
        assert all(row["customer"] == "金华领先" for row in preview["samples"])
        if not self.report["restart"]:
            assert (preview["created"], preview["updated"]) == (1, 1)
        self.report["checks"]["selected_combined_fields_exact_color_match"] = True
        dialog.imported.connect(lambda result: QTimer.singleShot(50, lambda: self.await_idle(self.selected_saved)))
        QTest.mouseClick(dialog.commit, Qt.MouseButton.LeftButton)

    def selected_saved(self):
        store = self.window.context.store
        history = store.history(self.base["id"])["items"]
        assert len(history) == 2 and history[0]["price"] == "13.123456"
        assert not store.list({"customer": "不该创建的客户"})["items"]
        assert self.window.import_customer == "金华领先"
        repeated = self.window.prices.preview_import(self.selected_path, self.window.context.storage_generation,
                                                    {"customer_mode": "selected", "selected_customer": "金华领先",
                                                     "core_only": True, "effective_date": "2026-10-10"})
        assert (repeated["added"], repeated["skipped"], repeated["error_count"]) == (0, 2, 0)
        self.report["checks"]["selected_commit_history_repeat_and_customer_lock"] = True
        self.conflict = self.folder / "core-conflict.csv"
        self.conflict.write_text("牌号,含税价格,含税价格\nQA-CORE-CONFLICT,12,13\n", encoding="utf-8")
        self.await_idle(lambda: self.open_file(self.conflict, self.conflict_ready))

    def conflict_ready(self):
        dialog = self.preview()
        assert dialog.preview["error_count"] == 1 and not dialog.commit.isEnabled()
        assert "第2、3列" in dialog.preview["errors"][0]["message"]
        self.report["checks"]["duplicate_price_conflict_blocks_native_commit"] = True
        self.capture(dialog, "conflict-preview.png")
        dialog.reject()
        with sqlite3.connect(self.window.context.store.path) as db:
            assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            assert db.execute("SELECT COUNT(*) FROM quotes").fetchone()[0] == 47
        self.report["checks"]["isolated_integrity_and_exact_47_history_rows"] = True
        self.select_customer("")
        self.await_idle(lambda: self.open_file(self.original, self.finished_preview))

    def finished_preview(self):
        dialog = self.preview()
        assert (dialog.preview["added"], dialog.preview["skipped"], dialog.preview["error_count"]) == (0, 4, 0)
        self.window.resize(960, 640)
        self.capture(dialog, "original-preview.png")
        dialog.reject()
        self.report["checks"]["native_repeat_preview_after_all_operations"] = True
        self.complete()
