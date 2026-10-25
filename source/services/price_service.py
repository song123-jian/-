"""Query, append, import, export and backup without GUI dependencies."""
from __future__ import annotations

import csv
import io
import os
import secrets
import sqlite3
import tempfile
import time
from dataclasses import asdict, dataclass
from pathlib import Path

from domain import (
    APP_ID,
    ASSETS,
    MAX_FILE_BYTES,
    VERSION,
    ConflictError,
    StorageError,
    ValidationError,
    business_date,
    customer_key,
    identity,
    import_key,
    norm,
    quote_order,
    today,
    validate_record,
)
from importer import material_spec, normalized_options, read_prices
from services.read_control import check_read_cancelled
from storage.atomic_files import atomic_copy


def match_customer_records(records, existing, options):
    """Merge only unique identities within each row's explicit customer."""
    by_grade = {}
    cutoff = today()
    for row in existing:
        key = (norm(row["customer"]), norm(row["grade"]))
        groups = by_grade.setdefault(key, {})
        group = identity(row)
        previous = groups.get(group)
        if previous is None or quote_order(row, cutoff) > quote_order(previous, cutoff):
            groups[group] = row
    matched, errors = [], []
    for raw in records:
        row = dict(raw)
        lookup = (norm(row["customer"]), norm(row["grade"]))
        candidates = [previous for previous in by_grade.get(lookup, {}).values()
                      if (row["tax_type"] == "未注明" or previous["tax_type"] == row["tax_type"])
                      and (not row["color"] or norm(previous["color"]) == norm(row["color"]))]
        if len(candidates) > 1 and row["material"]:
            exact_material = [candidate for candidate in candidates if norm(candidate["material"]) == norm(row["material"])]
            if exact_material:
                candidates = exact_material
        if len(candidates) > 1:
            errors.append({"row": row["source_row"], "sheet": row["source_sheet"],
                           "message": f"牌号 {row['grade']} 匹配多个颜色或税口径，请核对后从对应报价更新，或明确本批税口径"})
            continue
        if candidates:
            previous = candidates[0]
            if row["material"] and previous["material"] and norm(row["material"]) != norm(previous["material"]):
                errors.append({"row": row["source_row"], "sheet": row["source_sheet"],
                               "message": f"牌号 {row['grade']} 的产品名称与已有记录冲突，请核对"})
                continue
            old_spec, new_spec = material_spec(previous), material_spec(row)
            if old_spec and new_spec and norm(old_spec) != norm(new_spec):
                errors.append({"row": row["source_row"], "sheet": row["source_sheet"],
                               "message": f"牌号 {row['grade']} 的材料规格与已有记录冲突，请核对"})
                continue
            for key in ("customer", "grade", "color", "tax_type"):
                row[key] = previous[key]
            for key in ("material", "note", "reason"):
                if not row[key]:
                    row[key] = previous[key]
            if options.get("core_only"):
                explicit_note = "\n".join(line for line in raw["note"].splitlines() if not line.startswith("材料规格："))
                if not explicit_note:
                    row["note"] = previous["note"]
                    if new_spec and not old_spec:
                        row["note"] = "\n".join(filter(None, (row["note"], "材料规格：" + new_spec)))
                row["reason"] = previous["reason"]
        try:
            validated = validate_record(row)
            matched.append(validated)
            by_grade.setdefault(lookup, {})[identity(row)] = {**validated, "id": 0}
        except ValueError as exc:
            errors.append({"row": row["source_row"], "sheet": row["source_sheet"], "message": str(exc)})
    return matched, errors


@dataclass(frozen=True)
class QueryFilter:
    customer: str = ""
    q: str = ""
    material: str = ""
    tax: str = ""
    date_from: str = ""
    date_to: str = ""
    stale: bool = False

    def to_dict(self):
        result = asdict(self)
        result["from"] = result.pop("date_from")
        result["to"] = result.pop("date_to")
        result["stale"] = "1" if self.stale else ""
        return result


@dataclass(frozen=True)
class QuoteCommand:
    customer: str
    grade: str
    material: str
    color: str
    price: str
    tax_type: str
    effective_date: str
    note: str = ""
    reason: str = ""
    base_id: int | None = None
    storage_generation: str | None = None
    customer_revision: int | None = None
    data_generation: int | None = None


def checked_filters(filters):
    filters = filters.to_dict() if isinstance(filters, QueryFilter) else dict(filters or {})
    for key in ("from", "to"):
        if filters.get(key):
            filters[key] = business_date(filters[key])
    if filters.get("from") and filters.get("to") and filters["from"] > filters["to"]:
        raise ValidationError("开始日期不能晚于结束日期")
    if filters.get("tax") and filters["tax"] not in ("含税", "未税", "未注明"):
        raise ValidationError("税口径无效")
    return filters


def atomic_bytes(path, content):
    path = Path(path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".price-", dir=path.parent, delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return str(path)


def csv_bytes(rows, columns):
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow([label for _, label in columns])
    for row in rows:
        values = []
        for key, _ in columns:
            value = str(row.get(key, ""))
            if key not in ("price", "source_row", "history_count") and value.lstrip().startswith(("=", "+", "-", "@")):
                value = "'" + value
            values.append(value)
        writer.writerow(values)
    return output.getvalue().encode("utf-8")


class PriceService:
    def __init__(self, context):
        self.context = context

    def get_app_status(self):
        return {"app": APP_ID, "version": VERSION, "status": "ready",
                "storage_generation": self.context.storage_generation}

    def get_meta(self, generation):
        store, captured = self.context.capture(generation)
        return {**store.meta(), "storage_generation": captured}

    def list_quotes(self, filters, generation, query_sequence=0):
        store, captured = self.context.capture(generation)
        return {**store.list(checked_filters(filters)), "storage_generation": captured,
                "query_sequence": query_sequence}

    def refresh_quotes(self, filters, generation, query_sequence=0):
        store, captured = self.context.capture(generation)
        result = store.refresh(checked_filters(filters))
        check_read_cancelled()
        return {"meta": {**result["meta"], "storage_generation": captured},
                "quotes": {**result["quotes"], "storage_generation": captured, "query_sequence": query_sequence}}

    def get_history(self, row_id, generation):
        store, captured = self.context.capture(generation)
        try:
            row_id = int(row_id)
        except (ValueError, TypeError):
            raise ValidationError("报价编号无效") from None
        return {**store.history(row_id), "storage_generation": captured}

    def match_image_quote(self, record, generation, *, selected_customer="", data_generation=None):
        """Read-only matching; the original append entry point protects the save."""
        data = dict(record)
        if selected_customer:
            data["customer"] = selected_customer
        data = validate_record(data)
        reason = data["reason"]
        with self.context.operation_lock:
            store, captured = self.context.capture(generation)
            self.context.assert_data_generation(data_generation)
            states = store.customer_states()
            state = states.get(customer_key(data["customer"]))
            if state and state["status"] != "active":
                raise ValidationError("该客户已在回收站，请先恢复客户")
            if selected_customer and state is None:
                raise ValidationError("所选客户已不存在，请刷新客户目录")
            existing = store.active_all()
            merged, errors = match_customer_records([data], existing, {})
            if errors:
                raise ValidationError(errors[0]["message"])
            data = merged[0]
            data["reason"] = reason
            previous = [row for row in existing if identity(row) == identity(data)]
            cutoff = today()
            base = max(previous, key=lambda row: quote_order(row, cutoff)) if previous else None
            return {"record": data, "base": base, "customer_revision": state["revision"] if state else 0,
                    "storage_generation": captured, "data_generation": self.context.data_generation}

    def add_quote(self, command):
        data = asdict(command) if isinstance(command, QuoteCommand) else dict(command)
        with self.context.operation_lock:
            store, captured = self.context.capture(data.get("storage_generation"))
            self.context.assert_data_generation(data.get("data_generation"))
            validated = validate_record(data)
            base_id = data.get("base_id")
            if base_id is not None:
                if isinstance(base_id, bool) or not str(base_id).isdigit() or int(base_id) < 1:
                    raise ValidationError("报价基准编号无效")
                if not validated["reason"]:
                    raise ValidationError("请填写调价或补录原因", {"reason": "请填写调价或补录原因"})
            try:
                result = store.add({**validated, "base_id": base_id, "customer_revision": data.get("customer_revision"),
                                    "import_immediate": bool(data.get("import_immediate")),
                                    "fill_missing_identity": bool(data.get("fill_missing_identity"))})
            except sqlite3.Error:
                raise StorageError("数据库写入失败，请查看 data/app.log") from None
            if result.get("added") or data.get("fill_missing_identity"):
                self.context.invalidate_customer_data(clear_previews=False)
            return {**result, "storage_generation": captured}

    def _read_import(self, path, generation):
        self.context.capture(generation)
        path = Path(path)
        if not path.is_file() or not 0 < path.stat().st_size <= MAX_FILE_BYTES:
            raise ValidationError("请选择大于 0 且不超过 20 MB 的文件")
        # Bounded read also covers a file growing after stat().
        with path.open("rb") as handle:
            content = handle.read(MAX_FILE_BYTES + 1)
        return path, content

    def inspect_pdf(self, path, generation, import_options=None):
        from pdf_importer import inspect_pdf
        path, content = self._read_import(path, generation)
        result = inspect_pdf(content, path.name, import_options)
        self.context.capture(generation)
        return {key: value for key, value in result.items() if key != "rows"}

    def preview_import(self, path, generation, pdf_options=None):
        path, content = self._read_import(path, generation)
        options, mode = normalized_options(pdf_options)
        result = read_prices(content, path.name, pdf_options, fallback_date=options["default_effective_date"])
        check_read_cancelled()
        with self.context.operation_lock:
            store, captured = self.context.capture(generation)
            counts = {}
            baseline = {}
            page_actions = []
            raw_records = result["records"]
            states = store.customer_states()
            allowed = []
            for row in raw_records:
                state = states.get(customer_key(row["customer"]))
                if state and state["status"] != "active":
                    result["errors"].append({"row": row["source_row"], "sheet": row["source_sheet"],
                                             "message": f"客户“{state['display_name']}”已在回收站，请先恢复客户"})
                else:
                    allowed.append(row)
            result["records"] = raw_records = allowed
            if mode != "legacy":
                existing = store.active_all()
                if mode == "selected":
                    state = states.get(customer_key(options["selected_customer"]))
                    if state and state["status"] != "active":
                        raise ValidationError("所选客户已在回收站，请先恢复客户")
                    if not any(norm(row["customer"]) == norm(options["selected_customer"]) for row in existing):
                        raise ValidationError("所选客户已不存在，请刷新客户目录；创建新客户请选择“全部客户”")
                result["records"], match_errors = match_customer_records(raw_records, existing, options)
                result["errors"].extend(match_errors)
                latest_ids = {}
                for row in existing:
                    group = identity(row)
                    latest_ids[group] = max(latest_ids.get(group, 0), row["id"])
                baseline = {identity(row): latest_ids.get(identity(row), 0) for row in result["records"]}
                known_groups = {identity(row) for row in existing}
                known_customers = {norm(row["customer"]) for row in existing}
                keys = {import_key(row) for row in existing}
                actions = {}
                created = updated = skipped = 0
                for row in result["records"]:
                    key, group = import_key(row), identity(row)
                    if key in keys:
                        skipped += 1
                        actions.setdefault(key, "重复跳过")
                        page_actions.append("重复跳过")
                        continue
                    keys.add(key)
                    if group in known_groups:
                        updated += 1
                        actions[key] = "更新 / 合并"
                    else:
                        created += 1
                        actions[key] = "新增牌号"
                        known_groups.add(group)
                    page_actions.append(actions[key])
                counts = {"created": created, "updated": updated,
                          "new_customers": len({norm(row["customer"]) for row in result["records"]} - known_customers),
                          "customer_mode": mode, "selected_customer": options.get("selected_customer", "")}
            fresh, skipped = store.preview(result["records"])
            if mode == "legacy":
                fresh_keys = {import_key(row) for row in fresh}
                for row in result["records"]:
                    key = import_key(row)
                    page_actions.append("新增报价" if key in fresh_keys else "重复跳过")
                    fresh_keys.discard(key)
            customer_revisions = {customer_key(row["customer"]): states.get(customer_key(row["customer"]), {}).get("revision", 0)
                                  for row in result["records"]}
            previews = self.context.previews
            expiry = time.monotonic()
            for key in list(previews):
                if previews[key]["expires"] <= expiry:
                    del previews[key]
            if len(previews) >= 12:
                del previews[next(iter(previews))]
            preview_id = secrets.token_urlsafe(24)
            previews[preview_id] = {"expires": expiry + 600, "result": result, "generation": captured,
                                   "options": options, "baseline": baseline, "customer_revisions": customer_revisions,
                                   "raw_records": raw_records, "page_actions": page_actions}
            samples = (fresh or result["records"])[:50]
            if counts:
                samples = [{**row, "import_action": actions[import_key(row)], "material_spec": material_spec(row)} for row in samples]
            return {"preview_id": preview_id, "storage_generation": captured, "filename": path.name,
                    "added": len(fresh), "skipped": skipped, "omitted": result["omitted"],
                    "total": len(result["records"]) + len(result["errors"]), "sheet": result["sheet"],
                    "errors": result["errors"][:50], "error_count": len(result["errors"]),
                    "samples": samples, "warnings": result.get("warnings", []),
                    "page_data": self._import_page(previews[preview_id], 1), **counts}

    @staticmethod
    def _import_page(pending, page):
        records = pending["result"]["records"]
        pages = max(1, (len(records) + 49) // 50)
        if type(page) is not int or not 1 <= page <= pages:
            raise ValidationError("预览页码无效")
        start = (page - 1) * 50
        items = [{**row, "import_action": pending["page_actions"][index], "material_spec": material_spec(row)}
                 for index, row in enumerate(records[start:start + 50], start)]
        return {"items": items, "page": page, "pages": pages, "total": len(records), "page_size": 50}

    def get_import_page(self, preview_id, generation, page=1):
        with self.context.operation_lock:
            self.context.capture(generation)
            pending = self.context.previews.get(preview_id)
            if not pending or pending["expires"] <= time.monotonic():
                raise ValidationError("导入预览已过期或已使用，请重新选择文件")
            self.context.assert_generation(pending["generation"])
            return self._import_page(pending, page)

    def commit_import(self, preview_id, generation):
        with self.context.operation_lock:
            store, captured = self.context.capture(generation)
            pending = self.context.previews.pop(preview_id, None)
            if not pending or pending["expires"] <= time.monotonic():
                raise ValidationError("导入预览已过期或已使用，请重新选择文件")
            self.context.assert_generation(pending["generation"])
            if pending["result"]["errors"]:
                raise ValidationError("存在错误行，修正表格后才能导入")
            if pending["options"]["customer_mode"] != "legacy":
                existing = store.active_all()
                existing_keys = {import_key(row) for row in existing}
                proposed = pending["result"]["records"]
                missing = [row for row in proposed if import_key(row) not in existing_keys]
                missing_groups = {identity(row) for row in missing}
                if missing:
                    rematched, match_errors = match_customer_records(pending["raw_records"], existing, pending["options"])
                    if match_errors or [import_key(row) for row in rematched] != [import_key(row) for row in proposed]:
                        raise ConflictError("匹配目标在预览后已变化，请重新预览再合并")
                latest_ids = {}
                for row in existing:
                    group = identity(row)
                    latest_ids[group] = max(latest_ids.get(group, 0), row["id"])
                for group, expected in pending["baseline"].items():
                    latest = latest_ids.get(group, 0)
                    if latest != expected and group in missing_groups:
                        raise ConflictError("匹配报价在预览后已变化，请重新预览再合并")
            try:
                result = store.commit(pending["result"]["records"], customer_revisions=pending["customer_revisions"])
            except sqlite3.Error:
                raise StorageError("整批导入失败，事务已回滚；请重新预览") from None
            if result.get("added"):
                self.context.invalidate_customer_data(clear_previews=False)
            return {**result, "storage_generation": captured}

    def export_quotes(self, filters, mode, path, generation):
        if mode not in ("current", "history"):
            raise ValidationError("导出模式无效")
        self._extension(path, ".csv")
        with self.context.operation_lock:
            store, captured = self.context.capture(generation)
            self._safe_target(path)
            items = store.list(checked_filters(filters))["items"]
            columns = [("customer", "客户"), ("grade", "牌号"), ("material", "材料类别"), ("color", "颜色"),
                       ("price", "价格(元/kg)"), ("tax_type", "税口径"), ("effective_date", "更新日期"), ("note", "备注")]
            if mode == "history":
                keys = {row["identity"] for row in items}
                items = [row for row in store.all() if row["identity"] in keys]
                columns += [("reason", "调价原因"), ("created_at", "录入时间"), ("source_file", "来源文件"),
                            ("source_sheet", "来源工作表"), ("source_row", "来源行")]
            else:
                items = [{**row, "status": "待生效" if row["scheduled"] else "当前报价"} for row in items]
                columns += [("status", "报价状态"), ("history_count", "历史记录数")]
            atomic_bytes(path, csv_bytes(items, columns))
            return {"path": str(Path(path).resolve()), "records": len(items), "storage_generation": captured}

    def backup_database(self, path, generation):
        self._extension(path, ".sqlite3")
        with self.context.operation_lock:
            store, captured = self.context.capture(generation)
            self._safe_target(path)
            backup = store.backup("export")
            if Path(path).resolve() != backup.resolve():
                atomic_copy(backup, path)
            return {"path": str(Path(path).resolve()), "storage_generation": captured}

    def _safe_target(self, path):
        target = Path(path).resolve()
        protected = {self.context.folder / name for name in
                     ("prices.sqlite3", "config.local.json", "runtime.json", "instance.lock", "app.log", "ui.ini")}
        if target in protected:
            raise ValidationError("不能覆盖正在使用的数据库或程序配置，请另选文件")

    @staticmethod
    def _extension(path, suffix):
        if Path(path).suffix.lower() != suffix:
            raise ValidationError(f"保存文件须使用 {suffix} 扩展名，请另选文件")

    def save_import_template(self, path):
        self._safe_target(path)
        self._extension(path, ".csv")
        columns = [("customer", "客户"), ("grade", "牌号"), ("material", "材料"), ("color", "颜色"),
                   ("price", "价格"), ("tax_type", "税口径"), ("note", "备注")]
        return {"path": atomic_bytes(path, csv_bytes([], columns))}

    def save_cloud_schema(self, path):
        self._safe_target(path)
        self._extension(path, ".sql")
        schema = (ASSETS / "supabase.sql").read_bytes() + b"\n" + (ASSETS / "migrations/quote_workflow_v160.sql").read_bytes()
        return {"path": atomic_bytes(path, schema)}

    def save_cloud_workflow(self, path):
        self._safe_target(path)
        self._extension(path, ".sql")
        return {"path": atomic_bytes(path, (ASSETS / "migrations/quote_workflow_v160.sql").read_bytes())}
