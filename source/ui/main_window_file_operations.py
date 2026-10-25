"""Main-window behavior grouped by UI responsibility."""
from __future__ import annotations

import json
from pathlib import Path

from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QDesktopServices, QGuiApplication
from PySide6.QtWidgets import QFileDialog

from domain import today

from .dialogs import BackendDialog, ImportPreviewDialog, PdfImportOptionsDialog


class MainWindowFileOperationsMixin:
    def import_file(self):
        if self.customer.text().strip() and not self.import_customer:
            self.failed(ValueError("请先点击左侧具体客户再匹配导入；创建新客户请点击“全部客户”"))
            return
        options = {"customer_mode": "selected" if self.import_customer else "all",
                   "selected_customer": self.import_customer, "core_only": True}
        path, _ = QFileDialog.getOpenFileName(self, "导入报价", self.last_directory(), "报价文件 (*.xlsx *.csv *.pdf);;PDF 报价表 (*.pdf);;Excel / CSV (*.xlsx *.csv)")
        if path:
            self.remember_path(path)
            generation = self.context.storage_generation
            if Path(path).suffix.lower() == ".pdf":
                self.tasks.submit(lambda: self.prices.inspect_pdf(path, generation, options),
                                  lambda result: self.pdf_inspected(path, generation, result, options), self.failed, generation=generation)
            else:
                self.pdf_inspected(path, generation, {"defaults": {}, "warnings": [], "split_material_color": False}, options)

    def pdf_inspected(self, path, generation, inspection, import_options=None):
        customers = [self.customer_model.item(index).data(Qt.ItemDataRole.UserRole)
                     for index in range(1, self.customer_model.rowCount())]
        dialog = PdfImportOptionsDialog(Path(path).name, inspection, customers, self, import_options)
        dialog.previewRequested.connect(lambda options: self.start_import_preview(path, generation, options))
        self.show_dialog(dialog)

    def start_import_preview(self, path, generation, pdf_options=None):
        self.tasks.submit(lambda: self.prices.preview_import(path, generation, pdf_options),
                          self.preview_loaded, self.failed, generation=generation)

    def preview_loaded(self, result):
        dialog = ImportPreviewDialog(result, self.prices, self.tasks, self)
        dialog.imported.connect(self.imported)
        dialog.reselectRequested.connect(self.import_file)
        self.show_dialog(dialog)

    def imported(self, result):
        self.last_backup = result.get("backup")
        self.notify(f"导入完成：保存报价记录 {result['added']}，跳过 {result['skipped']}。" + (f"备份：{self.last_backup}" if self.last_backup else ""))
        self.refresh()

    def last_directory(self):
        return str(self.settings.value("last_directory", str(self.context.folder.parent)))

    def remember_path(self, path):
        self.settings.setValue("last_directory", str(Path(path).resolve().parent))

    def save_path(self, caption, name, filter_text):
        path, _ = QFileDialog.getSaveFileName(self, caption, str(Path(self.last_directory()) / name), filter_text)
        if path:
            if not Path(path).suffix:
                path += Path(name).suffix
            self.remember_path(path)
        return path

    def export(self, mode):
        path = self.save_path("导出报价", f"{'历史' if mode == 'history' else '当前'}价格-{today()}.csv", "CSV 文件 (*.csv)")
        if path:
            generation, filters = self.context.storage_generation, self.filters()
            self.tasks.submit(lambda: self.prices.export_quotes(filters, mode, path, generation), self.file_saved, self.failed, generation=generation, write=True)

    def backup(self):
        path = self.save_path("保存完整备份", f"价格完整备份-{today()}.sqlite3", "SQLite 备份 (*.sqlite3)")
        if path:
            generation = self.context.storage_generation
            self.tasks.submit(lambda: self.prices.backup_database(path, generation), self.file_saved, self.failed, generation=generation, write=True)

    def save_template(self):
        path = self.save_path("保存导入模板", "价格导入模板.csv", "CSV 文件 (*.csv)")
        if path:
            self.tasks.submit(lambda: self.prices.save_import_template(path), self.file_saved, self.failed, write=True)

    def save_schema(self):
        path = self.save_path("保存云端结构 SQL", "Supabase建表与接口.sql", "SQL 文件 (*.sql)")
        if path:
            self.tasks.submit(lambda: self.prices.save_cloud_schema(path), self.file_saved, self.failed, write=True)

    def save_workflow(self):
        path = self.save_path("保存报价功能升级 SQL", "Supabase报价完善与即时生效-1.6.0.sql", "SQL 文件 (*.sql)")
        if path:
            self.tasks.submit(lambda: self.prices.save_cloud_workflow(path), self.file_saved, self.failed, write=True)

    def file_saved(self, result):
        self.last_backup = result["path"] if result["path"].endswith(".sqlite3") else self.last_backup
        self.notify("已保存：" + result["path"])

    def open_backup_folder(self):
        path = Path(self.last_backup).parent if self.last_backup else self.context.folder / "backups"
        path.mkdir(exist_ok=True)
        QDesktopServices.openUrl(QUrl.fromLocalFile(str(path)))

    def backend_dialog(self):
        if getattr(self.context, 'account', None):
            self.notify('当前使用个人云端数据库，请通过账号菜单切换使用者')
            return
        dialog = BackendDialog(self.backends, self.tasks, self)
        dialog.switched.connect(self.backend_switched)
        self.show_dialog(dialog)

    def backend_switched(self, result):
        self.notify(result["message"], bool(result.get("warning")))
        self.loaded = False
        self.import_customer = ""
        self.customer.clear()
        self.model.set_items([])
        self.refresh()

    def copy_selected(self):
        row = self.selected()
        if row:
            QGuiApplication.clipboard().setText(json.dumps(row, ensure_ascii=False, indent=2))
