"""One tray icon for the active account; shutdown stays with MainWindow."""
from __future__ import annotations

from PySide6.QtCore import QObject, Qt
from PySide6.QtWidgets import QMenu, QSystemTrayIcon

from domain import APP_NAME, VERSION


class SystemTray(QObject):
    def __init__(self, app, parent=None):
        super().__init__(parent)
        self.window = None
        self.hidden_dialogs = ()
        self.icon = QSystemTrayIcon(app.windowIcon(), self)
        self.icon.setToolTip(f"{APP_NAME} · {VERSION}")
        self.menu = QMenu()
        self.destroyed.connect(self.menu.deleteLater)
        self.show_action = self.menu.addAction(f"显示{APP_NAME}", self.restore)
        self.menu.setDefaultAction(self.show_action)
        self.menu.addSeparator()
        self.quit_action = self.menu.addAction("退出程序", self.request_exit)
        self.icon.setContextMenu(self.menu)
        self.icon.activated.connect(self.activated)
        self.icon.messageClicked.connect(self.restore)
        app.aboutToQuit.connect(self.detach)

    def attach(self, window):
        self.detach()
        self.window = window
        window.tray = self
        if QSystemTrayIcon.isSystemTrayAvailable() and not self.icon.icon().isNull():
            self.icon.show()

    def detach(self):
        self.icon.hide()
        self.menu.close()
        if self.window is not None:
            self.window.tray = None
        self.window = None
        self.hidden_dialogs = ()

    def minimize(self):
        window = self.window
        if window is None or not self.icon.isVisible() or not QSystemTrayIcon.isSystemTrayAvailable():
            return False
        if not window.isVisible():
            return True
        self.hidden_dialogs = tuple(dialog for dialog in window.dialogs if dialog.isVisible())
        for dialog in self.hidden_dialogs:
            dialog.hide()
        window.hide()
        if not window.settings.value("tray_hint_shown", False, type=bool) and QSystemTrayIcon.supportsMessages():
            self.icon.showMessage(APP_NAME, "程序已收起到系统托盘，双击图标恢复；右键菜单可退出程序。",
                                  QSystemTrayIcon.MessageIcon.Information, 5000)
            window.settings.setValue("tray_hint_shown", True)
        return True

    def restore(self):
        window = self.window
        if window is None:
            return
        window.setWindowState(window.windowState() & ~Qt.WindowState.WindowMinimized)
        window.show()
        window.raise_()
        window.activateWindow()
        for dialog in self.hidden_dialogs:
            if dialog in window.dialogs:
                dialog.show()
                dialog.raise_()
                dialog.activateWindow()
        self.hidden_dialogs = ()

    def activated(self, reason):
        if reason in (QSystemTrayIcon.ActivationReason.Trigger, QSystemTrayIcon.ActivationReason.DoubleClick):
            self.restore()

    def request_exit(self):
        if self.window is not None:
            self.window.request_exit()
