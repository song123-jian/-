"""The authenticated save-failure continuation must not start a second login."""
import time
from types import SimpleNamespace

from PySide6.QtCore import Qt
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication, QDialog

from ui.login_dialog import LoginDialog


def test_registration_mode_requires_confirmation_and_keeps_saved_login(qtbot,tmp_path):
    from services.account_service import LoginCredentialStore
    store=LoginCredentialStore(tmp_path)
    store.save('old_user','old-isolated-password')
    dialog=LoginDialog(tmp_path,credential_store=store)
    qtbot.addWidget(dialog)
    dialog.show()
    qtbot.mouseClick(dialog.register_button,Qt.MouseButton.LeftButton)
    assert dialog.registering and dialog.confirmation.isVisible()
    assert '禁止重复注册' in dialog.notice.text.text()
    assert '总数最多15个' in dialog.notice.text.text()
    assert not dialog.username.text() and not dialog.password.text()
    assert store.load()==('old_user','old-isolated-password')
    dialog.password.setText('new-isolated-password')
    qtbot.keyClick(dialog.password,Qt.Key.Key_Return)
    assert dialog.focusWidget() is dialog.confirmation
    assert not dialog.pending
    qtbot.mouseClick(dialog.register_button,Qt.MouseButton.LeftButton)
    assert not dialog.registering and not dialog.confirmation.isVisible()
    assert dialog.login_button.text()=='登录'


def test_successful_registration_saves_encrypted_login_once(qtbot,tmp_path):
    calls=[]
    class Service:
        def register(self,u,p,c):
            calls.append((u,p==c))
            return SimpleNamespace(username=u,close=lambda:None)
    dialog=LoginDialog(tmp_path,service=Service())
    qtbot.addWidget(dialog)
    dialog.show()
    qtbot.mouseClick(dialog.register_button,Qt.MouseButton.LeftButton)
    dialog.username.setText('qa_user')
    dialog.password.setText('new-isolated-password')
    dialog.confirmation.setText('new-isolated-password')
    qtbot.mouseClick(dialog.login_button,Qt.MouseButton.LeftButton)
    dialog.login()
    qtbot.waitUntil(lambda:not dialog.pending)
    assert dialog.result()==QDialog.DialogCode.Accepted
    assert calls==[('qa_user',True)]
    assert dialog.credentials.load()==('qa_user','new-isolated-password')
    assert b'new-isolated-password' not in dialog.credentials.path.read_bytes()


def test_created_account_with_login_failure_returns_to_login(qtbot,tmp_path):
    from services.account_service import RegisteredAccountError
    class Service:
        def register(self,*args):
            raise RegisteredAccountError('账号已注册，请返回登录重试')
    dialog=LoginDialog(tmp_path,service=Service())
    qtbot.addWidget(dialog)
    dialog.show()
    qtbot.mouseClick(dialog.register_button,Qt.MouseButton.LeftButton)
    dialog.username.setText('qa_user')
    dialog.password.setText('new-isolated-password')
    dialog.confirmation.setText('new-isolated-password')
    qtbot.mouseClick(dialog.login_button,Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda:not dialog.pending)
    assert not dialog.registering and not dialog.confirmation.isVisible()
    assert dialog.username.text()=='qa_user' and dialog.password.text()=='new-isolated-password'
    assert '账号已注册' in dialog.notice.text.text()
    assert dialog.login_button.text()=='登录'


def test_register_saved_password_failure_cannot_register_twice(qtbot,tmp_path):
    calls=[]
    class Service:
        def register(self,u,p,c):
            calls.append(u)
            return SimpleNamespace(username=u,close=lambda:None)
    class Credentials:
        def load(self):
            return None
        def save(self,*args):
            raise ValueError('无法加密保存')
    dialog=LoginDialog(tmp_path,service=Service(),credential_store=Credentials())
    qtbot.addWidget(dialog)
    dialog.show()
    qtbot.mouseClick(dialog.register_button,Qt.MouseButton.LeftButton)
    dialog.username.setText('qa_user')
    dialog.password.setText('new-isolated-password')
    dialog.confirmation.setText('new-isolated-password')
    qtbot.mouseClick(dialog.login_button,Qt.MouseButton.LeftButton)
    qtbot.waitUntil(lambda:not dialog.pending)
    assert not dialog.register_button.isEnabled()
    qtbot.keyClick(dialog.confirmation,Qt.Key.Key_Return)
    assert calls==['qa_user'] and dialog.result()==QDialog.DialogCode.Accepted


def test_enter_after_credential_save_failure_uses_authenticated_session(tmp_path):
    app=QApplication.instance() or QApplication([])
    calls=[]
    class Service:
        def login(self,username,password):
            calls.append(username)
            return SimpleNamespace(username=username,close=lambda:None)
    class Credentials:
        def load(self):
            return None
        def save(self,*args):
            raise ValueError('无法加密保存')
    dialog=LoginDialog(tmp_path,service=Service(),credential_store=Credentials())
    dialog.username.setText('qa_user')
    dialog.password.setText('isolated-test-password')
    dialog.show()
    def drain():
        until=time.monotonic()+3
        while dialog.pending and time.monotonic()<until:
            app.processEvents()
            QTest.qWait(10)
        assert not dialog.pending
    try:
        QTest.mouseClick(dialog.login_button,Qt.MouseButton.LeftButton)
        drain()
        assert dialog.session and len(calls)==1
        assert dialog.login_button.text()=='进入个人空间'
        QTest.keyClick(dialog.password,Qt.Key.Key_Return)
        drain()
        assert len(calls)==1
        assert dialog.result()==QDialog.DialogCode.Accepted
    finally:
        dialog.reject()
