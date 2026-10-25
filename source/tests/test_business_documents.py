"""Verify document amounts, exact pagination, overflow protection and personal drafts."""
import uuid
from decimal import Decimal

import pdfplumber
import pytest
from PySide6.QtCore import QEvent, QPoint, QPointF, Qt
from PySide6.QtGui import QMouseEvent, QWheelEvent
from PySide6.QtWidgets import QApplication

from domain import ConflictError, NetworkError, ValidationError
from services.business_document_service import (
    PAGE_SIZES,
    BusinessDocumentService,
    decimal_value,
    item_amount,
    new_document,
    rmb_upper,
)


def sample(kind):
    data = new_document(kind, customer="示例客户有限公司")
    data["fields"].update(date="2026-10-13", valid_from="2026-10-13", valid_to="2026-11-12")
    data["items"][0].update(name="PA66", model="JLGF30", price="9.734513", quantity="280", note="样例数据")
    return data


class FakeDocumentCloud:
    def __init__(self):
        self.records = {}
        self.online = True
        self.external_revision = False

    @staticmethod
    def _key(record_id):
        return str(uuid.UUID(record_id))

    def _check_online(self):
        if not self.online:
            raise NetworkError("离线")

    def business_document_list(self, kind):
        self._check_online()
        return {"records": [record for record in self.records.values()
                             if record["document"]["kind"] == kind]}

    def business_document_save(self, kind, record_id, revision, title, document):
        self._check_online()
        if record_id is None:
            record_id = str(uuid.uuid4())
            revision = 1
            created_at = updated_at = "2026-10-25T12:00:00+08:00"
        else:
            record_id = self._key(record_id)
            current = self.records.get(record_id)
            if current is None or revision != current["revision"]:
                raise ConflictError("云端制作记录已被其他设备修改")
            revision += 1
            created_at, updated_at = current["created_at"], "2026-10-25T12:01:00+08:00"
        record = {"id": record_id, "title": title, "created_at": created_at,
                  "updated_at": updated_at, "revision": revision, "document": document}
        self.records[record_id] = record
        return record

    def business_document_delete(self, kind, record_id, revision):
        self._check_online()
        record_id = self._key(record_id)
        current = self.records.get(record_id)
        if current is None or revision != current["revision"]:
            raise ConflictError("云端制作记录已被其他设备修改")
        del self.records[record_id]
        return {"deleted": True}


@pytest.mark.parametrize("kind", ["quotation", "contract"])
def test_missing_template_has_actionable_error_and_preserves_export(tmp_path, kind):
    service = BusinessDocumentService(tmp_path, assets=tmp_path / "missing-templates")
    target = tmp_path / "existing.pdf"
    target.write_bytes(b"existing document")
    with pytest.raises(ValidationError, match="模板.*缺失"):
        service.export(sample(kind), target)
    assert target.read_bytes() == b"existing document"


def test_corrupt_template_reports_image_error(tmp_path):
    assets = tmp_path / "templates"
    assets.mkdir()
    for name in ("quotation.png",):
        (assets / name).write_bytes(b"not an image")
    with pytest.raises(ValidationError, match="模板图片.*损坏"):
        BusinessDocumentService(tmp_path, assets=assets).render(sample("quotation"))


def test_private_profile_template_directory_takes_precedence(tmp_path):
    assets = tmp_path / "business_templates"
    assets.mkdir()
    assert BusinessDocumentService(tmp_path).assets == assets


@pytest.mark.parametrize("kind", ["quotation", "contract"])
def test_builtin_document_works_without_private_background_images(tmp_path, kind):
    import io

    service = BusinessDocumentService(tmp_path)
    service.assets = tmp_path / "no-private-images"
    payload = service.render(sample(kind))
    with pdfplumber.open(io.BytesIO(payload)) as pdf:
        assert len(pdf.pages) == 1
        assert len(pdf.pages[0].images) == (3 if kind == "contract" else 1)
        text = pdf.pages[0].extract_text()
        assert "示例客户有限公司" in text and "JLGF30" in text
        if kind == "contract":
            assert "质量要求技术标准" in text


@pytest.mark.parametrize("amount,expected", [
    ("0", "零元整"), ("0.05", "零元伍分"), ("10.05", "壹拾元零伍分"),
    ("1001", "壹仟零壹元整"), ("10001", "壹万零壹元整"),
    ("100100001.01", "壹亿零壹拾万零壹元零壹分"),
    ("2725.66", "贰仟柒佰贰拾伍元陆角陆分"),
])
def test_rmb_financial_zero_gaps(amount, expected):
    assert rmb_upper(Decimal(amount)) == expected


@pytest.mark.parametrize("value", ["-1", "NaN", "Infinity", "1e3", "0.0000001", "1000000000", ""])
def test_numeric_input_rejected(value):
    with pytest.raises(ValidationError):
        decimal_value(value, "价格")


def test_half_up_line_amount_and_unconfirmed_tax():
    assert item_amount({"price": "0.10005", "quantity": "100"}) == Decimal("10.01")
    row = {"customer": "测试客户", "material": "PP", "grade": "A", "price": "9.123456", "tax_type": "未税"}
    assert new_document("quotation", row)["items"][0]["price"] == "9.123456"
    assert new_document("contract", row)["items"][0]["price"] == ""


@pytest.mark.parametrize("kind,count,pages", [("quotation", 2, 2), ("contract", 3, 2)])
def test_exact_template_size_and_continuation(tmp_path, kind, count, pages):
    doc = sample(kind)
    doc["items"] = [{**doc["items"][0], "model": f"PAGE-{index}"} for index in range(count)]
    path = tmp_path / (kind+".pdf")
    BusinessDocumentService(tmp_path).export(doc, path)
    with pdfplumber.open(path) as pdf:
        assert len(pdf.pages) == pages
        for page in pdf.pages:
            assert (page.width, page.height) == pytest.approx(PAGE_SIZES[kind], abs=0.001)
        text = "\n".join(page.extract_text() for page in pdf.pages)
        assert all(f"PAGE-{index}" in text for index in range(count))
        assert "示例客户有限公司" in text and "\ufffd" not in text
        if kind == "contract":
            assert "5451.32" in text and "2725.66" in text


@pytest.mark.parametrize(("kind", "item_count"), [("quotation", 2), ("contract", 3)])
def test_preview_payload_and_export_are_pixel_identical(tmp_path, kind, item_count):
    import pypdfium2 as pdfium
    from PIL import ImageChops

    document = sample(kind)
    document["items"] = [{**document["items"][0], "model": f"QA-{index}"}
                         for index in range(item_count)]
    service = BusinessDocumentService(tmp_path)
    preview_payload = service.render(document)
    target = tmp_path / f"{kind}.pdf"
    service.export(document, target)

    with pdfium.PdfDocument(preview_payload) as preview, pdfium.PdfDocument(target) as exported:
        assert len(preview) == len(exported)
        for index in range(len(preview)):
            preview_page = preview[index]
            exported_page = exported[index]
            try:
                assert preview_page.get_size() == pytest.approx(exported_page.get_size(), abs=0.001)
                preview_image = preview_page.render(scale=1).to_pil().convert("RGB")
                exported_image = exported_page.render(scale=1).to_pil().convert("RGB")
                assert ImageChops.difference(preview_image, exported_image).getbbox() is None
            finally:
                preview_page.close()
                exported_page.close()


def test_overlong_field_preserves_existing_file(tmp_path):
    doc = sample("quotation")
    doc["items"][0]["model"] = "过长规格" * 100
    path = tmp_path / "existing.pdf"
    path.write_bytes(b"existing content")
    with pytest.raises(ValidationError, match="内容过长"):
        BusinessDocumentService(tmp_path).export(doc, path)
    assert path.read_bytes() == b"existing content"


def test_private_incomplete_drafts_and_corruption_preserved(tmp_path):
    first = BusinessDocumentService(tmp_path/"owner1")
    second = BusinessDocumentService(tmp_path/"owner2")
    doc = new_document("quotation")
    doc["fields"]["buyer_name"] = "仅属于账号一"
    path = first.save_draft(doc)
    assert first.load_draft("quotation")["fields"]["buyer_name"] == "仅属于账号一"
    assert second.load_draft("quotation") is None
    assert not first.load_draft("contract")
    corrupt = first.folder / "quotation.json"
    corrupt.write_text("{invalid json", encoding="utf-8")
    with pytest.raises(ValidationError, match="已损坏"):
        first.load_draft("quotation")
    assert corrupt.read_text(encoding="utf-8") == "{invalid json"
    assert path.endswith("quotation.json")


@pytest.mark.parametrize("kind", ["quotation", "contract"])
def test_document_records_create_update_delete_and_account_scope(tmp_path, kind):
    owner = BusinessDocumentService(tmp_path / "owner")
    other = BusinessDocumentService(tmp_path / "other")
    document = sample(kind)
    document["fields"]["buyer_name"] = "记录客户"

    record = owner.save_record(document)
    assert len(record["id"]) == 32
    assert owner.load_records(kind)[0]["document"]["fields"]["buyer_name"] == "记录客户"
    assert owner.load_records("contract" if kind == "quotation" else "quotation") == []
    assert other.load_records(kind) == []

    document["fields"]["buyer_name"] = "手动修改后的客户"
    updated = owner.save_record(document, record["id"])
    assert updated["id"] == record["id"]
    assert len(owner.load_records(kind)) == 1
    assert owner.load_records(kind)[0]["document"]["fields"]["buyer_name"] == "手动修改后的客户"

    assert owner.delete_record(kind, record["id"])
    assert owner.load_records(kind) == []
    assert not owner.delete_record(kind, record["id"])


def test_document_record_saves_offline_then_uploads_after_network_recovers(tmp_path):
    cloud = FakeDocumentCloud()
    cloud.online = False
    service = BusinessDocumentService(tmp_path, cloud_store=cloud)

    record = service.save_record(sample("quotation"))
    assert record["sync_status"] == "pending"
    assert service._load_pending("quotation")[0]["operation"] == "save"

    offline = service.sync_pending("quotation")
    assert offline["online"] is False and offline["pending"] == 1
    cloud.online = True
    synced = service.sync_pending("quotation")
    assert synced["synced"] == 1 and synced["pending"] == 0
    assert service._load_pending("quotation") == []
    cached = service.load_records("quotation")
    assert FakeDocumentCloud._key(cached[0]["id"]) in cloud.records and "sync_status" not in cached[0]


def test_document_record_conflict_keeps_local_copy_and_pending_operation(tmp_path):
    cloud = FakeDocumentCloud()
    service = BusinessDocumentService(tmp_path, cloud_store=cloud)
    service.save_record(sample("contract"))
    service.sync_pending("contract")
    synced = service.load_records("contract")[0]

    edited = sample("contract")
    edited["fields"]["buyer_name"] = "本地编辑版本"
    service.save_record(edited, synced["id"])
    cloud.records[FakeDocumentCloud._key(synced["id"])]["revision"] = 2
    result = service.sync_pending("contract")

    assert result["conflicts"] == 1
    cached = service.load_records("contract")[0]
    assert cached["sync_status"] == "conflict"
    assert cached["document"]["fields"]["buyer_name"] == "本地编辑版本"
    assert service._load_pending("contract")[0]["status"] == "conflict"


def test_document_record_delete_offline_then_syncs(tmp_path):
    cloud = FakeDocumentCloud()
    service = BusinessDocumentService(tmp_path, cloud_store=cloud)
    record = service.save_record(sample("quotation"))
    service.sync_pending("quotation")
    record = service.load_records("quotation")[0]
    cloud.online = False
    assert service.delete_record("quotation", record["id"])
    assert service.load_records("quotation") == []
    assert service._load_pending("quotation")[0]["operation"] == "delete"
    cloud.online = True
    result = service.sync_pending("quotation")
    assert result["synced"] == 1 and FakeDocumentCloud._key(record["id"]) not in cloud.records


def test_document_record_sync_all_pulls_remote_and_refreshes_other_device(tmp_path):
    cloud = FakeDocumentCloud()
    first_device = BusinessDocumentService(tmp_path / "first-device", cloud_store=cloud)
    first_device.save_record(sample("quotation"))
    first_device.sync_all()

    second_device = BusinessDocumentService(tmp_path / "second-device", cloud_store=cloud)
    pulled = second_device.sync_all()
    assert pulled["online"] is True
    second_record = second_device.load_records("quotation")[0]
    assert second_record["id"] == first_device.load_records("quotation")[0]["id"]
    assert second_record["document"]["fields"]["buyer_name"] == "示例客户有限公司"

    edited = sample("quotation")
    edited["fields"]["buyer_name"] = "另一台设备修改"
    second_device.save_record(edited, second_record["id"])
    second_device.sync_all()

    refreshed = first_device.sync_all()
    assert refreshed["online"] is True
    assert first_device.load_records("quotation")[0]["document"]["fields"]["buyer_name"] == "另一台设备修改"


def test_document_dialog_account_mode_queues_local_save_and_shows_sync_state(qtbot, tmp_path):
    from services.app_context import AppContext
    from ui.business_document_dialog import BusinessDocumentDialog
    from ui.workers import TaskManager

    cloud = FakeDocumentCloud()
    cloud.online = False
    context = AppContext(cloud, tmp_path)
    context.account = {"id": "account", "username": "song123"}
    dialog = BusinessDocumentDialog(context, TaskManager(context), "quotation")
    qtbot.addWidget(dialog)
    dialog.fields["buyer_name"].setText("离线客户")

    assert dialog.save_record()
    assert dialog.service.cloud_store is cloud
    assert dialog.records_by_id[dialog.current_record_id]["sync_status"] == "pending"
    assert "待同步" in dialog.record_status.text()
    dialog.accept()


@pytest.mark.parametrize("kind", ["quotation", "contract"])
def test_document_dialog_records_double_click_load_and_manual_edit(qtbot, tmp_path, kind):
    from services.app_context import AppContext
    from services.business_document_service import BusinessDocumentService
    from ui.business_document_dialog import BusinessDocumentDialog
    from ui.workers import TaskManager

    context = AppContext(object(), tmp_path)
    dialog = BusinessDocumentDialog(context, TaskManager(context), kind)
    qtbot.addWidget(dialog)
    dialog.show()

    dialog.fields["buyer_name"].setText("第一条记录")
    assert dialog.save_record()
    assert dialog.records_table.rowCount() == 1

    dialog.new_record()
    dialog.fields["buyer_name"].setText("第二条记录")
    assert dialog.save_record()
    assert dialog.records_table.rowCount() == 2

    first_item = dialog.records_table.item(1, 0)
    dialog.records_table.itemDoubleClicked.emit(first_item)
    assert dialog.fields["buyer_name"].text() == "第一条记录"
    dialog.fields["buyer_name"].setText("第一条记录·已修改")
    assert dialog.save_record()

    records = BusinessDocumentService(tmp_path).load_records(kind)
    assert len(records) == 2
    assert any(item["document"]["fields"]["buyer_name"] == "第一条记录·已修改" for item in records)
    dialog.accept()


@pytest.mark.parametrize("kind", ["quotation", "contract"])
def test_document_records_blank_double_click_starts_new_record(qtbot, tmp_path, kind):
    from services.app_context import AppContext
    from ui.business_document_dialog import BusinessDocumentDialog
    from ui.workers import TaskManager

    context = AppContext(object(), tmp_path)
    dialog = BusinessDocumentDialog(context, TaskManager(context), kind)
    qtbot.addWidget(dialog)
    dialog.show()
    dialog.fields["buyer_name"].setText("已有记录")
    assert dialog.save_record()
    qtbot.wait(20)

    viewport = dialog.records_table.viewport()
    point = QPoint(max(1, viewport.width() - 5), max(1, viewport.height() - 5))
    assert not dialog.records_table.indexAt(point).isValid()
    event = QMouseEvent(QEvent.Type.MouseButtonDblClick, QPointF(point),
                        QPointF(viewport.mapToGlobal(point)), Qt.MouseButton.LeftButton,
                        Qt.MouseButton.LeftButton, Qt.KeyboardModifier.NoModifier)
    assert dialog.eventFilter(viewport, event)
    assert dialog.current_record_id is None
    assert dialog.dirty
    dialog.accept()


def test_invalid_draft_date_does_not_partially_change_form(qtbot, tmp_path):
    from services.app_context import AppContext
    from ui.business_document_dialog import BusinessDocumentDialog
    from ui.workers import TaskManager

    context = AppContext(object(), tmp_path)
    dialog = BusinessDocumentDialog(context, TaskManager(context), "quotation")
    qtbot.addWidget(dialog)
    before = dialog.values()
    corrupt = sample("quotation")
    corrupt["fields"]["date"] = "invalid date"
    with pytest.raises(ValidationError, match="日期无效"):
        dialog.apply_data(corrupt)
    assert dialog.values() == before


@pytest.mark.parametrize(("kind", "item_count"), [("quotation", 2), ("contract", 3)])
def test_pdf_preview_wheel_moves_between_pages_and_stops_at_boundaries(qtbot, tmp_path, kind, item_count):
    from ui.business_document_dialog import DocumentPreviewDialog

    document = sample(kind)
    document["items"] = [{**document["items"][0], "model": f"QA-{index}"}
                         for index in range(item_count)]
    payload = BusinessDocumentService(tmp_path).render(document)

    dialog = DocumentPreviewDialog(payload)
    qtbot.addWidget(dialog)
    dialog.show()
    dialog.draw_page()
    assert dialog.page_label.text() == "第1/2页"

    def wheel(delta):
        point = QPointF(dialog.image_label.rect().center())
        global_point = QPointF(dialog.image_label.mapToGlobal(point.toPoint()))
        event = QWheelEvent(point, global_point, QPoint(0, 0), QPoint(0, delta),
                            Qt.MouseButton.NoButton, Qt.KeyboardModifier.NoModifier,
                            Qt.ScrollPhase.NoScrollPhase, False)
        QApplication.sendEvent(dialog.image_label, event)

    def viewport_wheel(delta):
        viewport = dialog.scroll.viewport()
        point = QPointF(viewport.rect().center())
        global_point = QPointF(viewport.mapToGlobal(point.toPoint()))
        event = QWheelEvent(point, global_point, QPoint(0, 0), QPoint(0, delta),
                            Qt.MouseButton.NoButton, Qt.KeyboardModifier.NoModifier,
                            Qt.ScrollPhase.NoScrollPhase, False)
        QApplication.sendEvent(viewport, event)

    try:
        viewport_wheel(-120)
        assert dialog.page_index == 1
        viewport_wheel(120)
        assert dialog.page_index == 0
        wheel(120)
        assert dialog.page_index == 0
        wheel(-60)
        assert dialog.page_index == 0
        wheel(-60)
        assert dialog.page_index == 1
        wheel(-120)
        assert dialog.page_index == 1
        wheel(-120)
        assert dialog.page_index == 1
        wheel(120)
        assert dialog.page_index == 0
    finally:
        dialog.accept()
