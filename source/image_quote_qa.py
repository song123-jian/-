"""Actual Qt image acceptance, enabled only with an isolated smoke marker."""
from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
import traceback
from pathlib import Path
from unittest.mock import patch

from PySide6.QtCore import QMimeData, Qt, QTimer
from PySide6.QtGui import QGuiApplication, QImage
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QAbstractItemView

from domain import today
from qa_runner import PackagedSmoke
from ui.dialogs import QuoteDialog


class PackagedImageQuoteSmoke(PackagedSmoke):
    def safe(self, function):
        try:
            function()
        except Exception as exc:
            self.report["failure_traceback"] = traceback.format_exc()
            self.fail(f"{type(exc).__name__}: {exc}")

    def baseline(self):
        assert self.window.context.store.backend == "sqlite" and self.window.loaded
        self.folder = self.window.context.folder
        self.fixture = json.loads((self.folder / "acceptance-image.json").read_text(encoding="utf-8"))
        self.customer = self.fixture["customer"]
        self.grade = "IMAGE-PA12-01"
        self.seed_count = self.fixture["seed_count"]
        self.report.update(backend="isolated SQLite", production_or_cloud_writes=False,
                           image_ocr="bundled RapidOCR + ONNX Runtime CPU", computer_use_verified=False,
                           file_picker="System picker return path substituted; actual Qt buttons, forms, OCR, storage and readback")
        if self.report["frozen"]:
            self.report["binary_sha256"] = hashlib.sha256(Path(sys.executable).read_bytes()).hexdigest()
        self.original_clipboard = QMimeData()
        previous = QGuiApplication.clipboard().mimeData()
        if previous:
            for fmt in previous.formats():
                self.original_clipboard.setData(fmt, previous.data(fmt))
            if previous.hasImage():
                self.original_clipboard.setImageData(previous.imageData())
        self.report["restart"] = len(self.window.context.store.all()) == self.seed_count + 4
        self.window.resize(960, 640)
        QTimer.singleShot(100, lambda: self.safe(self.directory_ready))

    def directory_ready(self):
        view = self.window.customers
        assert not view.horizontalScrollBar().isVisible()
        assert view.verticalScrollBar().isVisible() and view.verticalScrollBar().width() == 6
        index = self.customer_index(self.fixture["long_customer"])
        view.scrollTo(index, QAbstractItemView.ScrollHint.PositionAtCenter)
        rect = view.visualRect(index)
        assert rect.width() <= view.viewport().width()
        assert self.fixture["long_customer"] in index.data(Qt.ItemDataRole.ToolTipRole)
        QTest.mouseClick(view.viewport(), Qt.MouseButton.LeftButton, pos=rect.center())
        assert self.window.import_customer == self.fixture["long_customer"]
        self.report["checks"]["long_name_count_tooltip_dark_scroll_and_selection"] = True
        self.await_idle(self.after_directory)

    def customer_index(self, customer):
        return next(self.window.customer_model.index(row, 0) for row in range(self.window.customer_model.rowCount())
                    if (self.window.customer_model.index(row, 0).data(Qt.ItemDataRole.UserRole) or "") == customer)

    def after_directory(self):
        self.capture(self.window, "customer-directory.png")
        if self.report["restart"]:
            self.verify_records()
            self.open_new("single.png", self.restart_form_ready, selected=True)
        else:
            assert len(self.window.context.store.all()) == self.seed_count
            self.open_new("single.png", self.first_form_ready, selected=True)

    def open_new(self, image, continuation, *, selected, paste=False):
        customer = self.customer if selected else ""
        index = self.customer_index(customer)
        view = self.window.customers
        view.scrollTo(index, QAbstractItemView.ScrollHint.PositionAtCenter)
        QTest.mouseClick(view.viewport(), Qt.MouseButton.LeftButton, pos=view.visualRect(index).center())
        assert self.window.import_customer == customer
        self.await_idle(lambda: self.open_form(image, continuation, paste))

    def open_form(self, image, continuation, paste):
        QTest.mouseClick(self.window.new_button, Qt.MouseButton.LeftButton)
        self.dialog = next(dialog for dialog in self.window.dialogs if isinstance(dialog, QuoteDialog))
        path = self.folder / image
        if paste:
            QGuiApplication.clipboard().setImage(QImage(str(path)))
            self.dialog.fields["grade"].setFocus()
            QTest.keyClick(self.dialog.fields["grade"], Qt.Key.Key_V, Qt.KeyboardModifier.ControlModifier)
        else:
            with patch("ui.image_quote_panel.QFileDialog.getOpenFileName", return_value=(str(path), "")):
                QTest.mouseClick(self.dialog.image_panel.choose, Qt.MouseButton.LeftButton)
        self.await_idle(lambda: self.image_ready(continuation))

    def image_ready(self, continuation):
        assert not self.dialog.image_pending and self.dialog.image_panel.candidates, self.dialog.notice.text.text()
        assert not self.dialog.image_panel.thumbnail.pixmap().isNull()
        assert self.dialog.font().family() == "Microsoft YaHei"
        self.report["field_fonts"] = {key: field.font().family() for key, field in self.dialog.fields.items()}
        assert all(field.font().family() == "Microsoft YaHei" for field in self.dialog.fields.values())
        assert all(field.height() >= max(38, field.sizeHint().height()) for key, field in self.dialog.fields.items() if key != "note")
        assert not self.dialog.scroll.horizontalScrollBar().isVisible()
        self.report["quote_geometry"] = {key: {"height": field.height(), "parent_height": field.parentWidget().height(),
                                              "bottom": field.geometry().bottom()} for key, field in self.dialog.fields.items() if key != "note"}
        assert all(field.geometry().bottom() < field.parentWidget().height() for key, field in self.dialog.fields.items() if key != "note")
        self.report["checks"]["quote_fields_microsoft_yahei"] = True
        continuation()

    def first_form_ready(self):
        values = self.dialog.values()
        assert (values["customer"], values["grade"], values["price"], values["tax_type"], values["effective_date"]) == (
            self.customer, self.grade, "9.734513", "未税", "2026-09-30"), values
        assert self.dialog.fields["customer"].isReadOnly() and not self.dialog.image_review.isChecked()
        self.dialog.save.click()
        assert "核对" in self.dialog.notice.text.text() and len(self.window.context.store.all()) == self.seed_count
        self.report["checks"]["file_image_exact_fields_and_review_blocks_unchecked_save"] = True
        self.capture(self.dialog, "recognized-image-quote.png")
        self.save(self.first_saved)

    def save(self, continuation):
        self.dialog.image_review.setChecked(True)
        self.dialog.save.click()
        self.await_idle(lambda: self.saved(continuation))

    def saved(self, continuation):
        assert self.dialog.isVisible() and self.dialog.row, self.dialog.notice.text.text() or "报价没有完成保存"
        self.dialog.accept()
        continuation()

    def current(self, customer, grade):
        return next(row for row in self.window.context.store.list({"customer": customer})["items"] if row["grade"] == grade)

    def first_saved(self):
        assert self.current(self.customer, self.grade)["price"] == "9.734513"
        self.report["checks"]["new_image_quote_saved"] = True
        self.open_new("update.png", self.update_ready, selected=True, paste=True)

    def update_ready(self):
        assert self.dialog.image_base and self.dialog.values()["price"] == "11.123456"
        assert self.dialog.values()["customer"] == self.customer
        self.dialog.image_review.setChecked(True)
        self.dialog.save.click()
        self.await_idle(self.reason_required)

    def reason_required(self):
        assert self.dialog.isVisible() and "原因" in self.dialog.notice.text.text()
        self.dialog.fields["reason"].setText("隔离验收截图调价")
        self.dialog.fields["note"].setPlainText("用户核对后补充备注")
        self.save(self.updated)

    def updated(self):
        current = self.current(self.customer, self.grade)
        history = self.window.context.store.history(current["id"])["items"]
        assert len(history) == 2 and {row["price"] for row in history} == {"9.734513", "11.123456"}
        assert current["note"] == "用户核对后补充备注"
        self.report["checks"]["ctrl_v_match_reason_note_and_history_append"] = True
        self.open_new("dual.png", self.dual_ready, selected=True)

    def dual_ready(self):
        assert len(self.dialog.image_panel.candidates) == 2
        assert self.dialog.image_panel.combo.currentIndex() == -1 and self.dialog.values()["grade"] == ""
        self.dialog.image_panel.combo.setCurrentIndex(0)
        self.dialog.image_panel.apply.click()
        self.await_idle(self.dual_applied)

    def dual_applied(self):
        values = self.dialog.values()
        assert (values["grade"], values["price"], values["tax_type"], values["effective_date"]) == (
            "IMAGE-DUAL-01", "9.734513", "未税", today()), values
        self.report["checks"]["dual_tax_selection_and_missing_date"] = True
        self.save(self.dual_saved)

    def dual_saved(self):
        self.open_new("new-customer.png", self.new_customer_ready, selected=False)

    def new_customer_ready(self):
        assert self.dialog.values()["customer"] == self.fixture["new_customer"] and self.dialog.image_base is None
        self.save(self.all_customer_saved)

    def all_customer_saved(self):
        assert self.current(self.fixture["new_customer"], "IMAGE-NEW-01")["price"] == "9.734513"
        self.report["checks"]["all_customer_image_creates_explicit_customer"] = True
        QTest.mouseClick(self.window.new_button, Qt.MouseButton.LeftButton)
        self.dialog = next(dialog for dialog in self.window.dialogs if isinstance(dialog, QuoteDialog))
        values = self.dialog.values()
        self.dialog.start_image({"path": str(self.folder / "single.png")})
        self.dialog.cancel_image()
        assert self.dialog.values() == values and not self.dialog.image_pending
        self.dialog.accept()
        self.await_idle(self.after_cancel)

    def after_cancel(self):
        assert len(self.window.context.store.all()) == self.seed_count + 4
        self.report["checks"]["cancel_discards_old_results_without_writes"] = True
        self.verify_records()
        self.finish_image()

    def verify_records(self):
        current = self.current(self.customer, self.grade)
        history = self.window.context.store.history(current["id"])["items"]
        assert len(history) == 2 and {row["price"] for row in history} == {"9.734513", "11.123456"}
        assert all(row["effective_date"] == "2026-09-30" for row in history)
        assert self.current(self.customer, "IMAGE-DUAL-01")["effective_date"] == self.fixture["preview_date"]
        assert self.current(self.fixture["new_customer"], "IMAGE-NEW-01")["effective_date"] == "2026-09-30"
        with sqlite3.connect(self.folder / "prices.sqlite3") as db:
            assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            assert db.execute("SELECT COUNT(*) FROM quotes").fetchone()[0] == self.seed_count + 4
        self.report["checks"]["persisted_values_customer_ownership_and_integrity"] = True

    def restart_form_ready(self):
        assert self.dialog.image_base and self.dialog.values()["price"] == "9.734513"
        row = self.current(self.customer, self.grade)
        self.dialog.accept()
        update = QuoteDialog(self.window.prices, self.window.tasks, self.window.context.storage_generation, row=row, parent=self.window)
        self.window.show_dialog(update)
        assert update.image_panel is None and not update.fields["tax_type"].isEnabled()
        assert all(field.font().family() == "Microsoft YaHei" for field in update.fields.values())
        self.capture(update, "update-yahei.png")
        update.accept()
        self.report["checks"]["restart_ocr_preview_update_font_and_readonly_identity"] = True
        self.finish_image()

    def finish_image(self):
        self.restore_clipboard()
        self.report["status"] = "passed"
        self.write_report()
        self.finished = True
        self.timeout.stop()
        self.window.close()

    def restore_clipboard(self):
        if getattr(self, "original_clipboard", None) is not None:
            QGuiApplication.clipboard().setMimeData(self.original_clipboard)
            self.original_clipboard = None

    def fail(self, message):
        self.restore_clipboard()
        super().fail(message)
