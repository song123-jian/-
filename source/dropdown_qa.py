"""Read-only dropdown acceptance on the real source and frozen Qt application."""

from PySide6.QtCore import Qt
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QAbstractItemView, QApplication

from qa_runner import PackagedSmoke
from ui.customer_dialogs import CustomerManagerDialog
from ui.dialogs import BackendDialog, PdfImportOptionsDialog, QuoteDialog


class PackagedDropdownSmoke(PackagedSmoke):
    def open_popup(self, combo):
        QTest.mouseClick(combo, Qt.MouseButton.LeftButton)
        QTest.qWait(QApplication.doubleClickInterval() + 50)
        view = combo.view()
        assert view.isVisible(), "Dropdown did not open"
        viewport = view.viewport().rect()
        visible = []
        for row in range(combo.count()):
            rectangle = view.visualRect(combo.model().index(row, 0))
            assert rectangle.height() >= combo.fontMetrics().height() + 8
            if viewport.intersects(rectangle):
                assert viewport.contains(rectangle), "Dropdown row clipped"
                visible.append(row)
        assert visible and not view.horizontalScrollBar().isVisible()
        if combo.count() <= combo.maxVisibleItems():
            assert len(visible) == combo.count() and not view.verticalScrollBar().isVisible()
        self.report.setdefault("popups", []).append({
            "name": combo.accessibleName() or combo.objectName(), "count": combo.count(),
            "viewport": list(viewport.getRect()), "visible_rows": visible,
            "row_height": view.sizeHintForRow(visible[0]),
        })
        return view

    def mouse_select(self, combo, target):
        view = self.open_popup(combo)
        view.scrollTo(combo.model().index(target, 0), QAbstractItemView.ScrollHint.PositionAtCenter)
        QTest.qWait(30)
        rectangle = view.visualRect(combo.model().index(target, 0))
        assert view.viewport().rect().contains(rectangle)
        QTest.mouseMove(view.viewport(), rectangle.center())
        QTest.mouseClick(view.viewport(), Qt.MouseButton.LeftButton, pos=rectangle.center())
        QTest.qWait(30)
        assert combo.currentIndex() == target and not view.isVisible(), "Dropdown selection failed"

    def exercise(self, combo, name):
        original = combo.currentIndex()
        target = combo.count() - 1 if original == 0 else 0
        self.mouse_select(combo, target)
        self.mouse_select(combo, original)
        view = self.open_popup(combo)
        QTest.keyClick(view, Qt.Key.Key_Escape)
        assert not view.isVisible() and combo.currentIndex() == original
        self.report["checks"][name] = True

    def baseline(self):
        assert self.window.loaded and self.window.context.store.backend == "sqlite"
        self.report["backend"] = "sqlite"
        self.report["production_or_cloud_writes"] = False
        self.original_quotes = self.window.context.store.all()
        self.exercise(self.window.material, "material_mouse_scroll_reopen")
        self.exercise(self.window.tax, "tax_mouse_reopen")
        self.window.manage_customers()
        self.manager = next(d for d in self.window.dialogs if isinstance(d, CustomerManagerDialog))
        self.await_idle(self.manager_loaded)

    def manager_loaded(self):
        assert len(self.manager.items) == 5
        self.mouse_select(self.manager.status, 1)
        self.await_idle(self.deleted_loaded)

    def deleted_loaded(self):
        assert self.manager.status.currentData() == "deleted"
        assert not self.manager.items and self.manager.table.rowCount() == 0
        assert self.manager.empty.isVisible() and self.manager.empty.text() == "回收站为空"
        assert not self.manager.delete_button.isEnabled() and not self.manager.restore_button.isEnabled()
        self.report["checks"]["manager_mouse_recycle_bin_refresh"] = True
        view = self.open_popup(self.manager.status)
        QTest.keyClick(view, Qt.Key.Key_Up)
        QTest.keyClick(view, Qt.Key.Key_Return)
        self.await_idle(self.active_loaded)

    def active_loaded(self):
        assert self.manager.status.currentData() == "active" and len(self.manager.items) == 5
        self.report["checks"]["manager_keyboard_active_refresh"] = True
        view = self.open_popup(self.manager.status)
        QTest.keyClick(view, Qt.Key.Key_Down)
        QTest.keyClick(view, Qt.Key.Key_Escape)
        assert self.manager.isVisible() and self.manager.status.currentData() == "active"
        self.report["checks"]["escape_cancels_popup_only"] = True
        self.capture(self.manager, "customer-manager.png")
        view = self.open_popup(self.manager.status)
        self.capture(view.window(), "customer-range-popup.png")
        self.manager.status.hidePopup()
        self.manager.accept()
        self.check_forms()

    def check_forms(self):
        window = self.window
        quote = QuoteDialog(window.prices, window.tasks, window.context.storage_generation, parent=window)
        backend = BackendDialog(window.backends, window.tasks, window)
        inspection = {"defaults": {}, "warnings": [], "split_material_color": False}
        options = PdfImportOptionsDialog("dropdown.csv", inspection, [], window,
                                         {"customer_mode": "selected", "selected_customer": "QA"})
        for dialog, combo, name in (
            (quote, quote.fields["tax_type"], "quote_tax_mouse_reopen"),
            (backend, backend.backend, "backend_mouse_reopen"),
            (options, options.tax, "import_tax_mouse_reopen"),
        ):
            window.show_dialog(dialog)
            QTest.qWait(50)
            try:
                self.exercise(combo, name)
            finally:
                combo.hidePopup()
                dialog.accept()
        assert window.context.store.all() == self.original_quotes
        self.report["checks"]["quotes_unchanged"] = True
        assert all(self.report["checks"].values())
        self.report["status"] = "passed"
        self.write_report()
        self.finished = True
        self.timeout.stop()
        window.close()
