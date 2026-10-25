"""Customer master records and the fixed XLSX exchange template."""
from __future__ import annotations

import re
import uuid
import zipfile
from pathlib import Path

from domain import MAX_FILE_BYTES, ValidationError, clean
from importer import ExcelCellError, xlsx_tables
from services.price_service import atomic_bytes
from storage.supabase_store import ReadApiUnavailable

PROFILE_HEADERS = (
    "客户编号（系统）", "数据版本（系统）", "客户名称", "联系人", "电话", "行业", "地址", "备注",
)
PROFILE_FIELDS = ("name", "contact", "phone", "industry", "address", "notes")
PROFILE_LIMITS = {"name": 240, "contact": 120, "phone": 80, "industry": 120, "address": 500, "notes": 2000}
MAX_PROFILE_ROWS = 20_000


def _inline_cell(address, value, style=None):
    if value is None or value == "":
        return ""
    style_attr = f' s="{style}"' if style else ""
    text = str(value)
    preserve = ' xml:space="preserve"' if text[:1].isspace() or text[-1:].isspace() else ""
    escaped = (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
               .replace('"', "&quot;").replace("'", "&apos;"))
    return f'<c r="{address}" t="inlineStr"{style_attr}><is><t{preserve}>{escaped}</t></is></c>'


def _profile_workbook(profiles=()):
    columns = "ABCDEFGH"
    rows = []
    header_cells = "".join(_inline_cell(f"{column}1", heading, 1)
                            for column, heading in zip(columns, PROFILE_HEADERS))
    rows.append(f'<row r="1" ht="26" customHeight="1">{header_cells}</row>')
    for row_number, profile in enumerate(profiles, 2):
        values = (profile.get("profile_id", ""), profile.get("revision", ""),
                  *(profile.get(field, "") for field in PROFILE_FIELDS))
        cells = []
        for column, value in zip(columns, values):
            cells.append(_inline_cell(f"{column}{row_number}", value))
        rows.append(f'<row r="{row_number}">{"".join(cells)}</row>')
    last_row = max(1, len(rows))
    worksheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<dimension ref="A1:H{last_row}"/><sheetViews><sheetView workbookViewId="0">'
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
        '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="21"/>'
        '<cols><col min="1" max="2" width="22" hidden="1" customWidth="1"/>'
        '<col min="3" max="3" width="28" customWidth="1"/>'
        '<col min="4" max="5" width="18" customWidth="1"/>'
        '<col min="6" max="6" width="20" customWidth="1"/>'
        '<col min="7" max="8" width="42" customWidth="1"/></cols>'
        f'<sheetData>{"".join(rows)}</sheetData><autoFilter ref="A1:H{last_row}"/>'
        '</worksheet>'
    )
    styles = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="2"><font><sz val="11"/><name val="Arial"/></font>'
        '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>'
        '<fills count="3"><fill><patternFill patternType="none"/></fill>'
        '<fill><patternFill patternType="gray125"/></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FF245B57"/><bgColor indexed="64"/>'
        '</patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
        '<border><left style="thin"><color rgb="FFD9E2E0"/></left><right style="thin"><color rgb="FFD9E2E0"/></right>'
        '<top style="thin"><color rgb="FFD9E2E0"/></top><bottom style="thin"><color rgb="FFD9E2E0"/></bottom>'
        '<diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>'
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" '
        'applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="客户资料" sheetId="1" r:id="rId1"/></sheets></workbook>'
    )
    workbook_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        'Target="worksheets/sheet1.xml"/><Relationship Id="rId2" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        '</Relationships>'
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="xl/workbook.xml"/></Relationships>'
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        '</Types>'
    )
    from io import BytesIO

    output = BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, payload in (
            ("[Content_Types].xml", content_types), ("_rels/.rels", root_rels),
            ("xl/workbook.xml", workbook), ("xl/_rels/workbook.xml.rels", workbook_rels),
            ("xl/styles.xml", styles), ("xl/worksheets/sheet1.xml", worksheet),
        ):
            archive.writestr(name, payload.encode("utf-8"))
    return output.getvalue()


def _profile_text(value, field):
    if isinstance(value, ExcelCellError):
        raise ValidationError("客户模板含公式错误，请检查后重试")
    return clean(value, PROFILE_LIMITS[field])


def parse_customer_profiles(content, filename="客户资料.xlsx"):
    if not isinstance(content, bytes) or not 0 < len(content) <= MAX_FILE_BYTES:
        raise ValidationError("客户模板应大于 0 且不超过 20 MB")
    if Path(filename).suffix.lower() != ".xlsx":
        raise ValidationError("客户资料仅支持固定 XLSX 模板")
    try:
        tables = list(xlsx_tables(content))
    except (ValueError, TypeError) as exc:
        raise ValidationError(str(exc)) from None
    table = next((rows for sheet, rows, _ in tables if sheet == "客户资料"), None)
    if table is None or not table:
        raise ValidationError("未识别到固定客户资料模板，请使用“客户资料”工作表")
    headers = table[0][1]
    actual = tuple(str(value or "").strip().replace("（", "(").replace("）", ")") for value in headers[:len(PROFILE_HEADERS)])
    expected = tuple(item.replace("（", "(").replace("）", ")") for item in PROFILE_HEADERS)
    legacy = actual[:7] == expected[:7] and all(value in (None, "") for value in headers[7:])
    if (actual != expected and not legacy) or any(value not in (None, "") for value in headers[len(PROFILE_HEADERS):]):
        raise ValidationError("客户资料模板表头不匹配，请下载最新固定模板后导入")
    if len(table) - 1 > MAX_PROFILE_ROWS:
        raise ValidationError(f"客户资料一次最多导入 {MAX_PROFILE_ROWS} 条")

    profiles, seen_ids = [], set()
    for line, values in table[1:]:
        padded = list(values) + [None] * max(0, len(PROFILE_HEADERS) - len(values))
        profile_id_text = _profile_text(padded[0], "name")
        revision_text = _profile_text(padded[1], "name")
        record = {field: _profile_text(padded[index + 2], field)
                  for index, field in enumerate(PROFILE_FIELDS)}
        if legacy:
            record.pop('notes')
        if not profile_id_text and not revision_text and not any(record.values()):
            continue
        profile_id = None
        if profile_id_text:
            try:
                profile_id = str(uuid.UUID(profile_id_text))
            except (ValueError, AttributeError):
                raise ValidationError(f"第{line}行客户编号无效") from None
            if profile_id in seen_ids:
                raise ValidationError(f"客户模板中客户编号重复：第{line}行")
            seen_ids.add(profile_id)
        revision = None
        if revision_text:
            if not re.fullmatch(r"\d+", revision_text) or int(revision_text) < 1:
                raise ValidationError(f"第{line}行数据版本无效")
            revision = int(revision_text)
        if revision is not None and profile_id is None:
            raise ValidationError(f"第{line}行缺少系统客户编号")
        profiles.append({"profile_id": profile_id, "revision": revision, **record})
    return profiles


class CustomerProfileService:
    def __init__(self, context):
        self.context = context
        self.local_only = False
        self._store_generation = None
        self._selected_store = None
        self._probe_profiles = None

    def _store(self, generation):
        store, _ = self.context.capture(generation)
        if self._store_generation == generation and self._selected_store is not None:
            return self._selected_store
        self.local_only = False
        self._probe_profiles = None
        if store.backend != "sqlite":
            from storage.sqlite_store import SQLiteStore

            folder = self.context.folder / "customer-profiles-local"
            if (folder / "prices.sqlite3").is_file():
                self.local_only = True
            else:
                try:
                    self._probe_profiles = store.customer_profiles_list()
                except ReadApiUnavailable:
                    self.local_only = True
            if self.local_only:
                store = SQLiteStore(folder, load_seed=False)
        self._selected_store, self._store_generation = store, generation
        return store

    def list_profiles(self, generation):
        store = self._store(generation)
        profiles = self._probe_profiles
        self._probe_profiles = None
        if profiles is None:
            profiles = store.customer_profiles_list()
        self.context.capture(generation)
        return sorted((dict(item) for item in profiles), key=lambda item: (item["name"].casefold(), item["profile_id"]))

    def save_profile(self, values, generation):
        profile = self._normalize(values)
        profile["profile_id"] = profile.get("profile_id") or str(uuid.uuid4())
        with self.context.operation_lock:
            store = self._store(generation)
            result = store.save_customer_profiles([profile])
            self._probe_profiles = None
        self.context.capture(generation)
        self.context.invalidate_customer_data()
        return result["profiles"][0]

    def import_file(self, path, generation):
        path = Path(path)
        if path.suffix.lower() != ".xlsx" or not path.is_file():
            raise ValidationError("请选择固定客户资料 XLSX 模板")
        with path.open("rb") as handle:
            content = handle.read(MAX_FILE_BYTES + 1)
        profiles = parse_customer_profiles(content, path.name)
        with self.context.operation_lock:
            store = self._store(generation)
            result = store.save_customer_profiles(profiles)
            self._probe_profiles = None
        self.context.capture(generation)
        if result["created"] or result["updated"]:
            self.context.invalidate_customer_data()
        return {key: result[key] for key in ("created", "updated", "skipped")}

    def export_xlsx(self, generation):
        profiles = self.list_profiles(generation)
        if len(profiles) > MAX_PROFILE_ROWS:
            raise ValidationError(f"客户资料超过 {MAX_PROFILE_ROWS} 条，暂不能导出")
        return _profile_workbook(profiles)

    def export_file(self, path, generation):
        return {"path": atomic_bytes(path, self.export_xlsx(generation))}

    def save_template(self, path):
        return {"path": atomic_bytes(path, _profile_workbook())}

    @staticmethod
    def _normalize(values):
        allowed = {"profile_id", "revision", *PROFILE_FIELDS, "created_at", "updated_at"}
        if not isinstance(values, dict) or set(values) - allowed:
            raise ValidationError("客户资料格式无效")
        profile_id = values.get("profile_id")
        if profile_id:
            try:
                profile_id = str(uuid.UUID(str(profile_id)))
            except (ValueError, AttributeError):
                raise ValidationError("客户编号无效，请重新读取客户资料") from None
        revision = values.get("revision")
        if revision is not None and (isinstance(revision, bool) or not isinstance(revision, int) or revision < 1):
            raise ValidationError("客户资料版本无效，请刷新后重试")
        record = {"profile_id": profile_id, "revision": revision}
        for field in PROFILE_FIELDS:
            record[field] = clean(values.get(field, ""), PROFILE_LIMITS[field])
        return record
