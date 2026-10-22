"""Tray lifecycle and unchanged metadata, using only disposable SQLite data."""
import copy
import threading
from types import SimpleNamespace

import pytest
from PySide6.QtCore import Qt, QThreadPool, QTimer
from PySide6.QtGui import QIcon
from PySide6.QtTest import QSignalSpy
from PySide6.QtWidgets import QApplication, QDialog, QMessageBox, QSystemTrayIcon
from shiboken6 import isValid

from ui import account_controller
from ui.customer_delegate import COUNT_ROLE
from ui.main_window import MainWindow
from ui.system_tray import SystemTray
from ui.theme_tokens import apply_theme


@pytest.fixture
def shell(qtbot, context, monkeypatch):
    app = QApplication.instance()
    apply_theme(app)
    app.setWindowIcon(QIcon(":/app-icon.svg"))
    monkeypatch.setattr(QSystemTrayIcon, "isSystemTrayAvailable", staticmethod(lambda: True))
    monkeypatch.setattr(QSystemTrayIcon, "supportsMessages", staticmethod(lambda: False))
    monkeypatch.setattr(QMessageBox, "question", lambda *args: QMessageBox.StandardButton.Discard)
    window = MainWindow(context)
    tray = SystemTray(app)
    tray.attach(window)

    def drain_before_delete(widget):
        for dialog in tuple(widget.dialogs):
            if isValid(dialog):
                dialog.accept()
        widget.request_exit()
        qtbot.waitUntil(lambda: widget._ready_to_close and not widget.isVisible(), timeout=10000)

    qtbot.addWidget(window, before_close_func=drain_before_delete)
    window.show()
    qtbot.waitUntil(lambda: window.loaded and not window.tasks.jobs, timeout=10000)
    yield window, tray
    if isValid(window):
        for dialog in tuple(window.dialogs):
            if isValid(dialog):
                dialog.accept()
        window.request_exit()
        qtbot.waitUntil(lambda: not isValid(window) or (window._ready_to_close and not window.isVisible()),
                        timeout=10000)
    tray.detach()
    tray.deleteLater()


def test_close_to_tray_restores_current_page_and_maximized_state(qtbot, shell):
    window, tray = shell
    window.settings_nav.click()
    window.showMaximized()
    qtbot.waitUntil(window.isMaximized)
    window.close()
    assert not window.isVisible() and not window._closing and not window.context.closing
    assert tray.icon.isVisible()
    tray.activated(QSystemTrayIcon.ActivationReason.DoubleClick)
    qtbot.waitUntil(window.isVisible)
    assert window.isMaximized() and window.pages.currentIndex() == 2 and window.settings_nav.isChecked()
    window.query_nav.click()
    assert window.pages.currentIndex() == 0 and not window.settings_nav.isChecked()


def test_missing_tray_service_falls_back_to_graceful_exit(qtbot, shell, monkeypatch):
    window, _ = shell
    monkeypatch.setattr(QSystemTrayIcon, "isSystemTrayAvailable", staticmethod(lambda: False))
    window.close()
    qtbot.waitUntil(lambda: window._ready_to_close and not window.isVisible())
    assert window.context.closing


def test_hidden_dirty_form_can_cancel_exit_without_losing_edits(qtbot, shell, monkeypatch):
    window, tray = shell
    window.new_quote()
    dialog = next(iter(window.dialogs))
    dialog.fields["grade"].setText("尚未保存的编辑")
    window.close()
    assert not window.isVisible() and not dialog.isVisible()
    window.close()
    prompts = []

    def cancel(*args):
        prompts.append(dialog.isVisible())
        return QMessageBox.StandardButton.Cancel

    monkeypatch.setattr(QMessageBox, "question", cancel)
    tray.quit_action.trigger()
    assert prompts == [True]
    assert window.isVisible() and dialog.isVisible()
    assert dialog.fields["grade"].text() == "尚未保存的编辑"
    assert not window._closing and not window._exit_requested and not window.context.closing


def test_exit_drains_write_while_gui_remains_responsive(qtbot, shell, monkeypatch):
    window, tray = shell
    started, release = threading.Event(), threading.Event()
    errors = []
    wait_calls = []
    monkeypatch.setattr(QThreadPool, "waitForDone", lambda pool, *args: wait_calls.append(pool))

    def save():
        started.set()
        assert release.wait(5)
        return window.context.store.add({"customer": "托盘隔离验证", "grade": "SAFE", "price": "10",
                                         "effective_date": "2026-10-19"})

    window.tasks.submit(save, lambda _: None, errors.append, write=True)
    qtbot.waitUntil(started.is_set)
    try:
        window.close()
        assert not window._closing and window.tasks.write_count == 1
        tray.quit_action.trigger()
        assert window._closing and not window._ready_to_close
        window.request_exit()
        window.logout_account()
        assert not window._logout_on_close
        responsive = []
        QTimer.singleShot(0, lambda: responsive.append(True))
        qtbot.waitUntil(lambda: bool(responsive))
    finally:
        release.set()
        qtbot.waitUntil(lambda: window._ready_to_close, timeout=7000)
    assert not errors
    assert len(window.context.store.list({"customer": "托盘隔离验证"})["items"]) == 1
    assert not wait_calls


def test_exit_keeps_polling_until_pool_is_idle_after_jobs_finish(qtbot, shell, monkeypatch):
    window, _ = shell
    started, release, pool_idle = threading.Event(), threading.Event(), threading.Event()
    pool = window.tasks.write_pool
    original_active_count = QThreadPool.activeThreadCount

    def delayed_active_count(candidate):
        if candidate is pool and not pool_idle.is_set():
            return max(1, original_active_count(candidate))
        return original_active_count(candidate)

    monkeypatch.setattr(QThreadPool, "activeThreadCount", delayed_active_count)
    window.tasks.submit(lambda: (started.set(), release.wait(5)), lambda _: None,
                        lambda error: pytest.fail(str(error)), write=True)
    qtbot.waitUntil(started.is_set, timeout=2000)
    window.request_exit()
    try:
        assert not window._ready_to_close
        release.set()
        qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=3000)
        assert not window._ready_to_close
        QTimer.singleShot(50, pool_idle.set)
        qtbot.waitUntil(lambda: window._ready_to_close, timeout=3000)
    finally:
        release.set()
        pool_idle.set()
        qtbot.waitUntil(lambda: (window._finish_close(), window._ready_to_close)[1], timeout=3000)


def test_logout_bypasses_tray_and_emits_account_closed(qtbot, shell):
    window, tray = shell
    window.context.account = {"username": "simulated-managed-account"}
    closed = QSignalSpy(window.accountClosed)
    window.logout_account()
    qtbot.waitUntil(lambda: closed.count() == 1)
    assert closed.at(0) == [True]
    assert window.context.closing and window._ready_to_close
    tray.detach()
    assert not tray.icon.isVisible() and tray.window is None


def test_first_minimize_notification_is_only_shown_once(shell, monkeypatch):
    window, tray = shell
    messages = []
    monkeypatch.setattr(QSystemTrayIcon, "supportsMessages", staticmethod(lambda: True))
    monkeypatch.setattr(tray.icon, "showMessage", lambda *args: messages.append(args))
    assert tray.minimize()
    tray.restore()
    assert tray.minimize()
    tray.restore()
    assert len(messages) == 1


def test_unchanged_metadata_preserves_objects_but_revision_and_changes_apply(shell):
    window, _ = shell
    meta = {"stats": {"items": 1}, "customers": [
        {"customer_key": "synthetic-key", "name": "合成客户", "count": 1, "revision": 1}],
        "materials": ["合成材料A", "合成材料B"]}
    window.meta_loaded(meta)
    window.material.setCurrentIndex(2)
    completer = window.customer.completer()
    directory = QSignalSpy(window.customer_model.modelReset)
    options = QSignalSpy(window.material.model().modelReset)
    same_display = copy.deepcopy(meta)
    same_display["customers"][0]["revision"] = 2
    window.meta_loaded(same_display)
    assert window.customer_revisions == {"synthetic-key": 2}
    assert directory.count() == options.count() == 0
    assert window.customer.completer() is completer
    assert window.material.currentData() == "合成材料B"
    changed = copy.deepcopy(same_display)
    changed["stats"]["items"] = changed["customers"][0]["count"] = 2
    changed["customers"][0]["name"] = "已改名的合成客户"
    changed["materials"].append("合成材料C")
    window.meta_loaded(changed)
    assert directory.count() == 1
    assert window.customer_model.index(1, 0).data() == "已改名的合成客户"
    assert window.customer_model.index(1, 0).data(COUNT_ROLE) == 2
    assert window.material.currentData() == "合成材料B" and window.material.count() == 4
    window.meta_loaded({"stats": {"items": 0}, "customers": [], "materials": []})
    assert window.customer_model.rowCount() == window.material.count() == 1
    assert window.customer.completer().model().rowCount() == 0
    assert window.material.currentData() == ""


def test_storage_settings_row_and_managed_permissions(qtbot, context):
    context.account = {"username": "simulated-managed-account"}
    window = MainWindow(context)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitUntil(lambda: window.loaded and not window.tasks.jobs, timeout=10000)
    try:
        window.resize(960, 640)
        qtbot.mouseClick(window.settings_nav, Qt.MouseButton.LeftButton)
        assert window.pages.currentIndex() == 2
        assert window.storage_label.text() == "● Supabase 云数据库"
        assert window.settings_nav.accessibleName() == "数据库设置"
        assert window.storage_label.geometry().right() < window.settings_nav.geometry().left()
        assert abs(window.storage_label.geometry().center().y() - window.settings_nav.geometry().center().y()) <= 1
        backend_button = next(control for control in window.pages.widget(2).findChildren(type(window.settings_nav))
                              if control.text() == "打开数据库设置")
        assert not backend_button.isEnabled()
        window.data_nav.click()
        assert window.pages.currentIndex() == 1 and not window.settings_nav.isChecked()
    finally:
        window.request_exit()
        qtbot.waitUntil(lambda: window._ready_to_close)


def test_controller_logout_detaches_tray_and_closes_old_session(qtbot, context, monkeypatch):
    app = QApplication.instance()
    apply_theme(app)
    app.setWindowIcon(QIcon(":/app-icon.svg"))
    previous_quit_policy = app.quitOnLastWindowClosed()
    closed, logins, quits = [], [], []
    session = SimpleNamespace(close=lambda: closed.append(True))
    context.account = {"username": "simulated-managed-account"}

    class LoginStub(QDialog):
        def __init__(self, folder):
            super().__init__()
            self.session = session

        def exec(self):
            logins.append(True)
            return QDialog.DialogCode.Accepted if len(logins) == 1 else QDialog.DialogCode.Rejected

    monkeypatch.setattr(account_controller, "LoginDialog", LoginStub)
    monkeypatch.setattr(account_controller, "account_context", lambda folder, value: context)
    monkeypatch.setattr(app, "quit", lambda: quits.append(True))
    monkeypatch.setattr(QSystemTrayIcon, "isSystemTrayAvailable", staticmethod(lambda: True))
    controller = account_controller.AccountController(app, context.folder)
    try:
        qtbot.waitUntil(lambda: controller.window is not None and controller.window.loaded)
        old_window = controller.window
        old_window.close()
        assert not old_window.isVisible() and controller.session is session
        controller.wake()
        assert old_window.isVisible()
        old_window.logout_account()
        qtbot.waitUntil(lambda: bool(quits))
        assert closed == [True] and len(logins) == 2
        assert controller.window is controller.session is controller.tray.window is None
        assert not controller.tray.icon.isVisible()
    finally:
        controller.tray.detach()
        controller.deleteLater()
        app.setQuitOnLastWindowClosed(previous_quit_policy)
