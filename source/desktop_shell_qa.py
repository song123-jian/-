"""Narrow packaged UI acceptance, selected only inside an explicit isolated smoke directory."""
from __future__ import annotations

import sys

from PySide6.QtCore import Qt, QTimer
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication, QSystemTrayIcon

from qa_runner import PackagedSmoke
from ui.system_tray import SystemTray


class PackagedDesktopShellSmoke(PackagedSmoke):
    def baseline(self):
        assert self.window.loaded and self.window.context.store.backend == "sqlite"
        self.report["scope"] = "isolated desktop settings navigation and native system tray"
        self.report["cloud_or_business_data_accessed"] = False
        self.report["platform"] = QApplication.instance().platformName()
        self.report["entry"] = sys.executable
        self.tray = SystemTray(QApplication.instance(), self)
        self.tray.attach(self.window)
        assert QSystemTrayIcon.isSystemTrayAvailable() and self.tray.icon.isVisible(), "当前Windows会话无可用托盘"
        self.report["checks"]["native_tray_visible"] = True
        self.window.resize(960, 640)
        QTimer.singleShot(150, self, lambda: self.safe(self.compact))

    def compact(self):
        window = self.window
        QTest.mouseClick(window.settings_nav, Qt.MouseButton.LeftButton)
        assert window.pages.currentIndex() == 2 and window.settings_nav.isChecked()
        assert window.storage_label.geometry().right() < window.settings_nav.geometry().left()
        assert abs(window.storage_label.geometry().center().y() - window.settings_nav.geometry().center().y()) <= 1
        cloud_text_width = window.storage_label.fontMetrics().horizontalAdvance("● Supabase 云数据库")
        assert window.storage_label.width() >= cloud_text_width, "侧栏需要容纳完整云数据库文字"
        assert window.settings_nav.accessibleName() == "数据库设置"
        self.report["checks"]["settings_next_to_storage_at_960"] = True
        QTest.mouseClick(window.data_nav, Qt.MouseButton.LeftButton)
        assert window.pages.currentIndex() == 1 and not window.settings_nav.isChecked()
        window.close()
        assert not window.isVisible() and not window._closing and not window.context.closing
        self.report["checks"]["close_hides_without_shutdown"] = True
        QTimer.singleShot(100, self, lambda: self.safe(self.restore))

    def restore(self):
        self.tray.show_action.trigger()
        assert self.window.isVisible() and self.window.pages.currentIndex() == 1
        self.window.showMaximized()
        QTimer.singleShot(100, self, lambda: self.safe(self.maximized))

    def maximized(self):
        self.window.close()
        self.tray.activated(QSystemTrayIcon.ActivationReason.DoubleClick)
        assert self.window.isVisible() and self.window.isMaximized()
        self.report["checks"]["tray_menu_and_double_click_restore"] = True
        self.window.showNormal()
        self.window.resize(1280, 800)
        QTest.mouseClick(self.window.settings_nav, Qt.MouseButton.LeftButton)
        QTimer.singleShot(150, self, lambda: self.safe(self.finish))

    def finish(self):
        assert all(self.report["checks"].values())
        self.capture(self.window, "settings-tray-1280.png")
        self.tray.quit_action.trigger()
        assert self.window._exit_requested and self.window._ready_to_close
        self.report["checks"]["explicit_exit_requested"] = True
        self.report["status"] = "passed"
        self.write_report()
        self.finished = True
        self.timeout.stop()

    def fail(self, message):
        if self.finished:
            return
        self.report["status"] = "failed"
        self.report["error"] = str(message)
        self.exit_code = 2
        self.write_report()
        self.finished = True
        self.timeout.stop()
        for dialog in tuple(self.window.dialogs):
            dialog.accept()
        self.window.request_exit()
