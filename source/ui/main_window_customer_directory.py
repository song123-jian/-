"""Main-window behavior grouped by UI responsibility."""
from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QStandardItem
from PySide6.QtWidgets import QCompleter

from .customer_delegate import COUNT_ROLE


class MainWindowCustomerDirectoryMixin:
    def set_customer_directory_expanded(self, expanded):
        expanded = bool(expanded)
        self.customer_directory_toggle.setChecked(expanded)
        self.customer_directory_toggle.setText("客户目录  ▾" if expanded else "客户目录  ▸")
        action = "收起客户目录" if expanded else "展开客户目录"
        self.customer_directory_toggle.setAccessibleName(action)
        self.customer_directory_toggle.setToolTip(action + "（空格键切换）")
        self.customers.setVisible(expanded)
        self.settings.setValue("customer-directory-expanded", expanded)
        self.settings.sync()

    def load_customer_directory(self, generation=None):
        if self._closing:
            return
        generation = generation or self.context.storage_generation
        self.customer_directory_sequence += 1
        sequence = self.customer_directory_sequence
        self.tasks.submit(
            lambda: self.customer_service.list_customers("active", generation),
            lambda result: self.customer_directory_loaded(result) if sequence == self.customer_directory_sequence else None,
            lambda exc: self.customer_directory_failed(exc) if sequence == self.customer_directory_sequence else None,
            generation=generation, latest_key="customer-directory")

    def _apply_customer_directory(self, entries, total_items):
        normalized = []
        for entry in entries:
            normalized.append({
                "customer_key": entry["customer_key"],
                "name": entry.get("name", entry.get("display_name", "")),
                "count": entry.get("count", entry.get("specs", 0)),
                "revision": entry.get("revision", 0),
            })
        self.customer_revisions = {entry["customer_key"]: entry["revision"] for entry in normalized}
        customer_names = {entry["name"] for entry in normalized}
        if self.import_customer and self.import_customer not in customer_names:
            self.import_customer = ""
        directory_state = (total_items, tuple(
            (entry["customer_key"], entry["name"], entry["count"]) for entry in normalized))
        if directory_state != self._customer_directory_state:
            self.customer_model.clear()
            all_item = QStandardItem("全部客户")
            all_item.setData("", Qt.ItemDataRole.UserRole)
            all_item.setData("", Qt.ItemDataRole.UserRole + 1)
            all_item.setData(total_items, COUNT_ROLE)
            all_item.setToolTip(f"全部客户 · {total_items}个规格")
            all_item.setData(all_item.toolTip(), Qt.ItemDataRole.AccessibleTextRole)
            all_item.setEditable(False)
            self.customer_model.appendRow(all_item)
            for entry in normalized:
                item = QStandardItem(entry["name"])
                item.setData(entry["name"], Qt.ItemDataRole.UserRole)
                item.setData(entry["customer_key"], Qt.ItemDataRole.UserRole + 1)
                item.setData(entry["count"], COUNT_ROLE)
                item.setToolTip(f"{entry['name']} · {entry['count']}个规格")
                item.setData(item.toolTip(), Qt.ItemDataRole.AccessibleTextRole)
                item.setEditable(False)
                self.customer_model.appendRow(item)
            completer = QCompleter([entry["name"] for entry in normalized], self.customer)
            completer.setCaseSensitivity(Qt.CaseSensitivity.CaseInsensitive)
            completer.setFilterMode(Qt.MatchFlag.MatchContains)
            self.customer.setCompleter(completer)
            self._customer_directory_state = directory_state
        for row in range(self.customer_model.rowCount()):
            index = self.customer_model.index(row, 0)
            if index.data(Qt.ItemDataRole.UserRole) == self.import_customer:
                self.customers.setCurrentIndex(index)
                break

    def customer_directory_loaded(self, result):
        self.read_recovered("customer-directory")
        self._apply_customer_directory(result["items"], sum(entry.get("specs", 0) for entry in result["items"]))

    def customer_directory_failed(self, exc):
        self.read_failed("customer-directory", exc)

    def meta_loaded(self, result, *, update_directory=True):
        self.read_recovered("meta")
        if update_directory:
            self._apply_customer_directory(result["customers"], result["stats"]["items"])
        materials = tuple(result["materials"])
        if materials != self._material_options:
            current_material = self.material.currentData()
            self.material.clear()
            self.material.addItem("全部材料", "")
            for material in materials:
                self.material.addItem(material, material)
            index = self.material.findData(current_material)
            if index >= 0:
                self.material.setCurrentIndex(index)
            self._material_options = materials

    def meta_failed(self, exc):
        self.read_failed("meta", exc)
