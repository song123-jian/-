import re
import threading
from decimal import Decimal
from unittest.mock import patch

import pytest
from conftest import record
from pdf_factory import quotation_pdf
from PySide6.QtCore import QDate, Qt, QTimer
from PySide6.QtGui import QGuiApplication
from PySide6.QtWidgets import QApplication, QMessageBox
from shiboken6 import isValid

from services.backend_service import BackendService
from ui.dialogs import BackendDialog, HistoryDialog, ImportPreviewDialog, PdfImportOptionsDialog, QuoteDialog
from ui.main_window import MainWindow
from ui.quote_table_model import ACTION_COLUMN, PRICE_COLUMN, ROW_ROLE
from ui.theme_tokens import COLORS, apply_theme


@pytest.fixture(autouse=True)
def discard_unfinished_forms(monkeypatch):
    # Test teardown must never wait for a human in a modal confirmation.
    monkeypatch.setattr(QMessageBox, "question", lambda *args, **kwargs: QMessageBox.StandardButton.Discard)


@pytest.fixture
def window(qtbot, context):
    apply_theme(QApplication.instance())
    window = MainWindow(context)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitUntil(lambda: window.loaded and not window.tasks.jobs, timeout=10000)
    yield window
    for dialog in tuple(window.dialogs):
        dialog.accept()
    if isValid(window) and window.isVisible():
        window.close()
        qtbot.waitUntil(lambda: not isValid(window) or not window.isVisible(), timeout=10000)


def test_customer_search_enter_and_empty_result(qtbot, window):
    assert window.model.rowCount() == 41
    window.customer.setText("金华")
    qtbot.keyClick(window.customer, Qt.Key.Key_Return)
    qtbot.waitUntil(lambda: window.model.rowCount() == 16, timeout=5000)
    window.customer.setText("完全不存在的客户")
    qtbot.keyClick(window.customer, Qt.Key.Key_Return)
    qtbot.waitUntil(lambda: window.model.rowCount() == 0, timeout=5000)
    assert window.empty_label.isVisible()
    assert "没有找到匹配报价" in window.empty_label.text()
    assert window.customer.text() == "完全不存在的客户"


def test_numeric_sort_retains_quote_id(qtbot, window):
    window.proxy.sort(PRICE_COLUMN, Qt.SortOrder.AscendingOrder)
    prices = [Decimal(window.proxy.index(index, PRICE_COLUMN).data(ROW_ROLE)["price"]) for index in range(window.proxy.rowCount())]
    assert prices == sorted(prices)
    target = window.proxy.index(0, 0).data(ROW_ROLE)
    window.table.selectRow(0)
    window.edit_selected()
    dialog = next(iter(window.dialogs))
    assert dialog.row["id"] == target["id"]
    assert dialog.fields["customer"].isReadOnly()
    dialog.accept()


def test_quote_dialog_exact_save_field_error_and_dirty_close(qtbot, window, context):
    dialog = QuoteDialog(window.prices, window.tasks, context.storage_generation, parent=window)
    qtbot.addWidget(dialog)
    dialog.show()
    dialog.activateWindow()
    qtbot.waitUntil(dialog.isActiveWindow, timeout=3000)
    for key, value in record(price="9.734513").items():
        field = dialog.fields[key]
        if key == "tax_type":
            field.setCurrentText(value)
        elif key == "effective_date":
            field.setDate(QDate.fromString(value, "yyyy-MM-dd"))
        elif key == "note":
            field.setPlainText(value)
        else:
            field.setText(value)
    with patch.object(QMessageBox, "question", return_value=QMessageBox.StandardButton.Cancel):
        dialog.reject()
        assert dialog.isVisible()
    dialog.fields["price"].setText("0")
    qtbot.mouseClick(dialog.save, Qt.MouseButton.LeftButton)
    assert dialog.errors["price"].isVisible()
    assert dialog.fields["price"].hasFocus()
    dialog.fields["price"].setText("9.734513")
    with qtbot.waitSignal(dialog.saved, timeout=5000):
        qtbot.mouseClick(dialog.save, Qt.MouseButton.LeftButton)
    row = context.store.list({"customer": "QA隔离客户"})["items"][0]
    assert row["price"] == "9.734513"
    assert dialog.isVisible() and dialog.row["id"] == row["id"]
    dialog.accept()


def test_history_one_point_and_full_precision(qtbot, window, context):
    first = context.store.add(record(price="9.734513"))
    items = context.store.history(first["id"])["items"]
    dialog = HistoryDialog(items, window)
    qtbot.addWidget(dialog)
    dialog.show()
    qtbot.waitUntil(lambda: len(dialog.trend.points) == 1, timeout=3000)
    assert dialog.model.index(0, 1).data() == "9.734513"
    dialog.table.selectRow(0)
    dialog.copy_row()
    assert "9.734513" in QGuiApplication.clipboard().text()
    dialog.accept()


def test_import_errors_disable_confirm(qtbot, window, context, tmp_path):
    path = tmp_path / "bad.csv"
    path.write_text("客户,牌号,价格,更新日期\nQA,PP,0,2026-10-09\n", encoding="utf-8")
    preview = window.prices.preview_import(path, context.storage_generation)
    dialog = ImportPreviewDialog(preview, window.prices, window.tasks, window)
    qtbot.addWidget(dialog)
    dialog.show()
    assert not dialog.commit.isEnabled()
    assert dialog.notice.isVisible()
    dialog.reject()


def test_old_query_cannot_overwrite_latest(qtbot, window, context):
    old_started, release = threading.Event(), threading.Event()
    original = context.store.list

    def slow(filters=None):
        if filters and filters.get("customer") == "金华":
            old_started.set()
            assert release.wait(5)
        return original(filters)

    with patch.object(context.store, "list", side_effect=slow):
        window.customer.setText("金华")
        window.query()
        qtbot.waitUntil(old_started.is_set, timeout=3000)
        window.customer.setText("不存在")
        window.query()
        qtbot.waitUntil(lambda: window.model.rowCount() == 0, timeout=3000)
        release.set()
        qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert window.model.rowCount() == 0


def test_old_generation_result_discarded(qtbot, window, context):
    generation = context.storage_generation
    release, started = threading.Event(), threading.Event()
    results = []

    def delayed():
        started.set()
        assert release.wait(5)
        return {"storage_generation": generation}

    window.tasks.submit(delayed, results.append, lambda exc: pytest.fail(str(exc)), generation=generation)
    qtbot.waitUntil(started.is_set, timeout=3000)
    BackendService(context).switch_backend("sqlite", generation=generation)
    release.set()
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert not results


def test_background_read_keeps_ui_responsive_and_close_waits_write(qtbot, window, context):
    release, started = threading.Event(), threading.Event()
    heartbeats = []
    timer = QTimer()
    timer.setInterval(15)
    timer.timeout.connect(lambda: heartbeats.append(1))
    timer.start()

    def delayed_write():
        started.set()
        assert release.wait(5)
        return window.prices.add_quote({**record(), "storage_generation": context.storage_generation})

    window.tasks.submit(delayed_write, lambda value: None, lambda exc: pytest.fail(str(exc)), generation=context.storage_generation, write=True)
    qtbot.waitUntil(started.is_set, timeout=3000)
    qtbot.waitUntil(lambda: len(heartbeats) >= 4, timeout=1500)
    window.close()
    assert window.isVisible()
    assert window.tasks.closing
    release.set()
    qtbot.waitUntil(lambda: not window.isVisible(), timeout=5000)
    timer.stop()
    assert context.store.list({"customer": "QA隔离客户"})["items"]


def test_keyboard_shortcuts_and_compact_layout(qtbot, window):
    window.resize(960, 640)
    window.activateWindow()
    qtbot.waitUntil(window.isActiveWindow, timeout=3000)
    qtbot.keyClick(window, Qt.Key.Key_F, Qt.KeyboardModifier.ControlModifier)
    assert window.customer.hasFocus()
    qtbot.keyClick(window, Qt.Key.Key_N, Qt.KeyboardModifier.ControlModifier)
    qtbot.waitUntil(lambda: bool(window.dialogs), timeout=3000)
    dialog = next(iter(window.dialogs))
    qtbot.keyClick(dialog, Qt.Key.Key_Escape)
    qtbot.waitUntil(lambda: not dialog.isVisible(), timeout=3000)
    assert window.cards_grid.rowCount() == 1
    assert window.table.viewport().height() >= 120
    assert window.table.height() > 70
    assert window.search_button.isVisible()
    assert COLORS["g700"] == "#2f6b54"


def test_backend_failure_restores_controls(qtbot, window):
    dialog = BackendDialog(window.backends, window.tasks, window)
    qtbot.addWidget(dialog)
    dialog.show()
    dialog.backend.setCurrentIndex(1)
    dialog.key.setText("anon-is-not-a-backend-key")
    qtbot.mouseClick(dialog.test, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: not dialog.busy, timeout=5000)
    assert dialog.test.isEnabled() and dialog.save.isEnabled()
    assert dialog.notice.isVisible()
    assert "Secret" in dialog.notice.text.text()
    dialog.accept()


def test_native_import_confirmation_commits_and_refreshes(qtbot, window, tmp_path):
    path = tmp_path / "new.csv"
    path.write_text("客户,牌号,价格,更新日期\nQt导入客户,PP,9.734513,2026-10-09\n", encoding="utf-8")
    preview = window.prices.preview_import(path, window.context.storage_generation)
    dialog = ImportPreviewDialog(preview, window.prices, window.tasks, window)
    qtbot.addWidget(dialog)
    dialog.show()
    with qtbot.waitSignal(dialog.imported, timeout=5000) as signal:
        qtbot.mouseClick(dialog.commit, Qt.MouseButton.LeftButton)
        assert not dialog.commit.isEnabled()
    assert signal.args[0]["added"] == 1
    assert window.context.store.list({"customer": "Qt导入客户"})["items"][0]["price"] == "9.734513"


def test_native_backend_switch_updates_generation(qtbot, window):
    generation = window.context.storage_generation
    dialog = BackendDialog(window.backends, window.tasks, window)
    qtbot.addWidget(dialog)
    dialog.show()
    with qtbot.waitSignal(dialog.switched, timeout=5000):
        qtbot.mouseClick(dialog.save, Qt.MouseButton.LeftButton)
    assert window.context.storage_generation != generation
    assert not dialog.isVisible()


def test_old_form_failure_restores_submit_without_writing(qtbot, window):
    row = window.model.items[0]
    generation = window.context.storage_generation
    dialog = QuoteDialog(window.prices, window.tasks, generation, row=row, parent=window)
    qtbot.addWidget(dialog)
    dialog.show()
    dialog.fields["price"].setText("9.734513")
    dialog.fields["reason"].setText("旧表单测试")
    BackendService(window.context).switch_backend("sqlite", generation=generation)
    qtbot.mouseClick(dialog.save, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: not dialog.busy, timeout=5000)
    assert dialog.save.isEnabled()
    assert "数据库已切换" in dialog.notice.text.text()
    assert len(window.context.store.history(row["id"])["items"]) == 1
    dialog.accept()


def test_delegate_history_click_uses_id_after_sort(qtbot, window):
    window.resize(1450, 900)
    window.proxy.sort(PRICE_COLUMN, Qt.SortOrder.DescendingOrder)
    index = window.proxy.index(0, ACTION_COLUMN)
    row_id = index.data(ROW_ROLE)["id"]
    window.table.scrollTo(index)
    qtbot.wait(50)
    rect = window.table.visualRect(index)
    first, _ = window.delegate.action_rects(rect)
    with qtbot.waitSignal(window.delegate.historyRequested, timeout=2000) as signal:
        qtbot.mouseClick(window.table.viewport(), Qt.MouseButton.LeftButton, pos=first.center())
    assert signal.args[0] == row_id
    qtbot.waitUntil(lambda: bool(window.dialogs), timeout=5000)
    next(iter(window.dialogs)).accept()


def test_unexpected_worker_failure_recovers_busy_state(qtbot, window, caplog):
    errors = []

    def failure():
        raise RuntimeError("isolated QA failure")

    window.tasks.submit(failure, lambda _: pytest.fail("unexpected success"), errors.append, write=True)
    qtbot.waitUntil(lambda: bool(errors) and not window.tasks.jobs, timeout=5000)
    assert "程序数据目录中的 app.log" in str(errors[0])
    assert "Background task failed (RuntimeError" in caplog.text
    assert not window.progress.isVisible()


def test_unexpected_worker_log_has_safe_correlation_context(qtbot, window, caplog):
    secret = "isolated-sensitive-error-marker"
    errors = []

    window.tasks.submit(lambda: (_ for _ in ()).throw(RuntimeError(secret)),
                        lambda _: pytest.fail("unexpected success"), errors.append, write=True)
    qtbot.waitUntil(lambda: bool(errors) and not window.tasks.jobs, timeout=5000)

    assert secret not in caplog.text
    assert "phase=write" in caplog.text and "error_code=unexpected_error" in caplog.text
    match = re.search(r"operation_id=([0-9a-f]{16})", caplog.text)
    assert match and match.group(1) in str(errors[0])


@pytest.mark.parametrize("method", ["refresh_quotes", "list_quotes"])
def test_successful_read_retry_clears_previous_error(qtbot, window, monkeypatch, method):
    from domain import NetworkError

    original = getattr(window.prices, method)

    def failed_read(*args):
        raise NetworkError("临时云端读取失败")

    monkeypatch.setattr(window.prices, method, failed_read)
    (window.refresh if method == "refresh_quotes" else window.query)()
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert window.notice.isVisible()
    monkeypatch.setattr(window.prices, method, original)
    (window.refresh if method == "refresh_quotes" else window.query)()
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert window.customer_model.rowCount() == 6
    assert not window.notice.isVisible()


def test_query_recovery_preserves_outstanding_metadata_error(qtbot, window, monkeypatch):
    from domain import NetworkError

    original_meta = window.prices.refresh_quotes
    original_query = window.prices.list_quotes

    def failed_read(*args):
        raise NetworkError("临时云端读取失败")

    monkeypatch.setattr(window.prices, "refresh_quotes", failed_read)
    monkeypatch.setattr(window.prices, "list_quotes", failed_read)
    window.refresh()
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    monkeypatch.setattr(window.prices, "list_quotes", original_query)
    window.query()
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert window.notice.isVisible()
    assert window.read_errors == {"meta": "临时云端读取失败"}
    monkeypatch.setattr(window.prices, "refresh_quotes", original_meta)
    window.refresh()
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert not window.notice.isVisible()


def test_read_recovery_preserves_later_operation_error(qtbot, window):
    from domain import NetworkError

    window.query_failed(NetworkError("临时云端读取失败"))
    window.failed(ValueError("导出文件无法写入"))
    window.query()
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert window.notice.isVisible()
    assert window.notice.text.text() == "导出文件无法写入"
    assert not window.read_errors


def test_pdf_file_picker_to_confirmed_preview_and_native_commit(qtbot, window, context, tmp_path, monkeypatch):
    monkeypatch.setattr("importer.today", lambda: "2026-10-10")
    rows = [["材料名称", "材料规格", "价格", "备注"], ["PA6+GF15 黑色", "PDF-QA-BG3", "9.734513", ""]]
    path = tmp_path / "quotation.pdf"
    path.write_bytes(quotation_pdf([rows], metadata=["客户名称：金华领先塑业有限公司", "日期：2026年9月23日", "本次报价（未税）"]))

    def choose(*args):
        assert "*.pdf" in args[-1]
        return str(path), ""

    monkeypatch.setattr("ui.main_window.QFileDialog.getOpenFileName", choose)
    index = next(window.customer_model.index(row, 0) for row in range(window.customer_model.rowCount())
                 if window.customer_model.index(row, 0).data(Qt.ItemDataRole.UserRole) == "金华领先")
    qtbot.mouseClick(window.customers.viewport(), Qt.MouseButton.LeftButton, pos=window.customers.visualRect(index).center())
    window.import_file()
    qtbot.waitUntil(lambda: any(isinstance(dialog, PdfImportOptionsDialog) for dialog in window.dialogs), timeout=5000)
    options = next(dialog for dialog in window.dialogs if isinstance(dialog, PdfImportOptionsDialog))
    assert options.customer.currentText() == "金华领先"
    assert not options.customer.isEnabled()
    assert options.date.text() == "" and options.tax.currentData() == ""
    assert options.split_color.isVisible() and options.split_color.isChecked()
    options.tax.setCurrentText("未税")
    options.date.setText("2026-02-30")
    qtbot.mouseClick(options.preview, Qt.MouseButton.LeftButton)
    assert options.isVisible() and options.notice.isVisible()
    assert len(context.store.all()) == 41
    options.date.clear()
    qtbot.mouseClick(options.preview, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: any(isinstance(dialog, ImportPreviewDialog) for dialog in window.dialogs), timeout=5000)
    preview = next(dialog for dialog in window.dialogs if isinstance(dialog, ImportPreviewDialog))
    assert (preview.preview["added"], preview.preview["error_count"]) == (1, 0)
    assert preview.table.item(0, 7).text() == "PDF第1页·表1"
    assert len(context.store.all()) == 41
    with qtbot.waitSignal(preview.imported, timeout=5000):
        qtbot.mouseClick(preview.commit, Qt.MouseButton.LeftButton)
    saved = context.store.list({"q": "PDF-QA-BG3"})["items"][0]
    assert (saved["customer"], saved["price"], saved["material"], saved["color"]) == ("金华领先", "9.734513", "PA6+GF15", "黑色")
    assert saved["effective_date"] == "2026-10-10"


def test_selected_customer_csv_merge_commit_and_selection_survives_refresh(qtbot, window, context, tmp_path, monkeypatch):
    customer = window.customer_model.index(1, 0).data(Qt.ItemDataRole.UserRole)
    existing = next(row for row in window.model.items if row["customer"] == customer)
    index = window.customer_model.index(1, 0)
    qtbot.mouseClick(window.customers.viewport(), Qt.MouseButton.LeftButton, pos=window.customers.visualRect(index).center())
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert window.import_customer == customer
    path = tmp_path / "selected.csv"
    tax_header = "含税价格" if existing["tax_type"] == "含税" else "未税价格" if existing["tax_type"] == "未税" else "价格"
    path.write_text(f"客户,牌号,{tax_header}\n不该创建的客户,{existing['grade']},13.123456\n不该创建的客户,Qt新牌号,12\n", encoding="utf-8")
    monkeypatch.setattr("ui.main_window.QFileDialog.getOpenFileName", lambda *args: (str(path), ""))
    window.import_file()
    options = next(dialog for dialog in window.dialogs if isinstance(dialog, PdfImportOptionsDialog))
    assert options.customer.currentText() == customer and not options.customer.isEnabled()
    options.date.setText("2026-10-10")
    options.tax.setCurrentText(existing["tax_type"])
    qtbot.mouseClick(options.preview, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: any(isinstance(dialog, ImportPreviewDialog) for dialog in window.dialogs), timeout=5000)
    preview = next(dialog for dialog in window.dialogs if isinstance(dialog, ImportPreviewDialog))
    assert (preview.preview["updated"], preview.preview["created"], preview.preview["new_customers"]) == (1, 1, 0)
    assert customer in preview.scope_label.text()
    qtbot.mouseClick(preview.commit, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: not window.tasks.jobs and not preview.isVisible(), timeout=5000)
    assert len(context.store.history(existing["id"])["items"]) == 2
    assert not context.store.list({"customer": "不该创建的客户"})["items"]
    assert window.import_customer == customer
    assert window.customers.currentIndex().data(Qt.ItemDataRole.UserRole) == customer


def test_all_customer_import_cannot_fill_customer_from_heading(qtbot, window, context, tmp_path, monkeypatch):
    index = window.customer_model.index(0, 0)
    qtbot.mouseClick(window.customers.viewport(), Qt.MouseButton.LeftButton, pos=window.customers.visualRect(index).center())
    path = tmp_path / "no-client.csv"
    path.write_text("牌号,含税价格\nQt新牌号,12\n", encoding="utf-8")
    monkeypatch.setattr("ui.main_window.QFileDialog.getOpenFileName", lambda *args: (str(path), ""))
    window.import_file()
    options = next(dialog for dialog in window.dialogs if isinstance(dialog, PdfImportOptionsDialog))
    assert options.mode == "all" and not options.customer.isEnabled()
    options.date.setText("2026-10-10")
    qtbot.mouseClick(options.preview, Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: any(isinstance(dialog, ImportPreviewDialog) for dialog in window.dialogs), timeout=5000)
    preview = next(dialog for dialog in window.dialogs if isinstance(dialog, ImportPreviewDialog))
    assert not preview.commit.isEnabled() and "客户" in preview.preview["errors"][0]["message"]
    assert len(context.store.all()) == 41
    preview.reject()


def test_customer_search_cannot_be_used_as_selected_import_target(qtbot, window, monkeypatch):
    window.select_customer(window.customer_model.index(1, 0))
    window.customer.setText("金华")
    assert window.import_customer == ""
    assert not window.customers.currentIndex().isValid()
    picker = []
    monkeypatch.setattr("ui.main_window.QFileDialog.getOpenFileName", lambda *args: picker.append(1))
    window.import_file()
    assert not picker and "点击左侧" in window.notice.text.text()


def test_pdf_error_preview_displays_page_and_disables_commit(qtbot, window, context, tmp_path):
    path = tmp_path / "bad.pdf"
    path.write_bytes(quotation_pdf([[["牌号", "价格"], ["PP", "0"]]]))
    preview = window.prices.preview_import(path, context.storage_generation, {"customer": "甲", "effective_date": "2026-09-23"})
    dialog = ImportPreviewDialog(preview, window.prices, window.tasks, window)
    qtbot.addWidget(dialog)
    dialog.show()
    assert not dialog.commit.isEnabled() and dialog.notice.isVisible()
    from PySide6.QtWidgets import QPlainTextEdit
    assert "PDF第1页·表1 第2行" in dialog.findChild(QPlainTextEdit).toPlainText()
    dialog.reject()
