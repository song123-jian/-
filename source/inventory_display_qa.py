"""Scoped actual-window acceptance for MES columns and encrypted persistence."""
from __future__ import annotations

import json

from PySide6.QtCore import Qt, QTimer
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

from inventory_qa import PackagedInventorySmoke
from services.inventory_service import RESERVE_VIEW_ID, stock_date


class PackagedInventoryDisplaySmoke(PackagedInventorySmoke):
    def __init__(self, window, output):
        super().__init__(window, output)
        marker = window.context.folder / "acceptance-inventory-display.json"
        self.restart = bool(json.loads(marker.read_text(encoding="utf-8")).get("restart"))
        self.expected_login = (self.username, self.password)
        self.raw_reserve = None
        self.report["restart"] = self.restart

    def open_inventory(self):
        assert all(self.expected_login), "MES acceptance credentials missing"
        assert self.window.loaded and self.window.context.store.backend == "sqlite"
        self.before = (self.window.context.store.all(), self.window.context.store.customer_states())
        self.window.table.selectRow(0)
        grade = self.window.selected()["grade"]
        QTest.mouseClick(self.window.inventory_nav, Qt.MouseButton.LeftButton)
        self.dialog = self.window.inventory_dialog
        assert self.dialog.grade.text() == grade and self.dialog.isVisible()
        assert self.dialog.credential_store.path.parent == self.window.context.folder
        assert not self.dialog.service.logged_in
        if self.restart:
            assert (self.dialog.username.text(), self.dialog.password.text()) == self.expected_login
            self.report["checks"]["cross_process_restart_auto_prefill"] = True
        else:
            assert not self.dialog.username.text() and not self.dialog.password.text()
            self.dialog.username.setText(self.username)
            self.dialog.password.setText(self.password)
        assert self.dialog.remember_login.isChecked()
        self.username = self.password = ""
        self.report["checks"]["navigation_data_directory_and_prefill"] = True
        QTest.keyClick(self.dialog.password, Qt.Key.Key_Return)
        self.await_idle(self.logged_in)

    def logged_in(self):
        assert self.dialog.service.logged_in, self.dialog.status.text()
        assert not self.dialog.password.text() and not self.dialog.login_panel.isVisible()
        store = self.dialog.credential_store
        assert store.load() == self.expected_login
        raw = store.path.read_bytes()
        assert all(value.encode() not in raw for value in self.expected_login)
        self.report["checks"]["live_login_encrypted_file_reread"] = True
        actual_json = self.dialog.service._json

        def observe(*args, **kwargs):
            result = actual_json(*args, **kwargs)
            params = args[4] if len(args) > 4 else kwargs.get("data")
            if args[3] == "Query/QuerySqlObjectNew" and params.get("VIEWID") == RESERVE_VIEW_ID:
                self.raw_reserve = result
            return result

        self.dialog.service._json = observe
        self.dialog.grade.setText("AG6")
        QTest.keyClick(self.dialog.grade, Qt.Key.Key_Return)
        self.await_idle(self.first_query)

    @staticmethod
    def check_table(table, date_columns):
        assert table.rowCount() > 0
        assert table.horizontalHeader().defaultAlignment() == Qt.AlignmentFlag.AlignCenter
        for row in range(table.rowCount()):
            for col in range(table.columnCount()):
                item = table.item(row, col)
                assert item.textAlignment() == Qt.AlignmentFlag.AlignCenter
                assert item.text() in item.toolTip()
        for col in date_columns:
            for row in range(table.rowCount()):
                text = table.item(row, col).text()
                if text:
                    assert table.columnWidth(col) >= table.fontMetrics().horizontalAdvance(text) + 32
        assert table.horizontalScrollBar().maximum() > 0

    def first_query(self):
        assert self.dialog.result and self.dialog.result.items, self.dialog.status.text()
        self.check_table(self.dialog.table, (9, 10))
        self.report["checks"]["comprehensive_all_cells_center_full_dates"] = True
        self.dialog.tabs.setCurrentIndex(1)
        self.dialog.batch.setText("G262234201")
        QTest.keyClick(self.dialog.batch, Qt.Key.Key_Return)
        self.await_idle(self.reserve_query)

    def reserve_query(self):
        result = self.dialog.reserve_result
        table = self.dialog.reserve_table
        assert result and result.items, self.dialog.reserve_status.text()
        assert self.raw_reserve and len(self.raw_reserve["data"]) == table.rowCount()
        expected_headers = ("牌号", "批号", "数量", "客户码", "入库时间", "客户交期", "客户名称", "质量状态",
                            "质量描述", "业务员", "业务员代码", "客户标识", "库房")
        assert tuple(table.horizontalHeaderItem(c).text() for c in range(table.columnCount())) == expected_headers
        fields = {0: "SGMATCODE", 1: "SGBANTCH", 3: "CUSTID", 6: "CGNAME", 7: "SGQUASTATE1",
                  8: "QUADESC", 9: "bussman1", 10: "BUSSMAN", 11: "PCLIENTTAG", 12: "SGROOM"}
        for i, raw in enumerate(self.raw_reserve["data"]):
            for col, field in fields.items():
                assert table.item(i, col).text() == str(raw.get(field) or "")
            assert table.item(i, 2).text() == result.items[i]["stock"]
            assert table.item(i, 4).text() == stock_date(raw.get("SGDATE"))
            assert table.item(i, 5).text() == stock_date(raw.get("DILIVERDATE1") or raw.get("DILIVERDATE"))[:10]
        self.check_table(table, (4,))
        assert result.items[0]["warehouse"] == "110-1064"
        self.report["headers"] = expected_headers
        self.report["reserve_rows"] = result.total
        self.report["checks"]["thirteen_columns_equal_real_mes_fields"] = True
        self.report["checks"]["reserve_center_dates_and_original_warehouse_code"] = True
        self.capture(self.dialog, "reserve-results.png")
        table.horizontalScrollBar().setValue(table.horizontalScrollBar().maximum())
        QTimer.singleShot(80, lambda: self.safe(self.right_columns))

    def right_columns(self):
        table = self.dialog.reserve_table
        assert table.visualItemRect(table.item(0, 12)).intersects(table.viewport().rect())
        assert "库房名称" in table.item(0, 12).toolTip()
        self.capture(self.dialog, "reserve-extra-fields.png")
        self.report["checks"]["horizontal_scroll_reaches_added_columns_and_warehouse_tooltip"] = True
        if self.restart:
            QTest.mouseClick(self.dialog.clear_login_button, Qt.MouseButton.LeftButton)
            assert self.dialog.credential_store.load() is None and self.dialog.service.logged_in
            assert self.dialog.query_button.isEnabled() and not self.dialog.remember_login.isChecked()
            self.report["checks"]["clear_saved_login_keeps_current_session"] = True
            QTest.mouseClick(self.dialog.logout_button, Qt.MouseButton.LeftButton)
            assert not self.dialog.service.logged_in and not self.dialog.password.text()
        service = self.dialog.service
        QTest.keyClick(self.dialog, Qt.Key.Key_Escape)
        assert not self.dialog.isVisible() and not service.logged_in
        assert not self.dialog.username.text() and not self.dialog.password.text()
        QTest.mouseClick(self.window.inventory_nav, Qt.MouseButton.LeftButton)
        reopened = self.window.inventory_dialog
        assert reopened is not self.dialog and not reopened.service.logged_in
        if self.restart:
            assert not reopened.username.text() and not reopened.password.text()
            self.report["checks"]["cleared_login_stays_empty_on_reopen"] = True
        else:
            assert (reopened.username.text(), reopened.password.text()) == self.expected_login
            self.report["checks"]["close_reopen_auto_prefill_with_new_session"] = True
        reopened.reject()
        QTimer.singleShot(60, lambda: self.safe(self.finish))

    def finish(self):
        assert (self.window.context.store.all(), self.window.context.store.customer_states()) == self.before
        for path in self.window.context.folder.iterdir():
            if path.is_file() and path.suffix in (".json", ".ini", ".log"):
                assert all(value.encode() not in path.read_bytes() for value in self.expected_login)
        self.report["checks"]["price_ledger_unchanged_no_plaintext_in_data_or_logs"] = True
        self.expected_login = ("", "")
        QApplication.clipboard().clear()
        self.report["status"] = "passed"
        self.write_report()
        self.finished = True
        self.timeout.stop()
        self.window.close()
