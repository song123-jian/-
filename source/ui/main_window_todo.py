"""Main-window page and actions for account-local follow-up tasks."""
from __future__ import annotations

import datetime as dt

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QAbstractItemView,
    QComboBox,
    QHBoxLayout,
    QHeaderView,
    QLineEdit,
    QMessageBox,
    QTableWidget,
    QTableWidgetItem,
)

from services.todo_service import CATEGORIES, STATUSES

from .dialogs import button, label
from .query_shortcuts import bind_enter_query
from .todo_dialog import TodoDialog


class MainWindowTodoMixin:
    def build_todo_page(self):
        _, layout = self.page_layout("待办事项", "跟进项目、样品、测试和商务节点。")
        toolbar = QHBoxLayout()
        self.todo_status_label = label("0 项未完成 · 0 项已完成", "muted")
        toolbar.addWidget(self.todo_status_label)
        toolbar.addStretch()
        self.todo_search = QLineEdit()
        self.todo_search.setPlaceholderText("搜索待办、项目或备注")
        self.todo_search.setAccessibleName("搜索待办")
        self.todo_search.setMinimumWidth(220)
        self.todo_search.textChanged.connect(self.render_todos)
        toolbar.addWidget(self.todo_search)
        self.todo_status_filter = QComboBox()
        self.todo_status_filter.addItem("全部状态", "all")
        self.todo_status_filter.addItem("未完成", "open")
        self.todo_status_filter.addItem("未开始", "not_started")
        self.todo_status_filter.addItem("进行中", "in_progress")
        self.todo_status_filter.addItem("等待反馈", "waiting")
        self.todo_status_filter.addItem("今日到期", "today")
        self.todo_status_filter.addItem("逾期", "overdue")
        self.todo_status_filter.addItem("已完成", "completed")
        self.todo_status_filter.setAccessibleName("待办状态筛选")
        self.todo_status_filter.currentIndexChanged.connect(self.render_todos)
        toolbar.addWidget(self.todo_status_filter)
        self.todo_category_filter = QComboBox()
        self.todo_category_filter.setEditable(True)
        self.todo_category_filter.setInsertPolicy(QComboBox.InsertPolicy.NoInsert)
        self.todo_category_filter.addItem("全部类别", "")
        self.todo_category_filter.addItems(CATEGORIES)
        self.todo_category_filter.setAccessibleName("待办类别筛选")
        self.todo_category_filter.currentTextChanged.connect(self.render_todos)
        toolbar.addWidget(self.todo_category_filter)
        layout.addLayout(toolbar)
        actions = QHBoxLayout()
        self.todo_priority_filter = QComboBox()
        for caption, value in (("全部优先级", ""), ("高", "high"), ("普通", "normal"), ("低", "low")):
            self.todo_priority_filter.addItem(caption, value)
        self.todo_priority_filter.setAccessibleName("待办优先级筛选")
        self.todo_priority_filter.currentIndexChanged.connect(self.render_todos)
        self.todo_enter_query = bind_enter_query(
            self.render_todos, self.todo_search, self.todo_category_filter,
            self.todo_status_filter, self.todo_priority_filter)
        actions.addWidget(self.todo_priority_filter)
        actions.addStretch()
        self.todo_new_button = button("新增待办", self.new_todo, primary=True)
        self.todo_edit_button = button("编辑", self.edit_todo)
        self.todo_complete_button = button("标记完成", self.toggle_todo_completed)
        self.todo_delete_button = button("删除", self.delete_todo)
        self.todo_toolbar_buttons = (self.todo_new_button, self.todo_edit_button,
                                     self.todo_complete_button, self.todo_delete_button)
        for control in self.todo_toolbar_buttons:
            actions.addWidget(control)
        layout.addLayout(actions)
        self.todo_table = QTableWidget(0, 9)
        self.todo_table.setObjectName("TodoTable")
        self.todo_table.setHorizontalHeaderLabels(
            ["状态", "待办事项", "类别", "客户", "项目", "截止日期", "优先级", "负责人", "备注"])
        self.todo_table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.todo_table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.todo_table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.todo_table.setAlternatingRowColors(True)
        self.todo_table.setWordWrap(True)
        self.todo_table.verticalHeader().hide()
        self.todo_table.verticalHeader().setDefaultSectionSize(38)
        for column in range(self.todo_table.columnCount()):
            self.todo_table.horizontalHeader().setSectionResizeMode(column, QHeaderView.ResizeMode.Stretch)
        self.todo_table.itemSelectionChanged.connect(self.todo_selection_changed)
        self.todo_table.itemDoubleClicked.connect(lambda _item: self.edit_todo())
        layout.addWidget(self.todo_table, 1)
        self.todo_edit_button.setEnabled(False)
        self.todo_complete_button.setEnabled(False)
        self.todo_delete_button.setEnabled(False)

    def load_todos(self):
        try:
            self.todo_items = self.todo_service.list_items()
        except Exception as exc:
            self.todo_items = []
            self.todo_status_label.setText("待办读取失败")
            self.failed(exc)
            return
        customers = {item["profile_id"]: item for item in getattr(self, "customer_profiles", ())}
        projects = {item["project_id"]: item for item in getattr(self, "project_progress_records", ())}
        for item in self.todo_items:
            customer = customers.get(item.get("customer_id"))
            project = projects.get(item.get("project_id"))
            if customer is not None:
                item["customer_name"] = customer["name"]
            if project is not None:
                item["project_name"] = TodoDialog._project_label(project)
        self.render_todos()

    def render_todos(self, *_args):
        if not hasattr(self, "todo_table"):
            return
        selected_id = getattr(self, "selected_todo_id", None)
        if selected_id is None:
            selected = self.selected_todo()
            selected_id = selected["id"] if selected else None
        query = self.todo_search.text().strip().casefold()
        status = self.todo_status_filter.currentData()
        category_text = self.todo_category_filter.currentText().strip()
        category = "" if category_text == "全部类别" else category_text
        priority = self.todo_priority_filter.currentData()
        today = dt.date.today().isoformat()
        items = [item for item in self.todo_items
                 if (status == "all"
                     or status == "open" and not item["completed"]
                     or status == "completed" and item["completed"]
                     or status == "not_started" and item["status"] == "open"
                     or status in ("in_progress", "waiting") and item["status"] == status
                     or status == "today" and not item["completed"] and item["due_date"] == today
                     or status == "overdue" and not item["completed"] and item["due_date"] and item["due_date"] < today)
                 and (not category or item["category"].casefold() == category.casefold())
                 and (not priority or item["priority"] == priority)
                 and (not query or query in " ".join((item["title"], item["related"], item["notes"],
                                                       item["category"], item["owner"], item["customer_name"],
                                                       item["project_name"])).casefold())]
        items.sort(key=lambda item: (item["completed"], item["due_date"] or "9999-12-31",
                                     {"high": 0, "normal": 1, "low": 2}[item["priority"]], item["id"]))
        self.todo_table.setRowCount(len(items))
        priorities = {"low": "低", "normal": "普通", "high": "高"}
        selected_row = None
        for row, todo in enumerate(items):
            related_project = todo["project_name"] or todo["related"]
            values = (STATUSES[todo["status"]], todo["title"], todo["category"],
                      todo["customer_name"], related_project, todo["due_date"] or "—",
                      priorities[todo["priority"]], todo["owner"], todo["notes"])
            for column, value in enumerate(values):
                cell = QTableWidgetItem(str(value))
                cell.setFlags(cell.flags() & ~Qt.ItemFlag.ItemIsEditable)
                cell.setToolTip(str(value))
                if column == 1:
                    cell.setData(Qt.ItemDataRole.UserRole, todo["id"])
                self.todo_table.setItem(row, column, cell)
            if todo["id"] == selected_id:
                selected_row = row
        if selected_row is not None:
            self.todo_table.selectRow(selected_row)
        self.todo_table.resizeRowsToContents()
        open_count = sum(not item["completed"] for item in self.todo_items)
        done_count = len(self.todo_items) - open_count
        overdue_count = sum(bool(not item["completed"] and item["due_date"] and item["due_date"] < today)
                            for item in self.todo_items)
        self.todo_status_label.setText(f"{open_count} 项未完成 · {done_count} 项已完成 · {overdue_count} 项逾期")
        self.todo_selection_changed()

    def selected_todo(self):
        rows = self.todo_table.selectionModel().selectedRows()
        if not rows:
            return None
        item_id = self.todo_table.item(rows[0].row(), 1).data(Qt.ItemDataRole.UserRole)
        return next((item for item in self.todo_items if item["id"] == item_id), None)

    def todo_selection_changed(self):
        selected = self.selected_todo() if hasattr(self, "todo_table") else None
        if selected:
            self.selected_todo_id = selected["id"]
        self.todo_edit_button.setEnabled(bool(selected))
        self.todo_delete_button.setEnabled(bool(selected))
        self.todo_complete_button.setEnabled(bool(selected))
        if selected:
            self.todo_complete_button.setText("恢复待办" if selected["completed"] else "标记完成")

    def new_todo(self):
        dialog = TodoDialog(parent=self, customers=getattr(self, "customer_profiles", ()),
                            projects=self.todo_project_options())
        dialog.saved.connect(self.save_todo)
        self.show_dialog(dialog)

    def create_customer_todo(self):
        profile = self.selected_customer_profile()
        if profile is None:
            return
        dialog = TodoDialog({"customer_id": profile["profile_id"], "customer_name": profile["name"]},
                            self, customers=self.customer_profiles, projects=self.todo_project_options())
        dialog.saved.connect(self.save_todo)
        self.show_dialog(dialog)

    def edit_todo(self):
        record = self.selected_todo()
        if record:
            dialog = TodoDialog(record, self, customers=getattr(self, "customer_profiles", ()),
                                projects=self.todo_project_options())
            dialog.saved.connect(self.save_todo)
            self.show_dialog(dialog)

    def todo_project_options(self):
        if hasattr(self, "project_progress_records"):
            return self.project_progress_records
        table = getattr(self, "project_progress_table", None)
        if table is None:
            return []
        return [table.item(row, 0).data(Qt.ItemDataRole.UserRole)
                for row in range(table.rowCount()) if table.item(row, 0)
                and isinstance(table.item(row, 0).data(Qt.ItemDataRole.UserRole), dict)]

    def save_todo(self, values):
        try:
            if values.get("id"):
                self.todo_service.update(values["id"], values)
            else:
                self.todo_service.create(values)
        except Exception as exc:
            self.failed(exc)
            return
        self.load_todos()

    def toggle_todo_completed(self):
        record = self.selected_todo()
        if not record:
            return
        try:
            self.todo_service.update(record["id"], {"completed": not record["completed"]})
        except Exception as exc:
            self.failed(exc)
            return
        self.load_todos()

    def delete_todo(self):
        record = self.selected_todo()
        if not record:
            return
        prompt = QMessageBox(self)
        prompt.setIcon(QMessageBox.Icon.Question)
        prompt.setWindowTitle("删除待办")
        prompt.setText(f"确定删除“{record['title']}”？")
        delete_button = prompt.addButton("删除", QMessageBox.ButtonRole.DestructiveRole)
        cancel_button = prompt.addButton("取消", QMessageBox.ButtonRole.RejectRole)
        prompt.setDefaultButton(cancel_button)
        prompt.exec()
        if prompt.clickedButton() != delete_button:
            return
        try:
            self.todo_service.delete(record["id"])
        except Exception as exc:
            self.failed(exc)
            return
        self.selected_todo_id = None
        self.load_todos()
