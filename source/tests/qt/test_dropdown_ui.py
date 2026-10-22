"""Regression coverage for popup clipping in the actual themed desktop controls."""

import pytest
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QAbstractItemView, QApplication

from ui.customer_dialogs import CustomerManagerDialog
from ui.dialogs import BackendDialog, PdfImportOptionsDialog, QuoteDialog
from ui.main_window import MainWindow
from ui.theme_tokens import apply_theme


@pytest.fixture
def dropdown_window(qtbot, context):
    apply_theme(QApplication.instance())
    window = MainWindow(context)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitUntil(lambda: window.loaded and not window.tasks.jobs, timeout=10000)
    yield window
    for dialog in tuple(window.dialogs):
        dialog.accept()
    window.close()
    qtbot.waitUntil(lambda: not window.isVisible(), timeout=10000)


def open_popup(qtbot, combo):
    qtbot.mouseClick(combo, Qt.MouseButton.LeftButton)
    view = combo.view()
    qtbot.waitUntil(lambda: view.isVisible() and view.viewport().height() > 0, timeout=3000)
    # Qt ignores an immediate mouse release while the popup opens.
    qtbot.wait(QApplication.doubleClickInterval() + 50)
    return view


def assert_rows_fit(combo):
    view = combo.view()
    viewport = view.viewport().rect()
    visible = []
    for row in range(combo.count()):
        rectangle = view.visualRect(combo.model().index(row, 0))
        assert rectangle.height() >= combo.fontMetrics().height() + 8
        if viewport.intersects(rectangle):
            assert viewport.contains(rectangle), (combo.itemText(row), rectangle, viewport)
            visible.append(row)
    assert visible
    assert not view.horizontalScrollBar().isVisible()
    if combo.count() <= combo.maxVisibleItems():
        assert len(visible) == combo.count()
        assert not view.verticalScrollBar().isVisible()


@pytest.mark.parametrize("control", ["manager", "material", "tax", "quote_tax", "backend", "import_tax"])
@pytest.mark.parametrize("initial", ["first", "last"])
def test_dropdown_rows_fully_visible_and_mouse_selectable(qtbot, dropdown_window, context, control, initial):
    window = dropdown_window
    dialog = None
    if control == "manager":
        window.manage_customers()
        dialog = next(d for d in window.dialogs if isinstance(d, CustomerManagerDialog))
        qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
        combo = dialog.status
    elif control in ("material", "tax"):
        combo = getattr(window, control)
    elif control == "quote_tax":
        dialog = QuoteDialog(window.prices, window.tasks, context.storage_generation, parent=window)
        combo = dialog.fields["tax_type"]
    elif control == "backend":
        dialog = BackendDialog(window.backends, window.tasks, window)
        combo = dialog.backend
    else:
        inspection = {"defaults": {}, "warnings": [], "split_material_color": False}
        dialog = PdfImportOptionsDialog("dropdown.csv", inspection, [], window,
                                        {"customer_mode": "selected", "selected_customer": "QA"})
        combo = dialog.tax
    if dialog is not None:
        qtbot.addWidget(dialog)
        dialog.show()
    try:
        combo.setCurrentIndex(0 if initial == "first" else combo.count() - 1)
        qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
        view = open_popup(qtbot, combo)
        assert_rows_fit(combo)
        target = combo.count() - 1 if initial == "first" else 0
        view.scrollTo(combo.model().index(target, 0), QAbstractItemView.ScrollHint.PositionAtCenter)
        qtbot.wait(30)
        rectangle = view.visualRect(combo.model().index(target, 0))
        assert view.viewport().rect().contains(rectangle)
        qtbot.mouseMove(view.viewport(), rectangle.center())
        qtbot.mouseClick(view.viewport(), Qt.MouseButton.LeftButton, pos=rectangle.center())
        qtbot.waitUntil(lambda: combo.currentIndex() == target and not view.isVisible(), timeout=3000)
        open_popup(qtbot, combo)
        assert_rows_fit(combo)
    finally:
        combo.hidePopup()
        if dialog is not None:
            dialog.accept()
        qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)


def test_customer_range_mouse_keyboard_and_cancel(qtbot, dropdown_window):
    window = dropdown_window
    window.manage_customers()
    manager = next(d for d in window.dialogs if isinstance(d, CustomerManagerDialog))
    qtbot.waitUntil(lambda: len(manager.items) == 5 and not window.tasks.jobs, timeout=5000)
    try:
        view = open_popup(qtbot, manager.status)
        assert_rows_fit(manager.status)
        rectangle = view.visualRect(manager.status.model().index(1, 0))
        qtbot.mouseMove(view.viewport(), rectangle.center())
        qtbot.mouseClick(view.viewport(), Qt.MouseButton.LeftButton, pos=rectangle.center())
        qtbot.waitUntil(lambda: manager.status.currentData() == "deleted" and not window.tasks.jobs, timeout=5000)
        assert manager.items == [] and manager.table.rowCount() == 0
        assert manager.empty.text() == "回收站为空" and manager.empty.isVisible()
        assert not manager.delete_button.isEnabled() and not manager.restore_button.isEnabled()

        view = open_popup(qtbot, manager.status)
        qtbot.keyClick(view, Qt.Key.Key_Up)
        qtbot.keyClick(view, Qt.Key.Key_Return)
        qtbot.waitUntil(lambda: manager.status.currentData() == "active" and not window.tasks.jobs, timeout=5000)
        assert len(manager.items) == 5 and manager.table.rowCount() == 5
        view = open_popup(qtbot, manager.status)
        qtbot.keyClick(view, Qt.Key.Key_Down)
        qtbot.keyClick(view, Qt.Key.Key_Escape)
        assert manager.isVisible() and manager.status.currentData() == "active"
        assert len(manager.items) == 5
    finally:
        manager.accept()
