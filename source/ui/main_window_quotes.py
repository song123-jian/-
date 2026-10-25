"""Main-window behavior grouped by UI responsibility."""
from __future__ import annotations

from PySide6.QtCore import Qt

from .quote_table_model import ROW_ROLE


class MainWindowQuoteQueryMixin:
    def query(self):
        self.debounce.stop()
        if self._closing:
            return
        self.query_sequence += 1
        sequence, generation, filters = self.query_sequence, self.context.storage_generation, self.filters()
        self.statusBar().showMessage("正在查询…")
        self.tasks.submit(lambda: self.prices.list_quotes(filters, generation, sequence),
                          lambda result: self.quotes_loaded(result) if sequence == self.query_sequence else None,
                          lambda exc: self.query_failed(exc) if sequence == self.query_sequence else None,
                          generation=generation, latest_key="quote-query")

    def quotes_loaded(self, result):
        self.read_recovered("query")
        self.loaded = True
        selected = self.selected()
        self.model.set_items(result["items"])
        stats = result["stats"]
        for label_value, value in zip(self.card_values, (stats["customers"], stats["items"], stats["records"], stats["last_date"] or "—")):
            label_value.setText(str(value))
        self.empty_label.setVisible(not result["items"])
        self.empty_label.setText("没有找到匹配报价\n试试较短的客户名称或牌号，也可以清除筛选")
        if selected:
            for index in range(self.proxy.rowCount()):
                if self.proxy.index(index, 0).data(ROW_ROLE)["id"] == selected["id"]:
                    self.table.selectRow(index)
                    break
        self.selection_changed()
        self.statusBar().showMessage(f"{self.storage_label.text()}  ·  {stats['customers']}客户 / {stats['items']}规格 / {stats['records']}条历史")

    def reset(self):
        self.import_customer = ""
        self.customer.clear()
        self.customers.setCurrentIndex(self.customer_model.index(0, 0))
        self.term.clear()
        self.material.setCurrentIndex(0)
        self.tax.setCurrentIndex(0)
        self.date_enabled.setChecked(False)
        self.stale.setChecked(False)
        self.query()

    def customer_search_changed(self, text):
        if text != self.import_customer:
            self.import_customer = ""
            self.customers.clearSelection()
            self.customers.setCurrentIndex(self.customer_model.index(-1, 0))

    def select_customer(self, index):
        self.navigate(self.PAGE_QUERY)
        customer = index.data(Qt.ItemDataRole.UserRole) or ""
        self.customer.setText(customer)
        self.import_customer = customer
        self.customers.setCurrentIndex(index)
        self.query()

    def selected(self):
        selected = self.table.selectionModel().selectedRows()
        return selected[0].data(ROW_ROLE) if selected else None

    def selection_changed(self):
        enabled = bool(self.selected())
        self.history_button.setEnabled(enabled)
        self.edit_button.setEnabled(enabled)
