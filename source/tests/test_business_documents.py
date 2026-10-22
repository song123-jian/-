"""Verify document amounts, exact pagination, overflow protection and personal drafts."""
from decimal import Decimal

import pdfplumber
import pytest
from PySide6.QtCore import QPoint, QPointF, Qt
from PySide6.QtGui import QWheelEvent
from PySide6.QtWidgets import QApplication

from domain import ValidationError
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
        assert len(pdf.pages[0].images) == 1
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


@pytest.mark.parametrize("kind,count,pages", [("quotation", 4, 2), ("contract", 2, 2)])
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


@pytest.mark.parametrize(("kind", "item_count"), [("quotation", 4), ("contract", 2)])
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


@pytest.mark.parametrize(("kind", "item_count"), [("quotation", 4), ("contract", 2)])
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

    try:
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
