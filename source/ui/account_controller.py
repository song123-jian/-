"""Close/drain one user's window before creating the next authenticated profile."""
from PySide6.QtCore import QObject, QTimer
from PySide6.QtWidgets import QDialog

from services.backend_service import account_context
from ui.login_dialog import LoginDialog
from ui.main_window import MainWindow
from ui.system_tray import SystemTray


class AccountController(QObject):
    def __init__(self, app, folder):
        super().__init__()
        self.app,self.folder = app,folder
        self.window = self.login_dialog = self.session = None
        self.app.setQuitOnLastWindowClosed(False)
        self.tray = SystemTray(app, self)
        QTimer.singleShot(0,self.open_login)

    def open_login(self):
        self.login_dialog = LoginDialog(self.folder)
        if self.login_dialog.exec() != QDialog.DialogCode.Accepted:
            self.login_dialog = None
            self.app.quit()
            return
        self.session = self.login_dialog.session
        self.login_dialog.deleteLater()
        self.login_dialog = None
        self.window = MainWindow(account_context(self.folder,self.session))
        self.window.accountClosed.connect(self.window_closed)
        self.tray.attach(self.window)
        self.window.show()

    def window_closed(self, logout):
        self.tray.detach()
        session,self.session = self.session,None
        window,self.window = self.window,None
        if window:
            window.model.set_items([])
            window.deleteLater()
        if session:
            session.close()
        if logout:
            QTimer.singleShot(0,self.open_login)
        else:
            self.app.quit()

    def wake(self):
        if self.window is not None:
            self.tray.restore()
            return
        window = self.login_dialog
        if window:
            window.showNormal()
            window.raise_()
            window.activateWindow()
