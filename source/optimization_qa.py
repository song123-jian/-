"""Isolated acceptance through the actual application's Qt actions and storage."""
from __future__ import annotations

import csv
import json
import sqlite3
import threading
from unittest.mock import patch

from PySide6.QtCore import Qt, QTimer
from PySide6.QtTest import QTest

from qa_runner import PackagedSmoke
from ui.customer_dialogs import CustomerManagerDialog
from ui.dialogs import HistoryDialog, ImportPreviewDialog, PdfImportOptionsDialog, QuoteDialog


class PackagedOptimizationSmoke(PackagedSmoke):
    def __init__(self, window, output):
        super().__init__(window, output)
        marker = json.loads((window.context.folder / "acceptance-optimization.json").read_text(encoding="utf-8"))
        self.restart = bool(marker.get("restart"))
        self.start_at = marker.get("start_at", "import")
        self.base_records = marker.get("base_records")
        self.customer = "分页验收客户"
        self.report.update(restart=self.restart, backend="sqlite", production_or_cloud_writes=False,
                           substitutions=["OS file chooser returns a controlled path; all application dialogs, SQL and files are real",
                                          "a controlled queued read holds one pool slot during rapid search"])

    def later(self, function):
        QTimer.singleShot(80, lambda: self.safe(function))

    def safe(self, function):
        try:
            function()
        except Exception as exc:
            self.fail(f"{function.__name__}: {exc!r}")

    def dialog(self, kind):
        return next(dialog for dialog in self.window.dialogs if isinstance(dialog, kind) and dialog.isVisible())

    def baseline(self):
        assert self.window.loaded and self.window.context.store.backend == "sqlite"
        self.store = self.window.context.store
        self.before = (self.store.all(), self.store.customer_states())
        if self.base_records is None:
            self.base_records = len(self.before[0])
        self.window.resize(1440, 860)
        if self.restart:
            self.verify_restart()
            return
        if self.start_at == "search":
            self.report["continued_from"] = "import acceptance already passed; search and following paths only"
            self.prepare_search()
            return
        assert not any(row["customer"] == self.customer for row in self.before[0])
        self.path = self.window.context.folder / "all-rows.csv"
        with self.path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(["客户", "牌号", "材料", "颜色", "价格", "税口径", "备注"])
            for number in range(1, 124):
                writer.writerow([self.customer, f"PAGE-{number:03}", "PP", "白色", "9.734513", "未税", f"核对备注{number}"])
        self.preview_rows = []
        self.open_import(self.first_page)

    def open_import(self, after):
        self.after_preview = after
        self.window.import_customer = ""
        self.window.customer.clear()
        with patch("ui.main_window.QFileDialog.getOpenFileName", return_value=(str(self.path), "CSV")):
            self.window.import_file()
        self.later(self.import_options)

    def import_options(self):
        options = self.dialog(PdfImportOptionsDialog)
        QTest.mouseClick(options.preview, Qt.MouseButton.LeftButton)
        self.await_idle(lambda: self.later(self.after_preview))

    def page_rows(self):
        return [{key: self.preview.table.item(line, column).text()
                 for column, (key, _) in enumerate(self.preview.columns)}
                for line in range(self.preview.table.rowCount())]

    def first_page(self):
        self.preview = self.dialog(ImportPreviewDialog)
        assert self.preview.preview["total"] == self.preview.preview["added"] == 123
        assert self.preview.preview["error_count"] == 0 and self.preview.table.rowCount() == 50
        self.preview_rows.extend(self.page_rows())
        QTest.mouseClick(self.preview.next_page, Qt.MouseButton.LeftButton)
        self.await_idle(lambda: self.later(self.second_page))

    def second_page(self):
        rows = self.page_rows()
        assert rows[0]["grade"] == "PAGE-051" and rows[0]["note"] == "核对备注51"
        assert rows[0]["source_row"] == "52" and rows[0]["import_action"] == "新增牌号"
        self.preview_rows.extend(rows)
        self.report["checks"]["row_51_note_source_and_action"] = True
        QTest.mouseClick(self.preview.next_page, Qt.MouseButton.LeftButton)
        self.await_idle(lambda: self.later(self.last_page))

    def last_page(self):
        rows = self.page_rows()
        assert len(rows) == 23 and rows[-1]["grade"] == "PAGE-123" and rows[-1]["note"] == "核对备注123"
        assert "101–123" in self.preview.page_status.text() and not self.preview.next_page.isEnabled()
        self.preview_rows.extend(rows)
        assert [row["grade"] for row in self.preview_rows] == [f"PAGE-{i:03}" for i in range(1, 124)]
        self.preview.table.selectRow(22)
        self.preview.table.scrollToItem(self.preview.table.item(22, 1))
        self.capture(self.preview, "preview-last-page.png")
        self.report["checks"]["all_123_rows_browsed"] = True
        QTest.mouseClick(self.preview.previous_page, Qt.MouseButton.LeftButton)
        self.await_idle(lambda: self.later(self.cancel_preview))

    def cancel_preview(self):
        assert self.preview.page == 2 and self.page_rows()[0]["grade"] == "PAGE-051"
        QTest.mouseClick(self.preview.cancel, Qt.MouseButton.LeftButton)
        assert (self.store.all(), self.store.customer_states()) == self.before
        self.report["checks"]["previous_page_and_cancel_without_write"] = True
        self.open_import(self.commit_preview)

    def commit_preview(self):
        self.preview = self.dialog(ImportPreviewDialog)
        self.import_result = None
        self.preview.imported.connect(lambda result: setattr(self, "import_result", result))
        QTest.mouseClick(self.preview.commit, Qt.MouseButton.LeftButton)
        self.await_idle(lambda: self.later(self.committed))

    def committed(self):
        assert self.import_result and self.import_result["added"] == 123 and self.import_result["skipped"] == 0
        saved = self.store.list({"customer": self.customer})["items"]
        keys = ("customer", "grade", "material", "color", "price", "tax_type", "effective_date", "note", "source_sheet", "source_row")
        actual = {row["grade"]: tuple(str(row[key]) for key in keys) for row in saved}
        expected = {row["grade"]: tuple(row[key] for key in keys) for row in self.preview_rows}
        assert actual == expected and len(self.store.all()) == self.base_records + 123
        assert self.import_result["backup"]
        self.report["checks"]["commit_matches_every_preview_row"] = True
        self.open_import(self.duplicate_preview)

    def duplicate_preview(self):
        self.preview = self.dialog(ImportPreviewDialog)
        assert self.preview.preview["added"] == 0 and self.preview.preview["skipped"] == 123
        QTest.mouseClick(self.preview.next_page, Qt.MouseButton.LeftButton)
        self.await_idle(lambda: self.later(self.duplicate_page))

    def duplicate_page(self):
        assert all(row["import_action"] == "重复跳过" for row in self.page_rows())
        assert self.page_rows()[0]["grade"] == "PAGE-051"
        QTest.mouseClick(self.preview.cancel, Qt.MouseButton.LeftButton)
        assert len(self.store.all()) == self.base_records + 123
        self.report["checks"]["duplicate_rows_visible_without_write"] = True
        self.prepare_search()

    def prepare_search(self):
        self.original_list = self.store.list
        self.list_calls = []

        def counted(filters=None):
            self.list_calls.append(dict(filters or {}))
            return self.original_list(filters)

        self.store.list = counted
        self.window.tasks.read_pool.setMaxThreadCount(1)
        self.release, self.started_read = threading.Event(), threading.Event()

        def hold_read():
            self.started_read.set()
            assert self.release.wait(5), "验收读任务未释放"

        self.window.tasks.submit(hold_read, lambda _: None, lambda exc: self.fail(str(exc)))
        self.wait_started(self.rapid_search)

    def wait_started(self, after):
        if self.finished:
            return
        if self.started_read.is_set():
            self.safe(after)
        else:
            QTimer.singleShot(20, lambda: self.wait_started(after))

    def rapid_search(self):
        for number in range(1, 21):
            self.window.term.setText(f"PAGE-{number:03}")
            QTest.keyClick(self.window.term, Qt.Key.Key_Return)
        self.window.term.setText("PAGE-123")
        QTest.keyClick(self.window.term, Qt.Key.Key_Return)
        assert len(self.window.tasks.jobs) <= 2
        self.release.set()
        self.await_idle(lambda: self.later(self.search_done))

    def search_done(self):
        assert len(self.list_calls) == 1 and self.list_calls[0]["q"] == "PAGE-123"
        assert len(self.window.model.items) == 1 and self.window.model.items[0]["grade"] == "PAGE-123"
        assert not self.window.read_errors
        self.report["checks"]["rapid_search_only_latest_queued_read"] = True
        self.report["rapid_search"] = {"requests": 21, "executed_reads": len(self.list_calls)}
        self.list_calls.clear()
        QTest.keyClick(self.window, Qt.Key.Key_F5)
        self.await_idle(lambda: self.later(self.refresh_done))

    def refresh_done(self):
        assert len(self.list_calls) == 1 and self.window.model.items[0]["grade"] == "PAGE-123"
        assert self.window.customer_model.rowCount() == len(self.store.customer_states()) + 1
        self.report["checks"]["f5_directory_and_quotes_share_one_ranked_read"] = True
        self.store.list = self.original_list
        self.window.tasks.read_pool.setMaxThreadCount(3)
        self.original_all = self.store.all
        self.all_calls = 0

        def counted_all():
            self.all_calls += 1
            return self.original_all()

        self.store.all = counted_all
        self.window.manage_customers()
        self.await_idle(lambda: self.later(self.customer_manager))

    def customer_manager(self):
        self.manager = self.dialog(CustomerManagerDialog)
        index = next(i for i, row in enumerate(self.manager.items) if row["display_name"] == self.customer)
        assert self.manager.items[index]["specs"] == self.manager.items[index]["records"] == 123
        self.manager.table.selectRow(index)
        QTest.mouseClick(self.manager.details_button, Qt.MouseButton.LeftButton)
        self.await_idle(lambda: self.later(self.customer_detail))

    def customer_detail(self):
        detail = self.manager.detail_dialog
        assert detail.isVisible() and detail.table.rowCount() == 123 and self.all_calls == 0
        line = next(i for i in range(123) if detail.table.item(i, 0).text() == "PAGE-051")
        assert "核对备注51" in detail.table.item(line, 6).text()
        self.report["checks"]["customer_counts_and_detail_without_all_history"] = True
        self.store.all = self.original_all
        detail.accept()
        self.manager.accept()
        self.window.table.selectRow(0)
        QTest.mouseClick(self.window.edit_button, Qt.MouseButton.LeftButton)
        self.later(self.edit_quote)

    def edit_quote(self):
        self.quote_dialog = self.dialog(QuoteDialog)
        assert self.quote_dialog.row["grade"] == "PAGE-123"
        self.original_last = dict(self.quote_dialog.row)
        self.quote_dialog.fields["price"].setText("12.345678")
        self.quote_dialog.fields["reason"].setText("分页优化验收追加历史")
        self.quote_dialog.fields["note"].setPlainText("末条更新后的备注")
        QTest.mouseClick(self.quote_dialog.save, Qt.MouseButton.LeftButton)
        self.await_idle(lambda: self.later(self.quote_saved))

    def quote_saved(self):
        assert self.quote_dialog.isVisible() and self.quote_dialog.row["price"] == "12.345678"
        assert self.quote_dialog.row["note"] == "末条更新后的备注"
        history = self.store.history(self.quote_dialog.row["id"])["items"]
        assert len(history) == 2 and any(row["id"] == self.original_last["id"] and row["price"] == "9.734513" for row in history)
        self.quote_dialog.accept()
        self.report["checks"]["save_appends_history_and_updates_open_form"] = True
        self.window.table.selectRow(0)
        QTest.mouseClick(self.window.history_button, Qt.MouseButton.LeftButton)
        self.await_idle(lambda: self.later(self.history_dialog))

    def history_dialog(self):
        history = self.dialog(HistoryDialog)
        assert history.model.rowCount() == 2 and len(history.trend.points) == 2
        history.accept()
        self.report["checks"]["actual_history_dialog_has_both_records"] = True
        self.window.customer.setText(self.customer)
        self.window.term.clear()
        QTest.keyClick(self.window.term, Qt.Key.Key_Return)
        self.await_idle(lambda: self.later(self.export_files))

    def export_files(self):
        assert len(self.window.model.items) == 123
        with patch("ui.main_window.QFileDialog.getSaveFileName", return_value=(str(self.output / "history.csv"), "CSV")):
            self.window.export("history")
        with patch("ui.main_window.QFileDialog.getSaveFileName", return_value=(str(self.output / "snapshot.sqlite3"), "SQLite")):
            self.window.backup()
        self.await_idle(lambda: self.later(self.files_done))

    def files_done(self):
        with (self.output / "history.csv").open(encoding="utf-8-sig", newline="") as handle:
            exported = list(csv.DictReader(handle))
        assert len(exported) == 124
        assert any(row["价格(元/kg)"] == "12.345678" and row["备注"] == "末条更新后的备注" for row in exported)
        with sqlite3.connect(self.output / "snapshot.sqlite3") as db:
            assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            assert db.execute("SELECT COUNT(*) FROM quotes").fetchone()[0] == self.base_records + 124
        self.report["checks"].update(history_export_preserves_precision=True, full_backup_integrity=True)
        self.report["records_after"] = len(self.store.all())
        self.report["status"] = "passed"
        self.write_report()
        self.finished = True
        self.timeout.stop()
        self.window.close()

    def verify_restart(self):
        saved = self.store.list({"customer": self.customer})["items"]
        assert len(saved) == 123
        last = next(row for row in saved if row["grade"] == "PAGE-123")
        assert last["price"] == "12.345678" and last["note"] == "末条更新后的备注"
        assert len(self.store.history(last["id"])["items"]) == 2
        assert next(row for row in saved if row["grade"] == "PAGE-051")["note"] == "核对备注51"
        self.report["checks"].update(cross_process_prices_notes_history_persisted=True)
        self.window.customer.setText(self.customer)
        self.window.term.setText("PAGE-123")
        QTest.keyClick(self.window.term, Qt.Key.Key_Return)
        self.await_idle(lambda: self.later(self.restart_query_done))

    def restart_query_done(self):
        assert len(self.window.model.items) == 1 and self.window.model.items[0]["price"] == "12.345678"
        assert (self.store.all(), self.store.customer_states()) == self.before
        self.window.table.selectRow(0)
        self.capture(self.window, "restart-saved-query.png")
        with self.store.connection() as db:
            assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        self.report["checks"].update(actual_restart_query_and_integrity=True, restart_without_ledger_changes=True)
        self.report["status"] = "passed"
        self.write_report()
        self.finished = True
        self.timeout.stop()
        self.window.close()

    def fail(self, message):
        if hasattr(self, "release"):
            self.release.set()
        super().fail(message)
