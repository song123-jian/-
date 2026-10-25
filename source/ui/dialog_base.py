"""Desktop dialog implementation module."""
from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QGuiApplication, QIcon, QValidator
from PySide6.QtWidgets import QDialog, QFrame, QHBoxLayout, QLabel, QPushButton, QScrollArea, QVBoxLayout, QWidget


def label(text, role=None):
    result = QLabel(text)
    result.setTextFormat(Qt.TextFormat.PlainText)
    result.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
    if role:
        result.setProperty("role", role)
    return result

def button(text, slot=None, primary=False, icon=None):
    result = QPushButton(text)
    result.setAutoDefault(False)
    if slot:
        result.clicked.connect(slot)
    if primary:
        result.setProperty("role", "primary")
    if icon:
        result.setIcon(QIcon(":/icons/" + icon + ("-white" if primary else "") + ".svg"))
    return result

class Notice(QFrame):
    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(12, 10, 12, 10)
        self.text = label("")
        self.text.setWordWrap(True)
        layout.addWidget(self.text)
        self.hide()

    def show_message(self, message, error=False):
        self.setProperty("role", "error" if error else "success")
        self.style().unpolish(self)
        self.style().polish(self)
        self.text.setText(str(message))
        self.show()

class BaseDialog(QDialog):
    def __init__(self, title, width=680, height=640, parent=None):
        super().__init__(parent)
        self.setWindowTitle(title)
        self.setModal(True)
        screen = parent.screen() if parent else QGuiApplication.primaryScreen()
        available = screen.availableGeometry()
        self.resize(min(width, available.width() - 40), min(height, available.height() - 60))
        self.setMinimumSize(min(440, available.width() - 40), min(360, available.height() - 60))
        self.outer = QVBoxLayout(self)
        self.outer.setContentsMargins(22, 20, 22, 18)
        self.outer.setSpacing(14)
        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.body = QWidget()
        self.body.setObjectName("DialogBody")
        self.content = QVBoxLayout(self.body)
        self.content.setContentsMargins(0, 0, 4, 0)
        self.content.setSpacing(14)
        self.scroll.setWidget(self.body)
        self.outer.addWidget(self.scroll, 1)
        self.footer = QHBoxLayout()
        self.footer.addStretch()
        self.outer.addLayout(self.footer)
        self.notice = Notice()
        self.content.addWidget(self.notice)
        self.busy = False

    def reject(self):
        if not self.busy:
            super().reject()

    def closeEvent(self, event):
        if self.busy:
            event.ignore()
        else:
            super().closeEvent(event)

class MoneyValidator(QValidator):
    def validate(self, text, position):
        import re
        # Preserve the text verbatim; business validation handles range/precision.
        if re.fullmatch(r"[0-9]*(?:\.[0-9]*)?", text):
            state = QValidator.State.Acceptable if text and text != "." else QValidator.State.Intermediate
        else:
            state = QValidator.State.Invalid
        return state, text, position
