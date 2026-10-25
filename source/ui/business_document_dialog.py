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
    QCompleter,
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
    SYNC_STATUSES,
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
        self.scroll.viewport().installEventFilter(self)
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
        if watched in (self.image_label, self.scroll.viewport()) and event.type() == QEvent.Type.Wheel:
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
    def __init__(self, context, tasks, kind, *, row=None, customer="", parent=None, customer_profiles=()):
        super().__init__("制作"+KINDS[kind], 1040, 740, parent)
        self.setObjectName("BusinessDocumentForm")
        self.context, self.tasks, self.kind = context, tasks, kind
        self.customer_profiles = tuple(customer_profiles)
        self.cloud_store = (context.store if getattr(context, "account", None)
                            and hasattr(context.store, "business_document_list") else None)
        self.service = BusinessDocumentService(context.folder, cloud_store=self.cloud_store)
        self._seed_row = copy.deepcopy(row) if row else None
        self._seed_customer = customer
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
        self.current_record_id = None
        self.records_by_id = {}
        self.last_exported = None
        self.preview_dialog = None
        self._sync_busy = False
        self.sync_timer = QTimer(self)
        self.sync_timer.setInterval(15_000)
        self.sync_timer.timeout.connect(self.sync_cloud)
        self.content.addWidget(label("制作"+KINDS[kind], "title"))
        tip = ("报价单与合同使用提供的原件版式与原章。报价每页1项，合同每页2项，超出按相同版式续页。"
               "\n预览与导出采用同一PDF内容；制作记录和草稿均保存在当前账号目录。")
        help_label = label(tip, "muted")
        help_label.setWordWrap(True)
        self.content.addWidget(help_label)
        self.tabs = QTabWidget()
        self.content.addWidget(self.tabs, 1)
        self.build_records()
        self.build_basic()
        self.build_items()
        self.build_parties()
        self.build_terms()
        self.load_button = button("恢复上次草稿", self.load_draft)
        self.save_button = button("保存草稿", self.save_draft)
        self.preview_button = button("预览PDF", self.preview)
        self.export_button = button("导出PDF", self.export_pdf, True, "download")
        self.export_word_button = button("导出Word", self.export_word, False, "download")
        self.close_button = button("关闭", self.reject)
        for control in (self.load_button, self.save_button, self.preview_button, self.export_button,
                        self.export_word_button, self.close_button):
            self.footer.addWidget(control)
        self.apply_data(self.document)
        self._loading = False
        if kind == "contract" and row and row.get("tax_type") != "含税":
            self.notice.show_message("选中报价未确认含税。合同使用含税单价，请核对并填写单价。")
        if supplier_error:
            self.notice.show_message(supplier_error, True)
        if self.cloud_store is not None:
            self.sync_timer.start()
            QTimer.singleShot(0, self.sync_cloud)

    def add_tab(self, caption):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setSpacing(12)
        self.tabs.addTab(page, caption)
        return layout

    def build_records(self):
        layout = self.add_tab("制作记录")
        hint = label("双击已有记录载入并编辑；双击列表空白处新建记录。记录按当前账号独立保存。", "muted")
        hint.setWordWrap(True)
        layout.addWidget(hint)
        self.records_table = QTableWidget(0, 5)
        self.records_table.setObjectName("BusinessDocumentRecords")
        self.records_table.setHorizontalHeaderLabels(["记录名称", "客户 / 需方", "单据日期", "最近修改", "状态"])
        self.records_table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.records_table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.records_table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.records_table.setAlternatingRowColors(True)
        self.records_table.setMinimumHeight(220)
        self.records_table.verticalHeader().setVisible(False)
        self.records_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.records_table.itemDoubleClicked.connect(self.record_item_double_clicked)
        self.records_table.viewport().installEventFilter(self)
        layout.addWidget(self.records_table, 1)
        controls = QHBoxLayout()
        self.new_record_button = button("新建记录", self.new_record, True)
        self.save_record_button = button("保存当前记录", self.save_record)
        self.delete_record_button = button("删除记录", self.delete_record)
        controls.addWidget(self.new_record_button)
        controls.addWidget(self.save_record_button)
        controls.addWidget(self.delete_record_button)
        controls.addStretch()
        layout.addLayout(controls)
        self.record_status = label("暂无制作记录", "muted")
        self.record_status.setWordWrap(True)
        layout.addWidget(self.record_status)
        self.refresh_records()

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
        self.basic_tab_index = self.tabs.count()
        layout = self.add_tab("基本信息")
        form = QFormLayout()
        form.setSpacing(10)
        layout.addLayout(form)
        self.field(form, "buyer_name", "收件单位 / 需方名称 *")
        names = sorted({str(item.get("name") or "").strip() for item in self.customer_profiles
                        if str(item.get("name") or "").strip()}, key=str.casefold)
        if names:
            completer = QCompleter(names, self.fields["buyer_name"])
            completer.setCaseSensitivity(Qt.CaseSensitivity.CaseInsensitive)
            completer.setFilterMode(Qt.MatchFlag.MatchContains)
            self.fields["buyer_name"].setCompleter(completer)
            completer.activated[str].connect(self.customer_profile_activated)
        if self.kind == "quotation":
            for key, caption in (("recipient", "收件人"), ("buyer_fax", "传真号"), ("sender", "发件人"),
                                 ("subject", "主题"), ("cc", "抄送")):
                self.field(form, key, caption)
            self.field(form, "tax_type", "税口径 *", choices=["未税", "含税", "未注明"])
            self.field(form, "date", "报价日期", is_date=True)
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

    def customer_profile_activated(self, name):
        normalized = str(name).strip().casefold()
        profile = next((item for item in self.customer_profiles
                        if str(item.get("name") or "").strip().casefold() == normalized), None)
        if not profile:
            return
        fields = {"recipient": profile.get("contact", "")} if self.kind == "quotation" else {
            "buyer_address": profile.get("address", ""),
            "buyer_agent": profile.get("contact", ""),
            "buyer_phone": profile.get("phone", ""),
        }
        for key, value in fields.items():
            control = self.fields.get(key)
            if control is not None and value and not control.text().strip():
                control.setText(value)

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
        self.table.setEditTriggers(QAbstractItemView.EditTrigger.DoubleClicked | QAbstractItemView.EditTrigger.EditKeyPressed)
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

    def eventFilter(self, watched, event):
        if (getattr(self, "records_table", None) is not None
                and watched is self.records_table.viewport()
                and event.type() == QEvent.Type.MouseButtonDblClick):
            index = self.records_table.indexAt(event.position().toPoint())
            if not index.isValid():
                self.new_record()
                event.accept()
                return True
        return super().eventFilter(watched, event)

    def record_item_double_clicked(self, item, _column=None):
        record_id = item.data(Qt.ItemDataRole.UserRole)
        record = self.records_by_id.get(record_id)
        if record:
            self.load_record(record)

    def refresh_records(self, select_id=None):
        try:
            records = self.service.load_records(self.kind)
        except (OSError, ValueError) as exc:
            self.records_by_id = {}
            self.records_table.setRowCount(0)
            self.record_status.setText("制作记录读取失败：" + str(exc))
            self.notice.show_message(str(exc), True)
            return
        self.records_by_id = {record["id"]: record for record in records}
        self.records_table.setRowCount(0)
        for record in records:
            document = record["document"]
            fields = document["fields"]
            row = self.records_table.rowCount()
            self.records_table.insertRow(row)
            sync_status = record.get("sync_status", "")
            status_text = {"pending": "待同步", "conflict": "同步冲突", "error": "同步失败"}.get(sync_status)
            values = (record["title"], fields.get("buyer_name", "") or "未填写",
                      fields.get("date", "") or "—", record["updated_at"].replace("T", " ")[:16],
                      status_text or ("当前编辑" if record["id"] == self.current_record_id else "已同步"))
            for column, value in enumerate(values):
                cell = QTableWidgetItem(value)
                cell.setData(Qt.ItemDataRole.UserRole, record["id"])
                self.records_table.setItem(row, column, cell)
        counts = {status: sum(item.get("sync_status") == status for item in records)
                  for status in SYNC_STATUSES}
        sync_hint = []
        if counts["pending"]:
            sync_hint.append(f"待同步 {counts['pending']} 条")
        if counts["conflict"]:
            sync_hint.append(f"冲突 {counts['conflict']} 条")
        if counts["error"]:
            sync_hint.append(f"失败 {counts['error']} 条")
        suffix = "；" + "、".join(sync_hint) if sync_hint else "；已同步"
        if records:
            self.record_status.setText(f"共 {len(records)} 条制作记录{suffix}；双击可载入修改，空白处双击可新建。")
        else:
            self.record_status.setText("暂无制作记录；双击列表空白处即可新建记录。" +
                                       ("联网后会自动同步" if self.cloud_store else ""))
        target_id = select_id or self.current_record_id
        if target_id in self.records_by_id:
            for row in range(self.records_table.rowCount()):
                if self.records_table.item(row, 0).data(Qt.ItemDataRole.UserRole) == target_id:
                    self.records_table.selectRow(row)
                    break

    def load_record(self, record):
        if self.dirty and self.confirm(
            "载入制作记录", "当前填写内容尚未保存，载入记录会替换当前内容，继续吗？",
            {QMessageBox.StandardButton.Yes: "载入记录", QMessageBox.StandardButton.No: "取消"},
            QMessageBox.StandardButton.No,
        ) != QMessageBox.StandardButton.Yes:
            return
        try:
            self.apply_data(record["document"])
        except (OSError, ValueError) as exc:
            self.notice.show_message(str(exc), True)
            return
        self.current_record_id = record["id"]
        self.refresh_records(record["id"])
        self.tabs.setCurrentIndex(self.basic_tab_index)
        self.notice.show_message("已载入制作记录，可双击产品明细单元格手动修改。")

    def new_record(self):
        if self.dirty and self.confirm(
            "新建制作记录", "当前填写内容尚未保存，新建记录会替换当前内容，继续吗？",
            {QMessageBox.StandardButton.Yes: "新建记录", QMessageBox.StandardButton.No: "取消"},
            QMessageBox.StandardButton.No,
        ) != QMessageBox.StandardButton.Yes:
            return
        self.current_record_id = None
        self.apply_data(new_document(self.kind, self._seed_row, self._seed_customer))
        self.dirty = True
        self.refresh_records()
        self.tabs.setCurrentIndex(self.basic_tab_index)
        self.notice.show_message("已新建制作记录，请填写内容后保存。")

    def save_record(self):
        try:
            record = self.service.save_record(self.values(), self.current_record_id)
            self.current_record_id = record["id"]
            self.document = copy.deepcopy(record["document"])
            self.dirty = False
            self.refresh_records(record["id"])
            if record.get("sync_status") == "pending":
                self.notice.show_message("制作记录已保存在本地，联网后自动上传同步。")
            else:
                self.notice.show_message("制作记录已保存，可在“制作记录”中双击继续修改。")
            self.sync_cloud()
            return True
        except (OSError, ValueError) as exc:
            self.notice.show_message(str(exc), True)
            return False

    def delete_record(self):
        if not self.current_record_id:
            self.notice.show_message("请先双击载入要删除的制作记录。")
            return False
        if self.confirm(
            "删除制作记录", "删除后不能从制作记录列表恢复，确定继续吗？",
            {QMessageBox.StandardButton.Yes: "删除", QMessageBox.StandardButton.No: "取消"},
            QMessageBox.StandardButton.No,
        ) != QMessageBox.StandardButton.Yes:
            return False
        try:
            deleted = self.service.delete_record(self.kind, self.current_record_id)
            if not deleted:
                self.notice.show_message("制作记录已不存在，请刷新列表。", True)
                return False
            self.current_record_id = None
            self.dirty = False
            self.refresh_records()
            if self.cloud_store is not None:
                self.notice.show_message("制作记录已从本地删除，联网后自动同步删除。")
            else:
                self.notice.show_message("制作记录已删除。")
            self.sync_cloud()
            return True
        except (OSError, ValueError) as exc:
            self.notice.show_message(str(exc), True)
            return False

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
            self.total_label.setText(f"当前{self.table.rowCount()}项；每页保留原件1项，超出自动续页。")
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
                                     "填写数量和含税单价后自动计算金额；金额保留两位小数，每页保留原件2项。")
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
        for control in (self.load_button, self.save_button, self.preview_button, self.export_button,
                        self.export_word_button, self.supplier_button):
            control.setEnabled(not busy)

    def failed(self, error):
        self.set_busy(False)
        self.notice.show_message(str(error), True)

    def sync_cloud(self):
        if self.cloud_store is None or self._sync_busy or self.context.closing:
            return
        self._sync_busy = True
        self.tasks.submit(self.service.sync_all, self.sync_finished, self.sync_failed,
                          generation=self.context.storage_generation, write=True)

    def sync_finished(self, result):
        self._sync_busy = False
        self.refresh_records(self.current_record_id)
        if result.get("conflicts"):
            self.notice.show_message("发现制作记录同步冲突，已保留本地版本，请刷新后核对。", True)
        elif result.get("online") and result.get("synced"):
            self.notice.show_message(f"制作记录已自动同步 {result['synced']} 条。")
        elif not result.get("online"):
            self.record_status.setText(self.record_status.text() + " 当前离线，已保留本地内容，联网后自动重试。")

    def sync_failed(self, error):
        self._sync_busy = False
        self.record_status.setText("自动同步失败：" + str(error))

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

    def export_word(self):
        data = self.values()
        buyer = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", data["fields"]["buyer_name"])[:40].strip(". ")
        folder = QStandardPaths.writableLocation(QStandardPaths.StandardLocation.DesktopLocation) or str(Path.home())
        path, _ = QFileDialog.getSaveFileName(self, "导出Word"+KINDS[self.kind],
                                             str(Path(folder)/(KINDS[self.kind]+"-"+buyer+"-"+today()+".docx")),
                                             "Word 文件 (*.docx)")
        if not path:
            return
        self.set_busy(True)
        self.tasks.submit(lambda: self.service.export_word(data, path),
                          lambda result: self.export_ready(result, data, "Word"), self.failed,
                          generation=self.context.storage_generation, write=True)

    def export_ready(self, result, data, format_name="PDF"):
        self.set_busy(False)
        self.last_exported = result["path"]
        try:
            self.service.save_draft(data)
            record = self.service.save_record(data, self.current_record_id)
            self.current_record_id = record["id"]
            self.document = copy.deepcopy(record["document"])
            self.dirty = False
            self.refresh_records(record["id"])
            self.notice.show_message(format_name+"已导出，草稿和制作记录已保存："+result["path"])
        except (OSError, ValueError) as exc:
            self.notice.show_message(f"{format_name}已导出：{result['path']}；草稿或制作记录保存失败：{exc}", True)

    def reject(self):
        self.sync_timer.stop()
        if self.busy:
            self.notice.show_message("正在生成单据，请稍候。")
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
