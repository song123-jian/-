"""Exercise the retained templates, editable fields and invariant package parts."""

import hashlib
import io
import json
from zipfile import ZipFile

import pdfplumber
import pypdfium2 as pdfium
import pytest
from PIL import ImageChops

from domain import ASSETS, ValidationError
from services.business_document_service import BusinessDocumentService, new_document
from services.source_document_renderer import SourceDocumentRenderer

TEMPLATES = ASSETS / "business_templates"


def reference_document(kind):
    layout = json.loads((TEMPLATES / "source-layout.json").read_text(encoding="utf-8"))["kinds"][kind]
    document = new_document(kind)
    document["items"] = [{} for _ in range(layout["per_page"])]
    for slot in layout["slots"]:
        for edit in slot["edits"]:
            key = edit["key"]
            value = slot["source"][edit["start"] : edit["end"]]
            if key in document["fields"]:
                document["fields"][key] = value
            elif key.startswith("term_"):
                document["terms"][key[5:]] = value
            elif key.startswith("item"):
                number, field = key[4:].split("_", 1)
                if field != "amount":
                    document["items"][int(number)][field] = value
            elif key == "date_slash":
                document["fields"]["date"] = "-".join(f"{int(part):02}" for part in value.split("/"))
            elif key == "delivery":
                for item in document["items"]:
                    item["delivery"] = value
    document["fields"].update(valid_from="2026-10-23", valid_to="2026-11-22")
    return document


@pytest.mark.parametrize("kind", ["quotation", "contract"])
def test_same_business_values_return_exact_source_files(tmp_path, kind):
    document = reference_document(kind)
    service = BusinessDocumentService(tmp_path)
    assert service.render(document) == (TEMPLATES / f"source-{kind}.pdf").read_bytes()
    word = tmp_path / f"{kind}.docx"
    service.export_word(document, word)
    assert word.read_bytes() == (TEMPLATES / f"source-{kind}.docx").read_bytes()


@pytest.mark.parametrize("kind", ["quotation", "contract"])
def test_changed_fields_keep_all_unedited_word_parts_and_pdf_images(tmp_path, kind):
    document = reference_document(kind)
    old_buyer = document["fields"]["buyer_name"]
    document["fields"].update(buyer_name="验收客户有限公司", date="2026-10-24")
    service = BusinessDocumentService(tmp_path)
    target = tmp_path / f"{kind}.docx"
    service.export_word(document, target)
    with ZipFile(target) as output, ZipFile(TEMPLATES / f"source-{kind}.docx") as source:
        assert output.namelist() == source.namelist()
        for name in source.namelist():
            if name != "word/document.xml":
                assert output.read(name) == source.read(name), name
        assert "验收客户有限公司" in output.read("word/document.xml").decode("utf-8")
        assert old_buyer not in output.read("word/document.xml").decode("utf-8")
    payload = service.render(document)
    with pdfplumber.open(io.BytesIO(payload)) as pdf:
        text = pdf.pages[0].extract_text()
        assert "验收客户有限公司" in text and old_buyer not in text
        assert "请核对单据信息后使用" not in text
        assert len(pdf.pages) == 1
    from pypdf import PdfReader

    def images(data):
        page = PdfReader(io.BytesIO(data)).pages[0]
        return sorted(hashlib.sha256(image.data).hexdigest() for image in page.images)

    assert images(payload) == images((TEMPLATES / f"source-{kind}.pdf").read_bytes())


@pytest.mark.parametrize("kind", ["quotation", "contract"])
def test_only_changed_field_area_moves_and_preview_matches_export(tmp_path, kind):
    document = reference_document(kind)
    document["fields"]["date"] = "2026-10-24"
    service = BusinessDocumentService(tmp_path)
    preview = service.render(document)
    target = tmp_path / f"{kind}.pdf"
    service.export(document, target)
    with pdfium.PdfDocument(preview) as a, pdfium.PdfDocument(target) as b:
        assert ImageChops.difference(a[0].render(scale=2).to_pil(), b[0].render(scale=2).to_pil()).getbbox() is None
    source = SourceDocumentRenderer(TEMPLATES, kind)
    with pdfium.PdfDocument(source.reference) as before, pdfium.PdfDocument(preview) as after:
        first = before[0].render(scale=2).to_pil().convert("RGB")
        second = after[0].render(scale=2).to_pil().convert("RGB")
        # The bottom-left seal and all static furniture lie outside date slots.
        delta = ImageChops.difference(first, second)
        for slot in source.layout["slots"]:
            for edit in slot["edits"]:
                if edit["key"] in ("date", "date_cn", "date_slash"):
                    box = edit["pdf"]["source_bounds"]
                    x0 = min(box[0], edit["pdf"]["x"])
                    x1 = max(box[2], edit["pdf"]["x"] + edit["pdf"]["width"])
                    from PIL import ImageDraw

                    ImageDraw.Draw(delta).rectangle(
                        (int(x0 * 2) - 5, int(box[1] * 2) - 5, int(x1 * 2) + 5, int(box[3] * 2) + 5), fill=0
                    )
        assert delta.getbbox() is None


@pytest.mark.parametrize("kind", ["quotation", "contract"])
def test_overflow_preserves_both_existing_targets(tmp_path, kind):
    document = reference_document(kind)
    document["items"][0]["model"] = "超长规格" * 100
    service = BusinessDocumentService(tmp_path)
    for extension, export in (("pdf", service.export), ("docx", service.export_word)):
        target = tmp_path / ("existing." + extension)
        target.write_bytes(b"keep existing file")
        with pytest.raises(ValidationError, match="内容过长"):
            export(document, target)
        assert target.read_bytes() == b"keep existing file"


def test_mixed_date_keeps_all_unchanged_source_glyphs(tmp_path):
    document = reference_document("quotation")
    document["fields"]["date"] = "2026-10-24"
    renderer = SourceDocumentRenderer(TEMPLATES, "quotation")
    changes = renderer.changes(renderer.pages(document)[0])
    date_changes = [edit for edit, _ in changes if edit["key"] == "date_cn"]
    assert len(date_changes) == 1 and len(date_changes[0]["pdf"]["ops"]) == 1
    payload = BusinessDocumentService(tmp_path).render(document)
    with pdfplumber.open(io.BytesIO(payload)) as pdf:
        # A rewritten price must not leave text rendering mode 2 active on the next field.
        assert "2026" in pdf.pages[0].extract_text()


def test_contract_model_keeps_source_left_indent_when_its_length_changes(tmp_path):
    document = reference_document("contract")
    document["items"][0]["model"] = "QA-1"
    payload = BusinessDocumentService(tmp_path).render(document)
    with pdfplumber.open(io.BytesIO(payload)) as pdf:
        letters = [c for c in pdf.pages[0].chars if c["text"] == "Q" and abs(c["matrix"][5] - 609.941) < 0.01]
        assert len(letters) == 1
        assert letters[0]["x0"] == pytest.approx(130.32, abs=0.002)


@pytest.mark.parametrize(
    "date_value,month,day,day_x",
    [("2026-09-01", "9", "1", 524.519), ("2026-09-23", "9", "23", 531.0), ("2026-10-01", "10", "1", 531.0)],
)
def test_short_dates_keep_native_spacing_and_word_run_styles(tmp_path, date_value, month, day, day_x):
    from xml.etree import ElementTree

    document = reference_document("quotation")
    document["fields"]["date"] = date_value
    service = BusinessDocumentService(tmp_path)
    payload = service.render(document)
    with pdfplumber.open(io.BytesIO(payload)) as pdf:
        day_glyph = [c for c in pdf.pages[0].chars if c["text"] == "日" and 120 < c["top"] < 137 and c["x0"] > 448]
        assert len(day_glyph) == 1
        assert day_glyph[0]["x0"] == pytest.approx(day_x, abs=0.002)
        assert day_glyph[0]["size"] == 12
    target = tmp_path / "date.docx"
    service.export_word(document, target)
    with ZipFile(target) as package:
        nodes = list(ElementTree.fromstring(package.read("word/document.xml")).iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"))
    assert [node.text for node in nodes[6:13]] == ["日期(Date)：202", "6", "年", month, "月", day, "日"]


@pytest.mark.parametrize("kind,count,pages", [("quotation", 2, 2), ("contract", 3, 2)])
def test_continuation_uses_original_row_capacity(tmp_path, kind, count, pages):
    document = reference_document(kind)
    document["items"] = [{**document["items"][0], "model": f"QA-{index}"} for index in range(count)]
    service = BusinessDocumentService(tmp_path)
    with pdfplumber.open(io.BytesIO(service.render(document))) as pdf:
        assert len(pdf.pages) == pages
        text = "".join(page.extract_text() for page in pdf.pages)
        assert all(f"QA-{index}" in text for index in range(count))
    word = tmp_path / f"{kind}-continuation.docx"
    service.export_word(document, word)
    with ZipFile(word) as package:
        from xml.etree import ElementTree

        ElementTree.fromstring(package.read("word/document.xml"))


@pytest.mark.parametrize("count", [1, 3])
def test_contract_last_page_has_no_unused_product_row(tmp_path, count):
    from xml.etree import ElementTree

    document = reference_document("contract")
    document["items"] = [{**document["items"][0], "model": f"QA-{index}"} for index in range(count)]
    service = BusinessDocumentService(tmp_path)
    word = tmp_path / "compact-contract.docx"
    service.export_word(document, word)
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    with ZipFile(word) as package:
        root = ElementTree.fromstring(package.read("word/document.xml"))
        tables = root.findall("w:body/w:tbl", namespace)[::2]
        assert [len(table.findall("w:tr", namespace)) for table in tables] == ([6] if count == 3 else []) + [5]
        first = tables[-1].findall("w:tr", namespace)[2]
        assert "具体交期双方协商" in "".join(first.itertext())
        assert "合计" not in "".join(first.itertext())
        with ZipFile(TEMPLATES / "source-contract.docx") as original:
            for name in original.namelist():
                if name != "word/document.xml":
                    assert original.read(name) == package.read(name), name
    with pdfplumber.open(io.BytesIO(service.render(document))) as pdf:
        table = pdf.pages[-1].extract_tables()[0]
        assert len(table) == 5
        assert "具体交期" in "".join(cell or "" for row in table for cell in row)
        assert "双方协商" in "".join(cell or "" for row in table for cell in row)


@pytest.mark.parametrize("delivery", ["现货", ""])
def test_single_contract_short_delivery_uses_one_product_row(tmp_path, delivery):
    document = reference_document("contract")
    document["items"] = [{**document["items"][0], "delivery": delivery}]
    with pdfplumber.open(io.BytesIO(BusinessDocumentService(tmp_path).render(document))) as pdf:
        table = pdf.pages[0].extract_tables()[0]
        assert len(table) == 5
        text = "".join(cell or "" for row in table for cell in row)
        assert "1737.50" in text and "合计" in text
        assert delivery in text
