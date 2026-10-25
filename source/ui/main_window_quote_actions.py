"""Main-window behavior grouped by UI responsibility."""
from __future__ import annotations

from PySide6.QtCore import Qt

from .business_document_dialog import BusinessDocumentDialog
from .customer_dialogs import CustomerManagerDialog
from .dialogs import HistoryDialog, QuoteDialog
from .inventory_dialog import InventoryDialog


class MainWindowQuoteActionsMixin:
    def show_dialog(self, dialog):
        self.dialogs.add(dialog)
        dialog.finished.connect(lambda _: self.dialogs.discard(dialog))
        dialog.open()
        return dialog

    def open_inventory(self):
        if self._closing:
            return
        if self.inventory_dialog is not None and self.inventory_dialog.isVisible():
            self.inventory_dialog.raise_()
            self.inventory_dialog.activateWindow()
            return
        row = self.selected()
        self.inventory_dialog = InventoryDialog(
            grade=row["grade"] if row else "", parent=self, data_folder=getattr(self.context,'shared_folder',self.context.folder))
        self.show_dialog(self.inventory_dialog)

    def new_quote(self):
        dialog = QuoteDialog(self.prices, self.tasks, self.context.storage_generation,
                             customer=self.customer.text(), selected_customer=self.import_customer, parent=self,
                             customer_profiles=getattr(self, "customer_profiles", ()))
        dialog.saved.connect(self.quote_saved)
        self.show_dialog(dialog)

    def open_business_document(self, kind):
        if not self._closing:
            self.show_dialog(BusinessDocumentDialog(
                self.context, self.tasks, kind, row=self.selected(),
                customer=self.import_customer, parent=self,
                customer_profiles=getattr(self, "customer_profiles", ())))

    def manage_customers(self, deleted=False):
        index = self.customers.currentIndex()
        key = index.data(Qt.ItemDataRole.UserRole + 1) if index.isValid() else ""
        dialog = CustomerManagerDialog(self.customer_service, self.tasks, self.context.storage_generation,
                                       deleted=deleted, selected_key=key or "", parent=self)
        dialog.changed.connect(self.customer_changed)
        self.show_dialog(dialog)

    def customer_changed(self, result):
        self.last_backup = result.get("backup") or self.last_backup
        self.import_customer = ""
        self.customer.clear()
        self.customer_revisions.clear()
        self.model.set_items([])
        self.meta_sequence += 1
        self.query_sequence += 1
        self.notify(result["message"])
        self.refresh()

    def edit_by_id(self, row_id):
        row = next((row for row in self.model.items if row["id"] == row_id), None)
        if row is None:
            # History can refer to a current record outside the last table refresh.
            self.failed(ValueError("该报价已变化，请刷新后再操作"))
            return
        dialog = QuoteDialog(self.prices, self.tasks, self.context.storage_generation, row=row, parent=self)
        dialog.saved.connect(self.quote_saved)
        self.show_dialog(dialog)

    def edit_selected(self):
        row = self.selected()
        if row:
            self.edit_by_id(row["id"])

    def history_selected(self):
        row = self.selected()
        if row:
            self.open_history(row["id"])

    def open_history(self, row_id):
        generation = self.context.storage_generation
        self.tasks.submit(lambda: self.prices.get_history(row_id, generation), self.history_loaded, self.failed, generation=generation)

    def history_loaded(self, result):
        dialog = HistoryDialog(result["items"], self)
        dialog.editRequested.connect(lambda row_id: (dialog.accept(), self.edit_by_id(row_id)))
        self.show_dialog(dialog)

    def quote_saved(self, result):
        self.last_backup = result.get("backup") or self.last_backup
        self.notify(result.get("message", "已保存报价"))
        self.refresh()
