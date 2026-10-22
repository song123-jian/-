"""Explicit isolated acceptance against normal login controller and real cloud."""
from __future__ import annotations

import json
import secrets
import sys
import time
from pathlib import Path
from unittest.mock import patch

from PySide6.QtCore import QObject, Qt, QTimer
from PySide6.QtTest import QTest

from domain import VERSION
from services.account_service import LoginCredentialStore
from ui.dialogs import HistoryDialog, ImportPreviewDialog, PdfImportOptionsDialog, QuoteDialog


class AccountAcceptance(QObject):
    def __init__(self, controller, output):
        super().__init__(controller)
        self.controller,self.output = controller,Path(output)
        self.output.mkdir(parents=True,exist_ok=True)
        self.started=time.monotonic()
        self.phase='login'
        self.first=True
        marker=self.controller.folder/'acceptance-account.json'
        self.spec=json.loads(marker.read_text(encoding='utf-8')) if marker.exists() else {}
        self.username=self.spec.get('username','song123')
        self.business=self.spec.get('business',False)
        self.expected_records=self.spec.get('initial_records',78)
        self.expected_current=self.spec.get('initial_current',1 if self.business else 47)
        if self.business:
            assert self.username.startswith('qa') and self.spec.get('user_id')
        self.report={'version':VERSION,'frozen':bool(getattr(sys,'frozen',False)),
                     'program_entry':str(Path(sys.executable) if getattr(sys,'frozen',False) else Path(__file__).with_name('desktop_main.py')),
                     'environment':'Windows x64 Qt Widgets; actual Supabase Auth/HTTPS/SQL',
                     'checks':{},'substitution':'OS export/save file chooser only; real login/controller/Qt/RPC/files',
                     'business_writes':0}
        self.timer=QTimer(self)
        self.timer.timeout.connect(self.tick)
        self.timer.start(90)

    def tick(self):
        try:
            if time.monotonic()-self.started>180:
                raise AssertionError('Actual account UI acceptance timed out at '+self.phase)
            method=getattr(self,'phase_'+self.phase)
            method()
        except Exception as exc:
            self.timer.stop()
            self.report.update(status='failed',phase=self.phase,error=str(exc))
            self.save()
            if self.controller.window:
                self.controller.window.close()
            elif self.controller.login_dialog:
                self.controller.login_dialog.reject()

    def save(self):
        (self.output/'report.json').write_text(json.dumps(self.report,ensure_ascii=False,indent=2),encoding='utf-8')

    def phase_login(self):
        dialog=self.controller.login_dialog
        if not dialog or not dialog.isVisible() or dialog.pending:
            return
        assert dialog.username.text() and dialog.password.text() and dialog.remember.isChecked()
        self.report['checks']['encrypted_prefill_at_start']=True
        assert dialog.password.echoMode()==dialog.password.EchoMode.Password
        self.phase='loaded'
        QTest.mouseClick(dialog.login_button,Qt.MouseButton.LeftButton)

    def phase_loaded(self):
        window=self.controller.window
        if not window or window.tasks.jobs or not window.loaded:
            return
        assert window.model.rowCount()==self.expected_current and window.context.account['username']==self.username
        assert window.context.folder.parent.name=='profiles'
        assert window.context.shared_folder==self.controller.folder
        assert not (window.context.folder/'prices.sqlite3').exists()
        assert self.username in window.windowTitle()
        self.report['checks']['normal_login_actual_cloud_and_profile']=True
        window.backend_dialog()
        assert not any(d.isVisible() and d.__class__.__name__=='BackendDialog' for d in window.dialogs)
        self.report['checks']['admin_database_switch_blocked']=True
        self.window=window
        if self.business:
            assert window.context.account['id']==self.spec['user_id']
            self.grade='QA-UI-'+secrets.token_hex(4)
            window.new_quote()
            self.quote=next(d for d in window.dialogs if isinstance(d,QuoteDialog) and d.isVisible())
            for key,value in {'customer':'QA窗口客户','grade':self.grade,'material':'PP','color':'本色','price':'12.345678'}.items():
                self.quote.fields[key].setText(value)
            self.quote.fields['tax_type'].setCurrentText('含税')
            self.quote.fields['note'].setPlainText('真实窗口新增报价')
            self.phase='saved_new'
            QTest.mouseClick(self.quote.save,Qt.MouseButton.LeftButton)
            return
        self.open_history()

    def phase_saved_new(self):
        if self.window.tasks.jobs or not self.quote.row:
            return
        assert self.quote.isVisible() and self.quote.row['price']=='12.345678'
        assert self.window.model.rowCount()==self.expected_current+1
        self.report['checks']['actual_window_new_quote_saved_and_read_back']=True
        self.report['business_writes']+=1
        self.quote.fields['price'].setText('12.345679')
        self.quote.fields['reason'].setText('真实窗口更新价格')
        self.phase='saved_update'
        QTest.mouseClick(self.quote.save,Qt.MouseButton.LeftButton)

    def phase_saved_update(self):
        if self.window.tasks.jobs or self.quote.row['price']!='12.345679':
            return
        assert self.quote.isVisible()
        self.report['checks']['actual_window_price_update_saved_and_read_back']=True
        self.report['business_writes']+=1
        self.quote.accept()
        self.import_path=self.output/'personal-import.csv'
        self.import_path.write_text('客户,牌号,材料,颜色,价格,税口径,备注\nQA窗口客户,'+self.grade+'-IMPORT,PP,本色,18,含税,真实窗口导入\n',encoding='utf-8-sig')
        self.phase='import_options'
        with patch('ui.main_window.QFileDialog.getOpenFileName',return_value=(str(self.import_path),'CSV')):
            self.window.import_file()

    def phase_import_options(self):
        dialog=next((d for d in self.window.dialogs if isinstance(d,PdfImportOptionsDialog) and d.isVisible()),None)
        if dialog is None:
            return
        self.phase='import_preview'
        QTest.mouseClick(dialog.preview,Qt.MouseButton.LeftButton)

    def phase_import_preview(self):
        if self.window.tasks.jobs:
            return
        dialog=next((d for d in self.window.dialogs if isinstance(d,ImportPreviewDialog) and d.isVisible()),None)
        if dialog is None:
            return
        assert dialog.preview['error_count']==0 and dialog.commit.isEnabled()
        self.phase='import_saved'
        QTest.mouseClick(dialog.commit,Qt.MouseButton.LeftButton)

    def phase_import_saved(self):
        if self.window.tasks.jobs:
            return
        assert any(r['grade']==self.grade+'-IMPORT' and r['price']=='18' for r in self.window.model.items)
        self.report['checks']['actual_window_csv_preview_commit_and_readback']=True
        self.report['business_writes']+=1
        self.expected_records+=3
        self.expected_current+=2
        self.open_history()

    def open_history(self):
        self.phase='history'
        self.history_row=next(r for r in self.window.model.items if r['grade']==self.grade) if self.business else self.window.model.items[0]
        self.window.open_history(self.history_row['id'])

    def phase_history(self):
        if self.window.tasks.jobs:
            return
        self.history=next(d for d in self.window.dialogs if isinstance(d,HistoryDialog) and d.isVisible())
        assert self.history.isVisible() and self.history.model.rowCount()>0
        if self.business:
            assert self.history.model.rowCount()==2
        self.report['checks']['actual_history_dialog']=True
        self.history.accept()
        self.phase='export'
        self.export_path=self.output/'personal-current.csv'
        with patch('ui.main_window.QFileDialog.getSaveFileName',return_value=(str(self.export_path),'CSV')):
            self.window.export('current')

    def phase_export(self):
        if self.window.tasks.jobs:
            return
        assert self.export_path.exists() and '客户' in self.export_path.read_text(encoding='utf-8-sig')
        self.report['checks']['actual_export_personal_results']=True
        self.phase='backup'
        self.backup_path=self.output/'personal-backup.sqlite3'
        with patch('ui.main_window.QFileDialog.getSaveFileName',return_value=(str(self.backup_path),'SQLite')):
            self.window.backup()

    def phase_backup(self):
        if self.window.tasks.jobs:
            return
        import sqlite3
        with sqlite3.connect(self.backup_path) as db:
            assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
            assert db.execute('SELECT count(*) FROM quotes').fetchone()[0]==self.expected_records
        self.report['checks']['actual_complete_personal_backup']=True
        self.report['backup_records']=self.expected_records
        self.window.open_inventory()
        dialog=self.window.inventory_dialog
        assert dialog.credential_store.path.parent==self.controller.folder
        dialog.reject()
        self.report['checks']['mes_still_uses_original_shared_directory']=True
        self.window.resize(1200,780)
        self.window.grab().save(str(self.output/'account-final.png'))
        self.phase='logged_out'
        self.window.logout_account()

    def phase_logged_out(self):
        dialog=self.controller.login_dialog
        if not dialog or not dialog.isVisible() or dialog.pending:
            return
        assert self.controller.window is None
        assert self.controller.session is None
        assert self.window.context.closing
        assert self.window.context.store.session.closed
        assert not self.window.context.previews
        assert dialog.username.text()==self.username and dialog.password.text()
        self.report['checks']['logout_drains_tasks_and_destroys_old_session']=True
        QTest.mouseClick(dialog.clear_button,Qt.MouseButton.LeftButton)
        assert LoginCredentialStore(self.controller.folder).load() is None
        self.report['checks']['clear_remembered_login']=True
        self.phase='relogin'
        QTest.mouseClick(dialog.login_button,Qt.MouseButton.LeftButton)

    def phase_relogin(self):
        window=self.controller.window
        if not window or window.tasks.jobs or not window.loaded:
            return
        assert window is not self.window and window.context.store.session is not self.window.context.store.session
        assert LoginCredentialStore(self.controller.folder).load()
        assert window.model.rowCount()==self.expected_current
        self.report['checks']['fresh_relogin_and_credentials_saved_again']=True
        self.timer.stop()
        self.report.update(status='passed',elapsed_seconds=round(time.monotonic()-self.started,2))
        self.save()
        window.close()
