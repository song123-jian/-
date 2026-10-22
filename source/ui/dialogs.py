"""Native forms with field errors, async operations and unsaved-edit guards."""
from __future__ import annotations

import json
import threading

from PySide6.QtCore import QDate, Qt, Signal
from PySide6.QtGui import QGuiApplication, QIcon, QKeySequence, QShortcut, QValidator
from PySide6.QtWidgets import (
    QAbstractItemView,
    QCheckBox,
    QComboBox,
    QDateEdit,
    QDialog,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLayout,
    QLineEdit,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    QScrollArea,
    QTableView,
    QTableWidget,
    QTableWidgetItem,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from domain import (
    TAX_TYPES,
    ValidationError,
    business_date,
    clean,
    customer_key,
    display_price,
    identity,
    today,
    validate_record,
)
from services.image_quote_service import recognize_image

from .combo_delegate import configure_combo_popup
from .image_quote_panel import ImageQuotePanel
from .quote_table_model import ROW_ROLE, HistoryTableModel
from .theme_tokens import form_font
from .trend_widget import TrendWidget


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


class QuoteDialog(BaseDialog):
    saved = Signal(object)

    def __init__(self, service, tasks, generation, row=None, customer="", parent=None, selected_customer=""):
        super().__init__("更新价格" if row else "新增报价", 680, 700, parent)
        self.setFont(form_font())
        self.body.setFont(form_font())
        self.content.setSizeConstraint(QLayout.SizeConstraint.SetMinimumSize)
        self.service, self.tasks, self.generation, self.row = service, tasks, generation, row
        self.data_generation = service.context.data_generation
        self.selected_customer = selected_customer
        self.image_sequence = 0
        self.image_pending = False
        self.image_active = False
        self.image_cancel = None
        self.image_base = None
        self.image_origin = {}
        self.image_match = None
        self.image_invalid_date = False
        self.image_panel = None
        self.customer_revisions = dict(getattr(parent, "customer_revisions", {}))
        if row:
            self.customer_revisions[customer_key(row["customer"])] = row.get("customer_revision")
        self.heading = label("更新价格" if row else "新增报价", "title")
        self.content.insertWidget(0, self.heading)
        description = "保存后可在本窗口继续补填。空颜色或未注明税口径可补齐，会同步该规格历史；历史价格、日期和来源保留。" if row else "填写真实报价。保存后可继续补填，价格单位元/kg，支持六位有效小数。"
        self.help_label = label(description, "muted")
        self.help_label.setWordWrap(True)
        self.content.addWidget(self.help_label)
        if not row:
            self.image_panel = ImageQuotePanel(self)
            self.content.addWidget(self.image_panel)
            self.image_panel.imageRequested.connect(self.start_image)
            self.image_panel.candidateRequested.connect(self.apply_image_candidate)
            self.image_panel.cancelRequested.connect(self.cancel_image)
        self.fields, self.errors = {}, {}
        grid = QGridLayout()
        grid.setHorizontalSpacing(14)
        grid.setVerticalSpacing(14)
        definitions = [("customer", "客户 *"), ("grade", "牌号 *"), ("material", "材料"), ("color", "颜色"),
                       ("price", "价格（元/kg）*"), ("effective_date", "业务日期 *"),
                       ("tax_type", "税口径 *"), ("reason", "调价 / 补录原因" + (" *" if row else ""))]
        for index, (key, caption) in enumerate(definitions):
            container = QWidget()
            layout = QVBoxLayout(container)
            layout.setSizeConstraint(QLayout.SizeConstraint.SetMinimumSize)
            layout.setContentsMargins(0, 0, 0, 0)
            layout.setSpacing(6)
            layout.addWidget(label(caption))
            if key == "tax_type":
                field = QComboBox()
                configure_combo_popup(field)
                field.addItems(TAX_TYPES)
            elif key == "effective_date":
                field = QDateEdit(QDate.fromString(today(), "yyyy-MM-dd"))
                field.setDisplayFormat("yyyy-MM-dd")
                field.setCalendarPopup(True)
                field.setDateRange(QDate(1900, 1, 1), QDate(2200, 12, 31))
            else:
                field = QLineEdit()
                field.setMaxLength(1000 if key == "reason" else 128 if key == "price" else 250)
                if key == "price":
                    field.setValidator(MoneyValidator(field))
                    field.setPlaceholderText("例如 9.734513")
            field.setObjectName(key)
            field.setFont(form_font())
            field.setMinimumHeight(max(38, field.sizeHint().height()))
            field.setAccessibleName(caption)
            if isinstance(field, QComboBox):
                field.view().setFont(form_font())
            elif isinstance(field, QDateEdit):
                field.calendarWidget().setFont(form_font())
            layout.addWidget(field)
            error = label("", "fieldError")
            error.setWordWrap(True)
            error.hide()
            layout.addWidget(error)
            self.fields[key], self.errors[key] = field, error
            grid.addWidget(container, index // 2, index % 2)
        self.content.addLayout(grid)
        self.content.addWidget(label("备注（最多2000字）"))
        note = QTextEdit()
        note.setFont(form_font())
        note.setAcceptRichText(False)
        note.setFixedHeight(96)
        note.setObjectName("note")
        note.setAccessibleName("备注")
        self.fields["note"] = note
        self.content.addWidget(note)
        self.errors["note"] = label("", "fieldError")
        self.errors["note"].hide()
        self.content.addWidget(self.errors["note"])
        self.image_review = QCheckBox("已对照原图核对报价字段")
        self.image_review.setToolTip("请核对客户、牌号/产品名称、材料/颜色、单价、含税/未税和业务日期")
        self.image_review.setAccessibleName("确认图片报价字段")
        self.image_review.hide()
        self.content.addWidget(self.image_review)
        self.cancel = button("取消", self.reject)
        self.save = button("保存报价", self.submit, True)
        self.save.setObjectName("SaveQuote")
        self.save.setDefault(True)
        self.footer.addWidget(self.cancel)
        self.footer.addWidget(self.save)
        data = row or {"customer": selected_customer or customer, "tax_type": "未注明"}
        for key, field in self.fields.items():
            value = data.get(key, "")
            if key == "effective_date":
                field.setDate(QDate.fromString(value or today(), "yyyy-MM-dd"))
            elif isinstance(field, QComboBox):
                field.setCurrentText(value or "未注明")
            elif isinstance(field, QTextEdit):
                field.setPlainText(value)
            else:
                field.setText(str(value))
            if (row and key in ("customer", "grade")) or (row and key == "color" and value) or (selected_customer and key == "customer"):
                field.setReadOnly(True)
            if row and key == "tax_type":
                field.setEnabled(value == "未注明")
        if row:
            self.fields["reason"].clear()
        self.initial = self.values()
        self.fields["price" if row else "customer"].setFocus()
        self.submit_shortcut = QShortcut(QKeySequence("Ctrl+Return"), self)
        self.submit_shortcut.activated.connect(self.submit)
        if self.image_panel:
            for field in self.fields.values():
                field.installEventFilter(self.image_panel)
                signal = field.dateChanged if isinstance(field, QDateEdit) else field.currentTextChanged if isinstance(field, QComboBox) else field.textChanged
                signal.connect(self.image_field_changed)
            self.installEventFilter(self.image_panel)
            self.body.installEventFilter(self.image_panel)
            self.fields["effective_date"].dateChanged.connect(self.image_date_corrected)
            self.finished.connect(self.cancel_image)
            self.tasks.allFinished.connect(self.image_tasks_finished)

    def values(self):
        result = {}
        for key, field in self.fields.items():
            result[key] = field.date().toString("yyyy-MM-dd") if isinstance(field, QDateEdit) else field.currentText() if isinstance(field, QComboBox) else field.toPlainText() if isinstance(field, QTextEdit) else field.text()
        return result

    def _set_busy(self, busy):
        self.busy = busy
        self.save.setEnabled(not busy and not self.image_pending)
        self.cancel.setEnabled(not busy)
        self.save.setText("保存中…" if busy else "保存报价")
        self.body.setEnabled(not busy)
        if self.image_panel:
            self.image_panel.setEnabled(not busy)

    def image_field_changed(self, *_):
        if self.image_active:
            self.image_review.setChecked(False)

    def image_date_corrected(self, *_):
        self.image_invalid_date = False
        self.fields["effective_date"].setSpecialValueText("")

    def image_tasks_finished(self):
        if self.image_pending:
            self._image_pending(False)
            self.image_review.setChecked(False)
            self.notice.show_message("客户或数据库状态已变化，请重新打开报价窗口。", True)

    def _image_pending(self, pending, message="正在识别图片…"):
        self.image_pending = pending
        self.save.setEnabled(not self.busy and not pending)
        if self.image_panel:
            self.image_panel.set_pending(pending, message)

    def cancel_image(self, *_):
        self.image_sequence += 1
        if self.image_cancel:
            self.image_cancel.set()
        self._image_pending(False)
        if self.image_panel:
            self.image_panel.status.setText("已取消识别；表单内容保留。")

    def start_image(self, source):
        if self.busy:
            return
        self.cancel_image()
        sequence = self.image_sequence
        snapshot = self.values()
        cancellation = threading.Event()
        self.image_cancel = cancellation
        default_date = today()
        self._image_pending(True)
        self.notice.hide()

        def succeeded(result):
            if sequence != self.image_sequence:
                return
            self._image_pending(False)
            self.image_panel.show_result(result)
            if len(result["candidates"]) == 1 and snapshot == self.values():
                self.apply_image_candidate(result["candidates"][0])
            elif snapshot != self.values():
                self.image_panel.status.setText("识别完成。你已编辑表单，请选择候选后点击“填入并匹配”。")

        self.tasks.submit(lambda: recognize_image(source, selected_customer=self.selected_customer,
                                                 default_date=default_date, cancelled=cancellation),
                          succeeded, lambda exc: self.image_failed(sequence, exc), generation=self.generation)

    def image_failed(self, sequence, exc):
        if sequence != self.image_sequence:
            return
        self._image_pending(False)
        self.notice.show_message(str(exc), True)
        self.image_panel.status.setText("识别或匹配未完成，请核对图片和表单。")

    def apply_image_candidate(self, candidate):
        if self.busy or self.image_pending:
            return
        if self.values() != self.initial and QMessageBox.question(
                self, "填入图片报价", "将替换表单中的报价字段，是否继续？",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.Cancel,
                QMessageBox.StandardButton.Cancel) != QMessageBox.StandardButton.Yes:
            return
        record = candidate["record"]
        self.image_origin = {key: record.get(key, "" if key != "source_row" else 0) for key in ("source_file", "source_sheet", "source_row")}
        self.image_active = True
        self.image_base = None
        self.image_match = None
        self.image_review.show()
        self.image_review.setChecked(False)
        for key, field in self.fields.items():
            value = record.get(key, "")
            if key == "customer" and self.selected_customer:
                value = self.selected_customer
            if isinstance(field, QDateEdit):
                date = QDate.fromString(value, "yyyy-MM-dd")
                if date.isValid() and 1900 <= date.year() <= 2200:
                    field.setSpecialValueText("")
                    field.setDate(date)
                    self.image_invalid_date = False
                else:
                    field.setDate(field.minimumDate())
                    field.setSpecialValueText("请核对原图日期")
                    self.image_invalid_date = True
                    self.errors[key].setText("图片日期无效，请重新选择正确的业务日期")
                    self.errors[key].show()
            elif isinstance(field, QComboBox):
                field.setCurrentText(value if value in TAX_TYPES else "未注明")
            elif isinstance(field, QTextEdit):
                field.setPlainText(value)
            else:
                field.setText(str(value))
        self.image_panel.status.setText("已填入图片字段，请核对后保存。")
        try:
            data = validate_record(self.values())
            if self.image_invalid_date:
                raise ValidationError("图片日期无效，请重新选择业务日期")
            if candidate.get("blocking_issues"):
                self.notice.show_message("；".join(candidate["blocking_issues"]) + "；请对照原图修正后再核对匹配。", True)
                return
        except ValidationError as exc:
            self.notice.show_message(str(exc), True)
            return
        self.request_image_match(data, save_after=False)

    def request_image_match(self, data, *, save_after):
        self.image_sequence += 1
        sequence, snapshot = self.image_sequence, self.values()
        previous_match = self.image_match
        self._image_pending(True, "正在匹配已有客户和报价…")

        def succeeded(result):
            if sequence != self.image_sequence:
                return
            self._image_pending(False)
            if snapshot != self.values():
                self.image_review.setChecked(False)
                self.image_panel.status.setText("表单已修改，请重新核对并保存以匹配最新内容。")
                return
            if save_after and previous_match and identity(previous_match["record"]) == identity(result["record"]):
                previous_id = previous_match["base"]["id"] if previous_match["base"] else None
                current_id = result["base"]["id"] if result["base"] else None
                if previous_id != current_id or previous_match["customer_revision"] != result["customer_revision"]:
                    self.image_review.setChecked(False)
                    self.notice.show_message("客户或报价在核对期间已变化，请重新填入图片并核对。", True)
                    return
            self.image_match = result
            self.image_base = result["base"]
            self.customer_revisions[customer_key(result["record"]["customer"])] = result["customer_revision"]
            merged = result["record"]
            # Matching may supply a unique omitted color/tax/material, never a price.
            for key in ("customer", "grade", "material", "color", "tax_type", "note"):
                field = self.fields[key]
                if isinstance(field, QComboBox):
                    if field.currentText() != merged[key]:
                        field.setCurrentText(merged[key])
                elif isinstance(field, QTextEdit):
                    if field.toPlainText() != merged[key]:
                        field.setPlainText(merged[key])
                else:
                    if field.text() != merged[key]:
                        field.setText(merged[key])
            self.setWindowTitle("更新价格（图片匹配）" if self.image_base else "新增报价")
            self.heading.setText("更新价格（图片匹配）" if self.image_base else "新增报价")
            self.image_panel.status.setText("已匹配已有报价，保存将追加历史；请填写调价/补录原因。" if self.image_base else "未匹配已有规格，保存将新增报价。")
            if save_after and snapshot == self.values() and self.image_review.isChecked():
                self.write_quote(validate_record(self.values()), base=self.image_base)
            elif save_after:
                self.notice.show_message("匹配补齐了已有报价字段，请重新对照原图核对后保存。")

        self.tasks.submit(lambda: self.service.match_image_quote(data, self.generation,
                          selected_customer=self.selected_customer, data_generation=self.data_generation),
                          succeeded, lambda exc: self.image_failed(sequence, exc), generation=self.generation)

    def submit(self):
        if self.busy or self.image_pending:
            return
        self.notice.hide()
        for key, field in self.fields.items():
            self.errors[key].hide()
            field.setProperty("error", False)
            field.style().unpolish(field)
            field.style().polish(field)
        data = self.values()
        try:
            data = validate_record(data)
            identity_fill = bool(self.row and identity(data) != identity(self.row))
            unchanged_price = bool(self.row and all(data[key] == self.row[key] for key in ("price", "effective_date")))
            if unchanged_price and not data["reason"] and (identity_fill or data["material"] != self.row["material"] or data["note"] != self.row["note"]):
                data["reason"] = "补齐缺失字段" if identity_fill else "完善报价资料"
            if self.row and not data["reason"]:
                raise ValidationError("请填写调价或补录原因", {"reason": "请填写调价或补录原因"})
            if self.image_active:
                if self.image_invalid_date:
                    raise ValidationError("请修正图片中的业务日期", {"effective_date": "请重新选择正确业务日期"})
                if not self.image_review.isChecked():
                    raise ValidationError("请对照原图核对字段，并勾选核对确认")
        except ValidationError as exc:
            self.failed(exc)
            return
        if self.image_active:
            self.request_image_match(data, save_after=True)
        else:
            self.write_quote(data, base=self.row)

    def write_quote(self, data, *, base):
        if base and not data["reason"]:
            self.failed(ValidationError("请填写调价或补录原因", {"reason": "请填写调价或补录原因"}))
            return
        data.update(base_id=base["id"] if base else None, storage_generation=self.generation,
                    data_generation=self.data_generation, customer_revision=self.customer_revisions.get(customer_key(data["customer"]), 0),
                    import_immediate=self.image_active,
                    fill_missing_identity=bool(base and identity(base) != identity(data)))
        if self.image_active:
            data.update(self.image_origin)
        self._set_busy(True)
        self.tasks.submit(lambda: self.service.add_quote(data), self.succeeded, self.failed,
                          generation=self.generation, write=True)

    def failed(self, exc):
        self._set_busy(False)
        self.notice.show_message(str(exc), True)
        if isinstance(exc, ValidationError):
            for key, message in exc.fields.items():
                if key in self.fields:
                    self.errors[key].setText(message)
                    self.errors[key].show()
                    field = self.fields[key]
                    field.setProperty("error", True)
                    field.style().unpolish(field)
                    field.style().polish(field)
            first = next((self.fields[key] for key in exc.fields if key in self.fields), None)
            if first:
                first.setFocus()
                self.scroll.ensureWidgetVisible(first)

    def succeeded(self, result):
        self._set_busy(False)
        record = result.get("record")
        if not record:
            self.initial = self.values()
            self.saved.emit(result)
            self.notice.show_message("报价已保存，未取得最新基准。请关闭窗口并刷新后继续补填。")
            self.save.setEnabled(False)
            self.cancel.setText("关闭")
            return
        self.row = dict(record)
        self.image_active = False
        self.image_base = self.image_match = None
        self.image_review.hide()
        if self.image_panel:
            self.cancel_image()
            self.image_panel.hide()
        self.setWindowTitle("完善 / 更新报价")
        self.heading.setText("完善 / 更新报价")
        self.help_label.setText("可继续补填材料、空颜色、未注明税口径和备注。补齐规格信息会同步该规格历史；价格、日期和来源保留。")
        self.customer_revisions[customer_key(record["customer"])] = record["customer_revision"]
        for key, field in self.fields.items():
            value = "" if key == "reason" else record.get(key, "")
            if isinstance(field, QDateEdit):
                field.setDate(QDate.fromString(value, "yyyy-MM-dd"))
            elif isinstance(field, QComboBox):
                field.setCurrentText(value)
                field.setEnabled(value == "未注明")
            elif isinstance(field, QTextEdit):
                field.setPlainText(value)
            else:
                field.setText(str(value))
                if key in ("customer", "grade", "color"):
                    field.setReadOnly(key != "color" or bool(value))
        self.cancel.setText("关闭")
        self.initial = self.values()
        self.saved.emit(result)
        self.notice.show_message(result["message"] + "。可继续补充缺少内容。")

    def reject(self):
        if self.busy:
            return
        if self.values() != self.initial and QMessageBox.question(self, "放弃未保存内容", "内容尚未保存，确定放弃？", QMessageBox.StandardButton.Discard | QMessageBox.StandardButton.Cancel, QMessageBox.StandardButton.Cancel) != QMessageBox.StandardButton.Discard:
            return
        super().reject()


class HistoryDialog(BaseDialog):
    editRequested = Signal(int)

    def __init__(self, items, parent=None):
        super().__init__("价格历史", 1160, 720, parent)
        row = items[0]
        current = next((item for item in items if item["is_current"]), row)
        self.content.insertWidget(0, label("价格历史", "title"))
        subtitle = label(f"{row['customer']}  /  {row['grade']}  ·  {row['material']}  ·  {row['color'] or '未注明颜色'}  ·  {row['tax_type']}")
        subtitle.setWordWrap(True)
        self.content.addWidget(subtitle)
        self.content.addWidget(label(f"{'待生效报价' if current['scheduled'] else '当前价'}  {display_price(current['price'])} 元/kg   ·   {current['effective_date']}", "heading"))
        self.trend = TrendWidget(items)
        self.content.addWidget(self.trend)
        self.table = QTableView()
        self.table.setObjectName("HistoryTable")
        self.model = HistoryTableModel(items, self)
        self.table.setModel(self.model)
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setShowGrid(True)
        self.table.setGridStyle(Qt.PenStyle.SolidLine)
        self.table.setWordWrap(False)
        self.table.verticalHeader().hide()
        self.table.verticalHeader().setDefaultSectionSize(62)
        for column, width in enumerate((150, 180, 180, 230, 290)):
            self.table.setColumnWidth(column, width)
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.setMinimumHeight(210)
        self.content.addWidget(self.table, 1)
        self.content.addWidget(label(f"共 {len(items)} 条历史记录 · 来源及完整内容见记录详情", "muted"))
        self.table.doubleClicked.connect(self.details)
        self.copy_shortcut = QShortcut(QKeySequence.StandardKey.Copy, self.table)
        self.copy_shortcut.activated.connect(self.copy_row)
        self.footer.addWidget(button("复制记录", self.copy_row))
        self.footer.addWidget(button("更新价格", lambda: self.editRequested.emit(current["id"]), True))
        self.footer.addWidget(button("关闭", self.accept))

    def selected(self):
        index = self.table.currentIndex()
        return index.data(ROW_ROLE) if index.isValid() else None

    def copy_row(self):
        row = self.selected()
        if row:
            QGuiApplication.clipboard().setText(json.dumps(row, ensure_ascii=False, indent=2))

    def details(self):
        row = self.selected()
        if row:
            dialog = BaseDialog("历史记录详情", 680, 580, self)
            text = QPlainTextEdit()
            text.setReadOnly(True)
            text.setPlainText(json.dumps(row, ensure_ascii=False, indent=2))
            dialog.content.addWidget(text, 1)
            dialog.footer.addWidget(button("关闭", dialog.accept))
            dialog.exec()


class PdfImportOptionsDialog(BaseDialog):
    previewRequested = Signal(object)

    def __init__(self, filename, inspection, customers, parent=None, import_options=None):
        self.import_options = dict(import_options or {})
        self.mode = self.import_options.get("customer_mode", "legacy")
        title = "PDF 报价字段确认" if "pages" in inspection else "导入字段确认"
        super().__init__(title, 680, 600, parent)
        self.inspection = inspection
        defaults = inspection["defaults"]
        self.content.insertWidget(0, label(title, "title"))
        description = (f"{filename} · {inspection['pages']}页 / {inspection['tables']}个报价表" if "pages" in inspection else filename)
        text = label(description + "\n识别客户、牌号、材料、颜色、价格、税口径和备注。文件日期优先，无日期按当天；确认导入后立即生效。", "muted")
        text.setWordWrap(True)
        self.content.addWidget(text)
        self.content.addWidget(label("导入客户" if self.mode != "legacy" else "客户（表格无客户列时填写，可选择已有客户）"))
        self.customer = QComboBox()
        configure_combo_popup(self.customer)
        self.customer.setEditable(self.mode == "legacy")
        self.customer.setAccessibleName("PDF 共同客户")
        self.customer.addItem("")
        self.customer.addItems(customers)
        detected = defaults.get("customer", "")
        matches = [name for name in customers if name and name in detected]
        self.customer.setCurrentText(matches[0] if len(matches) == 1 else detected)
        if self.mode != "legacy":
            self.customer.clear()
            self.customer.addItem(self.import_options.get("selected_customer", "") if self.mode == "selected" else "全部客户（按文件客户列创建）")
            self.customer.setEnabled(False)
        self.content.addWidget(self.customer)
        if self.mode != "legacy":
            help_text = label("固定归属所选客户；文件抬头和客户列均忽略。" if self.mode == "selected" else
                              "文件每行须有客户名称；缺少客户时禁止导入。抬头不参与识别。", "muted")
            help_text.setWordWrap(True)
            self.content.addWidget(help_text)
        self.content.addWidget(label("补齐报价日期（YYYY-MM-DD，可留空）"))
        self.date = QLineEdit(defaults.get("effective_date", ""))
        self.date.setPlaceholderText("留空时，缺失日期使用导入当天（北京时间）")
        self.date.setAccessibleName("PDF 共同报价日期")
        self.content.addWidget(self.date)
        date_help = label("文件有日期就使用文件日期；缺失时使用补齐日期，未填写则使用生成预览当天的北京时间。", "muted")
        date_help.setWordWrap(True)
        self.content.addWidget(date_help)
        self.content.addWidget(label("税口径（只填补缺失税口径）"))
        self.tax = QComboBox()
        configure_combo_popup(self.tax)
        self.tax.setAccessibleName("PDF 共同税口径")
        self.tax.addItem("按表格或备注识别" if self.mode == "legacy" else "按价格列识别；未标明则为未注明", "")
        for tax in TAX_TYPES:
            self.tax.addItem(tax, tax)
        self.tax.setCurrentIndex(max(0, self.tax.findData(defaults.get("tax_type", ""))))
        self.content.addWidget(self.tax)
        self.split_color = QCheckBox("识别材料末尾颜色（如 PA6+GF15 黑色）")
        self.split_color.setChecked(inspection["split_material_color"] if self.mode == "legacy" else True)
        self.content.addWidget(self.split_color)
        if inspection["warnings"]:
            warnings = label("\n".join(inspection["warnings"]), "muted")
            warnings.setWordWrap(True)
            self.content.addWidget(warnings)
        self.cancel = button("取消", self.reject)
        self.preview = button("生成导入预览", self.submit, True)
        self.footer.addWidget(self.cancel)
        self.footer.addWidget(self.preview)

    def submit(self):
        try:
            customer = clean(self.customer.currentText(), 250)
            date = business_date(self.date.text()) if self.date.text().strip() else ""
        except ValueError as exc:
            self.notice.show_message(str(exc), True)
            return
        options = {**self.import_options, "effective_date": date, "tax_type": self.tax.currentData(),
                   "split_material_color": self.split_color.isChecked()}
        if self.mode == "legacy":
            options["customer"] = customer
        if self.inspection.get("file_sha256"):
            options["file_sha256"] = self.inspection["file_sha256"]
        self.previewRequested.emit(options)
        self.accept()


class ImportPreviewDialog(BaseDialog):
    imported = Signal(object)
    reselectRequested = Signal()

    def __init__(self, preview, service, tasks, parent=None):
        super().__init__("导入预览", 920, 700, parent)
        self.preview, self.service, self.tasks = preview, service, tasks
        self.page_pending = False
        self.page = 1
        self.pages = 1
        self.content.insertWidget(0, label("导入预览", "title"))
        self.content.addWidget(label(f"{preview['filename']} · {preview['sheet']}\n业务记录 {preview['total']} · 忽略汇总 {preview['omitted']}"))
        self.content.addWidget(label(f"新增 {preview['added']}    重复 {preview['skipped']}    错误 {preview['error_count']}", "heading"))
        if preview.get("customer_mode"):
            scope = preview.get("selected_customer") or "全部客户"
            self.scope_label = label(f"导入范围：{scope}\n新增牌号 {preview['created']} · 更新/合并 {preview['updated']} · 新客户 {preview['new_customers']}", "muted")
            self.scope_label.setWordWrap(True)
            self.content.addWidget(self.scope_label)
        if preview.get("warnings"):
            warning = label("\n".join(preview["warnings"]), "muted")
            warning.setWordWrap(True)
            self.content.addWidget(warning)
        if preview["error_count"]:
            errors = QPlainTextEdit()
            errors.setReadOnly(True)
            errors.setPlainText("\n".join(f"{item.get('sheet', '')} 第{item['row']}行：{item['message']}".lstrip() for item in preview["errors"]))
            errors.setMinimumHeight(120)
            self.content.addWidget(errors)
            self.notice.show_message(f"共 {preview['error_count']} 条错误，列出前50条；整批禁止提交，请修正后重新预览。", True)
        columns = [("customer", "客户"), ("grade", "牌号"), ("material", "材料"), ("color", "颜色"),
                   ("price", "价格"), ("tax_type", "税口径"), ("effective_date", "日期"),
                    ("source_sheet", "工作表 / PDF页"), ("source_row", "来源行"), ("note", "备注")]
        if preview.get("customer_mode"):
            columns[2] = ("material", "产品名称")
            columns += [("material_spec", "材料规格"), ("import_action", "匹配结果")]
        self.columns = columns
        self.table = QTableWidget(0, len(columns))
        self.table.setHorizontalHeaderLabels([caption for _, caption in columns])
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setShowGrid(True)
        self.table.setGridStyle(Qt.PenStyle.SolidLine)
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.verticalHeader().hide()
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.setMinimumHeight(220)
        self.content.addWidget(self.table, 1)
        pager = QHBoxLayout()
        self.page_status = label("")
        self.previous_page = button("上一页", lambda: self.load_page(self.page - 1))
        self.next_page = button("下一页", lambda: self.load_page(self.page + 1))
        pager.addWidget(self.page_status, 1)
        pager.addWidget(self.previous_page)
        pager.addWidget(self.next_page)
        self.content.addLayout(pager)
        self.content.addWidget(label("预览有效期10分钟，只能确认一次。重复行会在提交时再次核对。", "muted"))
        self.reselect = button("重新选择文件", self.choose_again)
        self.cancel = button("取消", self.reject)
        self.commit = button("确认导入", self.submit, True)
        self.commit.setObjectName("CommitImport")
        self.commit.setEnabled(not preview["error_count"])
        self.footer.addWidget(self.reselect)
        self.footer.addWidget(self.cancel)
        self.footer.addWidget(self.commit)
        self.page_loaded(preview.get("page_data") or {
            "items": preview["samples"], "page": 1, "pages": 1, "total": len(preview["samples"]), "page_size": 50})

    def page_loaded(self, result):
        self.page_pending = False
        self.page, self.pages = result["page"], result["pages"]
        items = result["items"]
        self.table.setRowCount(len(items))
        for line, row in enumerate(items):
            for column, (key, _) in enumerate(self.columns):
                text = str(row.get(key, ""))
                item = QTableWidgetItem(text)
                item.setToolTip(text)
                self.table.setItem(line, column, item)
        self.table.resizeColumnsToContents()
        for column in range(len(self.columns)):
            self.table.setColumnWidth(column, min(260, self.table.columnWidth(column)))
        start = (self.page - 1) * result["page_size"] + 1 if items else 0
        end = start + len(items) - 1 if items else 0
        self.page_status.setText(f"第 {self.page}/{self.pages} 页 · 显示 {start}–{end} / {result['total']} 条报价（含重复行）")
        self.previous_page.setEnabled(self.page > 1)
        self.next_page.setEnabled(self.page < self.pages)
        self.commit.setEnabled(not self.preview["error_count"])

    def load_page(self, page):
        if self.busy or self.page_pending or not 1 <= page <= self.pages:
            return
        self.page_pending = True
        self.previous_page.setEnabled(False)
        self.next_page.setEnabled(False)
        self.commit.setEnabled(False)
        generation = self.preview["storage_generation"]
        self.tasks.submit(lambda: self.service.get_import_page(self.preview["preview_id"], generation, page),
                          self.page_loaded, self.page_failed, generation=generation)

    def page_failed(self, exc):
        self.page_pending = False
        self.notice.show_message(str(exc), True)
        self.previous_page.setEnabled(False)
        self.next_page.setEnabled(False)
        self.commit.setEnabled(False)

    def choose_again(self):
        self.reject()
        self.reselectRequested.emit()

    def submit(self):
        if self.busy or self.page_pending or self.preview["error_count"]:
            return
        self.busy = True
        for widget in (self.commit, self.cancel, self.reselect, self.previous_page, self.next_page):
            widget.setEnabled(False)
        self.commit.setText("导入中…")
        generation = self.preview["storage_generation"]
        self.tasks.submit(lambda: self.service.commit_import(self.preview["preview_id"], generation),
                          self.succeeded, self.failed, generation=generation, write=True)

    def succeeded(self, result):
        self.busy = False
        self.imported.emit(result)
        self.accept()

    def failed(self, exc):
        self.busy = False
        self.commit.setText("请重新预览")
        self.cancel.setEnabled(True)
        self.reselect.setEnabled(True)
        self.notice.show_message(str(exc), True)


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
