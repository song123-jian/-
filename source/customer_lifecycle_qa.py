"""Real native window acceptance in an explicitly isolated SQLite data directory."""
from __future__ import annotations

import json
import sqlite3

from PySide6.QtCore import Qt, QTimer
from PySide6.QtTest import QTest

from domain import ValidationError
from qa_runner import PackagedSmoke
from storage.sqlite_store import SQLiteStore
from ui.customer_dialogs import CustomerManagerDialog
from ui.dialogs import QuoteDialog


class PackagedCustomerLifecycleSmoke(PackagedSmoke):
    def baseline(self):
        self.settings = json.loads((self.window.context.folder / "acceptance-lifecycle.json").read_text(encoding="utf-8"))
        if self.settings.get("stage") == "cloud-read":
            self.cloud_baseline()
            return
        assert self.window.context.store.backend == "sqlite", "仅可在隔离本地库执行删除验收"
        assert self.window.loaded
        self.generation = self.window.context.storage_generation
        self.store = self.window.context.store
        self.report["backend"] = "sqlite"
        self.report["production_or_cloud_writes"] = False
        self.target = next(r for r in self.store.customer_states().values() if "金华" in r["display_name"])
        self.key = self.target["customer_key"]
        self.original = self.store.all()
        stats = self.store.meta()["stats"]
        if self.settings.get("stage") == "restart-deleted":
            assert stats["customers"] == 4 and stats["items"] == 25
            assert self.target["status"] == "deleted"
            self.report["checks"]["deleted_persists_after_restart"] = True
            self.open_manager(True, self.restore_preview)
        elif self.settings.get("stage") == "restart-restored":
            assert stats["customers"] == 5 and stats["items"] == 41
            assert self.target["status"] == "active"
            self.report["checks"]["restored_persists_after_restart"] = True
            self.finish()
        else:
            assert stats["customers"] == 5 and stats["items"] == 41
            self.old_row = next(r for r in self.store.list()["items"] if r["customer_key"] == self.key)
            self.old_form = QuoteDialog(self.window.prices, self.window.tasks, self.generation, row=self.old_row, parent=self.window)
            self.old_form.fields["price"].setText("22.734513")
            self.old_form.fields["reason"].setText("旧表单应拒绝")
            self.old_form.open()
            self.old_form.hide()
            csv = self.output / "old-preview.csv"
            csv.write_text(f"客户,牌号,价格,更新日期\n{self.target['display_name']},QA新牌号,10,2026-10-10\n", encoding="utf-8")
            self.import_preview = self.window.prices.preview_import(csv,self.generation)
            self.window.navigate(1)
            self.open_manager(False, self.delete_preview)

    def open_manager(self, deleted, after):
        self.window.manage_customers(deleted)
        self.manager = next(d for d in self.window.dialogs if isinstance(d, CustomerManagerDialog))
        QTimer.singleShot(70, lambda: self.await_idle(after))

    def select_target(self):
        row = next(i for i,r in enumerate(self.manager.items) if r["customer_key"] == self.key)
        rectangle = self.manager.table.visualRect(self.manager.table.model().index(row,0))
        QTest.mouseClick(self.manager.table.viewport(), Qt.MouseButton.LeftButton, pos=rectangle.center())
        assert self.manager.selected()["customer_key"] == self.key

    def delete_preview(self):
        self.select_target()
        QTest.mouseClick(self.manager.delete_button,Qt.MouseButton.LeftButton)
        QTimer.singleShot(80,lambda: self.await_idle(self.confirm_delete))

    def confirm_delete(self):
        self.confirmation = self.manager.confirm_dialog
        assert self.confirmation and self.confirmation.isVisible()
        assert self.confirmation.preview["specs"] == 16 and self.confirmation.preview["records"] == 16
        self.capture(self.confirmation,"delete-confirm.png")
        QTest.mouseClick(self.confirmation.confirm,Qt.MouseButton.LeftButton)
        QTimer.singleShot(70,lambda: self.await_idle(self.deleted))

    def deleted(self):
        assert self.store.all() == self.original
        assert self.window.import_customer == "" and self.window.customer.text() == ""
        assert self.window.customer_model.rowCount() == 5
        assert self.window.model.rowCount() == 25
        self.report["checks"]["delete_5_to_4_customers_41_to_25_specs"] = True
        self.report["checks"]["physical_41_quotes_unchanged"] = True
        self.report["checks"]["directory_stats_and_search_reset"] = True
        try:
            self.window.prices.commit_import(self.import_preview["preview_id"],self.generation)
            raise AssertionError("旧导入预览错误提交")
        except ValidationError:
            self.report["checks"]["old_import_preview_rejected"] = True
        self.old_form.show()
        QTest.mouseClick(self.old_form.save,Qt.MouseButton.LeftButton)
        QTimer.singleShot(70,lambda: self.await_idle(self.old_form_rejected))

    def old_form_rejected(self):
        assert not self.old_form.busy and self.old_form.notice.isVisible()
        self.report["checks"]["old_native_quote_form_rejected"] = True
        self.old_form.accept()
        path = self.output / "deleted-backup.sqlite3"
        self.window.prices.backup_database(path,self.generation)
        with sqlite3.connect(path) as db:
            assert db.execute("SELECT status FROM customers WHERE customer_key=?",(self.key,)).fetchone()[0] == "deleted"
            assert db.execute("SELECT count(*) FROM quotes").fetchone()[0] == 41
            assert db.execute("SELECT count(*) FROM customer_audit").fetchone()[0] == 1
        self.report["checks"]["complete_backup_includes_recycle_bin_and_audit"] = True
        self.manager.status.setCurrentIndex(1)
        QTimer.singleShot(70,lambda: self.await_idle(self.deleted_details))

    def deleted_details(self):
        self.select_target()
        QTest.mouseClick(self.manager.details_button,Qt.MouseButton.LeftButton)
        QTimer.singleShot(70,lambda: self.await_idle(self.details_ready))

    def details_ready(self):
        detail = self.manager.detail_dialog
        assert detail.isVisible() and detail.table.rowCount() == 16
        self.report["checks"]["recycle_bin_full_readonly_history"] = True
        self.capture(detail,"deleted-history.png")
        detail.accept()
        self.window.resize(960,640)
        self.manager.resize(900,550)
        QTimer.singleShot(100,lambda: self.safe(self.deleted_finish))

    def deleted_finish(self):
        self.capture(self.manager,"recycle-bin.png")
        self.manager.accept()
        self.finish()

    def restore_preview(self):
        self.select_target()
        QTest.mouseClick(self.manager.restore_button,Qt.MouseButton.LeftButton)
        QTimer.singleShot(70,lambda: self.await_idle(self.confirm_restore))

    def confirm_restore(self):
        confirmation = self.manager.confirm_dialog
        assert confirmation and confirmation.isVisible()
        self.capture(confirmation,"restore-confirm.png")
        QTest.mouseClick(confirmation.confirm,Qt.MouseButton.LeftButton)
        QTimer.singleShot(70,lambda: self.await_idle(self.restored))

    def restored(self):
        assert self.window.model.rowCount() == 41
        assert self.window.customer_model.rowCount() == 6
        assert self.store.all() == self.original
        assert not self.window.customer_service.list_customers("deleted",self.generation)["items"]
        self.report["checks"]["restore_5_customers_41_specs_all_history"] = True
        self.manager.accept()
        self.finish()

    def finish(self):
        assert all(self.report["checks"].values())
        assert len(SQLiteStore(self.window.context.folder).all()) == 41
        self.window.navigate(1)
        self.capture(self.window,"final-main.png")
        self.report["status"] = "passed"
        self.write_report()
        self.finished = True
        self.timeout.stop()
        self.window.close()

    def cloud_baseline(self):
        assert self.window.loaded and self.window.context.store.backend == "supabase"
        self.report["backend"] = "supabase"
        self.report["cloud_writes"] = False
        assert self.window.customer_model.rowCount() == 7
        assert self.window.model.rowCount() == 57
        self.report["checks"]["real_cloud_schema2_6_customers_57_quotes"] = True
        self.window.manage_customers()
        self.manager = next(d for d in self.window.dialogs if isinstance(d,CustomerManagerDialog))
        QTimer.singleShot(70,lambda: self.await_idle(self.cloud_manager))

    def cloud_manager(self):
        assert len(self.manager.items) == 6
        assert sum(r["records"] for r in self.manager.items) == 57
        index = next(i for i,r in enumerate(self.manager.items) if r["display_name"] == "金华领先")
        self.manager.table.selectRow(index)
        QTest.mouseClick(self.manager.details_button,Qt.MouseButton.LeftButton)
        QTimer.singleShot(70,lambda: self.await_idle(self.cloud_details))

    def cloud_details(self):
        assert self.manager.detail_dialog.table.rowCount() == 16
        self.report["checks"]["native_cloud_customer_manager_full_history"] = True
        self.manager.detail_dialog.accept()
        self.manager.status.setCurrentIndex(1)
        QTimer.singleShot(70,lambda: self.await_idle(self.cloud_bin))

    def cloud_bin(self):
        assert not self.manager.items and self.manager.empty.text() == "回收站为空"
        assert not self.manager.delete_button.isEnabled() and not self.manager.restore_button.isEnabled()
        self.report["checks"]["native_cloud_recycle_bin_empty"] = True
        self.capture(self.manager,"cloud-recycle-bin.png")
        self.manager.accept()
        self.window.navigate(1)
        self.capture(self.window,"cloud-final-main.png")
        self.report["status"] = "passed"
        self.write_report()
        self.finished = True
        self.timeout.stop()
        self.window.close()
