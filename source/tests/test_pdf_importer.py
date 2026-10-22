import pytest
from pdf_factory import quotation_pdf

from domain import ValidationError
from importer import read_prices
from pdf_importer import detected_defaults, inspect_pdf


def test_pdf_exact_prices_sources_and_wrapped_cells():
    rows = [["客户", "材料规格", "材料名称", "颜色", "价格（元/kg）", "报价日期", "备注"],
            ["PDF客户", "QA-\nPP", "PP-TD20", "黑色", "9.734513", "2026-09-23", "第一行\n不含税"]]
    result = read_prices(quotation_pdf([rows]), "报价.PDF")
    assert not result["errors"] and len(result["records"]) == 1
    row = result["records"][0]
    assert (row["grade"], row["price"], row["tax_type"]) == ("QA-PP", "9.734513", "未税")
    assert row["note"] == "第一行\n不含税"
    assert (row["source_sheet"], row["source_row"], row["source_file"]) == ("PDF第1页·表1", 2, "报价.PDF")


@pytest.mark.parametrize("repeat_header", [True, False])
def test_multipage_repeated_headers_and_continuations(repeat_header):
    first = [["客户", "牌号", "价格", "报价日期"], ["甲", "PP-1", "10.5", "2026-09-23"]]
    second = ([first[0]] if repeat_header else []) + [["乙", "PP-2", "11.123456", "2026-09-24"]]
    result = read_prices(quotation_pdf([first, second]), "multi.pdf")
    assert not result["errors"]
    assert [row["price"] for row in result["records"]] == ["10.5", "11.123456"]
    assert result["records"][1]["source_sheet"] == "PDF第2页·表1"
    assert result["records"][1]["source_row"] == (2 if repeat_header else 1)


def test_borderless_text_table():
    rows = [["客户", "牌号", "价格", "报价日期"], ["甲", "PP-1", "9.734513", "2026-09-23"],
            ["乙", "PP-2", "10.5", "2026-09-24"]]
    result = read_prices(quotation_pdf([rows], grid=False), "text.pdf")
    assert not result["errors"]
    assert [row["price"] for row in result["records"]] == ["9.734513", "10.5"]


def test_confirmed_defaults_and_color_split_do_not_override_row_values():
    rows = [["材料名称", "材料规格", "价格", "备注"], ["PA6+GF15 黑色", "BG3", "15", ""]]
    content = quotation_pdf([rows], metadata=["客户名称：金华领先塑业有限公司", "日期：2026 年9 月23 日", "本次报价（未税）"])
    inspected = inspect_pdf(content, "quote.pdf")
    assert inspected["defaults"] == {"customer": "金华领先塑业有限公司", "effective_date": "2026-09-23", "tax_type": "未税"}
    result = read_prices(content, "quote.pdf", {**inspected["defaults"], "customer": "金华领先", "split_material_color": True})
    assert not result["errors"]
    row = result["records"][0]
    assert (row["customer"], row["material"], row["color"]) == ("金华领先", "PA6+GF15", "黑色")
    untouched = read_prices(quotation_pdf(), "full.pdf", {"customer": "另一客户", "effective_date": "2000-01-01", "tax_type": "含税"})["records"][0]
    assert (untouched["customer"], untouched["effective_date"], untouched["tax_type"]) == ("PDF隔离客户", "2026-09-23", "未税")


def test_missing_pdf_date_uses_beijing_today(monkeypatch):
    monkeypatch.setattr("importer.today", lambda: "2026-10-10")
    rows = [["牌号", "价格"], ["PP", "9.9"]]
    result = read_prices(quotation_pdf([rows]), "missing.pdf", {"customer": "甲"})
    assert len(result["records"]) == 1 and not result["errors"]
    assert result["records"][0]["effective_date"] == "2026-10-10"
    assert result["records"][0]["source_sheet"] == "PDF第1页·表1"


def test_date_detection_ignores_validity_ranges_and_conflicting_tax():
    assert detected_defaults("备注：2026年8月26日-2026年9月26日\n2026/09/23") == {}
    assert "tax_type" not in detected_defaults("产品A含税\n产品B不含税")
    assert detected_defaults("客户：甲\n客户：乙\n日期：2026-09-23\n日期：2026-09-24") == {}


def test_pdf_errors_block_whole_batch_and_repeat_deduplicates(service, context, tmp_path):
    generation = context.storage_generation
    path = tmp_path / "price.pdf"
    path.write_bytes(quotation_pdf())
    preview = service.preview_import(path, generation)
    assert (preview["added"], preview["skipped"], preview["error_count"]) == (1, 0, 0)
    assert len(context.store.all()) == 41
    saved = service.commit_import(preview["preview_id"], generation)
    assert saved["added"] == 1
    renamed = tmp_path / "renamed.pdf"
    renamed.write_bytes(path.read_bytes())
    repeated = service.preview_import(renamed, generation)
    assert (repeated["added"], repeated["skipped"], repeated["error_count"]) == (0, 1, 0)
    rows = [["客户", "牌号", "价格", "报价日期"], ["甲", "PP", "9.9", "2026-09-23"], ["乙", "PA", "0", "2026-09-23"]]
    path.write_bytes(quotation_pdf([rows]))
    bad = service.preview_import(path, generation)
    assert bad["error_count"] == 1
    assert "PDF第1页" in bad["errors"][0]["sheet"]
    with pytest.raises(ValidationError, match="错误行"):
        service.commit_import(bad["preview_id"], generation)
    assert len(context.store.all()) == 42


def test_changed_pdf_between_inspection_and_preview_rejected(service, context, tmp_path):
    path = tmp_path / "price.pdf"
    path.write_bytes(quotation_pdf())
    inspected = service.inspect_pdf(path, context.storage_generation)
    path.write_bytes(quotation_pdf(metadata=["Updated"]))
    with pytest.raises(ValueError, match="已变化"):
        service.preview_import(path, context.storage_generation, {"file_sha256": inspected["file_sha256"]})


@pytest.mark.parametrize("kind", ["malformed", "encrypted", "scanned", "missing-table"])
def test_unreadable_pdf_has_actionable_error(kind):
    content = {"malformed": b"%PDF-broken", "encrypted": quotation_pdf(encrypt="secret"),
               "scanned": quotation_pdf(image_only=True), "missing-table": quotation_pdf([[]])}[kind]
    with pytest.raises(ValueError, match="PDF|扫描|表格"):
        read_prices(content, "invalid.pdf")


def test_pdf_page_limit(monkeypatch):
    monkeypatch.setattr("pdf_importer.MAX_PDF_PAGES", 1)
    with pytest.raises(ValueError, match="最多支持 1 页"):
        read_prices(quotation_pdf([[["牌号", "价格"], ["PP", "10"]]] * 2), "long.pdf")


def test_pdf_business_row_limit_ignores_totals_and_includes_invalid(monkeypatch):
    monkeypatch.setattr("pdf_importer.MAX_ROWS", 2)
    rows = [["客户", "牌号", "价格", "报价日期"], ["甲", "PP", "9.9", "2026-09-23"],
            ["合计", "", "", ""], ["乙", "PA", "10", "2026-09-23"]]
    result = read_prices(quotation_pdf([rows]), "limit.pdf")
    assert len(result["records"]) == 2 and result["omitted"] == 1
    rows.append(["丙", "PC", "0", "2026-09-23"])
    with pytest.raises(ValueError, match="2 条业务报价"):
        read_prices(quotation_pdf([rows]), "limit.pdf")


def test_pdf_repeated_header_in_same_table_is_not_a_business_row():
    header = ["客户", "牌号", "价格", "报价日期"]
    rows = [header, ["甲", "PP", "9.9", "2026-09-23"], header, ["乙", "PA", "10.5", "2026-09-23"]]
    result = read_prices(quotation_pdf([rows]), "repeated.pdf")
    assert len(result["records"]) == 2 and not result["errors"]
    assert result["records"][1]["source_row"] == 4


def test_pdf_size_and_character_limits(monkeypatch):
    with pytest.raises(ValueError, match="20 MB"):
        read_prices(b"%PDF-" + b"x" * (20 * 1024 * 1024), "huge.pdf")
    monkeypatch.setattr("pdf_importer.MAX_PDF_CHARACTERS", 5)
    with pytest.raises(ValueError, match="文字量过大"):
        read_prices(quotation_pdf(), "text.pdf")


def test_pdf_and_csv_same_business_content_deduplicates(service, context, tmp_path):
    path = tmp_path / "price.pdf"
    path.write_bytes(quotation_pdf())
    generation = context.storage_generation
    preview = service.preview_import(path, generation)
    service.commit_import(preview["preview_id"], generation)
    csv = tmp_path / "same.csv"
    csv.write_text("客户,牌号,材料,颜色,价格,报价日期,税口径,备注\nPDF隔离客户,QA-PP,PP-TD20,黑色,9.734513,2026-09-23,未税,PDF真实文本\n", encoding="utf-8")
    assert service.preview_import(csv, generation)["skipped"] == 1
