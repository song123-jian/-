"""Create and edit one customer master record."""
from __future__ import annotations

from PySide6.QtCore import Signal
from PySide6.QtWidgets import QFormLayout, QLineEdit, QPlainTextEdit

from .dialog_base import BaseDialog, button


class CustomerProfileDialog(BaseDialog):
    saved = Signal(object)

    def __init__(self, record=None, parent=None):
        super().__init__("编辑客户" if record else "新增客户", 620, 540, parent)
        self.record = dict(record or {})
        form = QFormLayout()
        form.setHorizontalSpacing(14)
        form.setVerticalSpacing(12)
        self.name = self._line(form, "客户名称", "name", 240)
        self.contact = self._line(form, "联系人", "contact", 120)
        self.phone = self._line(form, "电话", "phone", 80)
        self.industry = self._line(form, "行业", "industry", 120)
        self.address = QPlainTextEdit(str(self.record.get("address") or ""))
        self.address.setAccessibleName("地址")
        self.address.setMaximumHeight(96)
        form.addRow("地址", self.address)
        self.notes = QPlainTextEdit(str(self.record.get("notes") or ""))
        self.notes.setAccessibleName("备注")
        self.notes.setPlaceholderText("可留空，最多2000字")
        self.notes.setMaximumHeight(96)
        form.addRow("备注", self.notes)
        self.content.addLayout(form)
        self.footer.addWidget(button("取消", self.reject))
        save = button("保存", self.submit, primary=True)
        save.setObjectName("SaveCustomerProfile")
        self.save_button = save
        self.footer.addWidget(save)

    def _line(self, form, caption, field, limit):
        control = QLineEdit(str(self.record.get(field) or ""))
        control.setAccessibleName(caption)
        control.setMaxLength(limit)
        control.setPlaceholderText("可留空")
        self.__dict__.setdefault("_profile_fields", {})[field] = control
        form.addRow(caption, control)
        return control

    def submit(self):
        fields = self._profile_fields
        self.saved.emit({
            "profile_id": self.record.get("profile_id"),
            "revision": self.record.get("revision"),
            "name": fields["name"].text(),
            "contact": fields["contact"].text(),
            "phone": fields["phone"].text(),
            "industry": fields["industry"].text(),
            "address": self.address.toPlainText(),
            "notes": self.notes.toPlainText(),
        })
        self.accept()
