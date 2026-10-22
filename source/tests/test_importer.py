import csv
import io
import zipfile

import pytest

from importer import read_prices


def csv_data(count, bad_last=False):
    text = io.StringIO(newline="")
    writer = csv.writer(text)
    writer.writerow(["客户", "牌号", "价格", "更新日期"])
    for i in range(count):
        writer.writerow(["QA客户", f"PP-{i}", "错误" if bad_last and i == count - 1 else "9.734513", "2026-10-09"])
        if i % 50 == 0:
            writer.writerow([])
            writer.writerow(["合计", "", "", ""])
    return text.getvalue().encode("utf-8")


def test_exact_business_limit_20000_ignores_blanks_and_totals():
    result = read_prices(csv_data(20000), "boundary.csv")
    assert len(result["records"]) == 20000
    assert result["omitted"] == 400
    assert not result["errors"]


def test_20001_rejected_including_invalid_business_rows():
    for bad in (False, True):
        with pytest.raises(ValueError, match="20000"):
            read_prices(csv_data(20001, bad), "boundary.csv")


def test_synthetic_excel_exact_records_and_materials(qa_workbook):
    path = qa_workbook
    result = read_prices(path.read_bytes(), path.name)
    assert result["sheet"] == "价格明细"
    assert len(result["records"]) == 41
    assert len({row["material"] for row in result["records"]}) == 17
    assert not result["errors"]


@pytest.mark.parametrize("data,filename", [(b"", "empty.csv"), (b"x" * (20 * 1024 * 1024 + 1), "big.csv"), (b"not a zip", "bad.xlsx"), (b"x", "old.xls"), ("客户,客户名称,牌号,价格,日期\n".encode(), "duplicate.csv"), (("," * 129).encode(), "wide.csv")], ids=["empty", "over-20mb", "malformed-xlsx", "legacy-xls", "duplicate-header", "wide-csv"])
def test_file_boundaries_and_malformed_input(data, filename):
    with pytest.raises(ValueError):
        read_prices(data, filename)


def test_gb18030_csv_and_error_line_number():
    text = "客户,牌号,价格,更新日期,备注\n客户甲,PP,9.734513,2026-10-09,不含税\n客户乙,PA,0,2026-10-09,\n"
    result = read_prices(text.encode("gb18030"), "data.csv")
    assert result["records"][0]["tax_type"] == "未税"
    assert result["errors"][0]["row"] == 3


def test_formula_missing_cache_in_text_field_rejected():
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("xl/workbook.xml", '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="价格明细" sheetId="1" r:id="rId1"/></sheets></workbook>')
        archive.writestr("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
        archive.writestr("xl/worksheets/sheet1.xml", '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>客户</t></is></c><c r="B1" t="inlineStr"><is><t>牌号</t></is></c><c r="C1" t="inlineStr"><is><t>价格</t></is></c><c r="D1" t="inlineStr"><is><t>更新日期</t></is></c></row><row r="2"><c r="A2"><f>A3</f></c><c r="B2" t="inlineStr"><is><t>PP</t></is></c><c r="C2"><v>9.734513</v></c><c r="D2" t="inlineStr"><is><t>2026-10-09</t></is></c></row></sheetData></worksheet>')
    result = read_prices(stream.getvalue(), "formula.xlsx")
    assert not result["records"]
    assert "缓存" in result["errors"][0]["message"]


@pytest.mark.parametrize("count,allowed", [(20000, True), (20001, False)], ids=["xlsx-20000", "xlsx-20001"])
def test_xlsx_exact_business_row_boundary(count, allowed):
    stream = io.BytesIO()
    headers = ["客户", "牌号", "价格", "更新日期"]
    xml_rows = ['<row r="1">' + ''.join(f'<c r="{chr(65 + column)}1" t="inlineStr"><is><t>{name}</t></is></c>' for column, name in enumerate(headers)) + '</row>']
    line = 1
    for index in range(count):
        line += 1
        xml_rows.append(f'<row r="{line}"><c r="A{line}" t="inlineStr"><is><t>QA客户</t></is></c><c r="B{line}" t="inlineStr"><is><t>PP-{index}</t></is></c><c r="C{line}"><v>9.734513</v></c><c r="D{line}" t="inlineStr"><is><t>2026-10-09</t></is></c></row>')
        if index % 100 == 0:
            line += 1
            xml_rows.append(f'<row r="{line}"><c r="A{line}" t="inlineStr"><is><t>总计</t></is></c></row>')
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("xl/workbook.xml", '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="价格明细" sheetId="1" r:id="rId1"/></sheets></workbook>')
        archive.writestr("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
        archive.writestr("xl/worksheets/sheet1.xml", '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + ''.join(xml_rows) + '</sheetData></worksheet>')
    if allowed:
        result = read_prices(stream.getvalue(), "boundary.xlsx")
        assert len(result["records"]) == 20000 and not result["errors"]
    else:
        with pytest.raises(ValueError, match="20000"):
            read_prices(stream.getvalue(), "boundary.xlsx")
