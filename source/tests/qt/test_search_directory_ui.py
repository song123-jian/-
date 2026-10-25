"""Enter query and customer-directory disclosure regressions."""
import pytest
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QApplication
from shiboken6 import isValid

from services.app_context import AppContext
from ui.customer_profile_dialog import CustomerProfileDialog
from ui.main_window import MainWindow
from ui.theme_tokens import apply_theme


@pytest.fixture
def window(qtbot, context):
    apply_theme(QApplication.instance())
    result = MainWindow(context)
    qtbot.addWidget(result)
    result.show()
    qtbot.waitUntil(lambda: result.loaded and not result.tasks.jobs, timeout=10000)
    yield result
    if isValid(result):
        result.request_exit()
        qtbot.waitUntil(lambda: not isValid(result) or not result.isVisible(), timeout=10000)


@pytest.mark.parametrize('key', [Qt.Key.Key_Return, Qt.Key.Key_Enter])
@pytest.mark.parametrize('field', ['customer', 'term', 'material', 'tax', 'date_from', 'date_to'])
def test_enter_runs_quote_search_once(qtbot, window, field, key):
    window.date_enabled.setChecked(True)
    control = getattr(window, field)
    control.setFocus()
    before = window.query_sequence
    qtbot.keyClick(control, key)
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert window.query_sequence == before + 1
    assert window.pages.currentIndex() == window.PAGE_QUERY
    assert not window.dialogs


@pytest.mark.parametrize('key', [Qt.Key.Key_Return, Qt.Key.Key_Enter])
@pytest.mark.parametrize('page,field,table', [
    ('PAGE_CUSTOMERS', 'customer_profile_search', 'customer_profile_table'),
    ('PAGE_TODO', 'todo_search', 'todo_table'),
    ('PAGE_TODO', 'todo_category_filter', 'todo_table'),
    ('PAGE_TODO', 'todo_status_filter', 'todo_table'),
    ('PAGE_TODO', 'todo_priority_filter', 'todo_table'),
])
def test_enter_reapplies_current_local_filter(qtbot, window, page, field, table, key):
    window.navigate(getattr(window, page))
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    grid = getattr(window, table)
    expected = grid.rowCount()
    grid.setRowCount(expected + 1)
    control = getattr(window, field)
    if hasattr(control, 'lineEdit') and control.isEditable():
        control = control.lineEdit()
    control.setFocus()
    quote_sequence = window.query_sequence
    qtbot.keyClick(control, key)
    assert grid.rowCount() == expected
    assert window.query_sequence == quote_sequence
    assert window.pages.currentIndex() == getattr(window, page)
    assert not window.dialogs


def test_customer_directory_header_collapse_keeps_selection_and_remembers(qtbot, window):
    toggle = window.customer_directory_toggle
    assert toggle.text().startswith('客户目录') and toggle.isChecked()
    window.select_customer(window.customer_model.index(1, 0))
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    selected = window.customer.text()
    count = window.model.rowCount()
    qtbot.mouseClick(toggle, Qt.MouseButton.LeftButton)
    assert not window.customers.isVisible() and toggle.isVisible()
    assert window.customer.text() == selected and window.model.rowCount() == count
    window.refresh()
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert not window.customers.isVisible()
    window.settings.sync()
    other = MainWindow(AppContext(window.context.store, window.context.folder))
    qtbot.addWidget(other)
    other.show()
    qtbot.waitUntil(lambda: other.loaded and not other.tasks.jobs, timeout=5000)
    assert not other.customer_directory_toggle.isChecked() and not other.customers.isVisible()
    other.request_exit()
    qtbot.waitUntil(lambda: not other.isVisible(), timeout=5000)
    toggle.setFocus()
    qtbot.keyClick(toggle, Qt.Key.Key_Space)
    assert window.customers.isVisible() and toggle.isChecked()
    window.select_customer(window.customer_model.index(0, 0))
    qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
    assert window.pages.currentIndex() == window.PAGE_QUERY and window.customer.text() == ''
    assert window.model.rowCount() == len(window.context.store.list({})['items'])


def test_query_enter_does_not_submit_forms_or_swallow_combo_selection(qtbot, window):
    before = window.query_sequence
    window.material.showPopup()
    qtbot.keyClick(window.material, Qt.Key.Key_Return)
    window.material.hidePopup()
    assert window.query_sequence == before
    dialog = CustomerProfileDialog(parent=window)
    qtbot.addWidget(dialog)
    dialog.show()
    saved = []
    dialog.saved.connect(saved.append)
    dialog.notes.setPlainText('第一行')
    dialog.notes.moveCursor(dialog.notes.textCursor().MoveOperation.End)
    qtbot.keyClick(dialog.notes, Qt.Key.Key_Return)
    assert dialog.notes.toPlainText() == '第一行\n' and not saved
    qtbot.keyClick(dialog.name, Qt.Key.Key_Return)
    assert dialog.isVisible() and not saved and window.query_sequence == before
    dialog.reject()
