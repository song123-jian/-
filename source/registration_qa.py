"""Opt-in isolated acceptance of the real registration/login/business UI."""
from __future__ import annotations

import json
import secrets
import sys
import time
from pathlib import Path

from PySide6.QtCore import QObject, Qt, QTimer
from PySide6.QtTest import QTest

from domain import VERSION
from services.account_service import LoginCredentialStore
from ui.dialogs import QuoteDialog


class RegistrationAcceptance(QObject):
    def __init__(self, controller, output):
        super().__init__(controller)
        self.controller,self.output=controller,Path(output)
        self.output.mkdir(parents=True,exist_ok=True)
        marker=controller.folder/'acceptance-registration.json'
        self.spec=json.loads(marker.read_text(encoding='utf-8'))
        self.username=self.spec['username']
        assert self.username.startswith('qareg_')
        self.login_only=self.spec.get('login_only',False)
        self.password=secrets.token_urlsafe(20)
        self.phase='open'
        self.started=time.monotonic()
        self.report={'status':'running','version':VERSION,'frozen':bool(getattr(sys,'frozen',False)),
            'program_entry':str(Path(sys.executable) if getattr(sys,'frozen',False) else Path(__file__).with_name('desktop_main.py')),
            'environment':'Windows x64 actual Qt Widgets, Supabase Auth/Edge/REST; isolated --data-dir',
            'username':self.username,'checks':{},'substitution':'none; real app UI and cloud', 'business_writes':0}
        self.timer=QTimer(self)
        self.timer.timeout.connect(self.tick)
        self.timer.start(90)

    def tick(self):
        try:
            if time.monotonic()-self.started>150:
                raise AssertionError('Registration acceptance timed out at '+self.phase)
            getattr(self,'phase_'+self.phase)()
        except Exception as exc:
            self.timer.stop()
            # Deliberately omit submitted values and arbitrary upstream errors.
            self.report.update(status='failed',phase=self.phase,error_type=type(exc).__name__)
            self.save()
            if self.controller.window:
                self.controller.window.close()
            elif self.controller.login_dialog and not self.controller.login_dialog.pending:
                self.controller.login_dialog.reject()
            else:
                self.controller.app.exit(1)

    def save(self):
        (self.output/'report.json').write_text(json.dumps(self.report,ensure_ascii=False,indent=2),encoding='utf-8')

    def phase_open(self):
        dialog=self.controller.login_dialog
        if not dialog or not dialog.isVisible() or dialog.pending:
            return
        if self.login_only:
            assert dialog.username.text()==self.username and dialog.password.text()
            self.phase='loaded'
            QTest.mouseClick(dialog.login_button,Qt.MouseButton.LeftButton)
            return
        assert not dialog.username.text() and not dialog.password.text()
        QTest.mouseClick(dialog.register_button,Qt.MouseButton.LeftButton)
        assert dialog.registering and dialog.confirmation.isVisible()
        dialog.username.setText(self.username)
        dialog.password.setText(self.password)
        dialog.confirmation.setText('mismatch-isolated-password')
        QTest.keyClick(dialog.password,Qt.Key.Key_Return)
        assert dialog.focusWidget() is dialog.confirmation and not dialog.pending
        self.report['checks']['password_enter_moves_to_confirmation_without_submit']=True
        self.phase='mismatch'
        QTest.mouseClick(dialog.login_button,Qt.MouseButton.LeftButton)

    def phase_mismatch(self):
        dialog=self.controller.login_dialog
        if not dialog or dialog.pending:
            return
        assert dialog.registering and dialog.session is None
        assert '不一致' in dialog.notice.text.text()
        assert LoginCredentialStore(self.controller.folder).load() is None
        self.report['checks']['mismatch_stays_in_registration_without_saved_credential']=True
        dialog.confirmation.setText(self.password)
        dialog.grab().save(str(self.output/'registration-form.png'))
        self.phase='loaded'
        QTest.keyClick(dialog.confirmation,Qt.Key.Key_Return)

    def phase_loaded(self):
        window=self.controller.window
        if not window or not window.loaded or window.tasks.jobs:
            return
        assert window.context.account['username']==self.username
        self.report['user_id']=window.context.account['id']
        assert window.context.folder==self.controller.folder/'profiles'/self.report['user_id']
        assert window.context.shared_folder==self.controller.folder
        assert not (window.context.folder/'prices.sqlite3').exists()
        self.window=window
        if self.login_only:
            self.check_quote(window)
            self.report['checks']['new_process_dpapi_prefill_and_real_login']=True
            self.logout()
            return
        assert window.model.rowCount()==0
        assert window.context.store.all()==[]
        self.report['checks']['new_registration_auto_login_empty_personal_space']=True
        saved=LoginCredentialStore(self.controller.folder)
        assert saved.load()==(self.username,self.password)
        assert self.password.encode() not in saved.path.read_bytes()
        self.report['checks']['registration_credential_dpapi_saved']=True
        window.new_quote()
        self.quote=next(d for d in window.dialogs if isinstance(d,QuoteDialog) and d.isVisible())
        for field,value in {'customer':'QA注册同名客户','grade':'QA-REGISTER-SHARED','material':'PP','color':'本色','price':self.spec['price']}.items():
            self.quote.fields[field].setText(value)
        self.quote.fields['tax_type'].setCurrentText('含税')
        self.quote.fields['note'].setPlainText('注册后真实界面报价')
        self.phase='saved'
        QTest.mouseClick(self.quote.save,Qt.MouseButton.LeftButton)

    def check_quote(self,window):
        assert window.model.rowCount()==1
        row=window.model.items[0]
        assert row['customer']=='QA注册同名客户' and row['grade']=='QA-REGISTER-SHARED'
        assert row['price']==self.spec['price']
        rows=window.context.store.all()
        assert len(rows)==1 and rows[0]['owner_id']==self.report['user_id']
        assert rows[0]['price']==self.spec['price']
        self.report['quote_id']=rows[0]['id']

    def phase_saved(self):
        if self.window.tasks.jobs or not self.quote.row:
            return
        self.check_quote(self.window)
        self.report['business_writes']=1
        self.report['checks']['new_quote_ui_write_and_cloud_readback']=True
        self.quote.accept()
        self.logout()

    def logout(self):
        self.phase='logged_out'
        self.window.logout_account()

    def phase_logged_out(self):
        dialog=self.controller.login_dialog
        if not dialog or not dialog.isVisible() or dialog.pending:
            return
        assert self.controller.window is None and self.controller.session is None
        assert self.window.context.store.session.closed
        assert dialog.username.text()==self.username and dialog.password.text()
        self.report['checks']['logout_destroys_session_and_encrypted_reopen']=True
        self.phase='relogin'
        QTest.mouseClick(dialog.login_button,Qt.MouseButton.LeftButton)

    def phase_relogin(self):
        window=self.controller.window
        if not window or not window.loaded or window.tasks.jobs:
            return
        assert window.context.account['id']==self.report['user_id']
        self.check_quote(window)
        self.report['checks']['relogin_retains_only_own_quote']=True
        self.report['status']='passed'
        self.timer.stop()
        self.save()
        window.close()
