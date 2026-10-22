"""Native customer manager, recycle bin, reversible confirmation and read-only history."""
from __future__ import annotations

import secrets

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QAbstractItemView, QComboBox, QHeaderView, QLineEdit, QTableWidget, QTableWidgetItem

from domain import NetworkError

from .combo_delegate import configure_combo_popup
from .dialogs import BaseDialog, button, label


class CustomerDetailDialog(BaseDialog):
    def __init__(self, detail, parent=None):
        super().__init__("客户全部报价历史（只读）", 1040, 660, parent)
        name = label(detail["display_name"], "heading")
        name.setWordWrap(True)
        self.content.insertWidget(0, name)
        self.content.addWidget(label(f"{detail['specs']} 个规格 / {detail['records']} 条历史 / {detail['future_records']} 条未来记录 · 全部日期", "muted"))
        self.table = QTableWidget(0, 8)
        self.table.setHorizontalHeaderLabels(["牌号", "颜色", "税口径", "价格(元/kg)", "业务日期", "材料", "备注 / 原因", "来源"])
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setShowGrid(True)
        self.table.setGridStyle(Qt.PenStyle.SolidLine)
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setMinimumHeight(320)
        self.table.setRowCount(len(detail["items"]))
        for index, row in enumerate(detail["items"]):
            values = [row["grade"], row["color"], row["tax_type"], row["price"], row["effective_date"], row["material"],
                      " / ".join(filter(None, (row["note"], row["reason"]))),
                      " / ".join(filter(None, (row["source_file"], row["source_sheet"], str(row["source_row"]) if row["source_row"] else "")))]
            for column, value in enumerate(values):
                item = QTableWidgetItem(value)
                item.setToolTip(value)
                self.table.setItem(index, column, item)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        self.table.horizontalHeader().setStretchLastSection(True)
        self.content.addWidget(self.table)
        self.footer.addWidget(button("关闭", self.accept))


class CustomerConfirmDialog(BaseDialog):
    changed = Signal(object)

    def __init__(self, preview, service, tasks, action, parent=None):
        self.action = action
        verb = "删除客户" if action == "delete" else "恢复客户"
        super().__init__(verb, 640, 470, parent)
        self.preview, self.service, self.tasks = preview, service, tasks
        self.generation = preview["storage_generation"]
        self.request_id = secrets.token_urlsafe(24)
        self.uncertain = False
        self.content.insertWidget(0, label(verb, "title"))
        name = label(preview["display_name"], "heading")
        name.setWordWrap(True)
        self.content.addWidget(name)
        info = label(f"完整客户范围：{preview['specs']} 个规格，{preview['records']} 条历史，其中 {preview['future_records']} 条未来记录。\n"
                     f"存储：{'Supabase 云数据库' if preview['backend'] == 'supabase' else '本地 SQLite'}\n"
                     + ("确认后移入回收站，可恢复；全部报价历史和来源保持完整。" if action == "delete" else "恢复全部规格和历史；当前价按今日业务日期重新计算。"), "muted")
        info.setWordWrap(True)
        self.content.addWidget(info)
        self.reason = QLineEdit()
        self.reason.setMaxLength(1000)
        self.reason.setPlaceholderText("删除原因（可选）")
        self.reason.setAccessibleName("删除原因")
        self.reason.setVisible(action == "delete")
        self.content.addWidget(self.reason)
        self.cancel = button("取消", self.reject)
        self.confirm = button("移入回收站" if action == "delete" else "恢复客户", self.submit, action != "delete")
        self.confirm.setObjectName("ConfirmCustomer")
        if action == "delete":
            self.confirm.setProperty("role", "danger")
        self.footer.addWidget(self.cancel)
        self.footer.addWidget(self.confirm)
        # Enter defaults to cancel; destructive confirmation requires an explicit click.
        self.cancel.setDefault(True)

    def submit(self):
        if self.busy:
            return
        self.busy = True
        self.confirm.setEnabled(False)
        self.cancel.setEnabled(False)
        self.reason.setReadOnly(True)
        if self.uncertain:
            def function():
                return self.service.recover_request(self.request_id, self.generation)
        elif self.action == "delete":
            reason = self.reason.text()
            def function():
                return self.service.delete_customer(self.preview["customer_key"], self.preview["revision"],
                                                    self.generation, self.request_id, reason)
        else:
            def function():
                return self.service.restore_customer(self.preview["customer_key"], self.preview["revision"],
                                                     self.generation, self.request_id)
        self.tasks.submit(function, self.succeeded, self.failed, generation=self.generation, write=True)

    def succeeded(self, result):
        self.busy = False
        self.changed.emit(result)
        self.accept()

    def failed(self, error):
        self.busy = False
        self.cancel.setEnabled(True)
        self.uncertain = isinstance(error, NetworkError)
        self.confirm.setEnabled(self.uncertain)
        self.confirm.setText("核对结果" if self.uncertain else "请取消并重新预览")
        self.notice.show_message(error, True)


class CustomerManagerDialog(BaseDialog):
    changed = Signal(object)

    def __init__(self, service, tasks, generation, deleted=False, selected_key="", parent=None):
        super().__init__("客户管理与回收站", 950, 650, parent)
        self.service, self.tasks, self.generation = service, tasks, generation
        self.selected_key, self.items, self.sequence = selected_key, [], 0
        self.confirm_dialog = None
        self.content.insertWidget(0, label("客户管理与回收站", "title"))
        explanation = label("选择具体客户查看完整报价范围。删除后可在回收站恢复，报价历史始终保留。", "muted")
        explanation.setWordWrap(True)
        self.content.addWidget(explanation)
        self.status = QComboBox()
        configure_combo_popup(self.status)
        self.status.addItem("在用客户", "active")
        self.status.addItem("回收站", "deleted")
        self.status.setCurrentIndex(1 if deleted else 0)
        self.status.setAccessibleName("客户管理范围")
        self.content.addWidget(self.status)
        self.table = QTableWidget(0, 6)
        self.table.setHorizontalHeaderLabels(["客户全称", "规格", "历史记录", "版本", "删除时间", "删除原因"])
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.table.setWordWrap(False)
        self.table.setShowGrid(True)
        self.table.setGridStyle(Qt.PenStyle.SolidLine)
        self.table.verticalHeader().hide()
        self.table.verticalHeader().setDefaultSectionSize(38)
        self.table.setMinimumHeight(260)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
        self.table.horizontalHeader().setStretchLastSection(True)
        self.content.addWidget(self.table)
        self.empty = label("正在读取客户…", "muted")
        self.content.addWidget(self.empty)
        self.details_button = button("全部历史（只读）", self.details)
        self.delete_button = button("删除所选客户", lambda: self.preview_action("delete"))
        self.delete_button.setProperty("role", "danger")
        self.restore_button = button("恢复所选客户", lambda: self.preview_action("restore"), True)
        for control in (button("刷新", self.reload), self.details_button, self.delete_button, self.restore_button, button("关闭", self.reject)):
            self.footer.addWidget(control)
        self.table.itemSelectionChanged.connect(self.selection_changed)
        self.status.currentIndexChanged.connect(self.reload)
        self.reload()

    def selected(self):
        index = self.table.currentRow()
        return self.items[index] if 0 <= index < len(self.items) and self.table.selectedItems() else None

    def selection_changed(self):
        selected = self.selected()
        self.details_button.setEnabled(bool(selected) and not self.busy)
        self.delete_button.setEnabled(bool(selected) and not self.busy and self.status.currentData() == "active")
        self.restore_button.setEnabled(bool(selected) and not self.busy and self.status.currentData() == "deleted")

    def reload(self):
        self.sequence += 1
        sequence, status = self.sequence, self.status.currentData()
        self.items = []
        self.table.setRowCount(0)
        self.selection_changed()
        self.tasks.submit(lambda: self.service.list_customers(status, self.generation),
                          lambda result: self.loaded(result) if sequence == self.sequence else None,
                          self.failed, generation=self.generation)

    def loaded(self, result):
        self.notice.hide()
        self.items = result["items"]
        self.table.setRowCount(len(self.items))
        for index, row in enumerate(self.items):
            for column, value in enumerate((row["display_name"], row["specs"], row["records"], row["revision"], row["deleted_at"] or "—", row["deleted_reason"])):
                item = QTableWidgetItem(str(value))
                item.setToolTip(str(value))
                self.table.setItem(index, column, item)
            if row["customer_key"] == self.selected_key:
                self.table.selectRow(index)
        self.empty.setText("回收站为空" if self.status.currentData() == "deleted" else "没有在用客户")
        self.empty.setVisible(not self.items)
        self.selection_changed()

    def details(self):
        def show(detail):
            self.detail_dialog = CustomerDetailDialog(detail, self)
            self.detail_dialog.open()
        self.request_detail(show)

    def preview_action(self, action):
        def show(detail):
            if detail["status"] != ("active" if action == "delete" else "deleted"):
                self.failed(ValueError("客户状态已变化，请刷新后重新选择"))
                return
            self.confirm_dialog = CustomerConfirmDialog(detail, self.service, self.tasks, action, self)
            self.confirm_dialog.changed.connect(self.customer_changed)
            self.confirm_dialog.open()
        self.request_detail(show)

    def request_detail(self, after):
        row = self.selected()
        if not row or self.busy:
            return
        self.busy = True
        self.selection_changed()
        def received(detail):
            self.busy = False
            self.selection_changed()
            after(detail)
        self.tasks.submit(lambda: self.service.preview_delete(row["customer_key"], self.generation), received,
                          self.failed, generation=self.generation)

    def customer_changed(self, result):
        self.changed.emit(result)
        self.reload()

    def failed(self, error):
        self.busy = False
        self.selection_changed()
        self.notice.show_message(error, True)
