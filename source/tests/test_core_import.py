import csv
import io
import zipfile
from xml.sax.saxutils import escape

import pytest
from conftest import record
from pdf_factory import quotation_pdf

from importer import ExcelCellError, map_header, mapped_row, read_prices
from storage.sqlite_store import SQLiteStore


def options(**changes):
    return {"customer_mode": "all", "core_only": True, "effective_date": "2026-10-10", **changes}


def csv_bytes(rows):
    stream = io.StringIO(newline="")
    csv.writer(stream).writerows(rows)
    return stream.getvalue().encode()


def xlsx_bytes(rows):
    stream = io.BytesIO()
    xml_rows = []
    for line, values in enumerate(rows, 1):
        cells = ''.join(f'<c r="{chr(65 + column)}{line}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>'
                        for column, value in enumerate(values) if value is not None)
        xml_rows.append(f'<row r="{line}">{cells}</row>')
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("xl/workbook.xml", '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="价格明细" sheetId="1" r:id="rId1"/></sheets></workbook>')
        archive.writestr("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
        archive.writestr("xl/worksheets/sheet1.xml", '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + ''.join(xml_rows) + '</sheetData></worksheet>')
    return stream.getvalue()


@pytest.mark.parametrize("encoder,extension", [(csv_bytes, "csv"), (xlsx_bytes, "xlsx"),
                                               (lambda rows: quotation_pdf([rows]), "pdf")])
def test_duplicate_tax_columns_merge_and_conflicting_row_blocks(service, context, tmp_path, encoder, extension):
    rows = [["客户", "牌号", "含税价格", "含税价格"],
            ["QA新客户", "QA-1", "12", ""], ["QA新客户", "QA-2", "", "11"],
            ["QA新客户", "QA-3", "14.89", "14.890000"], ["QA新客户", "QA-4", "14.51", "15"]]
    path = tmp_path / f"duplicates.{extension}"
    path.write_bytes(encoder(rows))
    parsed = read_prices(path.read_bytes(), path.name, options())
    assert [(row["grade"], row["price"]) for row in parsed["records"]] == [("QA-1", "12"), ("QA-2", "11"), ("QA-3", "14.89")]
    assert len(parsed["errors"]) == 1
    assert parsed["errors"][0]["row"] == 5 and "第3、4列" in parsed["errors"][0]["message"]
    before = context.store.all()
    preview = service.preview_import(path, context.storage_generation, options())
    assert preview["error_count"] == 1
    with pytest.raises(ValueError, match="错误行"):
        service.commit_import(preview["preview_id"], context.storage_generation)
    assert context.store.all() == before


def test_original_feedback_shape_four_quotes_ignore_blank_duplicate():
    rows = [["客户", "产品名称", "牌号", "含税价格", "含税价格", "更新日期"],
            ["QA客户", "PP-TD20", "PM4BK-S04", "12", None, "46305"],
            ["QA客户", "PP-TD30", "PM6-S01", "11", None, "46306"],
            ["QA客户", "PA6-GF30", "BG6BK", "14.89", None, "46307"],
            ["QA客户", "PA6-GF50", "BG10BK", "14.51", None, "46308"]]
    result = read_prices(xlsx_bytes(rows), "feedback.xlsx", options(effective_date=""))
    assert not result["errors"]
    assert [row["price"] for row in result["records"]] == ["12", "11", "14.89", "14.51"]
    assert [row["effective_date"] for row in result["records"]] == ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"]
    assert {row["tax_type"] for row in result["records"]} == {"含税"}


@pytest.mark.parametrize("header,value,grade,material", [
    ("牌号/产品名称", "QA-BG3 | PA6+GF15", "QA-BG3", "PA6+GF15"),
    ("产品名称/牌号", "PC/ABS\nQA-PC-1", "QA-PC-1", "PC/ABS"),
    ("牌号产品名称", "PM4BK-S04", "PM4BK-S04", ""),
    ("产品名称", "PM4BK-S04", "PM4BK-S04", "PM4BK-S04"),
])
def test_product_grade_combination_preserves_identifier(header, value, grade, material):
    result = read_prices(csv_bytes([["客户名称", header, "价格（含税）"], ["QA客户", value, "12"]]), "combined.csv", options())
    assert not result["errors"]
    row = result["records"][0]
    assert (row["grade"], row["material"], row["tax_type"]) == (grade, material, "含税")


@pytest.mark.parametrize("header,value", [("材料/颜色", "PC/ABS | 黑色"), ("材料颜色", "PC/ABS 黑色"),
                                          ("颜色/材料", "黑色 ; PC/ABS"), ("材料", "PC/ABS 黑色")])
def test_material_color_combination(header, value):
    result = read_prices(csv_bytes([["客户", "牌号", header, "未税"], ["QA客户", "QA-1", value, "10"]]), "colors.csv", options())
    assert not result["errors"]
    row = result["records"][0]
    assert (row["material"], row["color"], row["tax_type"]) == ("PC/ABS", "黑色", "未税")


def test_material_color_header_can_contain_only_color():
    result = read_prices(csv_bytes([["客户", "产品名称", "牌号", "材料颜色", "含税价格"],
                                   ["QA客户", "PC/ABS", "QA-1", "白色", "10"]]), "color-only.csv", options())
    assert not result["errors"]
    row = result["records"][0]
    assert (row["material"], row["color"]) == ("PC/ABS", "白色")


def test_selected_customer_ignores_conflicting_customer_columns_and_ignored_errors():
    result = read_prices(csv_bytes([["客户", "客户名称", "牌号", "含税价格", "备注", "颜色"],
                                   ["其他客户", "另一个客户", "QA-1", "12", "不含税", "白色"]]), "selected.csv",
                         options(customer_mode="selected", selected_customer="QA选中客户"))
    assert not result["errors"]
    row = result["records"][0]
    assert (row["customer"], row["tax_type"], row["color"], row["note"]) == ("QA选中客户", "含税", "白色", "不含税")


def test_duplicate_customer_aliases_merge_only_if_equal():
    content = csv_bytes([["客户", "客户名称", "牌号", "价格", "含税/未税"],
                         ["QA客户", "QA客户", "QA-1", "10", "不含税"],
                         ["QA客户", "其他客户", "QA-2", "10", "含税"]])
    result = read_prices(content, "customers.csv", options())
    assert result["records"][0]["tax_type"] == "未税" and len(result["records"]) == 1
    assert result["errors"][0]["row"] == 3 and "客户" in result["errors"][0]["message"]


def test_duplicate_formula_error_is_not_hidden_by_valid_price():
    mapping = map_header(["含税价格", "含税价格"], allow_duplicates=True)
    with pytest.raises(ValueError, match="缓存"):
        mapped_row(["12", ExcelCellError("formula")], mapping)


def test_combined_field_conflict_with_separate_column_is_an_error():
    content = csv_bytes([["客户", "牌号/产品名称", "牌号", "含税"], ["QA客户", "QA-1 | PP", "QA-2", "10"]])
    result = read_prices(content, "conflict.csv", options())
    assert not result["records"] and "冲突" in result["errors"][0]["message"]


def test_color_selects_exact_existing_identity_and_restart_is_idempotent(service, context, tmp_path):
    white = context.store.add(record(customer="QA已有客户", color="白色"))
    black = context.store.add(record(customer="QA已有客户", color="黑色"))
    path = tmp_path / "color-update.csv"
    path.write_bytes(csv_bytes([["产品名称/牌号", "材料/颜色", "含税价格", "含税价格"],
                               ["PP-TD20 | QA-PP", "PP-TD20 黑色", "12", ""]]))
    scope = options(customer_mode="selected", selected_customer="QA已有客户")
    preview = service.preview_import(path, context.storage_generation, scope)
    assert (preview["updated"], preview["created"], preview["error_count"]) == (1, 0, 0)
    assert preview["samples"][0]["color"] == "黑色"
    service.commit_import(preview["preview_id"], context.storage_generation)
    reopened = SQLiteStore(context.folder)
    assert len(reopened.history(white["id"])["items"]) == 1
    assert len(reopened.history(black["id"])["items"]) == 2
    repeated = service.preview_import(path, context.storage_generation, scope)
    assert (repeated["added"], repeated["skipped"], repeated["error_count"]) == (0, 1, 0)


def test_pdf_combined_fields_share_core_parser():
    content = quotation_pdf([[["客户", "牌号/产品名称", "材料/颜色", "含税", "未税"],
                              ["QA客户", "QA-1 | PC/ABS", "PC/ABS 白色", "12", "10"]]])
    result = read_prices(content, "combined.pdf", options())
    assert not result["errors"] and len(result["records"]) == 2
    assert all((row["grade"], row["material"], row["color"]) == ("QA-1", "PC/ABS", "白色") for row in result["records"])


def test_pdf_empty_product_still_reads_grade_and_price():
    content = quotation_pdf([[["客户", "产品名称", "牌号", "含税价格"], ["QA客户", "", "QA-1", "12"]]])
    result = read_prices(content, "empty-product.pdf", options())
    assert not result["errors"] and len(result["records"]) == 1
    assert (result["records"][0]["material"], result["records"][0]["grade"]) == ("", "QA-1")


@pytest.mark.parametrize("color,allowed", [("黑色", True), ("白色", False)])
def test_material_suffix_and_separate_color_must_agree(color, allowed):
    data = csv_bytes([["客户", "牌号", "材料", "颜色", "含税"], ["QA客户", "QA-1", "PC/ABS 黑色", color, "12"]])
    result = read_prices(data, "explicit-color.csv", options())
    if allowed:
        assert not result["errors"]
        assert (result["records"][0]["material"], result["records"][0]["color"]) == ("PC/ABS", "黑色")
    else:
        assert not result["records"] and "颜色" in result["errors"][0]["message"]
