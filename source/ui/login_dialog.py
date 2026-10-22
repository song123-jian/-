"""Application login; MES credentials remain in their existing dialog."""
from __future__ import annotations

from types import SimpleNamespace

from PySide6.QtCore import QEvent, Qt
from PySide6.QtWidgets import QCheckBox, QDialog, QFormLayout, QHBoxLayout, QLineEdit, QVBoxLayout

from domain import APP_NAME
from services.account_service import AccountService, LoginCredentialStore, RegisteredAccountError
from ui.dialogs import Notice, button, label
from ui.workers import TaskManager


class LoginDialog(QDialog):
    def __init__(self, folder, *, service=None, credential_store=None):
        super().__init__()
        self.setWindowTitle(f'{APP_NAME} · 程序账号登录')
        self.setMinimumWidth(430)
        self.setWindowFlag(Qt.WindowType.WindowContextHelpButtonHint, False)
        self.service = service or AccountService()
        self.credentials = credential_store or LoginCredentialStore(folder)
        self.session = None
        self.pending = False
        self.registering = False
        self.tasks = TaskManager(SimpleNamespace(data_generation=0,storage_generation='login'), self)
        self.tasks.allFinished.connect(self._finished)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(30,26,30,24)
        layout.setSpacing(16)
        self.title = label(f'登录{APP_NAME}','title')
        layout.addWidget(self.title)
        description = label('每个账号独立管理客户与报价；库存使用原 MES 账号。','muted')
        description.setWordWrap(True)
        layout.addWidget(description)
        form = QFormLayout()
        self.username = QLineEdit()
        self.username.setAccessibleName('程序账号')
        self.username.setPlaceholderText('输入程序账号')
        self.username.setMaxLength(32)
        self.password = QLineEdit()
        self.password.setAccessibleName('程序密码')
        self.password.setPlaceholderText('输入程序密码')
        self.password.setMaxLength(256)
        self.password.setEchoMode(QLineEdit.EchoMode.Password)
        self.confirmation = QLineEdit()
        self.confirmation.setAccessibleName('确认程序密码')
        self.confirmation.setPlaceholderText('再次输入密码')
        self.confirmation.setMaxLength(256)
        self.confirmation.setEchoMode(QLineEdit.EchoMode.Password)
        form.addRow('账号',self.username)
        form.addRow('密码',self.password)
        self.confirm_label = label('确认密码')
        form.addRow(self.confirm_label,self.confirmation)
        self.confirmation.hide()
        self.confirm_label.hide()
        layout.addLayout(form)
        self.remember = QCheckBox('记住账号密码（仅本机当前 Windows 用户）')
        self.remember.setChecked(True)
        layout.addWidget(self.remember)
        self.notice = Notice()
        layout.addWidget(self.notice)
        actions = QHBoxLayout()
        self.clear_button = button('清除已保存登录',self.clear_saved)
        self.register_button = button('注册账号',self.toggle_registration)
        self.login_button = button('登录',self.login,True)
        self.login_button.setDefault(True)
        actions.addWidget(self.clear_button)
        actions.addStretch()
        actions.addWidget(self.register_button)
        actions.addWidget(self.login_button)
        layout.addLayout(actions)
        for field in (self.username,self.password,self.confirmation):
            field.installEventFilter(self)
        self.remember.toggled.connect(self.remember_changed)
        try:
            saved = self.credentials.load()
            if saved:
                self.username.setText(saved[0])
                self.password.setText(saved[1])
        except ValueError as exc:
            self.notice.show_message(str(exc),True)

    def toggle_registration(self):
        if self.pending or self.session is not None:
            return
        self.registering = not self.registering
        self.confirmation.clear()
        if self.registering:
            self.username.clear()
            self.password.clear()
        self.confirmation.setVisible(self.registering)
        self.confirm_label.setVisible(self.registering)
        self.clear_button.setVisible(not self.registering)
        self.title.setText(f'注册{APP_NAME}账号' if self.registering else f'登录{APP_NAME}')
        self.register_button.setText('返回登录' if self.registering else '注册账号')
        self.login_button.setText('注册并登录' if self.registering else '登录')
        if self.registering:
            self.username.setPlaceholderText('3至32位字母、数字或下划线')
            self.notice.show_message('禁止重复注册，账号总数最多15个；新账号拥有空白个人空间。')
        else:
            self.username.setPlaceholderText('输入程序账号')
            self.notice.hide()
        self.username.setFocus()
        self.adjustSize()

    def password_entered(self):
        if self.registering and self.session is None:
            self.confirmation.setFocus()
        else:
            self.login()

    def eventFilter(self, watched, event):
        if event.type()==QEvent.Type.KeyPress and event.key() in (Qt.Key.Key_Return,Qt.Key.Key_Enter):
            if not self.pending:
                if watched is self.username:
                    self.password.setFocus()
                elif watched is self.password:
                    self.password_entered()
                elif watched is self.confirmation:
                    self.login()
                else:
                    return super().eventFilter(watched,event)
            return True
        return super().eventFilter(watched,event)

    def remember_changed(self, checked):
        if not checked:
            self.clear_saved()

    def clear_saved(self):
        try:
            self.credentials.clear()
            self.notice.show_message('已清除保存，下次启动需要重新输入')
        except ValueError as exc:
            self.notice.show_message(str(exc),True)

    def login(self):
        if self.pending:
            return
        if self.session is not None:
            self.accept()
            return
        username,password = self.username.text(),self.password.text()
        confirmation = self.confirmation.text()
        registering = self.registering
        self.pending = True
        for widget in (self.username,self.password,self.confirmation,self.remember,self.clear_button,self.register_button,self.login_button):
            widget.setEnabled(False)
        self.login_button.setText('注册中…' if registering else '登录中…')
        self.notice.hide()
        def authenticated(session):
            self.session = session
            if self.remember.isChecked():
                try:
                    self.credentials.save(session.username,password)
                except ValueError as exc:
                    self.notice.show_message(str(exc),True)
                    self.login_button.setText('进入个人空间')
                    self.login_button.clicked.disconnect()
                    self.login_button.clicked.connect(self.accept)
                    return
            self.accept()
        def failed(exc):
            if isinstance(exc,RegisteredAccountError):
                self.confirmation.clear()
                self.registering = False
                self.confirmation.hide()
                self.confirm_label.hide()
                self.clear_button.show()
                self.title.setText(f'登录{APP_NAME}')
                self.register_button.setText('注册账号')
            self.notice.show_message(str(exc),True)
        self.tasks.submit(lambda:self.service.register(username,password,confirmation) if registering else self.service.login(username,password),
                          authenticated,failed,write=registering)

    def _finished(self):
        self.pending = False
        for widget in (self.username,self.password,self.confirmation,self.remember,self.clear_button,self.register_button,self.login_button):
            widget.setEnabled(True)
        self.register_button.setEnabled(self.session is None)
        if self.session is None:
            self.login_button.setText('注册并登录' if self.registering else '登录')

    def reject(self):
        if self.pending:
            self.notice.show_message('正在注册或登录，请等待本次请求结束',True)
            return
        if self.session is not None:
            self.session.close()
            self.session = None
        super().reject()
