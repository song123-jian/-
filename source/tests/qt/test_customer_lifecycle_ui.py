import secrets
import threading
from unittest.mock import patch

import pytest
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QApplication

from domain import customer_key
from services.customer_service import CustomerService
from ui.customer_dialogs import CustomerManagerDialog
from ui.main_window import MainWindow
from ui.theme_tokens import apply_theme


@pytest.fixture
def lifecycle_window(qtbot, context):
    apply_theme(QApplication.instance())
    window = MainWindow(context)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitUntil(lambda: window.loaded and not window.tasks.jobs,timeout=10000)
    yield window
    for dialog in tuple(window.dialogs):
        dialog.accept()
    window.close()
    qtbot.waitUntil(lambda: not window.isVisible(),timeout=10000)


def test_manager_all_selection_disabled_and_full_preview(qtbot,lifecycle_window,context):
    window=lifecycle_window
    window.customer.setText("金华")
    window.manage_customers()
    manager=next(d for d in window.dialogs if isinstance(d,CustomerManagerDialog))
    qtbot.waitUntil(lambda: len(manager.items)==5 and not window.tasks.jobs,timeout=5000)
    assert not manager.delete_button.isEnabled()
    index=next(i for i,r in enumerate(manager.items) if r["specs"]==16)
    manager.table.selectRow(index)
    qtbot.mouseClick(manager.delete_button,Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: manager.confirm_dialog is not None,timeout=5000)
    confirmation=manager.confirm_dialog
    assert confirmation.preview["specs"]==16 and confirmation.preview["records"]==16
    assert confirmation.cancel.isDefault()
    qtbot.mouseClick(confirmation.confirm,Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda: window.model.rowCount()==25 and not window.tasks.jobs,timeout=5000)
    assert window.customer.text()=="" and window.import_customer==""
    assert window.customer_model.rowCount()==5
    manager.accept()


def test_old_async_read_discarded_after_delete(qtbot,lifecycle_window,context):
    window=lifecycle_window
    started,release=threading.Event(),threading.Event()
    results=[]
    old=window.prices.list_quotes({},context.storage_generation)
    def delayed():
        started.set()
        assert release.wait(5)
        return old
    window.tasks.submit(delayed,results.append,lambda exc: pytest.fail(str(exc)),generation=context.storage_generation)
    qtbot.waitUntil(started.is_set,timeout=3000)
    key=customer_key("金华领先")
    preview=window.customer_service.preview_delete(key,context.storage_generation)
    window.customer_service.delete_customer(key,preview["revision"],context.storage_generation,secrets.token_urlsafe(24))
    release.set()
    qtbot.waitUntil(lambda: not window.tasks.jobs,timeout=5000)
    assert not results


def test_cloud_uncertain_ui_only_reads_request(qtbot,lifecycle_window,context):
    from domain import NetworkError
    from ui.customer_dialogs import CustomerConfirmDialog
    service=CustomerService(context)
    key=customer_key("金华领先")
    preview=service.preview_delete(key,context.storage_generation)
    dialog=CustomerConfirmDialog(preview,service,lifecycle_window.tasks,"delete",lifecycle_window)
    qtbot.addWidget(dialog)
    dialog.show()
    with patch.object(service,"delete_customer",side_effect=NetworkError("结果未确认")) as write:
        qtbot.mouseClick(dialog.confirm,Qt.MouseButton.LeftButton)
        qtbot.waitUntil(lambda: not dialog.busy,timeout=5000)
        assert dialog.confirm.text()=="核对结果"
        with patch.object(service,"recover_request",return_value={"message":"已核对"}) as read:
            qtbot.mouseClick(dialog.confirm,Qt.MouseButton.LeftButton)
            qtbot.waitUntil(lambda: not dialog.isVisible(),timeout=5000)
            assert read.call_count==1 and write.call_count==1
