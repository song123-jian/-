"""Actual Qt window actions with an isolated MES transport substitute."""
import json
import threading

import pytest
from PySide6.QtCore import QPoint, Qt, QThreadPool, QTimer
from PySide6.QtWidgets import QApplication, QLineEdit

import services.inventory_service as inventory_module
from services.inventory_service import (
    InventoryError,
    InventoryLoginError,
    InventoryPage,
    InventoryService,
    InventorySessionExpired,
    ReservePage,
)
from services.mes_credentials import MesCredentialError, MesCredentialStore
from ui.inventory_dialog import InventoryDialog
from ui.main_window import MainWindow
from ui.theme_tokens import apply_theme

DEFAULT_MES_URL = inventory_module.MES_URL


class FakeInventory:
    def __init__(self):
        self.logged_in = False
        self.fail_login = False
        self.expired = False
        self.empty = False
        self.block = None
        self.calls = []
        self.closed = False
        self.reserve_failure = False
        self.no_batch = False

    def login(self, username, password):
        self.calls.append(("login", threading.get_ident()))
        if self.fail_login:
            raise InventoryLoginError("MES 登录失败，请核对账号和密码")
        if self.block:
            self.block.wait(2)
        self.logged_in = True
        return {"message": "已登录"}

    def query(self, grade, page, *, search_by="material_code"):
        self.calls.append((grade, page, threading.get_ident()))
        if self.block:
            self.block.wait(2)
        if self.expired:
            self.logged_in = False
            raise InventorySessionExpired("登录已过期，请重新登录")
        item = {"grade": grade, "material": "PA12", "stock": "50", "available": "25", "unit": "KG",
                "warehouse": "成品库房", "site": "A01", "batch": "" if self.no_batch else "B01", "stock_date": "2026-09-01 08:00:00", "updated_date": "2026-10-11 10:00:00"}
        return InventoryPage(grade, page, 1, 0 if self.empty else 3, () if self.empty else (item,), "2026-10-11T10:00:00+08:00", search_by)

    def query_reserve(self, batch, page):
        self.calls.append(("reserve", batch, page, threading.get_ident()))
        if self.block:
            self.block.wait(2)
        if self.expired:
            self.logged_in = False
            raise InventorySessionExpired("登录已过期，请重新登录")
        if self.reserve_failure:
            raise InventoryError("此账号未开放备货库存查询")
        item = {"grade": "AG6", "batch": batch, "stock": "18", "customer_code": "00C064", "stock_date": "2026-09-17 19:27:52",
                "delivery_date": "2026-09-12", "customer": "备货示例客户", "quality": "合格", "warehouse": "110-1064"}
        return ReservePage(batch, page, 1, 0 if self.empty else 2, () if self.empty else (item,), "2026-10-11T10:00:00+08:00")

    def logout(self):
        self.logged_in = False

    def close(self):
        self.closed = True
        self.logged_in = False
        if self.block:
            self.block.set()


class MesResponse:
    def __init__(self, payload=None, *, status=200, location=""):
        self.status_code = status
        self.headers = {"Location": location}
        self.content = (json.dumps(payload).encode() if payload is not None else b"")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def iter_content(self, _chunk_size):
        yield self.content


def open_dialog(qtbot, service=None):
    apply_theme(QApplication.instance())
    service = service or FakeInventory()
    dialog = InventoryDialog(grade="AG6", service=service)
    qtbot.addWidget(dialog)
    dialog.show()
    return dialog, service


def login(qtbot, dialog):
    dialog.username.setText("test-account")
    dialog.password.setText("test-secret")
    qtbot.keyClick(dialog.password, Qt.Key.Key_Return)
    qtbot.waitUntil(lambda: not dialog.tasks.jobs, timeout=5000)


def query(qtbot, dialog):
    qtbot.mouseClick(dialog.query_button, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: not dialog.tasks.jobs, timeout=5000)


def test_login_query_paging_new_grade_and_logout(qtbot):
    dialog, service = open_dialog(qtbot)
    assert not dialog.query_button.isEnabled() and dialog.password.echoMode() == QLineEdit.EchoMode.Password
    login(qtbot, dialog)
    assert dialog.password.text() == "" and not dialog.login_panel.isVisible()
    assert dialog.query_button.isEnabled()
    query(qtbot, dialog)
    assert dialog.table.item(0, 3).text() == "50" and "本页库存 50 KG" in dialog.quantity_status.text()
    assert dialog.next_button.isEnabled() and not dialog.previous_button.isEnabled()
    qtbot.mouseClick(dialog.next_button, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: not dialog.tasks.jobs, timeout=5000)
    assert service.calls[-1][:2] == ("AG6", 2) and "第 2/3 页" in dialog.page_status.text()
    dialog.grade.setText("NEW-GRADE")
    assert dialog.table.rowCount() == 0 and not dialog.next_button.isEnabled()
    query(qtbot, dialog)
    assert service.calls[-1][:2] == ("NEW-GRADE", 1)
    assert all(call[-1] != threading.get_ident() for call in service.calls)
    qtbot.mouseClick(dialog.logout_button, Qt.MouseButton.LeftButton)
    assert not service.logged_in and dialog.login_panel.isVisible() and not dialog.query_button.isEnabled()
    dialog.reject()
    assert service.closed and not dialog.username.text() and not dialog.password.text()


@pytest.mark.parametrize('key', [Qt.Key.Key_Return, Qt.Key.Key_Enter])
@pytest.mark.parametrize('field', ['grade', 'search_by', 'batch'])
def test_enter_queries_current_inventory_step_once(qtbot, field, key):
    dialog, service = open_dialog(qtbot)
    login(qtbot, dialog)
    if field == 'batch':
        dialog.tabs.setCurrentIndex(1)
        dialog.batch.setText('B01')
    control = getattr(dialog, field)
    control.setFocus()
    before = len(service.calls)
    qtbot.keyClick(control, key)
    qtbot.waitUntil(lambda: not dialog.tasks.jobs, timeout=5000)
    assert len(service.calls) == before + 1
    if field == 'batch':
        assert service.calls[-1][:3] == ('reserve', 'B01', 1)
    else:
        assert service.calls[-1][:2] == ('AG6', 1)
    assert dialog.isVisible()
    dialog.reject()


def test_login_error_empty_result_and_expiration_are_readable(qtbot):
    dialog, service = open_dialog(qtbot)
    service.fail_login = True
    login(qtbot, dialog)
    assert dialog.notice.isVisible() and dialog.login_panel.isVisible() and not dialog.query_button.isEnabled()
    assert not dialog.password.text()
    service.fail_login = False
    login(qtbot, dialog)
    service.empty = True
    query(qtbot, dialog)
    assert "未找到" in dialog.status.text() and "共 0 条" in dialog.page_status.text()
    assert not dialog.notice.isVisible()
    service.expired = True
    query(qtbot, dialog)
    assert dialog.login_panel.isVisible() and not dialog.query_button.isEnabled() and "过期" in dialog.notice.text.text()
    dialog.reject()


def test_unapproved_http_mes_login_is_blocked_with_actionable_ui_message(qtbot, monkeypatch):
    monkeypatch.setattr(inventory_module, "MES_URL", "http://mes.example.invalid/")
    dialog, service = open_dialog(qtbot, InventoryService())

    login(qtbot, dialog)

    assert "HTTP" in dialog.status.text()
    assert "原服务地址" in dialog.notice.text.text()
    assert dialog.login_panel.isVisible() and not service.logged_in
    dialog.reject()


def test_legacy_http_login_completes_in_actual_qt_dialog_with_local_responses(qtbot, monkeypatch):
    monkeypatch.setattr(inventory_module, "MES_URL", DEFAULT_MES_URL)
    responses = iter((
        MesResponse(),
        MesResponse(status=302, location="/"),
        MesResponse({"SYSID": "WMS0301", "CONFIGARGU": "WH_STOCKQUERY"}),
        MesResponse({"viewdef": {"viewID": "WH_STOCKGRID", "storeUrl": "Query/QuerySqlObjectNew", "allowEdit": False}}),
        MesResponse({"datas": [{"DATACODE": "3382", "DATANAME": "KG"}]}),
        MesResponse({"datas": [{"ROOM": "XN", "ROOMNAME": "虚拟库"}]}),
    ))
    requests_made = []

    def local_mes_response(_session, method, url, **kwargs):
        requests_made.append((method, url, kwargs))
        return next(responses)

    monkeypatch.setattr(inventory_module.requests.Session, "request", local_mes_response)
    dialog, service = open_dialog(qtbot, InventoryService())

    login(qtbot, dialog)

    assert service.logged_in and dialog.query_button.isEnabled()
    assert not dialog.login_panel.isVisible() and not dialog.password.text()
    assert len(requests_made) == 6
    assert all(url.startswith("http://mes.njjulong.cn:8081/") for _, url, _ in requests_made)
    assert all(options["verify"] is True for _, _, options in requests_made)
    dialog.reject()


def test_close_during_request_waits_then_clears(qtbot):
    dialog, service = open_dialog(qtbot)
    login(qtbot, dialog)
    service.block = threading.Event()
    qtbot.mouseClick(dialog.query_button, Qt.MouseButton.LeftButton)
    assert dialog.pending
    dialog.reject()
    qtbot.waitUntil(lambda: not dialog.isVisible() and not dialog.tasks.jobs, timeout=5000)
    assert service.closed and dialog.result is None and not dialog.username.text()


def test_main_navigation_selection_reopen_and_parent_shutdown(qtbot, context, monkeypatch):
    fake = FakeInventory()
    monkeypatch.setattr("ui.inventory_dialog.InventoryService", lambda: fake)
    apply_theme(QApplication.instance())
    window = MainWindow(context)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitUntil(lambda: window.loaded and not window.tasks.jobs, timeout=5000)
    before = (context.store.all(), context.store.customer_states())
    window.table.selectRow(0)
    grade = window.selected()["grade"]
    qtbot.mouseClick(window.inventory_nav, Qt.MouseButton.LeftButton)
    dialog = window.inventory_dialog
    assert dialog.grade.text() == grade and dialog in window.dialogs
    assert dialog.credential_store.path.parent == context.folder
    window.open_inventory()
    assert window.inventory_dialog is dialog
    login(qtbot, dialog)
    fake.block = threading.Event()
    qtbot.mouseClick(dialog.query_button, Qt.MouseButton.LeftButton)
    window.close()
    qtbot.waitUntil(lambda: not window.isVisible() and not dialog.tasks.jobs and not window.tasks.jobs, timeout=5000)
    assert fake.closed and (context.store.all(), context.store.customer_states()) == before


def test_copy_batch_direct_reserve_paging_and_back_preserve_stock(qtbot):
    dialog, service = open_dialog(qtbot)
    login(qtbot, dialog)
    query(qtbot, dialog)
    assert not dialog.copy_batch_button.isEnabled() and not dialog.reserve_selected_button.isEnabled()
    dialog.table.selectRow(0)
    assert dialog.copy_batch_button.isEnabled() and dialog.reserve_selected_button.isEnabled()
    qtbot.mouseClick(dialog.copy_batch_button, Qt.MouseButton.LeftButton)
    assert QApplication.clipboard().text() == "B01" and dialog.batch.text() == "B01"
    original = dialog.result
    qtbot.mouseClick(dialog.reserve_selected_button, Qt.MouseButton.LeftButton)
    assert dialog.pending and not dialog.tabs.tabBar().isEnabled() and not dialog.reserve_query_button.isEnabled()
    qtbot.waitUntil(lambda: not dialog.tasks.jobs, timeout=5000)
    assert dialog.tabs.currentIndex() == 1 and service.calls[-1][:3] == ("reserve", "B01", 1)
    assert dialog.reserve_table.item(0, 2).text() == "18"
    assert dialog.reserve_table.item(0, 6).text() == "备货示例客户" and dialog.reserve_table.item(0, 7).text() == "合格"
    assert "未提供单位" in dialog.reserve_quantity_status.text() and "KG" not in dialog.reserve_quantity_status.text()
    qtbot.mouseClick(dialog.reserve_next_button, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: not dialog.tasks.jobs, timeout=5000)
    assert service.calls[-1][:3] == ("reserve", "B01", 2) and dialog.reserve_previous_button.isEnabled()
    qtbot.mouseClick(dialog.back_button, Qt.MouseButton.LeftButton)
    assert dialog.tabs.currentIndex() == 0 and dialog.result is original and dialog.table.rowCount() == 1
    dialog.search_by.setCurrentIndex(1)
    assert dialog.result is None and dialog.reserve_result is None and not dialog.batch.text()
    query(qtbot, dialog)
    assert dialog.result.search_by == "material_name"
    dialog.reject()


def test_manual_reserve_empty_validation_failure_and_expiration(qtbot):
    dialog, service = open_dialog(qtbot)
    login(qtbot, dialog)
    query(qtbot, dialog)
    stock = dialog.result
    dialog.tabs.setCurrentIndex(1)
    qtbot.mouseClick(dialog.reserve_query_button, Qt.MouseButton.LeftButton)
    assert "完整批号" in dialog.notice.text.text() and not dialog.pending
    dialog.batch.setText("C264671001")
    qtbot.keyClick(dialog.batch, Qt.Key.Key_Return)
    qtbot.waitUntil(lambda: not dialog.tasks.jobs, timeout=5000)
    assert dialog.reserve_result.batch == "C264671001"
    dialog.batch.setText("NEW-BATCH")
    assert dialog.reserve_result is None and dialog.reserve_table.rowCount() == 0
    service.empty = True
    qtbot.mouseClick(dialog.reserve_query_button, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: not dialog.tasks.jobs, timeout=5000)
    assert "没有备货记录" in dialog.reserve_status.text() and "共 0 条" in dialog.reserve_page_status.text()
    assert dialog.result is stock and not dialog.reserve_next_button.isEnabled()
    service.reserve_failure = True
    qtbot.mouseClick(dialog.reserve_query_button, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: not dialog.tasks.jobs, timeout=5000)
    assert dialog.result is stock and dialog.notice.isVisible() and service.logged_in
    service.reserve_failure = False
    service.expired = True
    qtbot.mouseClick(dialog.reserve_query_button, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: not dialog.tasks.jobs, timeout=5000)
    assert dialog.result is None and dialog.reserve_result is None and dialog.login_panel.isVisible()
    assert not dialog.reserve_query_button.isEnabled() and "过期" in dialog.notice.text.text()
    dialog.reject()


def test_no_batch_and_close_during_reserve(qtbot):
    dialog, service = open_dialog(qtbot)
    login(qtbot, dialog)
    service.no_batch = True
    query(qtbot, dialog)
    dialog.table.selectRow(0)
    assert not dialog.copy_batch_button.isEnabled() and not dialog.reserve_selected_button.isEnabled()
    service.no_batch = False
    query(qtbot, dialog)
    dialog.table.selectRow(0)
    service.block = threading.Event()
    qtbot.mouseClick(dialog.reserve_selected_button, Qt.MouseButton.LeftButton)
    assert dialog.pending
    dialog.reject()
    qtbot.waitUntil(lambda: not dialog.isVisible() and not dialog.tasks.jobs, timeout=5000)
    assert service.closed and dialog.result is None and dialog.reserve_result is None and not dialog.batch.text()


def test_double_click_inventory_row_queries_the_selected_batch(qtbot):
    dialog, service = open_dialog(qtbot)
    login(qtbot, dialog)
    query(qtbot, dialog)
    dialog.table.selectRow(0)
    rect = dialog.table.visualItemRect(dialog.table.item(0, 2))
    qtbot.mouseClick(dialog.table.viewport(), Qt.MouseButton.LeftButton, pos=rect.center())
    qtbot.mouseDClick(dialog.table.viewport(), Qt.MouseButton.LeftButton, pos=rect.center())
    qtbot.waitUntil(lambda: not dialog.tasks.jobs, timeout=5000)
    assert dialog.tabs.currentIndex() == 1 and dialog.batch.text() == "B01"
    assert dialog.reserve_result and dialog.reserve_result.batch == "B01"
    assert service.calls[-1][:3] == ("reserve", "B01", 1)
    dialog.reject()


def test_all_inventory_cells_headers_center_and_full_dates_fit(qtbot):
    dialog, _ = open_dialog(qtbot)
    login(qtbot, dialog)
    query(qtbot, dialog)
    dialog.table.selectRow(0)
    qtbot.mouseClick(dialog.reserve_selected_button, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: not dialog.tasks.jobs, timeout=5000)
    assert dialog.reserve_table.columnCount() == 13
    assert dialog.reserve_table.item(0, 12).text() == "110-1064"
    for table, date_columns in ((dialog.table, (9, 10)), (dialog.reserve_table, (4,))):
        assert table.property("role") == "inventoryTable"
        assert table.horizontalHeader().defaultAlignment() == Qt.AlignmentFlag.AlignCenter
        assert all(table.item(0, col).textAlignment() == Qt.AlignmentFlag.AlignCenter for col in range(table.columnCount()))
        for col in date_columns:
            text = table.item(0, col).text()
            assert len(text) == 19 and table.columnWidth(col) >= table.fontMetrics().horizontalAdvance(text) + 32
        assert table.horizontalScrollBar().maximum() > 0
    dialog.reserve_table.horizontalScrollBar().setValue(dialog.reserve_table.horizontalScrollBar().maximum())
    assert dialog.reserve_table.visualItemRect(dialog.reserve_table.item(0, 12)).intersects(dialog.reserve_table.viewport().rect())
    dialog.reject()


def test_successful_login_saved_prefilled_and_clear_without_logging_out(qtbot, tmp_path):
    store = MesCredentialStore(tmp_path)
    dialog = InventoryDialog(service=FakeInventory(), credential_store=store)
    qtbot.addWidget(dialog)
    dialog.show()
    login(qtbot, dialog)
    assert store.load() == ("test-account", "test-secret")
    dialog.reject()
    reopened = InventoryDialog(service=FakeInventory(), data_folder=tmp_path)
    qtbot.addWidget(reopened)
    reopened.show()
    assert reopened.username.text() == "test-account" and reopened.password.text() == "test-secret"
    qtbot.mouseClick(reopened.login_button, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: not reopened.tasks.jobs, timeout=5000)
    qtbot.mouseClick(reopened.clear_login_button, Qt.MouseButton.LeftButton)
    assert store.load() is None and reopened.service.logged_in and not reopened.remember_login.isChecked()
    qtbot.mouseClick(reopened.logout_button, Qt.MouseButton.LeftButton)
    assert not reopened.password.text()
    reopened.reject()


def test_unchecking_remember_clears_saved_data_but_keeps_typed_inputs(qtbot, tmp_path):
    store = MesCredentialStore(tmp_path)
    store.save("test-account", "test-secret")
    dialog = InventoryDialog(service=FakeInventory(), credential_store=store)
    qtbot.addWidget(dialog)
    dialog.show()
    qtbot.mouseClick(dialog.remember_login, Qt.MouseButton.LeftButton, pos=QPoint(8, dialog.remember_login.height() // 2))
    assert store.load() is None and dialog.username.text() == "test-account" and dialog.password.text() == "test-secret"
    login(qtbot, dialog)
    assert dialog.service.logged_in and store.load() is None
    dialog.reject()


def test_failed_login_does_not_replace_saved_password(qtbot, tmp_path):
    store = MesCredentialStore(tmp_path)
    store.save("original-account", "original-secret")
    fake = FakeInventory()
    fake.fail_login = True
    dialog = InventoryDialog(service=fake, credential_store=store)
    qtbot.addWidget(dialog)
    dialog.show()
    login(qtbot, dialog)
    assert store.load() == ("original-account", "original-secret")
    assert not dialog.service.logged_in and dialog.login_panel.isVisible() and not dialog.password.text()
    dialog.reject()


@pytest.mark.parametrize("failure", ["save", "clear", "load"])
def test_credential_storage_errors_are_visible_and_login_remains_usable(qtbot, tmp_path, monkeypatch, failure):
    store = MesCredentialStore(tmp_path)

    def fail(*_):
        raise MesCredentialError("登录信息存储失败，请检查权限")

    monkeypatch.setattr(store, failure, fail)
    dialog = InventoryDialog(service=FakeInventory(), credential_store=store)
    qtbot.addWidget(dialog)
    dialog.show()
    if failure == "load":
        assert dialog.notice.isVisible() and not dialog.service.logged_in
    elif failure == "clear":
        qtbot.mouseClick(dialog.remember_login, Qt.MouseButton.LeftButton, pos=QPoint(8, dialog.remember_login.height() // 2))
        assert dialog.remember_login.isChecked() and dialog.notice.isVisible()
    else:
        login(qtbot, dialog)
        assert dialog.service.logged_in and dialog.query_button.isEnabled() and dialog.notice.isVisible()
        assert "存储失败" in dialog.notice.text.text()
    dialog.reject()


def test_inventory_close_waits_for_pool_idle_without_blocking(qtbot, monkeypatch):
    service = FakeInventory()
    dialog = InventoryDialog(service=service)
    qtbot.addWidget(dialog)
    dialog.show()
    started, release, pool_idle = threading.Event(), threading.Event(), threading.Event()
    pool = dialog.tasks.read_pool
    original_active_count = QThreadPool.activeThreadCount
    wait_calls = []

    def delayed_active_count(candidate):
        if candidate is pool and not pool_idle.is_set():
            return max(1, original_active_count(candidate))
        return original_active_count(candidate)

    monkeypatch.setattr(QThreadPool, "activeThreadCount", delayed_active_count)
    monkeypatch.setattr(QThreadPool, "waitForDone", lambda candidate, *args: wait_calls.append(candidate))
    dialog.tasks.submit(lambda: (started.set(), release.wait(5)), lambda _: None,
                        lambda error: pytest.fail(str(error)))
    qtbot.waitUntil(started.is_set, timeout=2000)
    try:
        dialog.reject()
        assert dialog.isVisible()
        release.set()
        qtbot.waitUntil(lambda: not dialog.tasks.jobs, timeout=3000)
        assert dialog.isVisible()
        assert not wait_calls
        QTimer.singleShot(50, pool_idle.set)
        qtbot.waitUntil(lambda: not dialog.isVisible(), timeout=3000)
        assert not wait_calls
    finally:
        release.set()
        pool_idle.set()
