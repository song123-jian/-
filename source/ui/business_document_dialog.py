"""Quotation/contract forms and an embedded preview of the actual PDF bytes."""
from __future__ import annotations

import copy
import re
from decimal import Decimal
from pathlib import Path

import pypdfium2 as pdfium
from PySide6.QtCore import QDate, QEvent, QStandardPaths, Qt, QTimer
from PySide6.QtGui import QImage, QPixmap
from PySide6.QtWidgets import (
    QAbstractItemView,
    QComboBox,
    QDateEdit,
    QFileDialog,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLineEdit,
    QMessageBox,
    QPlainTextEdit,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from domain import ValidationError, today
from services.business_document_service import (
    DEFAULT_TERMS,
    KINDS,
    MAX_ITEMS,
    PARTY_FIELDS,
    PAYMENTS,
    SUPPLIER_FIELDS,
    BusinessDocumentService,
    blank_item,
    item_amount,
    new_document,
    rmb_upper,
)

from .dialogs import BaseDialog, button, label

PARTY_LABELS = ("单位名称", "单位地址", "法定代表人", "委托代理人", "电话", "传真", "开户银行", "账号")
TERM_LABELS = {"quote_note": "报价说明", "quality": "二、质量要求技术标准",
               "delivery": "三、交货地点与方式", "transport": "四、运输与费用负担",
               "packaging": "五、包装方式", "acceptance": "六、验收及异议期限",
               "breach": "八、违约责任", "dispute": "九、争议解决", "effective": "十、生效条件"}


class DocumentPreviewDialog(BaseDialog):
    def __init__(self, payload, parent=None):
        super().__init__("PDF预览", 850, 860, parent)
        self.setObjectName("BusinessDocumentPreview")
        self.pdf = pdfium.PdfDocument(payload)
        self.page_index = 0
        self._wheel_delta = 0
        self.image_label = label("")
        self.image_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.image_label.installEventFilter(self)
        self.content.addWidget(self.image_label)
        self.previous = button("上一页", lambda: self.change_page(-1))
        self.next = button("下一页", lambda: self.change_page(1))
        self.page_label = label("")
        self.page_label.setMinimumWidth(80)
        self.page_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        for control in (self.previous, self.page_label, self.next, button("关闭预览", self.accept)):
            self.footer.addWidget(control)
        QTimer.singleShot(0, self.draw_page)

    def change_page(self, delta):
        page_index = max(0, min(len(self.pdf)-1, self.page_index+delta))
        if page_index == self.page_index:
            return
        self.page_index = page_index
        self.draw_page()

    def eventFilter(self, watched, event):
        if watched is self.image_label and event.type() == QEvent.Type.Wheel:
            delta = event.angleDelta().y()
            threshold = 120
            if not delta:
                delta = event.pixelDelta().y()
                threshold = 80
            if delta:
                if self._wheel_delta and delta * self._wheel_delta < 0:
                    self._wheel_delta = 0
                self._wheel_delta += delta
                while self._wheel_delta >= threshold:
                    self.change_page(-1)
                    self._wheel_delta -= threshold
                while self._wheel_delta <= -threshold:
                    self.change_page(1)
                    self._wheel_delta += threshold
                event.accept()
                return True
        return super().eventFilter(watched, event)

    def draw_page(self):
        if self.pdf is None:
            return
        page = self.pdf[self.page_index]
        bitmap = None
        try:
            scale = min(2, max(0.5, (self.width()-80)/page.get_width()))
            bitmap = page.render(scale=scale)
            image = bitmap.to_pil().convert("RGBA")
            qt_image = QImage(image.tobytes(), image.width, image.height, QImage.Format.Format_RGBA8888).copy()
            self.image_label.setPixmap(QPixmap.fromImage(qt_image))
            self.page_label.setText(f"第{self.page_index+1}/{len(self.pdf)}页")
            self.previous.setEnabled(self.page_index > 0)
            self.next.setEnabled(self.page_index+1 < len(self.pdf))
        finally:
            if bitmap:
                bitmap.close()
            page.close()

    def done(self, result):
        if self.pdf is not None:
            self.pdf.close()
            self.pdf = None
        super().done(result)


class BusinessDocumentDialog(BaseDialog):
    def __init__(self, context, tasks, kind, *, row=None, customer="", parent=None):
        super().__init__("制作"+KINDS[kind], 1040, 740, parent)
        self.setObjectName("BusinessDocumentForm")
        self.context, self.tasks, self.kind = context, tasks, kind
        self.service = BusinessDocumentService(context.folder)
        self.document = new_document(kind, row, customer)
        supplier_error = None
        try:
            self.document["fields"].update(self.service.load_supplier())
        except (OSError, ValueError) as exc:
            supplier_error = str(exc)
        self._loading = True
        self._updating = False
        self.fields, self.terms = {}, {}
        self.dirty = False
        self.last_exported = None
        self.preview_dialog = None
        self.content.addWidget(label("制作"+KINDS[kind], "title"))
        tip = ("报价单与合同统一使用指定合同中的原章。报价每页3项，合同每页1项，超出按相同版式续页。"
               "\n预览与导出采用同一PDF内容；草稿仅保存在当前账号目录。")
        help_label = label(tip, "muted")
        help_label.setWordWrap(True)
        self.content.addWidget(help_label)
        self.tabs = QTabWidget()
        self.content.addWidget(self.tabs, 1)
        self.build_basic()
        self.build_items()
        self.build_parties()
        self.build_terms()
        self.load_button = button("恢复上次草稿", self.load_draft)
        self.save_button = button("保存草稿", self.save_draft)
        self.preview_button = button("预览PDF", self.preview)
        self.export_button = button("导出PDF", self.export_pdf, True, "download")
        self.close_button = button("关闭", self.reject)
        for control in (self.load_button, self.save_button, self.preview_button, self.export_button, self.close_button):
            self.footer.addWidget(control)
        self.apply_data(self.document)
        self._loading = False
        if kind == "contract" and row and row.get("tax_type") != "含税":
            self.notice.show_message("选中报价未确认含税。合同使用含税单价，请核对并填写单价。")
        if supplier_error:
            self.notice.show_message(supplier_error, True)

    def add_tab(self, caption):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setSpacing(12)
        self.tabs.addTab(page, caption)
        return layout

    def field(self, layout, key, caption, *, choices=None, is_date=False):
        if is_date:
            control = QDateEdit()
            control.setCalendarPopup(True)
            control.setDisplayFormat("yyyy-MM-dd")
            control.setDate(QDate.fromString(today(), Qt.DateFormat.ISODate))
            control.dateChanged.connect(self.changed)
        elif choices:
            control = QComboBox()
            control.addItems(choices)
            control.currentTextChanged.connect(self.changed)
        else:
            control = QLineEdit()
            control.setMaxLength(2000)
            control.textChanged.connect(self.changed)
        control.setAccessibleName(caption)
        control.setObjectName("document_"+key)
        layout.addRow(caption, control)
        self.fields[key] = control

    def build_basic(self):
        layout = self.add_tab("基本信息")
        form = QFormLayout()
        form.setSpacing(10)
        layout.addLayout(form)
        self.field(form, "buyer_name", "收件单位 / 需方名称 *")
        if self.kind == "quotation":
            for key, caption in (("recipient", "收件人"), ("buyer_fax", "传真号"), ("sender", "发件人"),
                                 ("subject", "主题"), ("cc", "抄送")):
                self.field(form, key, caption)
            self.field(form, "tax_type", "税口径 *", choices=["未税", "含税", "未注明"])
            self.field(form, "date", "报价日期", is_date=True)
            self.field(form, "valid_from", "有效期开始", is_date=True)
            self.field(form, "valid_to", "有效期结束", is_date=True)
        else:
            self.field(form, "contract_no", "合同编号 *")
            self.field(form, "place", "合同履行地点")
            self.field(form, "date", "签订日期", is_date=True)
            self.payment = QComboBox()
            self.payment.addItems(PAYMENTS)
            self.payment.setAccessibleName("结算方式")
            self.payment.currentTextChanged.connect(self.changed)
            form.addRow("七、结算方式", self.payment)
        layout.addStretch()

    def build_items(self):
        layout = self.add_tab("产品明细")
        self.columns = (("name", "材料名称 *"), ("model", "材料规格 *"), ("price", "价格(元/kg) *"), ("note", "备注"))
        if self.kind == "contract":
            self.columns = (("name", "产品名称 *"), ("model", "规格型号 *"), ("manufacturer", "生产厂家"),
                            ("quantity", "数量(KG) *"), ("price", "含税单价 *"), ("amount", "金额(元)"),
                            ("delivery", "交货时间及数量"))
        self.table = QTableWidget(0, len(self.columns))
        self.table.setObjectName("BusinessDocumentItems")
        self.table.setHorizontalHeaderLabels([caption for _, caption in self.columns])
        self.table.setShowGrid(True)
        self.table.setGridStyle(Qt.PenStyle.SolidLine)
        self.table.setMinimumHeight(220)
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.table.verticalHeader().setDefaultSectionSize(44)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.table.horizontalHeader().setMinimumSectionSize(95)
        self.table.itemChanged.connect(self.item_changed)
        layout.addWidget(self.table, 1)
        row = QHBoxLayout()
        self.add_item_button = button("新增一项", self.add_item)
        self.remove_item_button = button("删除所选", self.remove_item)
        row.addWidget(self.add_item_button)
        row.addWidget(self.remove_item_button)
        row.addStretch()
        layout.addLayout(row)
        self.total_label = label("", "muted")
        self.total_label.setWordWrap(True)
        layout.addWidget(self.total_label)

    def build_parties(self):
        layout = self.add_tab("供需方信息" if self.kind == "contract" else "供方与联系信息")
        controls = QHBoxLayout()
        hint = label("保存后，新建报价单和购销合同自动填写供方信息。", "muted")
        hint.setWordWrap(True)
        controls.addWidget(hint, 1)
        self.supplier_button = button("保存供方信息", self.save_supplier)
        controls.addWidget(self.supplier_button)
        layout.addLayout(controls)
        parties = QHBoxLayout()
        layout.addLayout(parties)
        if self.kind == "quotation":
            group = QGroupBox("供方信息")
            form = QFormLayout(group)
            for key, caption in (("seller_name", "供方名称 *"), ("seller_address", "地址"),
                                 ("seller_agent", "联系人"), ("seller_phone", "联系电话"), ("email", "邮箱")):
                self.field(form, key, caption)
            parties.addWidget(group)
        else:
            for party, title in (("seller", "供方"), ("buyer", "需方")):
                group = QGroupBox(title)
                form = QFormLayout(group)
                for key, caption in zip(PARTY_FIELDS, PARTY_LABELS):
                    if party == "buyer" and key == "name":
                        continue
                    self.field(form, party+"_"+key, title+caption)
                parties.addWidget(group)
        layout.addStretch()

    def build_terms(self):
        layout = self.add_tab("报价说明" if self.kind == "quotation" else "合同条款")
        for key in (("quote_note",) if self.kind == "quotation" else tuple(k for k in DEFAULT_TERMS if k != "quote_note")):
            layout.addWidget(label(TERM_LABELS[key]))
            edit = QPlainTextEdit()
            edit.setAccessibleName(TERM_LABELS[key])
            edit.setMinimumHeight(54)
            edit.setMaximumHeight(90 if key == "acceptance" else 70)
            edit.textChanged.connect(self.changed)
            self.terms[key] = edit
            layout.addWidget(edit)

    def changed(self, *_):
        if not self._loading:
            self.dirty = True

    def item_changed(self, *_):
        if not self._updating and not self._loading:
            self.changed()
            self.recalculate()

    def add_item(self, item=None):
        if self.table.rowCount() >= MAX_ITEMS:
            self.notice.show_message(f"最多可填写{MAX_ITEMS}项产品", True)
            return
        self._updating = True
        row = self.table.rowCount()
        self.table.insertRow(row)
        item = item if isinstance(item, dict) else blank_item()
        for column, (key, _) in enumerate(self.columns):
            cell = QTableWidgetItem(item.get(key, ""))
            if self.kind == "quotation":
                cell.setTextAlignment(Qt.AlignmentFlag.AlignCenter)
            if key == "amount":
                cell.setFlags(cell.flags() & ~Qt.ItemFlag.ItemIsEditable)
            self.table.setItem(row, column, cell)
        self.table.setCurrentCell(row, 0)
        self._updating = False
        self.changed()
        self.recalculate()

    def remove_item(self):
        row = self.table.currentRow()
        if row >= 0:
            self.table.removeRow(row)
            if not self.table.rowCount():
                self.add_item()
            self.changed()
            self.recalculate()

    def items(self):
        result = []
        for row in range(self.table.rowCount()):
            item = blank_item()
            for column, (key, _) in enumerate(self.columns):
                if key != "amount":
                    cell = self.table.item(row, column)
                    item[key] = cell.text() if cell else ""
            result.append(item)
        return result

    def recalculate(self):
        if self.kind != "contract":
            self.total_label.setText(f"当前{self.table.rowCount()}项；每页保留模板3行，超出自动续页。")
            return
        self._updating = True
        total, valid = Decimal(0), True
        amount_column = next(i for i, (key, _) in enumerate(self.columns) if key == "amount")
        try:
            for row, item in enumerate(self.items()):
                try:
                    amount = item_amount(item)
                    text = format(amount, ".2f")
                    total += amount
                except ValueError:
                    valid, text = False, "—"
                self.table.item(row, amount_column).setText(text)
            self.total_label.setText(f"全合同合计：{total:.2f}元  ·  {rmb_upper(total)}" if valid else
                                     "填写数量和含税单价后自动计算金额；金额保留两位小数，每页保留模板1项。")
        except ValueError:
            self.total_label.setText("金额超出支持范围，请核对数量与单价。")
        finally:
            self._updating = False

    def values(self):
        result = copy.deepcopy(self.document)
        for key, control in self.fields.items():
            if isinstance(control, QDateEdit):
                value = control.date().toString(Qt.DateFormat.ISODate)
            elif isinstance(control, QComboBox):
                value = control.currentText()
            else:
                value = control.text()
            result["fields"][key] = value
        for key, control in self.terms.items():
            result["terms"][key] = control.toPlainText()
        result["items"] = self.items()
        if self.kind == "contract":
            result["payment"] = self.payment.currentText()
        return result

    def apply_data(self, data):
        parsed_dates = {}
        for key, control in self.fields.items():
            if isinstance(control, QDateEdit):
                parsed = QDate.fromString(data["fields"].get(key, ""), Qt.DateFormat.ISODate)
                if not parsed.isValid():
                    raise ValidationError("草稿日期无效，请重新填写")
                parsed_dates[key] = parsed
        self._loading = True
        try:
            self.document = copy.deepcopy(data)
            for key, control in self.fields.items():
                value = data["fields"].get(key, "")
                if isinstance(control, QDateEdit):
                    control.setDate(parsed_dates[key])
                elif isinstance(control, QComboBox):
                    control.setCurrentText(value)
                else:
                    control.setText(value)
            for key, control in self.terms.items():
                control.setPlainText(data["terms"].get(key, DEFAULT_TERMS[key]))
            if self.kind == "contract":
                self.payment.setCurrentText(data["payment"])
            self.table.setRowCount(0)
            for item in data["items"]:
                self.add_item(item)
            self.recalculate()
            self.dirty = False
        finally:
            self._loading = False

    def save_draft(self):
        try:
            self.service.save_draft(self.values())
            self.dirty = False
            self.notice.show_message("草稿已保存在当前账号，下次点击“恢复上次草稿”继续填写。")
            return True
        except (OSError, ValueError) as exc:
            self.notice.show_message(str(exc), True)
            return False

    def save_supplier(self):
        try:
            self.service.save_supplier({key: control.text() for key, control in self.fields.items()
                                        if key in SUPPLIER_FIELDS})
            self.notice.show_message("供方信息已保存，下次制作报价单和购销合同时自动填入。")
            return True
        except (OSError, ValueError) as exc:
            self.notice.show_message(str(exc), True)
            return False

    def confirm(self, title, text, captions, default):
        message = QMessageBox(self)
        message.setObjectName("BusinessDocumentConfirmation")
        message.setWindowTitle(title)
        message.setIcon(QMessageBox.Icon.Question)
        message.setText(text)
        buttons = QMessageBox.StandardButton.NoButton
        for choice in captions:
            buttons |= choice
        message.setStandardButtons(buttons)
        for choice, caption in captions.items():
            message.button(choice).setText(caption)
        message.setDefaultButton(default)
        message.setEscapeButton(default)
        return message.exec()

    def load_draft(self):
        if self.dirty and self.confirm(
            "恢复草稿", "恢复上次草稿会替换当前填写内容，继续恢复？",
            {QMessageBox.StandardButton.Yes: "恢复草稿", QMessageBox.StandardButton.No: "取消"},
            QMessageBox.StandardButton.No,
        ) != QMessageBox.StandardButton.Yes:
            return
        try:
            data = self.service.load_draft(self.kind)
            if data is None:
                self.notice.show_message("当前账号还没有保存这种单据的草稿。")
            else:
                self.apply_data(data)
                self.notice.show_message("已恢复当前账号的上次草稿。")
        except (OSError, ValueError) as exc:
            self.notice.show_message(str(exc), True)

    def set_busy(self, busy):
        self.busy = busy
        self.tabs.setEnabled(not busy)
        for control in (self.load_button, self.save_button, self.preview_button, self.export_button, self.supplier_button):
            control.setEnabled(not busy)

    def failed(self, error):
        self.set_busy(False)
        self.notice.show_message(str(error), True)

    def preview(self):
        self.set_busy(True)
        data = self.values()
        self.tasks.submit(lambda: self.service.render(data), self.preview_ready, self.failed,
                          generation=self.context.storage_generation, write=True)

    def preview_ready(self, payload):
        self.set_busy(False)
        self.preview_dialog = DocumentPreviewDialog(payload, self)
        self.preview_dialog.open()

    def export_pdf(self):
        data = self.values()
        buyer = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", data["fields"]["buyer_name"])[:40].strip(". ")
        folder = QStandardPaths.writableLocation(QStandardPaths.StandardLocation.DesktopLocation) or str(Path.home())
        path, _ = QFileDialog.getSaveFileName(self, "导出"+KINDS[self.kind],
                                             str(Path(folder)/(KINDS[self.kind]+"-"+buyer+"-"+today()+".pdf")),
                                             "PDF 文件 (*.pdf)")
        if not path:
            return
        self.set_busy(True)
        self.tasks.submit(lambda: self.service.export(data, path), lambda result: self.export_ready(result, data),
                          self.failed, generation=self.context.storage_generation, write=True)

    def export_ready(self, result, data):
        self.set_busy(False)
        self.last_exported = result["path"]
        try:
            self.service.save_draft(data)
            self.dirty = False
            self.notice.show_message("PDF已导出，草稿已保存："+result["path"])
        except (OSError, ValueError) as exc:
            self.notice.show_message(f"PDF已导出：{result['path']}；草稿保存失败：{exc}", True)

    def reject(self):
        if self.busy:
            self.notice.show_message("正在生成PDF，请稍候。")
            return
        if self.dirty:
            choice = self.confirm(
                "关闭单据", "填写内容尚未保存，要保存草稿后关闭吗？",
                {QMessageBox.StandardButton.Save: "保存草稿", QMessageBox.StandardButton.Discard: "放弃保存",
                 QMessageBox.StandardButton.Cancel: "取消"},
                QMessageBox.StandardButton.Cancel,
            )
            if choice not in (QMessageBox.StandardButton.Save, QMessageBox.StandardButton.Discard):
                return
            if choice == QMessageBox.StandardButton.Save and not self.save_draft():
                return
        super().reject()
