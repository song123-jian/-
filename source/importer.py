"""Read price rows from XLSX, CSV, or selectable-text PDF tables."""
from __future__ import annotations

import csv
import io
import posixpath
import re
import zipfile
from xml.etree import ElementTree as ET

from domain import MAX_FILE_BYTES, MAX_ROWS, business_date, clean, money, norm, today, validate_record

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

ALIASES = {
    "row_label": ("序号", "编号"),
    "customer": ("客户", "客户名称"),
    # The existing database calls this field material.  Product/material-name
    # headers are normalized to that field without changing the schema.
    "material": ("产品名称", "产品名", "物料名称", "材料名称", "材料类别", "材料", "类别"),
    "grade": ("牌号", "材料牌号", "型号"),
    "material_spec": ("材料规格", "规格型号", "规格", "材质规格"),
    "color": ("颜色", "产品颜色", "色号"),
    "grade_product": ("牌号/产品名称", "牌号产品名称", "牌号/产品名", "牌号（产品名称）"),
    "product_grade": ("产品名称/牌号", "产品名称牌号", "产品名称（牌号）"),
    "material_color": ("材料/颜色", "材料颜色", "材料及颜色", "材料和颜色"),
    "color_material": ("颜色/材料", "颜色材料"),
    "untaxed_price": ("未税价格", "未税单价", "不含税价格", "不含税单价", "价格未税", "单价未税", "未税", "不含税", "未税价", "不含税价"),
    "taxed_price": ("含税价格", "含税单价", "价格含税", "单价含税", "税后价格", "税后单价", "含税", "含税价"),
    "price": ("价格(元/kg)", "价格（元/kg）", "单价(元/kg)", "单价", "价格", "当前价格(元/kg)", "当前价格"),
    "effective_date": ("记录日期", "更新日期", "价格更新日期", "生效日期", "报价日期"),
    "note": ("备注",), "tax_type": ("税口径", "含税状态", "含税/未税", "含税未税", "是否含税", "税别"), "reason": ("调价原因",),
}
HEADERS = {re.sub(r"\s+", "", norm(v)): k for k, names in ALIASES.items() for v in names}
PRICE_KEYS = ("untaxed_price", "taxed_price", "price")
COMBINED_FIELDS = {"grade_product": ("grade", "material"), "product_grade": ("material", "grade"),
                   "material_color": ("material", "color"), "color_material": ("color", "material")}
CORE_FIELDS = {"material", "grade", "material_spec", "color", *PRICE_KEYS, *COMBINED_FIELDS}
SPEC_PREFIX = "材料规格："
COLOR_NAME = r"黑色|白色|本色|透明|黑|白|松露蓝|燕麦灰|桃桃粉|[\u4e00-\u9fff]{1,8}[色灰蓝绿红粉黄紫橙]"
COLOR_SUFFIX = re.compile(r"^(.+?)\s+(" + COLOR_NAME + r")$")


class ExcelCellError(str):
    """Keep formula failures distinguishable from ordinary user text."""


def header_key(value):
    if len(str(value or "")) > 250:
        return None
    text = re.sub(r"\s+", "", norm(value))
    # Units often wrap onto a second line in purchase orders.
    text = re.sub(r"\((?:元|RMB|CNY)(?:/(?:KG|公斤|千克))?\)$", "", text)
    return HEADERS.get(text) or HEADERS.get(re.sub(r"[()]", "", text))


def map_header(values, ignored=(), allow_duplicates=False):
    """Keep every recognized column so duplicate values can be checked per row."""
    mapping = {}
    for col, value in enumerate(values):
        key = header_key(value)
        if key and key not in ignored:
            if key in mapping and not allow_duplicates:
                raise ValueError(f"表头重复：{key}")
            mapping[key] = (*mapping.get(key, ()), col)
    return mapping


def _has_value(value):
    return value is not None and str(value).strip() != ""


def tax_text(value):
    text = clean(value, 20)
    return {"不含税": "未税", "未含税": "未税", "未税": "未税", "含税": "含税"}.get(norm(text), text)


def merged_value(key, values, location=""):
    present = [value for value in values if _has_value(value)]
    if any(isinstance(value, ExcelCellError) for value in values):
        raise ValueError("单元格报错或公式缺少缓存值，请在 Excel 计算并保存后重试")
    if not present:
        return None
    if len(present) > 1:
        compare = money if key in PRICE_KEYS else tax_text if key == "tax_type" else norm
        if len({compare(value) for value in present}) > 1:
            label = ALIASES[key][0]
            raise ValueError(f"{label}{location}内容冲突，请核对后重新预览")
    return present[0]


def mapped_row(values, mapping, transform=None):
    row = {}
    for key, columns in mapping.items():
        cells = [values[column] if column < len(values) else None for column in columns]
        if transform:
            cells = [transform(value, key) for value in cells]
        location = "（第" + "、".join(str(column + 1) for column in columns) + "列）"
        row[key] = merged_value(key, cells, location)
    return row


def expand_combined_fields(row):
    for key, fields in COMBINED_FIELDS.items():
        value = row.pop(key, None)
        if not _has_value(value):
            continue
        text = clean(value, 1000)
        if key in ("material_color", "color_material") and re.fullmatch(COLOR_NAME, text):
            row["color"] = merged_value("color", (row.get("color"), text))
            continue
        parts = re.split(r"\r?\n|[|;；]|[ \t]+/[ \t]+", text)
        if len(parts) == 1 and key in ("material_color", "color_material"):
            match = COLOR_SUFFIX.fullmatch(re.sub(r"\s+", " ", text))
            if match:
                parts = list(match.groups())
                if key == "color_material":
                    parts.reverse()
        if len(parts) == 1:
            # An undivided product/grade is one identifier. Never split its '/' or '-'.
            targets = ("grade",) if "grade" in fields else ("material",)
        elif len(parts) == 2:
            targets = fields
        else:
            raise ValueError(f"{ALIASES[key][0]}组合列须用换行、竖线、分号或两侧空格的 / 分隔两项")
        for target, part in zip(targets, parts):
            row[target] = merged_value(target, (row.get(target), part))


def is_total_row(values, mapping):
    def total_label(value):
        return bool(re.fullmatch(r"(?:汇总|合计|总计)[:：]?", re.sub(r"\s+", "", str(value or ""))))
    if not any(total_label(value) for value in values):
        return False
    labels = [values[column] for key, columns in mapping.items() for column in columns
              if key in ("row_label", "customer", "material", "grade", "material_spec", *COMBINED_FIELDS) and column < len(values)]
    if any(total_label(value) for value in labels):
        return True
    identifiers = [values[column] for key, columns in mapping.items() for column in columns
                   if key in ("grade", "material_spec", "material", *COMBINED_FIELDS) and column < len(values)]
    return not any(_has_value(value) and not total_label(value) for value in identifiers)


def is_price_header(mapping):
    has_grade = any(key in mapping for key in ("grade", "material_spec", "material", "grade_product", "product_grade"))
    has_price = any(key in mapping for key in PRICE_KEYS)
    return has_grade and has_price


def normalized_options(options, *, fallback_date=None):
    options = dict(options or {})
    mode = options.get("customer_mode", "legacy")
    if mode not in ("legacy", "selected", "all"):
        raise ValueError("客户导入模式无效")
    options["customer_mode"] = mode
    if mode == "selected":
        customer = clean(options.get("selected_customer") or options.get("customer"), 250)
        if not customer:
            raise ValueError("请先在客户目录中选择具体客户，再导入报价")
        options["selected_customer"] = customer
    elif mode == "all":
        options.pop("selected_customer", None)
        options.pop("customer", None)
    # Capture Beijing's date once per preview/batch, including both tax variants.
    if not options.get("default_effective_date"):
        options["default_effective_date"] = fallback_date or today()
    for key in ("effective_date", "default_effective_date"):
        if options.get(key):
            options[key] = business_date(options[key])
    return options, mode


def ignored_headers(options, mode):
    ignored = set(ALIASES) - (CORE_FIELDS | {"row_label", "customer", "effective_date", "tax_type", "note"}) if options.get("core_only") else set()
    if mode == "selected":
        ignored.add("customer")
    return ignored


def material_spec(row):
    return next((line[len(SPEC_PREFIX):] for line in str(row.get("note", "")).splitlines()
                 if line.startswith(SPEC_PREFIX)), "")


def price_rows(raw, options, epoch=False):
    """Normalize one business row atomically, including two explicit tax prices."""
    options, mode = normalized_options(options)
    row = dict(raw)
    row.pop("row_label", None)
    if options.get("core_only"):
        allowed = CORE_FIELDS | {"customer", "effective_date", "tax_type", "note", "source_file", "source_sheet", "source_row"}
        row = {key: value for key, value in row.items() if key in allowed}
    if mode == "selected":
        row["customer"] = options["selected_customer"]
    if any(isinstance(value, ExcelCellError) for value in row.values()):
        raise ValueError("单元格报错或公式缺少缓存值，请在 Excel 计算并保存后重试")
    expand_combined_fields(row)
    if options.get("split_material_color", bool(options.get("core_only"))):
        match = COLOR_SUFFIX.fullmatch(re.sub(r"\s+", " ", clean(row.get("material"))))
        if match:
            row["color"] = merged_value("color", (row.get("color"), match[2]))
            row["material"] = match[1]
    grade = clean(row.get("grade"))
    spec = clean(row.pop("material_spec", None))
    row["grade"] = grade or spec or clean(row.get("material"))
    if grade and spec and norm(grade) != norm(spec):
        note = clean(row.get("note"), 2000)
        row["note"] = "\n".join(filter(None, (note, SPEC_PREFIX + spec)))
    if not _has_value(row.get("effective_date")):
        row["effective_date"] = options.get("effective_date") or options.get("default_effective_date")
    if _has_value(row.get("tax_type")):
        row["tax_type"] = tax_text(row["tax_type"])
    explicit = (("untaxed_price", "未税"), ("taxed_price", "含税"))
    variants = [{**row, "price": row[key], "tax_type": tax} for key, tax in explicit if _has_value(row.get(key))]
    if not variants:
        variants = [row]
    result = []
    for item in variants:
        item = dict(item)
        item.pop("untaxed_price", None)
        item.pop("taxed_price", None)
        if not _has_value(item.get("tax_type")) and options.get("tax_type"):
            item["tax_type"] = options["tax_type"]
        result.append(validate_record(item, epoch))
    return result


def col_index(ref):
    letters = re.match(r"[A-Z]+", ref or "")
    if not letters:
        raise ValueError("Excel 单元格坐标无效")
    result = 0
    for letter in letters.group():
        result = result * 26 + ord(letter) - 64
    if result > 128:
        raise ValueError("导入区域超过 128 列，请另存仅含价格明细的表格")
    return result - 1


def xlsx_tables(content):
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            if sum(item.file_size for item in archive.infolist()) > 64 * 1024 * 1024:
                raise ValueError("Excel 解压后超过 64 MB，请拆分导入")
            workbook = ET.fromstring(archive.read("xl/workbook.xml"))
            props = workbook.find("s:workbookPr", NS)
            epoch = props is not None and props.get("date1904") in ("1", "true")
            shared = []
            if "xl/sharedStrings.xml" in archive.namelist():
                root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
                shared = ["".join(n.text or "" for n in cell.iter(f"{{{NS['s']}}}t")) for cell in root]
            rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
            targets = {r.get("Id"): r.get("Target") for r in rels if r.get("TargetMode") != "External"}
            sheets = list(workbook.find("s:sheets", NS))
            sheets.sort(key=lambda s: 0 if s.get("name") == "价格明细" else 1)
            for sheet in sheets:
                target = targets.get(sheet.get(f"{{{REL}}}id"))
                if not target:
                    continue
                path = target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join("xl", target))
                if not path.startswith("xl/"):
                    raise ValueError("Excel 工作表路径无效")
                root = ET.fromstring(archive.read(path))
                rows = []
                for row in root.findall("s:sheetData/s:row", NS):
                    values = []
                    for cell in row.findall("s:c", NS):
                        col = col_index(cell.get("r"))
                        values.extend([None] * (col + 1 - len(values)))
                        kind = cell.get("t")
                        raw = cell.findtext("s:v", default=None, namespaces=NS)
                        if kind == "s":
                            value = shared[int(raw)] if raw is not None else None
                        elif kind == "inlineStr":
                            value = "".join(n.text or "" for n in cell.iter(f"{{{NS['s']}}}t"))
                        elif kind == "e":
                            value = ExcelCellError(raw or "#ERROR!")
                        elif cell.find("s:f", NS) is not None and not raw:
                            value = ExcelCellError("#未计算公式")
                        else:
                            value = raw
                        values[col] = value
                    rows.append((int(row.get("r", len(rows) + 1)), values))
                yield sheet.get("name", ""), rows, epoch
    except (zipfile.BadZipFile, KeyError, ET.ParseError, IndexError, TypeError):
        raise ValueError("无法读取 Excel，请使用未加密的 .xlsx 文件并保存公式计算结果") from None


def read_prices(content, filename, pdf_options=None, *, fallback_date=None):
    if not content or len(content) > MAX_FILE_BYTES:
        raise ValueError("导入文件应大于 0 且不超过 20 MB")
    options, mode = normalized_options(pdf_options, fallback_date=fallback_date)
    extension = filename.rsplit(".", 1)[-1].lower()
    if extension == "pdf":
        from pdf_importer import read_pdf_prices
        return read_pdf_prices(content, filename, pdf_options, fallback_date=options["default_effective_date"])
    if extension == "xlsx":
        tables = xlsx_tables(content)
    elif extension == "csv":
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            try:
                text = content.decode("gb18030")
            except UnicodeDecodeError:
                raise ValueError("CSV 编码应为 UTF-8 或 GB18030") from None
        rows = list(enumerate(csv.reader(io.StringIO(text)), 1))
        if any(len(values) > 128 for _, values in rows):
            raise ValueError("导入区域超过 128 列")
        tables = [("CSV", rows, False)]
    else:
        raise ValueError("请选择 .xlsx、.csv 或文字表格 .pdf；旧版 .xls 请先另存为 .xlsx")
    for sheet, rows, epoch in tables:
        for offset, (_, header) in enumerate(rows[:20]):
            mapping = map_header(header, ignored=ignored_headers(options, mode),
                                 allow_duplicates=mode != "legacy" or bool(options.get("core_only")))
            if not is_price_header(mapping) or (mode == "legacy" and "customer" not in mapping):
                continue
            records, errors, omitted, business_rows = [], [], 0, 0
            for line, values in rows[offset + 1:]:
                if not any(v is not None and str(v).strip() for v in values):
                    continue
                if is_total_row(values, mapping):
                    omitted += 1
                    continue
                if is_price_header({header_key(value) for value in values}):
                    continue
                business_rows += 1
                if business_rows > MAX_ROWS:
                    raise ValueError(f"一次最多导入 {MAX_ROWS} 条业务报价")
                try:
                    row = mapped_row(values, mapping)
                    row.update(source_file=filename, source_sheet=sheet, source_row=line)
                    records.extend(price_rows(row, options, epoch))
                except ValueError as exc:
                    errors.append({"row": line, "message": str(exc)})
                if len(records) > MAX_ROWS:
                    raise ValueError(f"一次最多导入 {MAX_ROWS} 条报价（含税、未税分别计数）")
            if not records and not errors:
                raise ValueError("表格中没有报价记录")
            return {"records": records, "errors": errors, "omitted": omitted, "sheet": sheet}
    if mode == "selected":
        raise ValueError("未找到价格表头：须包含牌号/材料规格和未税价格/含税价格")
    if mode == "all":
        raise ValueError("未找到价格表头：须包含客户、牌号/材料规格和未税价格/含税价格")
    raise ValueError("未找到价格表头：须包含客户、牌号/材料规格和价格；缺失日期按导入当天补齐")
