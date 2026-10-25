"""Desktop dialog implementation module."""
from __future__ import annotations

import threading

from PySide6.QtCore import QDate, Qt, Signal
from PySide6.QtGui import QKeySequence, QShortcut
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QCompleter,
    QDateEdit,
    QGridLayout,
    QLayout,
    QLineEdit,
    QMessageBox,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from domain import TAX_TYPES, ValidationError, customer_key, identity, today, validate_record
from services.image_quote_service import recognize_image

from .combo_delegate import configure_combo_popup
from .dialog_base import BaseDialog, MoneyValidator, button, label
from .image_quote_panel import ImageQuotePanel
from .theme_tokens import form_font


class QuoteDialog(BaseDialog):
    saved = Signal(object)

    def __init__(self, service, tasks, generation, row=None, customer="", parent=None, selected_customer="",
                 customer_profiles=()):
        super().__init__("更新价格" if row else "新增报价", 680, 700, parent)
        self.setFont(form_font())
        self.body.setFont(form_font())
        self.content.setSizeConstraint(QLayout.SizeConstraint.SetMinimumSize)
        self.service, self.tasks, self.generation, self.row = service, tasks, generation, row
        self.data_generation = service.context.data_generation
        self.pending_generation_invalidation = False
        self.selected_customer = selected_customer
        self.customer_profiles = tuple(customer_profiles)
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
        customer_field = self.fields["customer"]
        customer_names = sorted({str(item.get("name") or "").strip() for item in self.customer_profiles
                                 if str(item.get("name") or "").strip()}, key=str.casefold)
        if not row and not selected_customer and customer_names:
            completer = QCompleter(customer_names, customer_field)
            completer.setCaseSensitivity(Qt.CaseSensitivity.CaseInsensitive)
            completer.setFilterMode(Qt.MatchFlag.MatchContains)
            customer_field.setCompleter(completer)
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
        self.pending_generation_invalidation = data["fill_missing_identity"]
        if self.image_active:
            data.update(self.image_origin)
        self._set_busy(True)
        self.tasks.submit(lambda: self.service.add_quote(data), self.succeeded, self.failed,
                          generation=self.generation, write=True)

    def failed(self, exc):
        self._set_busy(False)
        self.pending_generation_invalidation = False
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
        if result.get("added") or self.pending_generation_invalidation:
            self.data_generation += 1
        self.pending_generation_invalidation = False
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
