"""Workbook-backed project scoring and validation shared by desktop storage."""
from __future__ import annotations

import copy
import datetime as dt
import io
import posixpath
import re
import uuid
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from domain import ASSETS, MAX_FILE_BYTES, ValidationError, business_date
from importer import ExcelCellError, xlsx_tables

SPREADSHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
PROJECT_TEMPLATE_PATH = ASSETS / "business_templates" / "project-progress-template.xlsx"
MAX_PROJECT_IMPORT_ROWS = 1000
PROJECT_IMPORT_HEADERS = {
    "行业": "industry",
    "客户名称": "customer_name",
    "材料": "material",
    "推荐牌号": "recommended_grade",
    "材料价值": "material_value",
    "颜色": "color",
    "竞争对手": "competitor",
    "产品名称": "product_name",
    "项目进度(阶段代码)": "stage_code",
    "项目阶段(自动)": "stage_label",
    "下一步动作(建议)": "next_action",
    "时间节点": "milestone_date",
    "备注": "notes",
    "客户类型": "customer_type",
    "客户战略价值": "customer_value",
    "竞争态势": "competition",
    "项目编号(系统)": "project_id",
    "数据版本(系统)": "revision",
    "项目阶段(自定义)": "custom_stage_label",
    "客户战略价值(自定义)": "custom_customer_value",
    "材料价值(自定义)": "custom_material_value",
    "竞争态势(自定义)": "custom_competition",
}
PROJECT_REQUIRED_HEADERS = {
    "industry", "customer_name", "material", "material_value", "stage_code",
    "customer_type", "customer_value", "competition",
}
PROJECT_REQUIRED_HEADER_LABELS = {
    "industry": "行业", "customer_name": "客户名称", "material": "材料", "material_value": "材料价值",
    "stage_code": "项目进度(阶段代码)", "customer_type": "客户类型",
    "customer_value": "客户战略价值", "competition": "竞争态势",
}
PROJECT_EXPORT_HEADERS = (
    "行业", "客户名称", "材料", "推荐牌号", "材料价值", "颜色", "竞争对手", "产品名称",
    "项目进度(阶段代码)", "项目阶段(自动)", "下一步动作(建议)", "时间节点", "备注",
    "客户类型", "客户战略价值", "竞争态势", "项目编号（系统）", "数据版本（系统）",
    "项目阶段(自定义)", "客户战略价值(自定义)", "材料价值(自定义)", "竞争态势(自定义)",
)


class ProjectProgressImportError(ValidationError):
    """A batch write stopped after one or more confirmed project saves."""


def _xml_tag(name):
    return f"{{{SPREADSHEET_NS}}}{name}"


def _register_xml_namespaces(payload):
    for _, (prefix, uri) in ET.iterparse(io.BytesIO(payload), events=("start-ns",)):
        ET.register_namespace(prefix or "", uri)


def _excel_column(index):
    letters = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def _project_sheet_path(archive):
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {item.get("Id"): item.get("Target") for item in relationships}
    sheets = workbook.find(_xml_tag("sheets"))
    sheet = next((item for item in list(sheets) if item.get("name") == "项目进度表"), None) if sheets is not None else None
    if sheet is None:
        raise ValidationError("模板缺少“项目进度表”工作表")
    target = targets.get(sheet.get(f"{{{OFFICE_REL_NS}}}id"))
    if not target:
        raise ValidationError("项目进度工作表路径无效")
    path = target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join("xl", target))
    if not path.startswith("xl/") or ".." in Path(path).parts:
        raise ValidationError("项目进度工作表路径无效")
    return path


def _cell_style(row, address):
    cell = next((item for item in row.findall(_xml_tag("c")) if item.get("r") == address), None)
    return cell.get("s") if cell is not None else None


def _write_cell(row, address, value, style=None, numeric=False):
    cells = row.findall(_xml_tag("c"))
    cell = next((item for item in cells if item.get("r") == address), None)
    if cell is None:
        cell = ET.Element(_xml_tag("c"), {"r": address})
        column = re.match(r"[A-Z]+", address).group()
        target_index = 0
        for letter in column:
            target_index = target_index * 26 + ord(letter) - 64
        for index, existing in enumerate(cells):
            match = re.match(r"[A-Z]+", existing.get("r", ""))
            current_index = 0
            if match:
                for letter in match.group():
                    current_index = current_index * 26 + ord(letter) - 64
            if current_index > target_index:
                row.insert(list(row).index(existing), cell)
                break
        else:
            row.append(cell)
    cell.attrib.clear()
    cell.set("r", address)
    if style:
        cell.set("s", style)
    for child in list(cell):
        cell.remove(child)
    if value is None:
        return
    if numeric:
        ET.SubElement(cell, _xml_tag("v")).text = str(value)
    else:
        cell.set("t", "inlineStr")
        inline = ET.SubElement(cell, _xml_tag("is"))
        text = ET.SubElement(inline, _xml_tag("t"))
        text.text = str(value)
        if text.text[:1].isspace() or text.text[-1:].isspace():
            text.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")


def _choice_label(field, code, rules):
    if field == "customer_type":
        return {"oem": "汽车零部件主机厂", "non_auto": "非汽车客户"}[code]
    group = {"customer_value": "customer_values", "material_value": "material_values",
             "competition": "competition_scores"}[field]
    return rules[group][code]["label"]


def _export_row(project, rules):
    stage = rules["stage_scores"][str(project["stage_code"])]
    return (
        project["industry"], project["customer_name"], project["material"], project["recommended_grade"],
        project.get("custom_material_value") or _choice_label("material_value", project["material_value"], rules), project["color"],
        project["competitor"], project["product_name"], project["stage_code"],
        project.get("custom_stage_label") or stage["label"],
        project["next_action"], project["milestone_date"], project["notes"],
        _choice_label("customer_type", project["customer_type"], rules),
        project.get("custom_customer_value") or _choice_label("customer_value", project["customer_value"], rules),
        project.get("custom_competition") or _choice_label("competition", project["competition"], rules),
        project["project_id"], project["revision"], project.get("custom_stage_label", ""),
        project.get("custom_customer_value", ""), project.get("custom_material_value", ""),
        project.get("custom_competition", ""),
    )


def _rewrite_project_workbook(projects, rules, template):
    try:
        source = zipfile.ZipFile(io.BytesIO(template))
    except (zipfile.BadZipFile, OSError):
        raise ValidationError("项目进度模板文件损坏") from None
    output = io.BytesIO()
    with source, zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as target:
        sheet_path = _project_sheet_path(source)
        worksheet_xml = source.read(sheet_path)
        _register_xml_namespaces(worksheet_xml)
        worksheet = ET.fromstring(worksheet_xml)
        dimension = worksheet.find(_xml_tag("dimension"))
        sheet_data = worksheet.find(_xml_tag("sheetData"))
        if sheet_data is None:
            raise ValidationError("项目进度模板缺少表格数据区域")
        rows = {int(item.get("r")): item for item in sheet_data.findall(_xml_tag("row"))}
        header_row = rows.get(2)
        if header_row is None:
            raise ValidationError("项目进度模板缺少第2行表头")
        header_style = _cell_style(header_row, "M2")
        for index, header in enumerate(PROJECT_EXPORT_HEADERS[13:], 14):
            _write_cell(header_row, f"{_excel_column(index)}2", header, header_style)

        first_row = rows.get(8)
        if first_row is None:
            first_row = rows.get(3)
        second_row = rows.get(9)
        if second_row is None:
            second_row = first_row
        row_prototypes = [first_row, second_row]
        if any(row is None for row in row_prototypes):
            raise ValidationError("项目进度模板缺少可复用的数据行格式")
        for existing in list(sheet_data.findall(_xml_tag("row"))):
            if int(existing.get("r")) > 2:
                sheet_data.remove(existing)
        header_row.set("spans", "1:22")
        for index, project in enumerate(projects, 3):
            template_row = row_prototypes[0 if index == 3 else 1]
            row = copy.deepcopy(template_row)
            row.set("r", str(index))
            row.set("spans", "1:22")
            values = _export_row(project, rules)
            for column, value in enumerate(values, 1):
                address = f"{_excel_column(column)}{index}"
                style = _cell_style(template_row, f"{_excel_column(min(column, 13))}{template_row.get('r')}")
                numeric = column in (9, 18) and value not in (None, "")
                _write_cell(row, address, value, style if column <= 16 else None, numeric)
            sheet_data.append(row)

        columns = worksheet.find(_xml_tag("cols"))
        if columns is None:
            columns = ET.Element(_xml_tag("cols"))
            worksheet.insert(list(worksheet).index(sheet_data), columns)
        for item in list(columns):
            if int(item.get("min", "0")) > 13:
                columns.remove(item)
        for first, last, width, hidden in ((14, 14, 20, False), (15, 15, 28, False),
                                           (16, 16, 24, False), (17, 18, 15, True),
                                           (19, 19, 22, False), (20, 22, 24, False)):
            attributes = {"min": str(first), "max": str(last), "width": str(width), "customWidth": "1"}
            if hidden:
                attributes["hidden"] = "1"
            columns.append(ET.Element(_xml_tag("col"), attributes))

        merges = worksheet.find(_xml_tag("mergeCells"))
        if merges is not None:
            for merge in merges.findall(_xml_tag("mergeCell")):
                if merge.get("ref") == "A1:L1":
                    merge.set("ref", "A1:V1")
        last_row = max(2, len(projects) + 2)
        if dimension is not None:
            dimension.set("ref", f"A1:V{last_row}")
        rewritten = ET.tostring(worksheet, encoding="utf-8", xml_declaration=True)
        for item in source.infolist():
            target.writestr(item, rewritten if item.filename == sheet_path else source.read(item.filename))
    return output.getvalue()


def project_progress_template_bytes():
    try:
        template = PROJECT_TEMPLATE_PATH.read_bytes()
    except OSError:
        raise ValidationError("未找到项目进度 Excel 模板资源") from None
    return _rewrite_project_workbook([], DEFAULT_PROJECT_RULES, template)


def export_project_progress_xlsx(projects, rules=None):
    rules = rules or DEFAULT_PROJECT_RULES
    checked = [validate_project(project) for project in projects]
    try:
        template = PROJECT_TEMPLATE_PATH.read_bytes()
    except OSError:
        raise ValidationError("未找到项目进度 Excel 模板资源") from None
    return _rewrite_project_workbook(checked, rules, template)


def _header_key(value):
    if isinstance(value, ExcelCellError):
        return ""
    return re.sub(r"\s+", "", str(value or "")).replace("（", "(").replace("）", ")").lower()


def _project_header_map(values):
    mapping = {}
    for column, value in enumerate(values):
        field = PROJECT_IMPORT_HEADERS.get(_header_key(value))
        if field:
            if field in mapping:
                raise ValidationError(f"项目进度表头重复：{value}")
            mapping[field] = column
    return mapping


def _project_choice(field, value, rules):
    text = "" if value is None else str(value).strip()
    if isinstance(value, ExcelCellError):
        raise ValidationError("单元格含公式错误，请在 Excel 中检查后重试")
    if not text:
        return ""
    if field == "customer_type":
        aliases = {"oem": "oem", "主机厂": "oem", "汽车零部件主机厂": "oem", "非汽车": "non_auto", "非汽车客户": "non_auto"}
        code = aliases.get(text.lower())
    elif field == "stage_code":
        stage_labels = {item["label"]: key for key, item in rules["stage_scores"].items()}
        normalized = text[:-2] if text.endswith(".0") else text
        code = normalized if normalized in rules["stage_scores"] else stage_labels.get(text)
    else:
        group = {"material_value": "material_values", "customer_value": "customer_values",
                 "competition": "competition_scores"}[field]
        options = rules[group]
        code = text if text in options else next((key for key, item in options.items() if item["label"] == text), None)
    if code is None:
        raise ValidationError(f"{PROJECT_REQUIRED_HEADER_LABELS.get(field, field)}选项无效：{text[:80]}")
    return code


def _integer_cell(value, label, *, optional=False):
    text = "" if value is None else str(value).strip()
    if optional and not text:
        return None
    if text.endswith(".0"):
        text = text[:-2]
    if not text.isdigit():
        raise ValidationError(f"{label}须为整数")
    return int(text)


def parse_project_progress_workbook(content, filename="项目进度.xlsx", rules=None):
    rules = rules or DEFAULT_PROJECT_RULES
    if not isinstance(content, bytes) or not 0 < len(content) <= MAX_FILE_BYTES:
        raise ValidationError("导入文件应大于 0 且不超过 20 MB")
    tables = list(xlsx_tables(content))
    candidates = []
    for sheet, rows, epoch1904 in tables:
        for offset, (line, values) in enumerate(rows[:20]):
            mapping = _project_header_map(values)
            if {"industry", "customer_name", "material"}.issubset(mapping):
                candidates.append((sheet, rows, epoch1904, offset, line, mapping))
                if sheet == "项目进度表":
                    break
    if not candidates:
        return {"projects": [], "errors": [{"row": 1, "message": "未找到项目进度表头，请使用项目进度模板"}], "sheet": ""}
    sheet, rows, epoch1904, offset, header_line, mapping = next(
        (item for item in candidates if item[0] == "项目进度表"), candidates[0])
    missing = PROJECT_REQUIRED_HEADERS - mapping.keys()
    if missing:
        labels = "、".join(PROJECT_REQUIRED_HEADER_LABELS[key] for key in sorted(missing))
        return {"projects": [], "errors": [{"row": header_line, "message": f"模板缺少必需列：{labels}"}], "sheet": sheet}

    projects, errors, seen_ids, business_rows = [], [], set(), 0
    for line, values in rows[offset + 1:]:
        relevant = {field: values[column] if column < len(values) else None
                    for field, column in mapping.items()}
        if not any(value is not None and str(value).strip() for value in relevant.values()):
            continue
        business_rows += 1
        if business_rows > MAX_PROJECT_IMPORT_ROWS:
            errors.append({"row": line, "message": f"一次最多导入 {MAX_PROJECT_IMPORT_ROWS} 个项目"})
            break
        try:
            record = {field: relevant.get(field) for field in PROJECT_FIELDS}
            for field in ("customer_type", "customer_value", "material_value", "competition", "stage_code"):
                value = relevant.get(field)
                if field == "stage_code" and not str(value or "").strip() and relevant.get("custom_stage_label"):
                    record[field] = 1
                    continue
                try:
                    record[field] = _project_choice(field, value, rules)
                except ValidationError:
                    custom_field = {
                        "customer_value": "custom_customer_value", "material_value": "custom_material_value",
                        "competition": "custom_competition", "stage_code": "custom_stage_label",
                    }.get(field)
                    if not custom_field or not str(value or "").strip():
                        raise
                    record[custom_field] = str(value).strip()
                    record[field] = {
                        "customer_value": "oem_t1_regular" if record.get("customer_type") == "oem" else "non_auto",
                        "material_value": "general", "competition": "open", "stage_code": 1,
                    }[field]
            stage_label = str(relevant.get("stage_label") or "").strip()
            known_stage_labels = {item["label"] for item in rules["stage_scores"].values()}
            if stage_label and stage_label not in known_stage_labels and not record["custom_stage_label"]:
                record["custom_stage_label"] = stage_label
            for field in ("custom_stage_label", "custom_customer_value", "custom_material_value", "custom_competition"):
                if relevant.get(field) not in (None, ""):
                    record[field] = str(relevant[field]).strip()
            record["stage_code"] = _integer_cell(record["stage_code"], "项目阶段")
            record["milestone_date"] = (business_date(relevant.get("milestone_date"), epoch1904)
                                        if relevant.get("milestone_date") not in (None, "") else "")
            record["project_id"] = str(relevant.get("project_id") or "").strip()
            record["revision"] = _integer_cell(relevant.get("revision"), "数据版本", optional=True)
            if bool(record["project_id"]) != (record["revision"] is not None):
                raise ValidationError("项目编号与数据版本必须同时填写，或同时留空")
            if record["project_id"] and record["project_id"] in seen_ids:
                raise ValidationError("同一文件中项目编号重复")
            checked = validate_project(record)
            if record["project_id"]:
                seen_ids.add(record["project_id"])
            checked["_source_row"] = line
            projects.append(checked)
        except (TypeError, ValueError) as exc:
            errors.append({"row": line, "message": str(exc)})
    return {"projects": projects, "errors": errors, "sheet": sheet, "filename": filename}

DEFAULT_PROJECT_RULES = {
    "version": 1,
    "stage_scores": {
        "1": {"label": "项目接触", "score": 6, "detail": "立项接触、信息获取、首次报价"},
        "2": {"label": "送样 / 试料", "score": 12, "detail": "寄样、试模、小批试样"},
        "3": {"label": "测试 / 认证", "score": 18, "detail": "客户测试、第三方认证、合格性验证"},
        "4": {"label": "定点 / 小批", "score": 24, "detail": "定点通知、小批量供货"},
        "5": {"label": "量产", "score": 30, "detail": "批量供货、持续订单"},
    },
    "customer_values": {
        "geely_strategic": {"label": "吉利系 / 战略客户项目", "score": 30},
        "oem_t1_important": {"label": "主机厂 T1 重要客户", "score": 22},
        "oem_t1_regular": {"label": "主机厂 T1 普通客户", "score": 15},
        "non_auto": {"label": "非汽车客户", "score": 8},
    },
    "competition_scores": {
        "awarded": {"label": "已定点我司 / 独供", "score": 20},
        "open": {"label": "有竞争未定点", "score": 12},
        "intense": {"label": "竞争激烈暂无优势", "score": 8},
        "lost": {"label": "已失单 / 无望", "score": 0},
    },
    "material_values": {
        "special": {"label": "特种高价值（长玻纤 / 高增强 / 阻燃）", "score": 20},
        "reinforced": {"label": "常规增强改性", "score": 12},
        "general": {"label": "低附加值通用料", "score": 6},
    },
    "tiers": [
        {"code": "A", "min": 80, "label": "重点攻坚"},
        {"code": "B", "min": 65, "label": "重点跟进"},
        {"code": "C", "min": 45, "label": "常规推进"},
        {"code": "D", "min": 0, "label": "观察暂缓"},
    ],
    "resource_allocation": {"A": 50, "B": 30, "C": 20, "D": 0},
    "strategy": {
        "core": "A档主机厂项目集中攻认证、定点和样板复制；B档项目持续清卡点；非汽车客户用主机厂案例做背书，先小批验证再放量，同时把回款管理纳入每周节奏。",
        "geely": "主机厂已不再参与材料指定，备齐对应材料报告后主动跟进吉利系项目；新项目统一参与报价。",
        "non_auto": "以主机厂A/B档定点与量产记录做背书，老客稳供，新客先小批验证再放量，回款异常每周对账。",
        "weekly": ["周一更新项目进度与评分", "周三协调样品、测试、商务卡点", "周五输出周报并核对回款"],
    },
}

PROJECT_FIELDS = (
    "industry", "customer_type", "customer_name", "material", "recommended_grade", "material_value",
    "color", "competitor", "product_name", "stage_code", "customer_value", "competition",
    "custom_stage_label", "custom_customer_value", "custom_material_value", "custom_competition",
    "next_action", "milestone_date", "notes",
)

FIELD_LIMITS = {
    "industry": 120,
    "customer_name": 240,
    "material": 120,
    "recommended_grade": 120,
    "color": 120,
    "competitor": 240,
    "product_name": 240,
    "next_action": 1000,
    "milestone_date": 10,
    "notes": 4000,
    "custom_stage_label": 120,
    "custom_customer_value": 240,
    "custom_material_value": 240,
    "custom_competition": 240,
}
FIELD_LABELS = {
    "industry": "行业", "customer_name": "客户名称", "material": "材料", "recommended_grade": "推荐牌号",
    "color": "颜色", "competitor": "竞争对手", "product_name": "产品名称", "next_action": "下一步动作",
    "milestone_date": "时间节点", "notes": "备注",
    "custom_stage_label": "自定义项目阶段", "custom_customer_value": "自定义客户战略价值",
    "custom_material_value": "自定义材料价值", "custom_competition": "自定义竞争态势",
}


def validate_project(record):
    if not isinstance(record, dict):
        raise ValidationError("项目资料格式无效")
    result = {field: str(record.get(field) or "").strip() for field in PROJECT_FIELDS}
    for field, limit in FIELD_LIMITS.items():
        if len(result[field]) > limit:
            raise ValidationError(f"{FIELD_LABELS[field]}超过允许长度")
    if not result["industry"] or not result["customer_name"] or not result["material"]:
        raise ValidationError("请填写行业、客户名称和材料")
    if result["customer_type"] not in {"oem", "non_auto"}:
        raise ValidationError("请选择客户类型")
    if result["customer_value"] not in DEFAULT_PROJECT_RULES["customer_values"]:
        if not result["custom_customer_value"]:
            raise ValidationError("客户战略价值选项无效")
        result["customer_value"] = "non_auto" if result["customer_type"] == "non_auto" else "oem_t1_regular"
    if result["custom_customer_value"] and result["customer_type"] == "non_auto":
        result["customer_value"] = "non_auto"
    elif result["custom_customer_value"] and result["customer_value"] == "non_auto":
        result["customer_value"] = "oem_t1_regular"
    if not result["custom_customer_value"] and (result["customer_type"] == "non_auto") != (result["customer_value"] == "non_auto"):
        raise ValidationError("客户类型与客户战略价值标签不匹配")
    if result["competition"] not in DEFAULT_PROJECT_RULES["competition_scores"]:
        if not result["custom_competition"]:
            raise ValidationError("竞争态势选项无效")
        result["competition"] = "open"
    if result["material_value"] not in DEFAULT_PROJECT_RULES["material_values"]:
        if not result["custom_material_value"]:
            raise ValidationError("材料价值选项无效")
        result["material_value"] = "general"
    try:
        result["stage_code"] = int(result["stage_code"])
    except (TypeError, ValueError):
        if not result["custom_stage_label"]:
            raise ValidationError("项目阶段选项无效") from None
        result["stage_code"] = 1
    if str(result["stage_code"]) not in DEFAULT_PROJECT_RULES["stage_scores"]:
        if not result["custom_stage_label"]:
            raise ValidationError("项目阶段选项无效")
        result["stage_code"] = 1
    if result["milestone_date"]:
        try:
            dt.date.fromisoformat(result["milestone_date"])
        except ValueError:
            raise ValidationError("时间节点格式应为 YYYY-MM-DD") from None
    if record.get("project_id"):
        try:
            result["project_id"] = str(uuid.UUID(str(record["project_id"])))
        except (ValueError, TypeError, AttributeError):
            raise ValidationError("项目编号无效") from None
    else:
        result["project_id"] = str(uuid.uuid4())
    revision = record.get("revision")
    if revision is not None and (isinstance(revision, bool) or not isinstance(revision, int) or revision < 1):
        raise ValidationError("项目版本无效")
    result["revision"] = revision
    return result


def score_project(record, rules=None):
    rules = rules or DEFAULT_PROJECT_RULES
    stage = 0 if record.get("custom_stage_label") else rules["stage_scores"][str(record["stage_code"])]["score"]
    customer = 0 if record.get("custom_customer_value") else rules["customer_values"][record["customer_value"]]["score"]
    competition = 0 if record.get("custom_competition") else rules["competition_scores"][record["competition"]]["score"]
    material = 0 if record.get("custom_material_value") else rules["material_values"][record["material_value"]]["score"]
    total = stage + customer + competition + material
    tier = next(item for item in sorted(rules["tiers"], key=lambda item: item["min"], reverse=True) if total >= item["min"])
    return {**record, "stage_score": stage, "customer_score": customer, "competition_score": competition,
            "material_score": material, "total_score": total, "tier": tier["code"]}


class ProjectProgressService:
    def __init__(self, context):
        self.context = context

    def template_bytes(self):
        return project_progress_template_bytes()

    def save_template(self, path):
        from services.price_service import atomic_bytes

        return {"path": atomic_bytes(path, self.template_bytes())}

    def preview_import_file(self, path, generation, rules=None):
        self.context.capture(generation)
        path = Path(path)
        if not path.is_file() or not 0 < path.stat().st_size <= MAX_FILE_BYTES:
            raise ValidationError("请选择大于 0 且不超过 20 MB 的 XLSX 项目进度文件")
        with path.open("rb") as handle:
            content = handle.read(MAX_FILE_BYTES + 1)
        result = parse_project_progress_workbook(content, path.name, rules)
        self.context.capture(generation)
        return result

    def export_xlsx(self, generation):
        store, _ = self.context.capture(generation)
        payload = store.project_progress_list()
        if not isinstance(payload, dict) or not isinstance(payload.get("rules"), dict) or not isinstance(payload.get("projects"), list):
            raise ValidationError("云端项目进度格式无效")
        projects = [score_project(row, payload["rules"]) for row in payload["projects"]]
        result = export_project_progress_xlsx(projects, payload["rules"])
        self.context.capture(generation)
        return result

    def export_file(self, path, generation):
        from services.price_service import atomic_bytes

        return {"path": atomic_bytes(path, self.export_xlsx(generation))}

    def import_projects(self, records, generation):
        if not records:
            return {"created": 0, "updated": 0, "total": 0}
        prepared = []
        for record in records:
            source_row = record.get("_source_row", "?")
            checked = validate_project(record)
            prepared.append((checked, source_row))

        store, _ = self.context.capture(generation)
        saved = []
        for checked, source_row in prepared:
            is_new = checked.get("revision") is None
            try:
                result = store.save_project_progress({**checked, "_new_project": is_new})
            except ValueError as exc:
                raise ProjectProgressImportError(
                    f"导入已中断：已保存 {len(saved)}/{len(prepared)} 条；第{source_row}行失败：{exc}"
                ) from None
            saved.append((str(result["project_id"]), int(result["revision"]), is_new, source_row))

        payload = store.project_progress_list()
        persisted = {str(row.get("project_id")): row for row in payload.get("projects", [])}
        for project_id, revision, _, source_row in saved:
            row = persisted.get(project_id)
            if row is None or int(row.get("revision", 0)) != revision:
                raise ProjectProgressImportError(
                    f"导入写入完成 {len(saved)}/{len(prepared)} 条，但第{source_row}行回读核对失败；请刷新项目进度核对"
                )
        self.context.capture(generation)
        created = sum(1 for _, _, is_new, _ in saved if is_new)
        return {"created": created, "updated": len(saved) - created, "total": len(saved)}

    def list(self, generation):
        store, _ = self.context.capture(generation)
        payload = store.project_progress_list()
        if not isinstance(payload, dict) or not isinstance(payload.get("rules"), dict) or not isinstance(payload.get("projects"), list):
            raise ValidationError("云端项目进度格式无效")
        return {"rules": payload["rules"], "projects": [score_project(row, payload["rules"]) for row in payload["projects"]]}

    def save(self, record, generation):
        is_new = record.get("revision") is None
        checked = validate_project(record)
        checked["_new_project"] = is_new
        store, _ = self.context.capture(generation)
        result = store.save_project_progress(checked)
        payload = store.project_progress_list()
        saved_id = result.get("project_id")
        saved = next((item for item in payload["projects"] if item.get("project_id") == saved_id), None)
        if saved is None:
            raise ValidationError("项目已提交，但回读未找到该项目，请刷新核对")
        return score_project(saved, payload["rules"])
