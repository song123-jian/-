"""Desktop dialog implementation module."""
from __future__ import annotations

from PySide6.QtCore import Signal
from PySide6.QtWidgets import QComboBox, QLineEdit, QMessageBox

from .combo_delegate import configure_combo_popup
from .dialog_base import BaseDialog, button, label


class BackendDialog(BaseDialog):
    switched = Signal(object)

    def __init__(self, service, tasks, parent=None):
        super().__init__("数据库设置", 680, 600, parent)
        self.service, self.tasks = service, tasks
        status = service.get_backend_status()
        self.generation = status["storage_generation"]
        self.content.insertWidget(0, label("数据库设置", "title"))
        self.content.addWidget(label("存储切换会刷新界面，报价需通过导入迁移。", "muted"))
        self.backend = QComboBox()
        configure_combo_popup(self.backend)
        self.backend.addItem("本地 SQLite", "sqlite")
        self.backend.addItem("Supabase 云数据库", "supabase")
        self.backend.setCurrentIndex(1 if status["backend"] == "supabase" else 0)
        self.content.addWidget(label("存储方式"))
        self.content.addWidget(self.backend)
        self.url = QLineEdit(status["url"])
        self.url.setAccessibleName("Supabase 项目地址")
        self.content.addWidget(label("Supabase 项目地址"))
        self.content.addWidget(self.url)
        self.key = QLineEdit()
        self.key.setEchoMode(QLineEdit.EchoMode.Password)
        self.key.setMaxLength(8192)
        self.key.setAccessibleName("Supabase 后台密钥")
        self.key.setPlaceholderText("已保存凭据；同项目留空可复用" if status["has_key"] else "输入 Secret 或 service_role key")
        self.content.addWidget(label("后台密钥（当前 Windows 用户加密保存）"))
        self.content.addWidget(self.key)
        note = label("检查连接只读取结构与数量。保存前会备份当前账本；云端失败时请重试或明确切回本地。", "muted")
        note.setWordWrap(True)
        self.content.addWidget(note)
        self.content.addStretch()
        self.test = button("检查连接", self.check)
        self.cancel = button("取消", self.reject)
        self.save = button("保存并切换", self.submit, True)
        self.footer.addWidget(self.test)
        self.footer.addWidget(self.cancel)
        self.footer.addWidget(self.save)
        self.backend.currentIndexChanged.connect(self.changed)
        self.changed()
        self.initial = self.values()

    def values(self):
        return self.backend.currentData(), self.url.text(), self.key.text()

    def changed(self):
        cloud = self.backend.currentData() == "supabase"
        self.url.setEnabled(cloud)
        self.key.setEnabled(cloud)

    def set_busy(self, busy):
        self.busy = busy
        for control in (self.test, self.save, self.cancel, self.backend):
            control.setEnabled(not busy)
        self.url.setEnabled(not busy and self.backend.currentData() == "supabase")
        self.key.setEnabled(not busy and self.backend.currentData() == "supabase")

    def check(self):
        if self.busy:
            return
        backend, url, key = self.values()
        self.set_busy(True)
        self.tasks.submit(lambda: self.service.test_backend(backend, url, key), self.checked, self.failed)

    def checked(self, result):
        self.set_busy(False)
        self.notice.show_message(result["message"])

    def submit(self):
        if self.busy:
            return
        backend, url, key = self.values()
        self.set_busy(True)
        self.tasks.submit(lambda: self.service.switch_backend(backend, url, key, self.generation),
                          self.succeeded, self.failed, write=True, allow_generation_change=True)

    def succeeded(self, result):
        self.set_busy(False)
        self.initial = self.values()
        self.key.clear()
        self.switched.emit(result)
        self.accept()

    def failed(self, exc):
        self.set_busy(False)
        self.notice.show_message(str(exc), True)

    def reject(self):
        if self.busy:
            return
        if self.values() != self.initial and QMessageBox.question(self, "放弃未保存设置", "数据库设置尚未保存，确定放弃？", QMessageBox.StandardButton.Discard | QMessageBox.StandardButton.Cancel, QMessageBox.StandardButton.Cancel) != QMessageBox.StandardButton.Discard:
            return
        self.key.clear()
        super().reject()
