"""Real desktop-window document acceptance; requires the isolated smoke-test entry."""
from __future__ import annotations

import copy
import hashlib
import json
import sys
import traceback
from pathlib import Path
from unittest.mock import patch

import pdfplumber
from PySide6.QtCore import QPoint, QPointF, Qt, QTimer
from PySide6.QtGui import QWheelEvent
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication, QMessageBox

from qa_runner import PackagedSmoke
from services.business_document_service import BusinessDocumentService
from ui.business_document_dialog import BusinessDocumentDialog


class PackagedBusinessDocumentSmoke(PackagedSmoke):
    def safe(self, function):
        try:
            function()
        except Exception as exc:
            self.report["failure_traceback"] = traceback.format_exc()
            self.fail(f"{type(exc).__name__}: {exc}")

    def later(self, callback):
        QTimer.singleShot(70, lambda: self.await_idle(callback))

    def baseline(self):
        assert self.window.loaded and self.window.context.store.backend == "sqlite"
        assert (self.window.context.folder/"acceptance-documents.json").is_file()
        self.report.update(entry=str(Path(sys.executable) if self.report["frozen"] else Path(__file__).with_name("desktop_main.py")),
                           backend="isolated SQLite", actual_qt_ui=True, production_or_cloud_writes=False,
                           file_picker="controlled return path; real forms, preview, PDF generation and file writes",
                           fonts="Windows SimSun/Microsoft YaHei", exports=[])
        if self.report["frozen"]:
            self.report["binary_sha256"] = hashlib.sha256(Path(sys.executable).read_bytes()).hexdigest()
        self.window.resize(1280, 800)
        options = json.loads((self.window.context.folder/"acceptance-documents.json").read_text(encoding="utf-8"))
        if options.get("scenario") in ("source-fidelity", "source-empty-rows"):
            self.source_options = options
            self.source_empty_rows = options.get("scenario") == "source-empty-rows"
            self.source_kinds = iter((("quotation", 1), ("quotation", 2), ("contract", 1), ("contract", 3)) if self.source_empty_rows else ("quotation", "contract"))
            self.source_open()
            return
        if options.get("scenario") == "layout-fix":
            self.layout_options = options
            self.layout_baseline()
            return
        self.restart = BusinessDocumentService(self.window.context.folder).load_draft("quotation") is not None
        if not self.window.context.store.list({"customer": "示例客户有限公司"})["items"]:
            self.window.context.store.add({"customer": "示例客户有限公司", "grade": "JLGF30", "material": "PA66",
                                          "color": "本色", "price": "9.734513", "tax_type": "含税",
                                          "effective_date": "2026-10-13", "note": "样例数据"})
        self.window.customer.setText("示例客户有限公司")
        self.window.query()
        self.later(self.open_quote)

    def click(self, widget):
        QTest.mouseClick(widget, Qt.MouseButton.LeftButton)

    def wheel(self, widget, delta):
        point = QPointF(widget.rect().center())
        global_point = QPointF(widget.mapToGlobal(point.toPoint()))
        event = QWheelEvent(point, global_point, QPoint(0, 0), QPoint(0, delta),
                            Qt.MouseButton.NoButton, Qt.KeyboardModifier.NoModifier,
                            Qt.ScrollPhase.NoScrollPhase, False)
        QApplication.sendEvent(widget, event)

    def form(self):
        return next(d for d in self.window.dialogs if isinstance(d, BusinessDocumentDialog) and d.isVisible())

    def source_open(self):
        self.source_kind = next(self.source_kinds, None)
        if self.source_kind is None:
            self.report["checks"]["source_forms_preview_pdf_word"] = True
            self.report["status"] = "passed"
            self.write_report()
            self.finished = True
            self.timeout.stop()
            self.window.close()
            return
        if self.source_empty_rows:
            self.source_kind, self.source_count = self.source_kind
        self.click(self.window.document_quote_nav if self.source_kind == "quotation" else self.window.document_contract_nav)
        self.dialog = self.form()
        document = copy.deepcopy(self.source_options["documents"][self.source_kind])
        if self.source_empty_rows:
            document["items"] = [dict(document["items"][0], model=f"QA-{index}") for index in range(self.source_count)]
        self.dialog.apply_data(document)
        buyer = self.dialog.fields["buyer_name"]
        buyer.setFocus()
        buyer.selectAll()
        QTest.keyClicks(buyer, "Desktop-QA")
        assert buyer.text() == "Desktop-QA"
        self.click(self.dialog.preview_button)
        self.later(self.source_preview_ready)

    def source_preview_ready(self):
        preview = self.dialog.preview_dialog
        pages = 2 if self.source_empty_rows and self.source_count > 1 else 1
        assert preview and preview.isVisible() and len(preview.pdf) == pages
        if preview.image_label.pixmap().isNull():
            QTimer.singleShot(50, lambda: self.safe(self.source_preview_ready))
            return
        if self.source_kind == "contract" and (not self.source_empty_rows or self.source_count == 1):
            self.capture(preview, "source-contract-final-desktop.png")
        preview.accept()
        stem = self.source_kind + (f"-rows{self.source_count}" if self.source_empty_rows else "")
        self.source_pdf = self.output/(stem+"-desktop-ui.pdf")
        with patch("ui.business_document_dialog.QFileDialog.getSaveFileName", return_value=(str(self.source_pdf), "PDF")):
            self.click(self.dialog.export_button)
        self.later(self.source_pdf_saved)

    def source_pdf_saved(self):
        assert self.dialog.last_exported == str(self.source_pdf) and self.source_pdf.is_file()
        with pdfplumber.open(self.source_pdf) as pdf:
            pages = 2 if self.source_empty_rows and self.source_count > 1 else 1
            assert len(pdf.pages) == pages and all("Desktop-QA" in page.extract_text() for page in pdf.pages)
            if self.source_empty_rows:
                text = "".join(page.extract_text() for page in pdf.pages)
                assert all(f"QA-{index}" in text for index in range(self.source_count))
                if self.source_kind == "contract":
                    assert len(pdf.pages[-1].extract_tables()[0]) == 5
                    assert "具体交期" in text and "双方协商" in text
        self.source_word = self.source_pdf.with_suffix(".docx")
        with patch("ui.business_document_dialog.QFileDialog.getSaveFileName", return_value=(str(self.source_word), "Word")):
            self.click(self.dialog.export_word_button)
        self.later(self.source_word_saved)

    def source_word_saved(self):
        from zipfile import ZipFile

        assert self.dialog.last_exported == str(self.source_word) and self.source_word.is_file()
        with ZipFile(self.source_word) as docx:
            assert "Desktop-QA" in docx.read("word/document.xml").decode("utf-8")
            if self.source_empty_rows and self.source_kind == "contract":
                from xml.etree import ElementTree

                namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
                tables = ElementTree.fromstring(docx.read("word/document.xml")).findall("w:body/w:tbl", namespace)[::2]
                assert [len(table.findall("w:tr", namespace)) for table in tables] == ([6] if self.source_count == 3 else []) + [5]
        self.report["exports"].append({"kind": self.source_kind, "pdf": str(self.source_pdf), "word": str(self.source_word)})
        if self.source_empty_rows:
            self.click(self.dialog.preview_button)
            self.later(self.source_wheel_ready)
            return
        document = copy.deepcopy(self.source_options["documents"][self.source_kind])
        page_capacity = 1 if self.source_kind == "quotation" else 2
        assert len(document["items"]) == page_capacity
        continuation = copy.deepcopy(document["items"][-1])
        continuation["model"] = "QA-2"
        document["items"].append(continuation)
        self.dialog.apply_data(document)
        self.click(self.dialog.preview_button)
        self.later(self.source_wheel_ready)

    def source_wheel_ready(self):
        preview = self.dialog.preview_dialog
        if self.source_empty_rows and self.source_count == 1:
            assert preview and preview.isVisible() and len(preview.pdf) == 1
            for delta in (-120, 120):
                self.wheel(preview.scroll.viewport(), delta)
                assert preview.page_index == 0
            assert not preview.next.isEnabled() and not preview.previous.isEnabled()
            self.report["checks"][f"{self.source_kind}_single_page_wheel_boundary"] = True
            preview.accept()
            self.dialog.accept()
            self.source_open()
            return
        assert preview and preview.isVisible() and len(preview.pdf) == 2
        self.wheel(preview.scroll.viewport(), -120)
        assert preview.page_index == 1 and preview.page_label.text() == "第2/2页"
        self.wheel(preview.scroll.viewport(), 120)
        assert preview.page_index == 0 and preview.page_label.text() == "第1/2页"
        self.click(preview.next)
        assert preview.page_index == 1 and not preview.next.isEnabled()
        self.click(preview.previous)
        assert preview.page_index == 0 and not preview.previous.isEnabled()
        self.report["checks"][f"{self.source_kind}_viewport_wheel_navigation"] = True
        preview.accept()
        self.dialog.accept()
        self.source_open()

    def open_quote(self):
        assert self.window.model.rowCount() == 1
        self.window.table.selectRow(0)
        self.click(self.window.document_quote_nav)
        self.dialog = self.form()
        assert self.dialog.fields["buyer_name"].text() == "示例客户有限公司"
        assert self.dialog.items()[0]["price"] == "9.734513"
        self.report["checks"]["selected_quote_prefill"] = True
        if self.restart:
            self.click(self.dialog.load_button)
            assert len(self.dialog.items()) == 4
            assert self.dialog.fields["sender"].text() == "业务员"
            self.report["checks"]["quotation_restart_draft"] = True
            self.click(self.dialog.preview_button)
            self.later(self.restart_preview_ready)
            return
        for key, value in (("sender", "业务员"), ("recipient", "采购员"),
                           ("seller_agent", "业务员"), ("seller_phone", "13900000000")):
            self.dialog.fields[key].setText(value)
        self.dialog.tabs.setCurrentIndex(1)
        for model in ("JL-PP", "JL-PA6"):
            self.click(self.dialog.add_item_button)
            row = self.dialog.table.rowCount()-1
            for column, text in enumerate(("工程塑料", model, "12.25", "样例数据")):
                self.dialog.table.item(row, column).setText(text)
        self.export_to("报价单-示例.pdf")
        self.later(self.quote_single_saved)

    def restart_preview_ready(self):
        preview = self.dialog.preview_dialog
        assert preview and preview.isVisible() and len(preview.pdf) == 2
        assert preview.page_label.width() >= preview.page_label.fontMetrics().horizontalAdvance(preview.page_label.text())
        self.report["checks"]["restart_preview_page_label_visible"] = True
        preview.accept()
        self.dialog.accept()
        self.open_contract()

    def export_to(self, filename):
        target = self.output/filename
        with patch("ui.business_document_dialog.QFileDialog.getSaveFileName", return_value=(str(target), "PDF")):
            self.click(self.dialog.export_button)
        self.expected_path = target

    def verify_export(self, pages, required):
        path = self.expected_path
        assert self.dialog.last_exported == str(path) and path.is_file(), self.dialog.notice.text.text()
        with pdfplumber.open(path) as pdf:
            assert len(pdf.pages) == pages
            text = "\n".join(page.extract_text() for page in pdf.pages)
            assert all(value in text for value in required), text
            assert "\ufffd" not in text
        self.report["exports"].append({"path": str(path), "pages": pages,
                                       "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})

    def quote_single_saved(self):
        self.verify_export(1, ("JLGF30", "JL-PP", "JL-PA6", "9.734513", "示例客户有限公司"))
        self.report["checks"]["quotation_three_rows_export"] = True
        self.dialog.table.item(0, 1).setText("过长规格"*100)
        self.click(self.dialog.preview_button)
        self.later(self.overflow_error)

    def overflow_error(self):
        assert not self.dialog.busy and "内容过长" in self.dialog.notice.text.text()
        self.report["checks"]["actual_ui_overflow_error"] = True
        self.dialog.table.item(0, 1).setText("JLGF30")
        self.click(self.dialog.add_item_button)
        for column, text in enumerate(("工程塑料", "JL-FOUR", "11.5", "续页数据")):
            self.dialog.table.item(3, column).setText(text)
        self.click(self.dialog.preview_button)
        self.later(self.quote_preview_ready)

    def quote_preview_ready(self):
        preview = self.dialog.preview_dialog
        assert preview and preview.isVisible() and len(preview.pdf) == 2
        self.wheel(preview.scroll.viewport(), -120)
        assert preview.page_index == 1 and preview.page_label.text() == "第2/2页"
        self.wheel(preview.scroll.viewport(), 120)
        assert preview.page_index == 0 and preview.page_label.text() == "第1/2页"
        self.report["checks"]["quotation_viewport_wheel_navigation"] = True
        self.wheel(preview.image_label, -120)
        assert preview.page_index == 1 and preview.page_label.text() == "第2/2页"
        self.wheel(preview.image_label, 120)
        assert preview.page_index == 0 and preview.page_label.text() == "第1/2页"
        self.click(preview.next)
        assert preview.page_index == 1 and preview.page_label.text() == "第2/2页"
        assert preview.page_label.width() >= preview.page_label.fontMetrics().horizontalAdvance(preview.page_label.text())
        assert not preview.next.isEnabled()
        self.click(preview.previous)
        assert preview.page_index == 0 and not preview.previous.isEnabled()
        preview.accept()
        assert preview.pdf is None
        self.report["checks"]["actual_pdf_preview_and_page_navigation"] = True
        self.export_to("报价单-续页.pdf")
        self.later(self.quote_multi_saved)

    def quote_multi_saved(self):
        self.verify_export(2, ("JLGF30", "JL-FOUR", "2/2"))
        self.report["checks"]["quotation_continuation_export"] = True
        self.dialog.accept()
        self.open_contract()

    def open_contract(self):
        self.click(self.window.document_contract_nav)
        self.dialog = self.form()
        if self.restart:
            self.click(self.dialog.load_button)
            assert len(self.dialog.items()) == 2 and self.dialog.items()[0]["quantity"] == "280"
            assert "3338.16" in self.dialog.total_label.text()
            self.report["checks"]["contract_restart_draft_and_total"] = True
            self.dialog.accept()
            self.finish_documents()
            return
        self.dialog.tabs.setCurrentIndex(1)
        self.dialog.table.item(0, 3).setText("0")
        self.click(self.dialog.preview_button)
        self.later(self.quantity_error)

    def quantity_error(self):
        assert not self.dialog.busy and "必须大于0" in self.dialog.notice.text.text()
        self.report["checks"]["actual_ui_invalid_quantity"] = True
        self.dialog.table.item(0, 3).setText("280")
        assert self.dialog.table.item(0, 5).text() == "2725.66"
        assert "贰仟柒佰贰拾伍元陆角陆分" in self.dialog.total_label.text()
        self.dialog.payment.setCurrentText("月结30天")
        self.export_to("购销合同-示例.pdf")
        self.later(self.contract_single_saved)

    def contract_single_saved(self):
        self.verify_export(1, ("JLGF30", "2725.66", "贰仟柒佰贰拾伍元陆角陆分", "月结30天"))
        self.report["checks"]["contract_decimal_uppercase_export"] = True
        self.click(self.dialog.add_item_button)
        for column, text in enumerate(("工程塑料", "JL-SECOND", "聚隆", "50", "12.25", "", "协商交期")):
            if column != 5:
                self.dialog.table.item(1, column).setText(text)
        assert "3338.16" in self.dialog.total_label.text()
        self.click(self.dialog.preview_button)
        self.later(self.contract_preview_ready)

    def contract_preview_ready(self):
        preview = self.dialog.preview_dialog
        assert preview and preview.isVisible() and len(preview.pdf) == 2
        self.wheel(preview.scroll.viewport(), -120)
        assert preview.page_index == 1 and preview.page_label.text() == "第2/2页"
        self.wheel(preview.scroll.viewport(), 120)
        assert preview.page_index == 0 and preview.page_label.text() == "第1/2页"
        self.report["checks"]["contract_viewport_wheel_navigation"] = True
        self.wheel(preview.image_label, -120)
        assert preview.page_index == 1 and preview.page_label.text() == "第2/2页"
        self.wheel(preview.image_label, 120)
        assert preview.page_index == 0 and preview.page_label.text() == "第1/2页"
        self.wheel(preview.image_label, -120)
        assert preview.page_index == 1
        self.capture(preview, "contract-preview.png")
        preview.accept()
        self.export_to("购销合同-续页.pdf")
        self.later(self.contract_multi_saved)

    def contract_multi_saved(self):
        self.verify_export(2, ("JLGF30", "JL-SECOND", "3338.16", "612.50"))
        self.report["checks"]["contract_continuation_and_whole_total"] = True
        self.dialog.accept()
        self.finish_documents()

    def finish_documents(self):
        store = self.window.context.store
        assert store.list({"customer": "示例客户有限公司"})["items"][0]["price"] == "9.734513"
        first = BusinessDocumentService(self.window.context.folder)
        other = BusinessDocumentService(self.output/"other-owner")
        assert first.load_draft("quotation") and first.load_draft("contract")
        assert other.load_draft("quotation") is None and other.load_draft("contract") is None
        self.report["checks"]["draft_personal_scope_and_quotes_unchanged"] = True
        self.report["checks"]["menu_entries"] = any(action.text() == "单据" for action in self.window.menuBar().actions())
        self.report["restart"] = self.restart
        assert all(self.report["checks"].values())
        self.report["status"] = "passed"
        self.write_report()
        self.finished = True
        self.timeout.stop()
        self.window.close()

    def layout_baseline(self):
        self.report["scenario"] = "layout-fix"
        self.report["phase"] = self.layout_options.get("phase", "all")
        self.quotes_before = self.window.context.store.all()
        self.click(self.window.document_quote_nav)
        self.dialog = self.form()
        self.dialog.fields["buyer_name"].setText("排版验收客户")
        self.dialog.tabs.setCurrentIndex(1)
        for column, text in enumerate(("TPE", "ER6[2175]", "60", "")):
            self.dialog.table.item(0, column).setText(text)
        self.later(self.layout_start)

    def layout_confirm(self, action, title, captions, choice, *, escape=False, capture=False):
        errors = []

        def respond():
            message = QApplication.activeModalWidget()
            try:
                assert isinstance(message, QMessageBox), "未出现实际确认窗口"
                assert message.windowTitle() == title
                actual = {key: message.button(key).text() for key in captions}
                assert actual == captions, actual
                self.report.setdefault("confirmation_labels", {})[title] = list(actual.values())
                if capture:
                    self.capture(message, "关闭提示-中文.png")
                if escape:
                    QTest.keyClick(message, Qt.Key.Key_Escape)
                else:
                    self.click(message.button(choice))
            except Exception:
                errors.append(traceback.format_exc())
                if isinstance(message, QMessageBox):
                    message.reject()

        QTimer.singleShot(40, respond)
        action()
        assert not errors, "\n".join(errors)

    def layout_start(self):
        if self.report["phase"] in ("ui", "all"):
            self.layout_ui()
        if self.report["phase"] == "restart":
            self.layout_supplier_restart()
        elif self.report["phase"] in ("supplier", "all"):
            self.layout_supplier()
        if self.report["phase"] in ("ui", "supplier", "restart"):
            if self.dialog.isVisible():
                self.dialog.accept()
            self.layout_finish()
        else:
            self.layout_pdf()

    def layout_supplier_expected(self):
        return {"seller_name": "南京聚隆科技股份有限公司", "seller_address": "验收地址",
                "seller_representative": "验收代表", "seller_agent": "验收代理",
                "seller_phone": "01000000000", "seller_fax": "01000000001",
                "seller_bank": "验收银行", "seller_account": "0000000000000001"}

    def layout_supplier(self):
        if self.dialog.isVisible():
            self.dialog.accept()
        self.click(self.window.document_contract_nav)
        self.dialog = self.form()
        self.dialog.tabs.setCurrentIndex(2)
        expected = self.layout_supplier_expected()
        for key, value in expected.items():
            self.dialog.fields[key].setText(value)
        self.dialog.fields["buyer_name"].setText("需方不应记住")
        self.click(self.dialog.supplier_button)
        assert self.dialog.service.load_supplier() == expected
        assert "供方信息已保存" in self.dialog.notice.text.text()
        self.report["checks"]["save_supplier_eight_fields_actual_ui_readback"] = True
        self.dialog.accept()
        self.click(self.window.document_quote_nav)
        self.dialog = self.form()
        for key in ("seller_name", "seller_address", "seller_agent", "seller_phone"):
            assert self.dialog.fields[key].text() == expected[key]
        assert self.dialog.fields["buyer_name"].text() != "需方不应记住"
        self.dialog.tabs.setCurrentIndex(2)
        self.dialog.fields["seller_agent"].setText("验收代理（已更新）")
        self.click(self.dialog.supplier_button)
        expected.update(seller_agent="验收代理（已更新）", email="")
        assert self.dialog.service.load_supplier() == expected
        self.report["checks"]["quotation_remembers_supplier_without_erasing_bank_or_account"] = True
        self.dialog.accept()
        self.click(self.window.document_contract_nav)
        self.dialog = self.form()
        self.dialog.tabs.setCurrentIndex(2)
        for key in self.layout_supplier_expected():
            assert self.dialog.fields[key].text() == expected[key]
        assert BusinessDocumentService(self.output/"other-owner").load_supplier() == {}
        self.report["checks"]["new_contract_remembers_supplier_and_other_folder_empty"] = True
        folder = self.dialog.service.folder
        blocker = self.output/"blocked-supplier-folder"
        blocker.write_text("QA: regular file blocks mkdir", encoding="utf-8")
        self.dialog.service.folder = blocker
        self.dialog.fields["seller_bank"].setText("保存失败仍保留")
        try:
            self.click(self.dialog.supplier_button)
            assert self.dialog.isVisible() and self.dialog.fields["seller_bank"].text() == "保存失败仍保留"
            assert "供方信息已保存" not in self.dialog.notice.text.text()
        finally:
            self.dialog.service.folder = folder
        assert self.dialog.service.load_supplier() == expected
        self.report["checks"]["supplier_save_filesystem_error_keeps_previous_profile"] = True
        self.dialog.accept()

    def layout_supplier_restart(self):
        expected = self.layout_supplier_expected()
        expected.update(seller_agent="验收代理（已更新）", email="")
        assert self.dialog.service.load_supplier() == expected
        for key in ("seller_name", "seller_address", "seller_agent", "seller_phone"):
            assert self.dialog.fields[key].text() == expected[key]
        self.dialog.accept()
        self.click(self.window.document_contract_nav)
        self.dialog = self.form()
        for key in self.layout_supplier_expected():
            assert self.dialog.fields[key].text() == expected[key]
        assert self.dialog.fields["seller_account"].text().startswith("0000")
        self.report["checks"]["new_process_supplier_persistence_both_forms"] = True

    def layout_ui(self):
        assert self.dialog.table.horizontalHeaderItem(2).text() == "价格(元/kg) *"
        for column in range(4):
            cell = self.dialog.table.item(0, column)
            assert cell.textAlignment() == Qt.AlignmentFlag.AlignCenter
            caption = self.dialog.table.horizontalHeaderItem(column).text()
            assert self.dialog.table.columnWidth(column) >= self.dialog.table.fontMetrics().horizontalAdvance(caption)+12
        self.capture(self.dialog, "报价录入-居中.png")
        self.report["checks"]["quotation_headers_and_centered_input"] = True
        close = {QMessageBox.StandardButton.Save: "保存草稿", QMessageBox.StandardButton.Discard: "放弃保存",
                 QMessageBox.StandardButton.Cancel: "取消"}
        self.layout_confirm(lambda: self.click(self.dialog.close_button), "关闭单据", close,
                            QMessageBox.StandardButton.Cancel, capture=True)
        assert self.dialog.isVisible() and self.dialog.dirty
        assert self.dialog.service.load_draft("quotation") is None
        self.layout_confirm(lambda: self.click(self.dialog.close_button), "关闭单据", close,
                            QMessageBox.StandardButton.Cancel, escape=True)
        assert self.dialog.isVisible() and self.dialog.dirty
        self.report["checks"]["cancel_and_escape_keep_edits"] = True
        expected = self.dialog.values()
        self.layout_confirm(lambda: self.click(self.dialog.close_button), "关闭单据", close,
                            QMessageBox.StandardButton.Save)
        assert not self.dialog.isVisible() and self.dialog.service.load_draft("quotation") == expected
        self.report["checks"]["save_closes_and_personal_draft_readback"] = True
        self.click(self.window.document_quote_nav)
        self.dialog = self.form()
        self.dialog.fields["sender"].setText("保留当前填写")
        recovery = {QMessageBox.StandardButton.Yes: "恢复草稿", QMessageBox.StandardButton.No: "取消"}
        self.layout_confirm(lambda: self.click(self.dialog.load_button), "恢复草稿", recovery,
                            QMessageBox.StandardButton.No)
        assert self.dialog.fields["sender"].text() == "保留当前填写" and self.dialog.dirty
        self.layout_confirm(lambda: self.click(self.dialog.load_button), "恢复草稿", recovery,
                            QMessageBox.StandardButton.Yes)
        assert self.dialog.values() == expected and not self.dialog.dirty
        self.report["checks"]["chinese_restore_cancel_and_confirm"] = True
        self.dialog.fields["sender"].setText("放弃这次修改")
        self.layout_confirm(lambda: self.click(self.dialog.close_button), "关闭单据", close,
                            QMessageBox.StandardButton.Discard)
        assert not self.dialog.isVisible() and self.dialog.service.load_draft("quotation") == expected
        self.report["checks"]["discard_preserves_saved_draft"] = True
        self.click(self.window.document_quote_nav)
        self.dialog = self.form()
        self.dialog.fields["sender"].setText("保存失败仍保留")
        folder = self.dialog.service.folder
        blocker = self.output/"blocked-draft-folder"
        blocker.write_text("QA: regular file blocks mkdir", encoding="utf-8")
        self.dialog.service.folder = blocker
        try:
            self.layout_confirm(lambda: self.click(self.dialog.close_button), "关闭单据", close,
                                QMessageBox.StandardButton.Save)
            assert self.dialog.isVisible() and self.dialog.dirty
            assert self.dialog.fields["sender"].text() == "保存失败仍保留"
            assert self.dialog.notice.isVisible()
        finally:
            self.dialog.service.folder = folder
        assert self.dialog.service.load_draft("quotation") == expected
        self.report["checks"]["actual_filesystem_failure_keeps_form_and_edits"] = True
        self.dialog.accept()
        self.click(self.window.document_contract_nav)
        self.dialog = self.form()
        self.dialog.fields["buyer_name"].setText("中文提示验收")
        self.layout_confirm(lambda: self.click(self.dialog.close_button), "关闭单据", close,
                            QMessageBox.StandardButton.Cancel)
        assert self.dialog.isVisible()
        self.report["checks"]["contract_close_buttons_chinese"] = True
        self.dialog.accept()

    def layout_pdf(self):
        if not self.dialog.isVisible() or self.dialog.kind != "quotation":
            self.click(self.window.document_quote_nav)
            self.dialog = self.form()
        self.dialog.fields["buyer_name"].setText("排版验收客户")
        self.dialog.tabs.setCurrentIndex(1)
        for column, text in enumerate(("TPE", "ER6[2175]", "60", "")):
            self.dialog.table.item(0, column).setText(text)
        self.click(self.dialog.preview_button)
        self.later(self.layout_preview)

    def layout_preview(self):
        preview = self.dialog.preview_dialog
        assert preview and preview.isVisible() and len(preview.pdf) == 1
        assert preview.page_label.text() == "第1/1页"
        preview.accept()
        self.report["checks"]["actual_repaired_pdf_preview"] = True
        self.export_to("报价单-排版修复.pdf")
        self.later(self.layout_single_saved)

    def layout_text_regions(self):
        with pdfplumber.open(self.expected_path) as pdf:
            for page in pdf.pages:
                assert abs(page.width-595) < 0.001 and abs(page.height-842) < 0.001
                regions = (((332.35, 380, 396.3, 416), "价格(元/kg)"),
                           ((469, 256, 561, 273), "★如不清晰烦请电告"))
                for bounds, expected in regions:
                    chars = sorted(page.crop(bounds).chars, key=lambda c: c["x0"])
                    assert "".join(c["text"] for c in chars) == expected
                    assert all(left["x1"] <= right["x0"]+0.01 for left, right in zip(chars, chars[1:])), expected
                    assert chars[0]["x0"] >= bounds[0] and chars[-1]["x1"] <= bounds[2]

    def layout_single_saved(self):
        self.verify_export(1, ("TPE", "ER6[2175]", "60", "价格(元/kg)", "★如不清晰烦请电告"))
        self.layout_text_regions()
        with pdfplumber.open(self.expected_path) as pdf:
            assert pdf.pages[0].crop((86.65, 417.14, 525.7, 433.09)).extract_text() == "TPE ER6[2175] 60"
        self.report["checks"]["export_matches_input_and_no_header_notice_overlap"] = True
        for index in range(1, 4):
            self.click(self.dialog.add_item_button)
            for column, text in enumerate(("PA66", "续页-"+str(index), "9.734513", "验收备注")):
                self.dialog.table.item(index, column).setText(text)
        self.export_to("报价单-排版修复-续页.pdf")
        self.later(self.layout_multi_saved)

    def layout_multi_saved(self):
        self.verify_export(2, ("ER6[2175]", "续页-3", "9.734513", "2/2"))
        self.layout_text_regions()
        assert len(self.dialog.service.load_draft("quotation")["items"]) == 4
        self.report["checks"]["repaired_headers_on_all_continuation_pages"] = True
        self.dialog.accept()
        self.layout_finish()

    def layout_finish(self):
        assert self.window.context.store.all() == self.quotes_before
        self.report["checks"]["isolated_quote_database_unchanged"] = True
        assert all(self.report["checks"].values())
        self.report["status"] = "passed"
        self.write_report()
        self.finished = True
        self.timeout.stop()
        self.window.close()
