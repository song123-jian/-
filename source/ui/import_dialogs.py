"""Desktop dialog implementation module."""
from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QAbstractItemView,
    QCheckBox,
    QComboBox,
    QHBoxLayout,
    QLineEdit,
    QPlainTextEdit,
    QTableWidget,
    QTableWidgetItem,
)

from domain import TAX_TYPES, business_date, clean

from .combo_delegate import configure_combo_popup
from .dialog_base import BaseDialog, button, label


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
