"""UI boundaries for the customer directory and image quote form."""
import threading

from PySide6.QtCore import QMimeData, QPoint, QPointF, Qt, QTimer
from PySide6.QtGui import QDragEnterEvent, QDropEvent, QGuiApplication, QImage
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QDialog

from image_factory import quote_image
from services.image_quote_service import recognize_image
from ui.dialogs import QuoteDialog
from ui.main_window import MainWindow
from ui.theme_tokens import apply_theme, form_font


def test_customer_directory_elides_names_and_disables_horizontal_scroll(qtbot, context):
    window = MainWindow(context)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitUntil(lambda: window.loaded and not window.tasks.jobs, timeout=10000)
    item = window.customer_model.item(1)
    item.setText("非常长的客户名称有限公司（目录省略验证）")
    item.setData(12, Qt.ItemDataRole.UserRole + 2)
    window.customers.resize(176, 110)
    assert window.customers.horizontalScrollBarPolicy() == Qt.ScrollBarPolicy.ScrollBarAlwaysOff
    assert not window.customers.horizontalScrollBar().isVisible()
    assert window.customers.itemDelegate().__class__.__name__ == "CustomerDelegate"
    assert window.customers.visualRect(window.customer_model.index(1, 0)).width() <= window.customers.viewport().width()
    window.close()
    qtbot.waitUntil(lambda: not window.isVisible(), timeout=5000)


def test_image_drop_preview_edit_review_and_plain_text_paste(qtbot, qapp, context):
    apply_theme(qapp)
    window = MainWindow(context)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitUntil(lambda: window.loaded and not window.tasks.jobs, timeout=10000)
    customer = context.store.meta()["customers"][0]["name"]
    dialog = QuoteDialog(window.prices, window.tasks, context.storage_generation,
                         selected_customer=customer, parent=window)
    qtbot.addWidget(dialog)
    dialog.show()
    image = QImage.fromData(quote_image(customer="图片抬头客户", grade="DROP-PA12"))
    mime = QMimeData()
    mime.setImageData(image)
    panel = dialog.image_panel
    enter = QDragEnterEvent(QPoint(10, 10), Qt.DropAction.CopyAction, mime,
                            Qt.MouseButton.LeftButton, Qt.KeyboardModifier.NoModifier)
    qapp.sendEvent(panel, enter)
    assert enter.isAccepted()
    drop = QDropEvent(QPointF(10, 10), Qt.DropAction.CopyAction, mime,
                      Qt.MouseButton.LeftButton, Qt.KeyboardModifier.NoModifier)
    qapp.sendEvent(panel, drop)
    assert drop.isAccepted()
    qtbot.waitUntil(lambda: not window.tasks.jobs and bool(panel.candidates), timeout=20000)
    assert dialog.values()["customer"] == customer and dialog.values()["grade"] == "DROP-PA12"
    assert dialog.values()["price"] == "9.734513"
    checked = []

    def close_preview():
        preview = panel.findChild(QDialog)
        checked.append(preview is not None and preview.isVisible() and preview.windowTitle() == "核对报价原图")
        if preview:
            preview.accept()

    QTimer.singleShot(50, close_preview)
    panel.original.click()
    assert checked == [True]
    dialog.image_review.setChecked(True)
    dialog.fields["price"].setText("10.5")
    assert not dialog.image_review.isChecked()
    clipboard = QGuiApplication.clipboard()
    saved = QMimeData()
    previous = clipboard.mimeData()
    if previous is not None:
        for fmt in previous.formats():
            saved.setData(fmt, previous.data(fmt))
        if previous.hasImage():
            saved.setImageData(previous.imageData())
    try:
        clipboard.setText("手工备注")
        dialog.fields["note"].setFocus()
        QTest.keyClick(dialog.fields["note"], Qt.Key.Key_V, Qt.KeyboardModifier.ControlModifier)
        assert dialog.values()["note"] == "手工备注" and not dialog.image_pending
    finally:
        clipboard.setMimeData(saved)
    dialog.accept()
    window.close()
    qtbot.waitUntil(lambda: not window.isVisible(), timeout=5000)


def test_ocr_result_does_not_replace_concurrent_manual_edits(qtbot, qapp, context, monkeypatch):
    result = recognize_image({"content": quote_image(grade="ASYNC-PA12")})
    entered, release = threading.Event(), threading.Event()

    def delayed(*args, **kwargs):
        entered.set()
        assert release.wait(5)
        return result

    monkeypatch.setattr("ui.quote_dialog.recognize_image", delayed)
    apply_theme(qapp)
    window = MainWindow(context)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitUntil(lambda: window.loaded and not window.tasks.jobs, timeout=10000)
    dialog = QuoteDialog(window.prices, window.tasks, context.storage_generation, parent=window)
    qtbot.addWidget(dialog)
    dialog.show()
    dialog.start_image({"content": b"controlled OCR return"})
    try:
        qtbot.waitUntil(entered.is_set, timeout=3000)
        dialog.fields["grade"].setText("手工牌号")
        release.set()
        qtbot.waitUntil(lambda: not window.tasks.jobs, timeout=5000)
        assert dialog.values()["grade"] == "手工牌号" and not dialog.image_active
        assert len(dialog.image_panel.candidates) == 1 and "已编辑表单" in dialog.image_panel.status.text()
    finally:
        release.set()
        dialog.accept()
        window.close()
        qtbot.waitUntil(lambda: not window.isVisible(), timeout=5000)


def test_new_quote_has_image_inputs_and_microsoft_yahei(qtbot, qapp, context):
    apply_theme(qapp)
    window = MainWindow(context)
    qtbot.addWidget(window)
    window.show()
    qtbot.waitUntil(lambda: window.loaded and not window.tasks.jobs, timeout=10000)
    dialog = QuoteDialog(window.prices, window.tasks, context.storage_generation, customer="图片表单客户", parent=window)
    qtbot.addWidget(dialog)
    dialog.show()
    assert dialog.image_panel is not None
    assert dialog.image_panel.choose.text() == "选择图片"
    assert dialog.image_panel.paste.text() == "粘贴截图"
    assert dialog.image_panel.original.text() == "查看原图"
    assert dialog.font().family() in {"Microsoft YaHei", "Microsoft YaHei UI", "Segoe UI"}
    assert form_font().family() == dialog.font().family()
    assert all(field.font().family() == form_font().family() for field in dialog.fields.values())
    assert all(field.height() >= 38 for key, field in dialog.fields.items() if key != "note")
    dialog.accept()
    window.close()
    qtbot.waitUntil(lambda: not window.isVisible(), timeout=5000)

