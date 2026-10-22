"""Image inputs and candidate selection inside the new-quote form."""
from PySide6.QtCore import QBuffer, QEvent, QIODevice, Qt, Signal
from PySide6.QtGui import QGuiApplication, QImage, QKeySequence, QPixmap
from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QFileDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
)

from services.image_quote_service import IMAGE_SUFFIXES, MAX_IMAGE_PIXELS

from .combo_delegate import configure_combo_popup
from .theme_tokens import form_font


def text_label(text="", muted=False):
    result = QLabel(text)
    result.setTextFormat(Qt.TextFormat.PlainText)
    result.setWordWrap(True)
    if muted:
        result.setProperty("role", "muted")
    return result


class ImageQuotePanel(QFrame):
    imageRequested = Signal(object)
    candidateRequested = Signal(object)
    cancelRequested = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setProperty("role", "panel")
        self.setAcceptDrops(True)
        self.setFont(form_font())
        self.candidates = []
        self.pending = False
        self.preview_data = b""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 10, 12, 10)
        layout.setSpacing(8)
        actions = QHBoxLayout()
        actions.setSpacing(8)
        self.choose = QPushButton("选择图片")
        self.paste = QPushButton("粘贴截图")
        self.stop = QPushButton("取消识别")
        for control in (self.choose, self.paste, self.stop):
            control.setAutoDefault(False)
            actions.addWidget(control)
        actions.addStretch()
        self.stop.hide()
        layout.addLayout(actions)
        layout.addWidget(text_label("拖入报价图片，或 Win+Shift+S 截图后 Ctrl+V 粘贴。核对客户、牌号、单价和税口径后保存。", True))
        self.status = text_label("识别在本机完成。")
        layout.addWidget(self.status)
        self.details = QFrame()
        details = QHBoxLayout(self.details)
        details.setContentsMargins(0, 0, 0, 0)
        self.thumbnail = QLabel()
        self.thumbnail.setFixedSize(150, 90)
        self.thumbnail.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.thumbnail.setAccessibleName("报价原图缩略图")
        details.addWidget(self.thumbnail)
        controls = QVBoxLayout()
        self.combo = QComboBox()
        self.combo.setSizeAdjustPolicy(QComboBox.SizeAdjustPolicy.AdjustToMinimumContentsLengthWithIcon)
        self.combo.setMinimumContentsLength(14)
        configure_combo_popup(self.combo)
        self.combo.setAccessibleName("图片报价候选")
        self.combo.setPlaceholderText("请选择商品和税价")
        self.combo.view().setFont(form_font())
        controls.addWidget(self.combo)
        self.warning = text_label("", True)
        controls.addWidget(self.warning)
        buttons = QHBoxLayout()
        self.apply = QPushButton("填入并匹配")
        self.original = QPushButton("查看原图")
        for control in (self.apply, self.original):
            control.setAutoDefault(False)
            buttons.addWidget(control)
        buttons.addStretch()
        controls.addLayout(buttons)
        details.addLayout(controls, 1)
        layout.addWidget(self.details)
        self.details.hide()
        self.choose.clicked.connect(self.choose_image)
        self.paste.clicked.connect(self.paste_image)
        self.stop.clicked.connect(self.cancelRequested)
        self.apply.clicked.connect(self.apply_current)
        self.original.clicked.connect(self.show_original)
        self.combo.currentIndexChanged.connect(self.selection_changed)

    def choose_image(self):
        path, _ = QFileDialog.getOpenFileName(self, "选择报价图片", "", "报价图片 (*.png *.jpg *.jpeg *.bmp *.webp)")
        if path:
            self.imageRequested.emit({"path": path})

    @staticmethod
    def image_source(mime):
        if mime.hasImage():
            image = QImage(mime.imageData())
            if image.isNull():
                raise ValueError("剪贴板图片无法读取，请重新截图")
            if image.width() * image.height() > MAX_IMAGE_PIXELS:
                raise ValueError("图片超过2400万像素，请截图报价明细区域")
            buffer = QBuffer()
            buffer.open(QIODevice.OpenModeFlag.WriteOnly)
            if not image.save(buffer, "PNG"):
                raise ValueError("截图转换失败，请重新截图")
            return {"content": bytes(buffer.data())}
        if mime.hasUrls():
            urls = mime.urls()
            if len(urls) != 1:
                raise ValueError("请一次选择一张报价图片")
            if urls[0].isLocalFile() and urls[0].toLocalFile().lower().endswith(tuple(IMAGE_SUFFIXES)):
                return {"path": urls[0].toLocalFile()}
        return None

    def paste_image(self):
        try:
            source = self.image_source(QGuiApplication.clipboard().mimeData())
        except (ValueError, TypeError) as exc:
            self.status.setText(str(exc))
            return True
        if source is None:
            self.status.setText("剪贴板中没有图片，请先截图或复制图片。")
            return False
        self.imageRequested.emit(source)
        return True

    def eventFilter(self, watched, event):
        if event.type() == QEvent.Type.KeyPress and event.matches(QKeySequence.StandardKey.Paste):
            mime = QGuiApplication.clipboard().mimeData()
            if mime.hasImage() or (mime.hasUrls() and any(url.toLocalFile().lower().endswith(tuple(IMAGE_SUFFIXES)) for url in mime.urls())):
                return self.paste_image()
        return super().eventFilter(watched, event)

    def dragEnterEvent(self, event):
        mime = event.mimeData()
        if mime.hasImage() or (mime.hasUrls() and all(url.isLocalFile() and url.toLocalFile().lower().endswith(tuple(IMAGE_SUFFIXES)) for url in mime.urls())):
            event.acceptProposedAction()

    def dropEvent(self, event):
        try:
            source = self.image_source(event.mimeData())
            if source:
                self.imageRequested.emit(source)
                event.acceptProposedAction()
        except (ValueError, TypeError) as exc:
            self.status.setText(str(exc))

    def set_pending(self, pending, message="正在识别图片…"):
        self.pending = pending
        self.stop.setVisible(pending)
        self.apply.setEnabled(not pending and self.combo.currentIndex() >= 0)
        self.combo.setEnabled(not pending)
        if pending:
            self.status.setText(message)

    def show_result(self, result):
        self.candidates = result["candidates"]
        self.preview_data = result["preview_png"]
        pixmap = QPixmap()
        pixmap.loadFromData(self.preview_data)
        self.thumbnail.setPixmap(pixmap.scaled(self.thumbnail.size(), Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
        self.combo.clear()
        for candidate in self.candidates:
            row = candidate["record"]
            self.combo.addItem(f"{row['grade'] or '牌号待核对'} · {row['color'] or '颜色未注明'} · {row['tax_type']} · {row['price'] or '单价待核对'} 元/kg")
        self.combo.setCurrentIndex(0 if len(self.candidates) == 1 else -1)
        self.details.show()
        self.set_pending(False)
        self.status.setText(f"已识别 {len(self.candidates)} 个报价候选。" + ("请选择商品和税价后填入表单。" if len(self.candidates) > 1 else "请对照原图核对识别字段。"))

    def selection_changed(self, index):
        candidate = self.candidates[index] if 0 <= index < len(self.candidates) else None
        self.warning.setText("；".join(candidate["warnings"]) if candidate else "")
        self.apply.setEnabled(candidate is not None and not self.pending)

    def apply_current(self):
        index = self.combo.currentIndex()
        if 0 <= index < len(self.candidates):
            self.candidateRequested.emit(self.candidates[index])

    def show_original(self):
        if not self.preview_data:
            return
        dialog = QDialog(self)
        dialog.setWindowTitle("核对报价原图")
        dialog.setFont(form_font())
        available = self.screen().availableGeometry()
        dialog.resize(min(960, available.width() - 60), min(720, available.height() - 80))
        layout = QVBoxLayout(dialog)
        area = QScrollArea()
        image = QLabel()
        pixmap = QPixmap()
        pixmap.loadFromData(self.preview_data)
        image.setPixmap(pixmap)
        area.setWidget(image)
        layout.addWidget(area)
        close = QPushButton("关闭")
        close.clicked.connect(dialog.accept)
        layout.addWidget(close)
        dialog.exec()
