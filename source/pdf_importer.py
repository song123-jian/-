"""Extract selectable-text PDF quotation tables; never run OCR or infer missing prices."""
from __future__ import annotations

import hashlib
import io
import re
import unicodedata

import pdfplumber
from pdfminer.pdfdocument import PDFPasswordIncorrect

from domain import MAX_FILE_BYTES, MAX_ROWS, TAX_TYPES, business_date
from importer import (
    COLOR_SUFFIX,
    COMBINED_FIELDS,
    header_key,
    ignored_headers,
    is_price_header,
    is_total_row,
    map_header,
    mapped_row,
    normalized_options,
    price_rows,
)

MAX_PDF_PAGES = 100
MAX_PDF_CHARACTERS = 2_000_000
TEXT_TABLE_SETTINGS = {"vertical_strategy": "text", "horizontal_strategy": "text",
                       "min_words_vertical": 2, "min_words_horizontal": 1,
                       "text_x_tolerance": 2, "text_y_tolerance": 3}


def cell_text(value, key):
    text = str(value or "").strip()
    if key in ("price", "untaxed_price", "taxed_price", "effective_date"):
        return re.sub(r"\s+", "", text)
    if key not in ("note", "reason", *COMBINED_FIELDS):
        return text.replace("\r", "").replace("\n", "")
    return text


def date_text(value):
    value = re.sub(r"\s+", "", value).replace("年", "-").replace("月", "-").replace("日", "")
    return business_date(value)


def detected_defaults(text):
    defaults = {}
    normalized = unicodedata.normalize("NFKC", text)
    customers = set()
    for customer in re.finditer(r"(?:客户(?:名称)?|收件单位|购方|购买方)(?:\([^\n:]{0,40}\))?\s*[:：]\s*([^\n]+)", normalized):
        value = re.split(r"\s+(?:发件人|日期|联系人|电话|传真)", customer[1])[0].strip()
        if value:
            customers.add(value)
    if len(customers) == 1:
        defaults["customer"] = customers.pop()
    # Only a labelled date is used: validity ranges and footer dates are not substitutes.
    dates = set()
    for date in re.finditer(r"(?:报价日期|更新日期|生效日期|记录日期|日期)(?:\([^\n:]{0,40}\))?\s*[:：]\s*"
                            r"(\d{4}\s*[-/年]\s*\d{1,2}\s*[-/月]\s*\d{1,2}(?:\s*日(?!期))?)", normalized):
        try:
            dates.add(date_text(date[1]))
        except ValueError:
            pass
    if len(dates) == 1:
        defaults["effective_date"] = dates.pop()
    untaxed = bool(re.search(r"(?:不含税|未税|未含税)", normalized))
    taxed = bool(re.search(r"(?<!不)(?<!未)含税", normalized))
    if untaxed != taxed:
        defaults["tax_type"] = "未税" if untaxed else "含税"
    return defaults


def inspect_pdf(content, filename, options=None):
    options, mode = normalized_options(options)
    ignored = ignored_headers(options, mode)
    if not content or len(content) > MAX_FILE_BYTES:
        raise ValueError("导入文件应大于 0 且不超过 20 MB")
    if not content.lstrip().startswith(b"%PDF-"):
        raise ValueError("无法读取 PDF，请选择有效且未加密的文字表格 PDF")
    extracted, errors, warnings, texts, metadata_cells = [], [], [], [], []
    allow_duplicates = mode != "legacy" or bool(options.get("core_only"))
    previous_mapping, previous_width = None, 0
    business_rows = omitted = character_count = table_count = 0
    try:
        with pdfplumber.open(io.BytesIO(content)) as document:
            if document.doc.encryption:
                raise ValueError("PDF 已加密，请先另存为未加密的 PDF")
            if not 0 < len(document.pages) <= MAX_PDF_PAGES:
                raise ValueError(f"PDF 最多支持 {MAX_PDF_PAGES} 页，请拆分导入")
            for page_number, page in enumerate(document.pages, 1):
                try:
                    character_count += len(page.chars)
                    if character_count > MAX_PDF_CHARACTERS:
                        raise ValueError("PDF 文字量过大，请拆分导入")
                    text = page.extract_text(x_tolerance=2, y_tolerance=3) or ""
                    texts.append(text)
                    if not text.strip():
                        if page.images:
                            raise ValueError(f"第{page_number}页没有可提取文字；扫描件请先转换为可选中文字的表格 PDF 或 XLSX")
                        warnings.append(f"第{page_number}页为空白页，未导入报价")
                        continue
                    candidates = page.find_tables()
                    ruled = [(table, table.extract(x_tolerance=2, y_tolerance=3)) for table in candidates]
                    for _, rows in ruled:
                        metadata_cells.extend(str(value) for row in rows for value in row if value)
                    quote_tables = [(table, rows) for table, rows in ruled
                                    if any(is_price_header({header_key(value) for value in row}) for row in rows[:20])]
                    if not quote_tables:
                        candidates = page.find_tables(TEXT_TABLE_SETTINGS)
                        for table in candidates:
                            rows = table.extract(x_tolerance=2, y_tolerance=3)
                            if any(is_price_header({header_key(value) for value in row}) for row in rows[:20]):
                                quote_tables.append((table, rows))
                    if not quote_tables and previous_mapping:
                        # A ruled continuation keeps the previous page's column contract.
                        for table, rows in ruled:
                            if rows and max(map(len, rows)) == previous_width:
                                quote_tables.append((table, rows))
                    if not quote_tables:
                        if any(alias in re.sub(r"\s+", "", text) for alias in ("材料规格", "材料牌号", "牌号", "规格型号")) and any(word in text for word in ("价格", "单价")):
                            raise ValueError(f"第{page_number}页有报价表头但未识别完整表格，请另存为 XLSX 或整理表格列")
                        warnings.append(f"第{page_number}页未识别报价表格，请核对该页是否只有说明文字")
                        continue
                    for table_index, (_, rows) in enumerate(quote_tables, 1):
                        mapping, offset = None, -1
                        if any(len(row) > 128 for row in rows):
                            raise ValueError("PDF 导入区域超过 128 列")
                        for index, header in enumerate(rows[:20]):
                            if is_price_header({header_key(value) for value in header}):
                                mapping, offset = map_header(header, ignored, allow_duplicates), index
                                break
                        mapping = mapping or previous_mapping
                        if not mapping:
                            continue
                        previous_mapping = mapping
                        previous_width = max(map(len, rows))
                        table_count += 1
                        for row_number, values in enumerate(rows[offset + 1:], offset + 2):
                            if not any(str(value or "").strip() for value in values):
                                continue
                            if is_price_header({header_key(value) for value in values}):
                                mapping = map_header(values, ignored, allow_duplicates)
                                previous_mapping = mapping
                                continue
                            if is_total_row(values, mapping):
                                omitted += 1
                                continue
                            business_rows += 1
                            if business_rows > MAX_ROWS:
                                raise ValueError(f"一次最多导入 {MAX_ROWS} 条业务报价")
                            source = {"source_file": filename, "source_sheet": f"PDF第{page_number}页·表{table_index}", "source_row": row_number}
                            try:
                                row = mapped_row(values, mapping, cell_text)
                            except ValueError as exc:
                                errors.append({"row": row_number, "sheet": source["source_sheet"], "message": str(exc)})
                                continue
                            row.update(source)
                            extracted.append(row)
                finally:
                    page.close()
    except PDFPasswordIncorrect:
        raise ValueError("PDF 已加密，请先另存为未加密的 PDF") from None
    except ValueError:
        raise
    except Exception:
        raise ValueError("无法读取 PDF，文件可能已损坏；请另存为未加密的文字表格 PDF") from None
    if not extracted and not errors:
        raise ValueError("未找到 PDF 报价表格：须有牌号/材料规格和价格列；客户及报价日期可在下一步补充")
    return {"rows": extracted, "errors": errors, "defaults": detected_defaults("\n".join(metadata_cells + texts)) if mode == "legacy" else {}, "warnings": warnings,
            "pages": len(texts), "tables": table_count, "omitted": omitted,
            "split_material_color": any(COLOR_SUFFIX.fullmatch(row.get("material") or "") for row in extracted if not row.get("color")),
            "file_sha256": hashlib.sha256(content).hexdigest()}


def read_pdf_prices(content, filename, options=None, *, fallback_date=None):
    use_detected_defaults = options is None
    options, mode = normalized_options(options, fallback_date=fallback_date)
    extracted = inspect_pdf(content, filename, options)
    if use_detected_defaults:
        options.update(extracted["defaults"])
    if options.get("file_sha256") and options["file_sha256"] != extracted["file_sha256"]:
        raise ValueError("PDF 文件已变化，请重新选择并核对共同字段")
    defaults = {}
    for key in ("customer", "effective_date", "tax_type"):
        value = str(options.get(key) or "").strip()
        if value and (key != "customer" or mode == "legacy"):
            defaults[key] = value
    if defaults.get("effective_date"):
        defaults["effective_date"] = date_text(defaults["effective_date"])
    if defaults.get("tax_type") and defaults["tax_type"] not in TAX_TYPES:
        raise ValueError("税口径须为含税、未税或未注明")
    records, errors = [], list(extracted["errors"])
    for raw in extracted["rows"]:
        row = dict(raw)
        for key, value in defaults.items():
            if not row.get(key):
                row[key] = value
        if row.get("effective_date"):
            row["effective_date"] = re.sub(r"\s+", "", row["effective_date"]).replace("年", "-").replace("月", "-").replace("日", "")
        try:
            records.extend(price_rows(row, options))
        except ValueError as exc:
            errors.append({"row": raw["source_row"], "sheet": raw["source_sheet"], "message": str(exc)})
        if len(records) > MAX_ROWS:
            raise ValueError(f"一次最多导入 {MAX_ROWS} 条报价（含税、未税分别计数）")
    return {"records": records, "errors": errors, "omitted": extracted["omitted"],
            "sheet": f"PDF · {extracted['pages']}页 / {extracted['tables']}个报价表", "warnings": extracted["warnings"]}
