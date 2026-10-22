"""Explicit isolated acceptance mode for live MES login/query via actual Qt forms."""
from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from pathlib import Path
from unittest.mock import patch

from PySide6.QtCore import QObject, Qt, QTimer
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

from domain import VERSION
from ui.inventory_dialog import InventoryDialog


class PackagedInventorySmoke(QObject):
    def __init__(self, window, output):
        super().__init__(window)
        self.window, self.output = window, Path(output)
        self.output.mkdir(parents=True, exist_ok=True)
        self.username = os.environ.pop("PRICE_QA_MES_USERNAME", "")
        self.password = os.environ.pop("PRICE_QA_MES_PASSWORD", "")
        self.exit_code = 0
        self.finished = False
        self.started = time.monotonic()
        self.report = {"version": VERSION, "frozen": bool(getattr(sys, "frozen", False)),
                       "scale": os.environ.get("QT_SCALE_FACTOR", "system"), "transport": "real MES HTTP",
                       "price_writes": 0, "inventory_writes": 0, "checks": {}, "screenshots": []}
        self.timeout = QTimer(self)
        self.timeout.setSingleShot(True)
        self.timeout.timeout.connect(lambda: self.fail("库存验收超时"))
        self.timeout.start(120000)

    def safe(self, continuation):
        if self.finished:
            return
        try:
            continuation()
        except Exception as exc:
            self.fail(f"{type(exc).__name__}: {exc}")

    def await_idle(self, continuation):
        if self.finished:
            return
        inventory = self.window.inventory_dialog
        if not self.window.tasks.jobs and (inventory is None or not inventory.tasks.jobs):
            self.safe(continuation)
        else:
            QTimer.singleShot(40, lambda: self.await_idle(continuation))

    def capture(self, widget, name):
        path = self.output / name
        assert widget.grab().save(str(path)), "Screenshot save failed"
        self.report["screenshots"].append(str(path))
        self.report["viewport"] = [widget.width(), widget.height()]

    def start(self):
        self.await_idle(self.open_inventory)

    def open_inventory(self):
        assert self.username and self.password, "MES acceptance credentials missing"
        assert self.window.loaded and self.window.context.store.backend == "sqlite"
        self.before = (self.window.context.store.all(), self.window.context.store.customer_states())
        self.window.table.selectRow(0)
        expected = self.window.selected()["grade"]
        QTest.mouseClick(self.window.inventory_nav, Qt.MouseButton.LeftButton)
        self.dialog = self.window.inventory_dialog
        assert isinstance(self.dialog, InventoryDialog) and self.dialog.grade.text() == expected
        assert self.dialog.isVisible() and self.dialog.password.text() == ""
        self.report["checks"]["navigation_selected_quote_grade"] = True
        self.dialog.remember_login.setChecked(False)
        self.dialog.username.setText(self.username)
        self.dialog.password.setText(self.password)
        self.username = self.password = ""
        QTest.keyClick(self.dialog.password, Qt.Key.Key_Return)
        self.await_idle(self.logged_in)

    def logged_in(self):
        assert self.dialog.service.logged_in, self.dialog.status.text()
        assert not self.dialog.password.text() and self.dialog.query_button.isEnabled()
        assert not self.dialog.login_panel.isVisible()
        self.report["checks"]["live_login_password_cleared"] = True
        self.dialog.grade.setText("AG6")
        QTest.keyClick(self.dialog.grade, Qt.Key.Key_Return)
        self.await_idle(self.first_query)

    def first_query(self):
        result = self.dialog.result
        assert result and result.total > result.page_size and self.dialog.table.rowCount() > 0, self.dialog.status.text()
        assert self.dialog.table.item(0, 0).text() == result.items[0]["grade"]
        assert self.dialog.table.item(0, 3).text() == result.items[0]["stock"]
        assert "本页库存" in self.dialog.quantity_status.text() and "共" in self.dialog.page_status.text()
        self.first_batch = result.items[0]["batch"]
        self.report["total"] = result.total
        self.report["checks"]["live_query_numeric_fields_unit_warehouse"] = True
        assert self.dialog.next_button.isEnabled()
        QTest.mouseClick(self.dialog.next_button, Qt.MouseButton.LeftButton)
        self.await_idle(self.second_query)

    def second_query(self):
        assert self.dialog.result.page == 2 and self.dialog.previous_button.isEnabled()
        assert self.dialog.result.items[0]["batch"] != self.first_batch
        self.report["checks"]["real_pagination"] = True
        self.dialog.search_by.setCurrentIndex(1)
        self.dialog.grade.setText("AG6BK-S20(HZ)")
        assert not self.dialog.result and not self.dialog.table.rowCount() and not self.dialog.next_button.isEnabled()
        QTest.mouseClick(self.dialog.query_button, Qt.MouseButton.LeftButton)
        self.await_idle(self.select_batch)

    def select_batch(self):
        result = self.dialog.result
        assert result and result.search_by == "material_name" and result.items, self.dialog.status.text()
        assert all("AG6BK-S20(HZ)" in row["material"] for row in result.items)
        # MES inventory is live and its batch ordering changes. Use the first
        # exact material row, while the reserve query itself must match that
        # returned batch exactly. The screenshot batch is a user example, not
        # a stable fixture.
        matching = 0
        self.dialog.table.selectRow(matching)
        self.report["checks"]["material_name_filter_and_current_batch"] = True
        QTest.mouseClick(self.dialog.copy_batch_button, Qt.MouseButton.LeftButton)
        self.first_reserve_batch = result.items[matching]["batch"]
        assert QApplication.clipboard().text() == self.first_reserve_batch and self.dialog.batch.text() == self.first_reserve_batch
        self.report["checks"]["selected_batch_copy_and_fill"] = True
        self.stock_result = result
        QTest.mouseClick(self.dialog.reserve_selected_button, Qt.MouseButton.LeftButton)
        assert self.dialog.tabs.currentIndex() == 1 and self.dialog.pending
        self.await_idle(self.reserve_query)

    def reserve_query(self):
        result = self.dialog.reserve_result
        assert result and result.batch == self.first_reserve_batch and result.total >= 1, self.dialog.reserve_status.text()
        assert all(row["batch"] == self.first_reserve_batch for row in result.items)
        assert result.items[0]["stock"] and result.items[0]["customer_code"]
        assert result.items[0]["delivery_date"] and result.items[0]["quality"]
        assert self.dialog.reserve_table.item(0, 1).text() == self.first_reserve_batch
        assert self.dialog.reserve_table.item(0, 2).text() == result.items[0]["stock"]
        assert self.dialog.reserve_table.item(0, 6).text() == result.items[0]["customer"]
        assert self.dialog.reserve_table.item(0, 7).text() == result.items[0]["quality"]
        assert "未提供单位" in self.dialog.reserve_quantity_status.text()
        self.report["reserve_example"] = {"batch": result.batch, "total": result.total, "quantity": result.items[0]["stock"],
                                          "customer_code": result.items[0]["customer_code"], "quality": result.items[0]["quality"]}
        self.report["checks"]["real_batch_reserve_quantity_customer_date_quality"] = True
        self.capture(self.dialog, "reserve-results.png")
        self.dialog.batch.setText("QA-NO-BATCH-62F801")
        assert self.dialog.reserve_result is None and self.dialog.reserve_table.rowCount() == 0
        QTest.keyClick(self.dialog.batch, Qt.Key.Key_Return)
        self.await_idle(self.reserve_empty)

    def reserve_empty(self):
        assert self.dialog.reserve_result and self.dialog.reserve_result.total == 0
        assert "没有备货记录" in self.dialog.reserve_status.text() and self.dialog.reserve_table.rowCount() == 0
        self.report["checks"]["manual_batch_enter_and_empty_clears_reserve_only"] = True
        QTest.mouseClick(self.dialog.back_button, Qt.MouseButton.LeftButton)
        assert self.dialog.tabs.currentIndex() == 0 and self.dialog.result is self.stock_result
        self.report["checks"]["return_preserves_stock_page"] = True
        self.dialog.search_by.setCurrentIndex(0)
        self.dialog.grade.setText("AG6[2213]")
        QTest.mouseClick(self.dialog.query_button, Qt.MouseButton.LeftButton)
        self.await_idle(self.bracket_query)

    def bracket_query(self):
        assert self.dialog.result and self.dialog.result.page == 1 and self.dialog.result.items
        assert all("AG6[2213]" in item["grade"] for item in self.dialog.result.items)
        self.report["checks"]["changed_grade_resets_paging_and_literal_brackets"] = True
        self.dialog.grade.setText("QA-NO-STOCK-61F801")
        QTest.mouseClick(self.dialog.query_button, Qt.MouseButton.LeftButton)
        self.await_idle(self.empty_query)

    def empty_query(self):
        assert self.dialog.result and self.dialog.result.total == 0 and self.dialog.table.rowCount() == 0
        assert "未找到" in self.dialog.status.text() and not self.dialog.next_button.isEnabled()
        self.report["checks"]["empty_query_clear_previous_results"] = True
        QTest.mouseClick(self.dialog.logout_button, Qt.MouseButton.LeftButton)
        assert not self.dialog.service.logged_in and self.dialog.login_panel.isVisible()
        assert not self.dialog.query_button.isEnabled()
        self.report["checks"]["logout_clears_session_and_results"] = True
        service = self.dialog.service
        QTest.keyClick(self.dialog, Qt.Key.Key_Escape)
        assert not self.dialog.isVisible() and not service.logged_in and not self.dialog.username.text()
        assert not self.dialog.password.text()
        QTest.mouseClick(self.window.inventory_nav, Qt.MouseButton.LeftButton)
        new_dialog = self.window.inventory_dialog
        assert new_dialog is not self.dialog and not new_dialog.service.logged_in and not new_dialog.username.text()
        assert not new_dialog.password.text()
        new_dialog.reject()
        self.report["checks"]["close_and_reopen_require_login"] = True
        self.window.resize(960, 640)
        QTimer.singleShot(100, lambda: self.safe(self.finish))

    def finish(self):
        assert self.window.table.viewport().height() >= 100 and self.window.inventory_nav.isVisible()
        assert (self.window.context.store.all(), self.window.context.store.customer_states()) == self.before
        folder = self.window.context.folder
        for path in folder.iterdir():
            if path.is_file() and path.suffix in (".json", ".ini", ".log"):
                text = path.read_text(encoding="utf-8")
                assert "PRICE_QA_MES_PASSWORD" not in text and "MES密码" not in text
        self.report["checks"]["price_ledger_unchanged_compact_navigation"] = True
        self.report["status"] = "passed"
        self.write_report()
        self.finished = True
        self.timeout.stop()
        self.window.close()

    def write_report(self):
        self.report["elapsed_seconds"] = round(time.monotonic() - self.started, 3)
        (self.output / "report.json").write_text(json.dumps(self.report, ensure_ascii=False, indent=2), encoding="utf-8")

    def fail(self, message):
        if self.finished:
            return
        self.finished = True
        self.username = self.password = ""
        self.exit_code = 1
        self.report.update(status="failed", error=message)
        self.write_report()
        self.timeout.stop()
        self.window.close()


class SyntheticMesResponse:
    def __init__(self, payload=None, *, status=200, location=""):
        self.status_code = status
        self.headers = {"Location": location}
        self.content = json.dumps(payload).encode() if payload is not None else b""

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def iter_content(self, _chunk_size):
        yield self.content


class PackagedInventoryTransportSmoke(QObject):
    """Exercise the actual Qt login against local synthetic HTTP responses."""

    def __init__(self, window, output):
        super().__init__(window)
        self.window, self.output = window, Path(output)
        self.output.mkdir(parents=True, exist_ok=True)
        self.exit_code = 0
        self.finished = False
        self.started = time.monotonic()
        self.report = {"version": VERSION, "frozen": bool(getattr(sys, "frozen", False)),
                       "backend": "isolated SQLite", "actual_qt_ui": True,
                       "synthetic_request_count": 0, "synthetic_credentials_only": True,
                       "outbound_network": False, "real_mes_login": "not_run",
                       "cloud_or_mes_writes": False, "checks": {}, "screenshots": []}
        entry = Path(sys.executable) if self.report["frozen"] else Path(__file__).with_name("desktop_main.py")
        self.report["entry"] = str(entry)
        if self.report["frozen"]:
            self.report["binary_sha256"] = hashlib.sha256(entry.read_bytes()).hexdigest()
        self.transport_patches = []
        self.synthetic_requests = []
        self.timeout = QTimer(self)
        self.timeout.setSingleShot(True)
        self.timeout.timeout.connect(lambda: self.fail("合成 MES 登录验收超时"))
        self.timeout.start(30000)

    def start(self):
        self.await_idle(self.open_inventory)

    def safe(self, continuation):
        try:
            continuation()
        except Exception as exc:
            self.fail(f"{type(exc).__name__}: {exc}")

    def await_idle(self, continuation):
        if self.finished:
            return
        inventory = self.window.inventory_dialog
        if self.window.tasks.jobs or (inventory and inventory.tasks.jobs):
            QTimer.singleShot(25, lambda: self.await_idle(continuation))
        else:
            self.safe(continuation)

    def open_inventory(self):
        from services import inventory_service

        assert self.window.loaded and self.window.context.store.backend == "sqlite"
        assert inventory_service.MES_URL == "http://mes.njjulong.cn:8081/"
        self.before = (self.window.context.store.all(), self.window.context.store.customer_states())
        self.synthetic_responses = iter((
            SyntheticMesResponse(),
            SyntheticMesResponse(status=302, location="/"),
            SyntheticMesResponse({"SYSID": "WMS0301", "CONFIGARGU": "WH_STOCKQUERY"}),
            SyntheticMesResponse({"viewdef": {"viewID": "WH_STOCKGRID", "storeUrl": "Query/QuerySqlObjectNew", "allowEdit": False}}),
            SyntheticMesResponse({"datas": [{"DATACODE": "3382", "DATANAME": "KG"}]}),
            SyntheticMesResponse({"datas": [{"ROOM": "XN", "ROOMNAME": "虚拟库"}]}),
        ))
        self.transport_patches = [patch.object(inventory_service.requests.Session, "request", self.synthetic_request)]
        for replacement in self.transport_patches:
            replacement.start()
        self.window.resize(1280, 800)
        self.window.inventory_nav.click()
        self.dialog = self.window.inventory_dialog
        assert self.dialog.isVisible() and not self.dialog.service.logged_in
        self.dialog.remember_login.setChecked(False)
        self.dialog.username.setText("qa_transport_user")
        self.dialog.password.setText("synthetic-not-a-real-password")
        self.dialog.login()
        self.await_idle(self.login_completed)

    def synthetic_request(self, method, url, **kwargs):
        assert url.startswith("http://mes.njjulong.cn:8081/"), url
        self.report["synthetic_request_count"] += 1
        self.synthetic_requests.append((method, url, kwargs))
        return next(self.synthetic_responses)

    def login_completed(self):
        assert self.report["synthetic_request_count"] == 6
        assert not self.dialog.pending and self.dialog.service.logged_in
        assert not self.dialog.login_panel.isVisible() and self.dialog.query_button.isEnabled()
        assert not self.dialog.password.text()
        assert all(request[2]["verify"] is True for request in self.synthetic_requests)
        self.report["checks"].update(legacy_http_login_completed=True,
                                     synthetic_transport_intercepted=True,
                                     tls_verification_remains_enabled=True,
                                     synthetic_password_cleared=True)
        path = self.output / "legacy-http-login.png"
        assert self.dialog.grab().save(str(path))
        self.report["screenshots"].append(str(path))
        self.dialog.logout_button.click()
        assert not self.dialog.service.logged_in and self.dialog.login_panel.isVisible()
        assert (self.window.context.store.all(), self.window.context.store.customer_states()) == self.before
        self.report["checks"]["logout_clears_session_and_local_ledger_unchanged"] = True
        self.report["status"] = "passed"
        self.finish()

    def finish(self):
        for replacement in reversed(self.transport_patches):
            replacement.stop()
        self.transport_patches.clear()
        self.report["elapsed_seconds"] = round(time.monotonic() - self.started, 3)
        (self.output / "report.json").write_text(
            json.dumps(self.report, ensure_ascii=False, indent=2), encoding="utf-8")
        self.finished = True
        self.timeout.stop()
        self.window.close()

    def fail(self, message):
        if self.finished:
            return
        self.exit_code = 1
        self.report.update(status="failed", error=str(message))
        self.finish()
