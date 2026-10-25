"""Add and edit dialog for one local follow-up task."""
from __future__ import annotations

from PySide6.QtCore import QDate, Signal
from PySide6.QtWidgets import QCheckBox, QComboBox, QDateEdit, QFormLayout, QLineEdit, QPlainTextEdit

from services.todo_service import CATEGORIES, STATUSES

from .dialog_base import BaseDialog, button, label


class TodoDialog(BaseDialog):
    saved = Signal(object)

    def __init__(self, record=None, parent=None, *, customers=(), projects=()):
        super().__init__("编辑待办" if record else "新增待办", 700, 700, parent)
        self.record = dict(record or {})
        self.customers = tuple(customers)
        self.projects = tuple(projects)
        self.content.insertWidget(0, label("编辑待办" if record else "新增待办", "title"))
        form = QFormLayout()
        form.setHorizontalSpacing(14)
        form.setVerticalSpacing(10)
        self.title_field = QLineEdit(str(self.record.get("title") or ""))
        self.title_field.setMaxLength(240)
        self.title_field.setAccessibleName("待办事项")
        form.addRow("待办事项", self.title_field)
        self.status_field = QComboBox()
        for value, caption in STATUSES.items():
            self.status_field.addItem(caption, value)
        status = self.record.get("status", "completed" if self.record.get("completed") else "open")
        self.status_field.setCurrentIndex(self.status_field.findData(status))
        self.status_field.setAccessibleName("待办状态")
        form.addRow("状态", self.status_field)
        self.category = QComboBox()
        self.category.setEditable(True)
        self.category.setInsertPolicy(QComboBox.InsertPolicy.NoInsert)
        self.category.addItems(CATEGORIES)
        self.category.setCurrentText(str(self.record.get("category") or "其他"))
        self.category.setAccessibleName("待办类别")
        form.addRow("类别", self.category)
        self.owner_field = QLineEdit(str(self.record.get("owner") or ""))
        self.owner_field.setMaxLength(80)
        self.owner_field.setAccessibleName("负责人")
        self.owner_field.setPlaceholderText("可留空")
        form.addRow("负责人", self.owner_field)
        self.customer_field = self._link_field(self.customers, "profile_id", self._customer_label,
                                               "customer_id", "customer_name")
        self.customer_field.setAccessibleName("关联客户")
        form.addRow("关联客户", self.customer_field)
        self.project_field = self._link_field(self.projects, "project_id", self._project_label,
                                              "project_id", "project_name")
        self.project_field.setAccessibleName("关联项目")
        form.addRow("关联项目", self.project_field)
        self.related_field = QLineEdit(str(self.record.get("related") or ""))
        self.related_field.setMaxLength(240)
        self.related_field.setAccessibleName("关联说明")
        self.related_field.setPlaceholderText("可留空")
        form.addRow("关联说明", self.related_field)
        self.due_enabled = QCheckBox("设置截止日期")
        self.due_date = QDateEdit()
        self.due_date.setCalendarPopup(True)
        self.due_date.setDisplayFormat("yyyy-MM-dd")
        self.due_date.setDate(QDate.currentDate())
        due = self.record.get("due_date")
        if due:
            self.due_date.setDate(QDate.fromString(due, "yyyy-MM-dd"))
        self.due_enabled.setChecked(bool(due))
        self.due_date.setEnabled(bool(due))
        self.due_enabled.toggled.connect(self.due_date.setEnabled)
        self.due_field = self.due_date
        form.addRow(self.due_enabled, self.due_date)
        self.priority = QComboBox()
        for text, value in (("低", "low"), ("普通", "normal"), ("高", "high")):
            self.priority.addItem(text, value)
        self.priority.setCurrentIndex(self.priority.findData(self.record.get("priority", "normal")))
        self.priority.setAccessibleName("优先级")
        form.addRow("优先级", self.priority)
        self.notes_field = QPlainTextEdit(str(self.record.get("notes") or ""))
        self.notes_field.setMaximumHeight(140)
        self.notes_field.setAccessibleName("备注")
        form.addRow("备注", self.notes_field)
        self.content.addLayout(form)
        self.save_button = button("保存", self.submit, primary=True)
        self.footer.addWidget(button("取消", self.reject))
        self.footer.addWidget(self.save_button)

    def submit(self):
        due_date = self.due_date.date().toString("yyyy-MM-dd") if self.due_enabled.isChecked() else None
        customer_id = self._selected_id(self.customer_field)
        project_id = self._selected_id(self.project_field)
        customer = next((item for item in self.customers if item.get("profile_id") == customer_id), None)
        project = next((item for item in self.projects if item.get("project_id") == project_id), None)
        self.saved.emit({
            "id": self.record.get("id"),
            "title": self.title_field.text(),
            "category": self.category.currentText(),
            "owner": self.owner_field.text(),
            "customer_id": customer_id,
            "customer_name": str(customer.get("name") or "") if customer else self.customer_field.currentText(),
            "project_id": project_id,
            "project_name": self._project_label(project) if project else self.project_field.currentText(),
            "related": self.related_field.text(),
            "due_date": due_date,
            "priority": self.priority.currentData(),
            "status": self.status_field.currentData(),
            "completed": self.status_field.currentData() == "completed",
            "notes": self.notes_field.toPlainText(),
        })
        self.accept()

    def _link_field(self, records, id_key, labeler, selected_key, name_key):
        control = QComboBox()
        control.setEditable(True)
        control.setInsertPolicy(QComboBox.InsertPolicy.NoInsert)
        control.addItem("", None)
        ids = set()
        for item in records:
            item_id = item.get(id_key)
            if not item_id:
                continue
            ids.add(str(item_id))
            control.addItem(labeler(item), str(item_id))
        selected_id = self.record.get(selected_key)
        selected_name = str(self.record.get(name_key) or "")
        if selected_id and str(selected_id) not in ids:
            control.addItem(selected_name or f"未找到关联记录 · {str(selected_id)[:8]}", str(selected_id))
        index = control.findData(str(selected_id)) if selected_id else control.findText(selected_name)
        if index >= 0:
            control.setCurrentIndex(index)
        elif selected_name:
            control.setEditText(selected_name)
        else:
            control.setCurrentIndex(0)
        return control

    @staticmethod
    def _selected_id(control):
        index = control.currentIndex()
        if index >= 0 and control.currentText() == control.itemText(index):
            return control.itemData(index)
        return None

    @staticmethod
    def _customer_label(profile):
        name = str(profile.get("name") or "").strip()
        return name or f"未命名客户 · {str(profile.get('profile_id', ''))[:8]}"

    @staticmethod
    def _project_label(project):
        return " · ".join(str(project.get(key) or "").strip()
                          for key in ("customer_name", "product_name", "material")
                          if str(project.get(key) or "").strip()) or str(project.get("project_id", ""))[:8]
