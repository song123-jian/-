"""Narrow real-app acceptance with disposable data and explicitly simulated sync metadata."""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path
from unittest.mock import patch

import pdfplumber
from PySide6.QtCore import Qt, QTimer
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

from domain import now, today
from qa_runner import PackagedSmoke
from storage.sqlite_store import SQLiteStore
from ui.business_document_dialog import BusinessDocumentDialog
from ui.dialogs import ImportPreviewDialog, PdfImportOptionsDialog


class PackagedOperationSyncSmoke(PackagedSmoke):
    def later(self, callback):
        QTimer.singleShot(80, self, lambda: self.await_idle(callback))

    @staticmethod
    def click(widget):
        QTest.mouseClick(widget, Qt.MouseButton.LeftButton)

    def baseline(self):
        assert self.window.loaded and self.window.context.store.backend == 'sqlite'
        self.report.update(entry=sys.executable, platform=QApplication.instance().platformName(),
                           backend='isolated SQLite', cloud_business_writes=False,
                           controlled_inputs='CSV file picker return; sync metadata; injected PermissionError',
                           scope='actual import/duplicate persistence, document preview/export, error notice and sync recovery UI')
        if self.report['frozen']:
            self.report['binary_sha256'] = hashlib.sha256(Path(sys.executable).read_bytes()).hexdigest()
        self.customer = '本轮隔离验收客户'
        self.path = self.output / 'prices.csv'
        self.path.write_text('客户,产品名称,牌号,含税价格,备注\n'
                             f'{self.customer},PA66,JLGF30,9.734513,样例数据\n'
                             f'{self.customer},PP,QA-SECOND,12.25,样例数据\n', encoding='utf-8')
        self.window.resize(1280, 800)
        assert not self.window.context.store.list()['items'], '验收目录必须为空'
        self.open_import(self.import_ready)

    def open_import(self, continuation):
        self.window.customer.clear()
        self.window.import_customer = ''
        with patch('ui.main_window.QFileDialog.getOpenFileName', return_value=(str(self.path), 'CSV')):
            self.window.import_file()
        options = next(d for d in self.window.dialogs if isinstance(d, PdfImportOptionsDialog))
        self.click(options.preview)
        self.later(continuation)

    def import_ready(self):
        dialog = next(d for d in self.window.dialogs if isinstance(d, ImportPreviewDialog))
        assert (dialog.preview['added'], dialog.preview['error_count']) == (2, 0)
        self.click(dialog.commit)
        self.later(self.import_saved)

    def import_saved(self):
        rows = SQLiteStore(self.window.context.folder, load_seed=False).all()
        assert len(rows) == 2 and any(row['price'] == '9.734513' for row in rows)
        self.report['checks']['actual_csv_import_and_persistence'] = True
        self.open_import(self.duplicate_ready)

    def duplicate_ready(self):
        dialog = next(d for d in self.window.dialogs if isinstance(d, ImportPreviewDialog))
        assert (dialog.preview['added'], dialog.preview['skipped']) == (0, 2)
        self.click(dialog.commit)
        self.later(self.duplicate_saved)

    def duplicate_saved(self):
        assert len(SQLiteStore(self.window.context.folder, load_seed=False).all()) == 2
        self.report['checks']['duplicate_import_does_not_add_records'] = True
        row = next(i for i, value in enumerate(self.window.model.items) if value['grade'] == 'JLGF30')
        selected = self.window.table.model().mapFromSource(self.window.model.index(row, 0))
        self.window.table.selectRow(selected.row())
        self.open_document('quotation')

    def open_document(self, kind):
        self.kind = kind
        self.click(self.window.document_quote_nav if kind == 'quotation' else self.window.document_contract_nav)
        self.dialog = next(d for d in self.window.dialogs if isinstance(d, BusinessDocumentDialog))
        assert self.dialog.values()['fields']['buyer_name'] == self.customer
        if kind == 'contract':
            self.dialog.table.item(0, 3).setText('280')
        self.click(self.dialog.preview_button)
        self.later(self.preview_ready)

    def preview_ready(self):
        preview = self.dialog.preview_dialog
        assert preview and preview.isVisible() and len(preview.pdf) == 1
        self.report['checks'][self.kind + '_actual_preview'] = True
        preview.accept()
        self.target = self.output / (self.kind + '.pdf')
        with patch('ui.business_document_dialog.QFileDialog.getSaveFileName', return_value=(str(self.target), 'PDF')):
            self.click(self.dialog.export_button)
        self.later(self.export_ready)

    def export_ready(self):
        assert self.target.is_file() and not self.dialog.busy
        with pdfplumber.open(self.target) as pdf:
            text = pdf.pages[0].extract_text()
            assert self.customer in text and 'JLGF30' in text and '\ufffd' not in text
            assert len(pdf.pages[0].images) == 1
            if self.kind == 'contract':
                assert '2725.66' in text
        self.report['checks'][self.kind + '_export_with_reference_seal'] = True
        self.dialog.accept()
        if self.kind == 'quotation':
            self.open_document('contract')
        else:
            self.error_notice()

    def error_notice(self):
        def denied():
            raise PermissionError('private diagnostic must not appear in the UI')

        self.window.tasks.submit(denied, lambda _: None, self.window.failed)
        self.later(self.sync_recovery)

    def sync_recovery(self):
        assert '文件无法访问' in self.window.notice.text.text()
        assert 'private diagnostic' not in self.window.notice.text.text()
        self.report['checks']['injected_permission_error_has_actionable_notice'] = True
        self.window.sync_applied({'available': False, 'message': '云端同步待升级；每60秒重检，可手动刷新'})
        assert self.window.sync_timer.isActive() and self.window.sync_timer.interval() == 60000
        self.window.sync_applied(dict(available=True, owner_id='simulated-owner', schema_epoch='simulated-epoch',
                                      data_version='1', business_date=today(), last_read_at=now()))
        assert self.window.sync_timer.isActive() and self.window.sync_timer.interval() == 15000
        assert '已读取' in self.window.sync_label.text()
        self.report['checks']['controlled_sync_metadata_recovers_timer'] = True
        self.window.notice.hide()
        self.window.sync_label.hide()
        assert all(self.report['checks'].values())
        if self.report['frozen']:
            self.capture(self.window, 'operation-sync-1280.png')
        self.report['status'] = 'passed'
        self.write_report()
        self.finished = True
        self.timeout.stop()
        self.window.request_exit()
