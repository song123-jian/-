"""Enter performs only the query bound to the focused filter control."""
from PySide6.QtCore import QEvent, QObject, Qt
from PySide6.QtWidgets import QApplication


class _QueryEnterBinding(QObject):
    def __init__(self, action, controls):
        super().__init__(controls[0])
        self.action = action
        for control in controls:
            control.installEventFilter(self)
            editor = getattr(control, 'lineEdit', lambda: None)()
            if editor is not None:
                editor.installEventFilter(self)
            hint = control.toolTip()
            control.setToolTip((hint + '\n' if hint else '') + '按 Enter 查询')

    def eventFilter(self, watched, event):
        if (event.type() == QEvent.Type.KeyPress
                and event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter)
                and not event.modifiers() & (Qt.KeyboardModifier.ControlModifier
                                             | Qt.KeyboardModifier.AltModifier
                                             | Qt.KeyboardModifier.MetaModifier
                                             | Qt.KeyboardModifier.ShiftModifier)
                and watched.isEnabled() and watched.isVisible()
                and QApplication.activePopupWidget() is None):
            if not event.isAutoRepeat():
                self.action()
            return True
        return super().eventFilter(watched, event)


def bind_enter_query(action, *controls):
    """Bind existing search controls without intercepting form or popup keys."""
    return _QueryEnterBinding(action, controls)
