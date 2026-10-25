"""Supabase REST adapter. Server-only secret; no external runtime dependencies."""
from __future__ import annotations

import base64
import datetime as dt
import json
import secrets
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from domain import (
    ASSETS,
    FIELDS,
    IMMEDIATE_SOURCES,
    MAX_ROWS,
    TZ,
    Conflict,
    NetworkError,
    ValidationError,
    customer_key,
    history_result,
    identity,
    import_key,
    today,
)
from importer import clean, money, validate_record
from services.project_progress_service import DEFAULT_PROJECT_RULES
from services.read_control import check_read_cancelled
from storage.atomic_files import atomic_copy
from storage.sqlite_store import SQLiteStore as Store


class ReadApiUnavailable(ValidationError):
    """Only a missing optional read RPC can trigger compatibility fallback."""


def validate_config(url, key):
    try:
        parsed = urllib.parse.urlsplit(url)
        port = parsed.port
    except ValueError:
        raise ValueError("项目地址应为 https://项目编号.supabase.co") from None
    if (parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".supabase.co")
            or parsed.username or parsed.password or port or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
        raise ValueError("项目地址应为 https://项目编号.supabase.co")
    if key.startswith("sb_secret_") and len(key) > 25:
        return
    try:
        encoded = key.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
        if claims.get("role") == "service_role":
            return
    except (ValueError, IndexError, TypeError):
        pass
    raise ValueError("请使用后端 Secret key 或 service_role key；不要使用 anon/publishable key")


class SupabaseStore(Store):
    backend = "supabase"

    def __init__(self, folder, url, key):
        validate_config(url, key)
        self.folder = Path(folder).resolve()
        self.path = "Supabase / public.pm_quotes"
        self.url = url.rstrip("/")
        self.key = key
        self.lock = threading.RLock()
        self._missing_read_apis = set()

    def request_headers(self):
        headers = {"apikey": self.key, "Accept": "application/json", "Content-Type": "application/json"}
        if not self.key.startswith("sb_secret_"):
            headers["Authorization"] = "Bearer " + self.key
        return headers

    def authorization_error_message(self):
        return "Supabase 密钥或权限无效，请检查后端 Secret/service_role key"

    def request(self, route, body=None, count=False):
        check_read_cancelled()
        headers = self.request_headers()
        if count:
            headers["Prefer"] = "count=exact"
        request = urllib.request.Request(self.url + "/rest/v1/" + route, headers=headers,
            data=None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8"),
            method="GET" if body is None else "POST")
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                content = response.read(40 * 1024 * 1024 + 1)
                check_read_cancelled()
                if len(content) > 40 * 1024 * 1024:
                    raise ValueError("云端响应过大，请分批处理")
                return json.loads(content), response.headers.get("Content-Range", "")
        except urllib.error.HTTPError as exc:
            try:
                detail = json.loads(exc.read(4096))
            except (ValueError, UnicodeDecodeError):
                detail = {}
            if not isinstance(detail, dict):
                detail = {}
            code = detail.get("code", "")
            if code == "P0001":
                raise Conflict(clean(detail.get("message", "报价已变化，请刷新"), 500)) from None
            if code == "22023":
                raise ValueError(clean(detail.get("message", "云端参数校验失败"), 500)) from None
            if exc.code in (401, 403):
                raise ValueError(self.authorization_error_message()) from None
            if exc.code == 404 or code in ("42P01", "PGRST202", "PGRST205"):
                if route in ("rpc/pm_customer_profiles_v1", "rpc/pmu_customer_profiles_v1") and code != "42P01":
                    raise ReadApiUnavailable("云端客户管理接口尚未部署") from None
                if route in ("rpc/pm_current_quotes_v165", "rpc/pm_customer_summaries_v165", "rpc/pm_customer_details_v165") and code != "42P01":
                    raise ReadApiUnavailable("云端尚未安装可选读取优化接口") from None
                raise ValueError("Supabase 表或 RPC 尚未就绪，请先执行附带建表 SQL") from None
            raise ValueError(f"Supabase 请求失败（HTTP {exc.code}，{code or '请检查数据库约束或服务状态'}）") from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise NetworkError("无法连接 Supabase，请检查网络；保存请求中断时先刷新历史核对是否已保存，再重试") from None
        except json.JSONDecodeError:
            raise ValueError("Supabase 返回内容不是有效 JSON") from None

    def check(self):
        settings, _ = self.request("pm_settings?select=value&key=eq.schema_version")
        if not settings or settings[0].get("value") != "2":
            raise ValueError("Supabase 数据库版本不匹配，请执行客户回收站 schema 2 迁移 SQL")
        _, count = self.request("pm_quotes?select=id&limit=1", count=True)
        total = count.rsplit("/", 1)[-1] if "/" in count else "未知"
        return {"message": f"连接成功，建表版本 2，当前云端报价记录 {total} 条；未写入云端数据", "records": total}

    def project_progress_list(self):
        if not getattr(self, "session", None):
            raise ValueError("项目进度云端同步需要使用程序账号登录")
        result, _ = self.request("rpc/pm_project_progress_v2", {})
        if not isinstance(result, dict) or not isinstance(result.get("rules"), dict) or not isinstance(result.get("projects"), list):
            raise ValidationError("云端项目进度格式无效")
        return result

    def save_project_progress(self, record):
        if not getattr(self, "session", None):
            raise ValueError("项目进度云端同步需要使用程序账号登录")
        is_new = bool(record.get("_new_project"))
        result, _ = self.request("rpc/pm_save_project_progress_v2", {
            "p_project_id": None if is_new else record.get("project_id"),
            "p_expected_revision": None if is_new else record.get("revision"),
            "p_record": {key: record.get(key, "") or "" for key in (
                "industry", "customer_type", "customer_name", "material", "recommended_grade", "material_value",
                "color", "competitor", "product_name", "stage_code", "customer_value", "competition",
                "custom_stage_label", "custom_customer_value", "custom_material_value", "custom_competition",
                "next_action", "milestone_date", "notes",
            )},
        })
        if not isinstance(result, dict) or not result.get("project_id"):
            raise ValidationError("云端项目保存响应无效")
        return {"project_id": str(result["project_id"]), "revision": int(result["revision"])}

    def all(self):
        rows, offset = [], 0
        for _ in range(250):
            batch, content_range = self.request(f"pm_quotes?select=*&order=effective_date.desc,id.desc&limit=1000&offset={offset}", count=True)
            if not isinstance(batch, list):
                raise ValueError("云端报价格式无效")
            for row in batch:
                row["price"] = money(row["price"])
            rows.extend(batch)
            offset += len(batch)
            suffix = content_range.rsplit("/", 1)[-1] if "/" in content_range else ""
            total = int(suffix) if suffix.isdigit() else None
            if total is not None and offset >= total:
                return rows
            if total is None and len(batch) < 1000:
                return rows
            if not batch:
                raise ValueError("云端分页读取不完整，请重新查询")
        raise ValueError("云端历史超过单次读取范围，请按独立项目规划分区查询")

    def seed_summary(self):
        return json.loads((ASSETS / "seed.json").read_text(encoding="utf-8"))["summary"]

    def active_all(self):
        rows, _ = self.request("rpc/pm_active_quotes", {})
        for row in rows:
            row["price"] = money(row["price"])
        return rows

    def customer_states(self):
        rows, _ = self.request("rpc/pm_customer_states", {})
        return {r["customer_key"]: r for r in rows}

    def customer_profiles_list(self):
        result = self._read_rpc("rpc/pm_customer_profiles_v1", {})
        if result is None:
            raise ReadApiUnavailable("云端客户档案尚未初始化，请先完成客户管理数据库迁移")
        if not isinstance(result, dict) or not isinstance(result.get("profiles"), list):
            raise ValidationError("云端客户档案响应格式无效")
        return result["profiles"]

    def save_customer_profiles(self, profiles):
        result, _ = self.request("rpc/pm_save_customer_profiles_v1", {"p_profiles": profiles})
        if (not isinstance(result, dict) or not isinstance(result.get("profiles"), list)
                or any(isinstance(result.get(key), bool) or not isinstance(result.get(key), int)
                       or result[key] < 0 for key in ("created", "updated", "skipped"))):
            raise ValidationError("云端客户档案保存响应格式无效")
        return result

    def customer_request(self, request_id):
        rows, _ = self.request("pm_customer_audit?select=*&request_id=eq." + urllib.parse.quote(request_id, safe=""))
        return rows[0] if rows else None

    def change_customer(self, key, action, expected_revision, request_id, reason=""):
        result, _ = self.request("rpc/pm_change_customer", {"p_customer_key": key, "p_action": action,
                                                          "p_expected_revision": expected_revision,
                                                          "p_request_id": request_id, "p_reason": reason})
        return result

    def _read_rpc(self, route, body):
        if route in self._missing_read_apis:
            return None
        try:
            rows, _ = self.request(route, body)
            return rows
        except ReadApiUnavailable:
            self._missing_read_apis.add(route)
            return None

    def list(self, filters=None):
        cutoff = today()
        rows = self._read_rpc("rpc/pm_current_quotes_v165", {"p_today": cutoff})
        if rows is None:
            return self.list_from_all(filters)
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise ValidationError("云端当前报价格式无效")
        for row in rows:
            row["price"] = money(row["price"])
            if row["previous_price"] is not None:
                row["previous_price"] = money(row["previous_price"])
        current = self.decorate_ranked(rows, cutoff)
        current.sort(key=lambda row: (row["customer"], row["grade"], row["color"], row["tax_type"]))
        return self.filter_current(current, filters)

    def customer_summaries(self, status):
        rows = self._read_rpc("rpc/pm_customer_summaries_v165", {"p_status": status})
        if rows is not None:
            if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
                raise ValidationError("云端客户汇总格式无效")
            return rows
        states = self.customer_states()
        counts = {key: {**state, "specs": set(), "records": 0}
                  for key, state in states.items() if state["status"] == status}
        for row in self.all():
            check_read_cancelled()
            item = counts.get(row["customer_key"])
            if item is not None:
                item["specs"].add(row["identity"])
                item["records"] += 1
        return [{**item, "specs": len(item["specs"])} for item in counts.values()]

    def customer_details(self, key):
        detail = self._read_rpc("rpc/pm_customer_details_v165", {"p_customer_key": key})
        if detail is not None:
            if not isinstance(detail, dict) or detail.get("customer_key") != key or not isinstance(detail.get("items"), list):
                raise ValidationError("云端客户详情格式无效")
            for row in detail["items"]:
                row["price"] = money(row["price"])
            return detail
        state = self.customer_states().get(key)
        if state is None:
            raise ValidationError("客户不存在，请刷新客户目录")
        rows, offset = [], 0
        for _ in range(250):
            batch, content_range = self.request("pm_quotes?select=*&customer_key=eq." + urllib.parse.quote(key, safe="") +
                                                "&order=effective_date.desc,id.desc&limit=1000&offset=" + str(offset), count=True)
            if not isinstance(batch, list) or any(not isinstance(row, dict) or row.get("customer_key") != key for row in batch):
                raise ValidationError("云端客户详情格式无效")
            rows.extend(batch)
            offset += len(batch)
            suffix = content_range.rsplit("/", 1)[-1] if "/" in content_range else ""
            total = int(suffix) if suffix.isdigit() else None
            if (total is not None and offset >= total) or (total is None and len(batch) < 1000):
                break
            if not batch:
                raise ValidationError("云端分页读取不完整，请重新查询")
        else:
            raise ValidationError("该客户历史超过单次读取范围")
        for row in rows:
            row["price"] = money(row["price"])
        return {**state, "items": rows, "specs": len({row["identity"] for row in rows}),
                "records": len(rows), "future_records": sum(row["effective_date"] > today() for row in rows)}

    def history(self, row_id):
        result, _ = self.request("pm_quotes?select=identity,customer_key&id=eq." + str(int(row_id)))
        if not result:
            raise ValueError("该报价不存在，请刷新查询")
        group = result[0]["identity"]
        state = self.customer_states().get(result[0]["customer_key"])
        if not state or state["status"] != "active":
            raise ValidationError("该客户已在回收站，请从回收站查看只读历史")
        rows, offset = [], 0
        for _ in range(250):
            batch, content_range = self.request("pm_quotes?select=*&identity=eq." + group + "&order=effective_date.desc,id.desc&limit=1000&offset=" + str(offset), count=True)
            rows.extend(batch)
            offset += len(batch)
            suffix = content_range.rsplit("/", 1)[-1] if "/" in content_range else ""
            total = int(suffix) if suffix.isdigit() else None
            if (total is not None and offset >= total) or (total is None and len(batch) < 1000):
                break
            if not batch:
                raise ValueError("云端分页读取不完整，请重新查询")
        else:
            raise ValueError("该规格的历史超过单次读取范围")
        for row in rows:
            row["price"] = money(row["price"])
        return history_result(rows, cutoff=self.business_day())

    def business_day(self):
        return today()

    def add(self, data):
        if data.get("fill_missing_identity") or data.get("import_immediate"):
            self.require_quote_workflow()
        row = validate_record(data)
        row["identity"] = identity(row)
        row["customer_key"] = customer_key(row["customer"])
        state = self.customer_states().get(row["customer_key"])
        if state and state["status"] != "active":
            raise ValidationError("客户已在回收站，请先恢复客户")
        row["customer_revision"] = data.get("customer_revision")
        row["import_immediate"] = bool(data.get("import_immediate"))
        if row["customer_revision"] is None:
            row["customer_revision"] = state["revision"] if state else 0
        fill = bool(data.get("fill_missing_identity"))
        changes = []
        if data.get("base_id") is not None:
            if not row["reason"]:
                raise ValueError("请填写调价或补录原因")
            base_id = int(data["base_id"])
            existing, _ = self.request("pm_quotes?select=*&id=eq." + str(base_id))
            if not existing or (not fill and existing[0]["identity"] != row["identity"]):
                raise Conflict("客户/牌号/颜色/税口径被更改，请刷新后再操作")
            if not fill and not row["import_immediate"] and existing[0].get("source_type") in IMMEDIATE_SOURCES and existing[0]["effective_date"] > today():
                self.require_quote_workflow()
            if fill:
                prior = existing[0]
                if prior["customer"] != row["customer"] or prior["grade"] != row["grade"]:
                    raise Conflict("客户或牌号被更改，请刷新后再操作")
                if (prior["color"] and prior["color"] != row["color"]) or (prior["tax_type"] != "未注明" and prior["tax_type"] != row["tax_type"]):
                    raise ValidationError("仅能补齐原来空白的颜色或未注明税口径")
                if prior["identity"] == row["identity"]:
                    raise ValidationError("没有需要补齐的颜色或税口径")
                for item in self.history(base_id)["items"]:
                    changes.append({"id": item["id"], "import_key": import_key({**item, "color": row["color"], "tax_type": row["tax_type"]}) if item.get("import_key") else None})
        else:
            base_id = None
        with self.lock:
            backup = self.backup("before-fill-missing") if fill else None
            if fill or data.get("import_immediate"):
                result, _ = self.request("rpc/pm_save_quote_v160", {"p_record": row, "p_base_id": base_id, "p_history_keys": changes if fill else None})
            else:
                result, _ = self.request("rpc/pm_add_quote", {"p_record": row, "p_base_id": base_id})
            if backup:
                result["backup"] = str(backup)
        if "record" not in result:
            # A failed follow-up read must not turn a completed save into a retry.
            try:
                items = self.list({"customer": row["customer"]})["items"]
                result["record"] = next((item for item in items if item["identity"] == row["identity"]), None)
            except ValueError:
                result["record"] = None
        return result

    def require_quote_workflow(self):
        workflow, _ = self.request("pm_settings?select=value&key=eq.quote_workflow_version")
        if not workflow or workflow[0].get("value") != "1.6.0":
            raise ValidationError("云端需先执行 Supabase报价完善与即时生效-1.6.0.sql，再保存补填或图片报价。可在数据库设置中导出升级 SQL。")

    def preview(self, records):
        states = self.customer_states()
        for row in records:
            state = states.get(customer_key(row["customer"]))
            if state and state["status"] != "active":
                raise ValidationError("客户已在回收站，请先恢复客户")
        keys = {import_key(row) for row in self.all()}
        fresh, duplicates = [], 0
        for row in records:
            key = import_key(row)
            if key in keys:
                duplicates += 1
            else:
                keys.add(key)
                fresh.append(row)
        return fresh, duplicates

    def backup(self, label="auto"):
        with self.lock:
            payload, _ = self.request("rpc/pm_export_snapshot", {})
            project_data = self.project_progress_list() if getattr(self, "session", None) else {
                "rules": DEFAULT_PROJECT_RULES, "projects": []}
            rows = payload["quotes"]
            for row in rows:
                row["price"] = money(row["price"])
            folder = self.folder / "backups"
            folder.mkdir(parents=True, exist_ok=True)
            path = folder / f"supabase-{dt.datetime.now(TZ):%Y%m%d-%H%M%S}-{label}-{secrets.token_hex(3)}.sqlite3"
            with tempfile.TemporaryDirectory(prefix="snapshot-", dir=folder) as temp:
                snapshot = Store(temp, load_seed=False)
                columns = ("id", "identity") + FIELDS + ("created_at", "source_type", "import_key", "customer_key")
                with snapshot.connection() as db:
                    db.execute("UPDATE settings SET value=? WHERE key='project_progress_rules'",
                               (json.dumps(project_data["rules"], ensure_ascii=False),))
                    for customer in payload["customers"]:
                        db.execute("INSERT INTO customers VALUES (?,?,?,?,?,?)", tuple(customer[k] for k in
                                   ("customer_key", "display_name", "status", "revision", "deleted_at", "deleted_reason")))
                    for row in rows:
                        db.execute(f"INSERT INTO quotes ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})", tuple(row[k] for k in columns))
                    for entry in payload["audit"]:
                        db.execute("INSERT INTO customer_audit VALUES (?,?,?,?,?,?,?)", tuple(entry[k] for k in
                                   ("request_id", "customer_key", "action", "expected_revision", "revision", "reason", "created_at")))
                    project_columns = (
                        "project_id", "industry", "customer_type", "customer_name", "material", "recommended_grade",
                        "material_value", "color", "competitor", "product_name", "stage_code", "customer_value",
                        "competition", "custom_stage_label", "custom_customer_value", "custom_material_value",
                        "custom_competition", "next_action", "milestone_date", "notes", "revision", "updated_at",
                    )
                    for project in project_data["projects"]:
                        db.execute(f"INSERT INTO project_progress ({','.join(project_columns)}) VALUES "
                                   f"({','.join('?' for _ in project_columns)})",
                                   tuple(project.get(key) or "" for key in project_columns))
                atomic_copy(snapshot.path, path)
            return path

    def commit(self, records, customer_revisions=None):
        if len(records) > MAX_ROWS:
            raise ValueError("一次最多导入 20000 条报价")
        records = [validate_record(row) for row in records]
        with self.lock:
            fresh, skipped = self.preview(records)
            backup = self.backup("before-import") if fresh else None
            states = self.customer_states()
            revisions = customer_revisions if customer_revisions is not None else {
                customer_key(r["customer"]): states.get(customer_key(r["customer"]), {}).get("revision", 0) for r in records}
            payload = [{**r, "identity": identity(r), "import_key": import_key(r), "customer_key": customer_key(r["customer"])} for r in fresh]
            result, _ = self.request("rpc/pm_import_quotes", {"p_records": payload, "p_customer_revisions": revisions})
            return {"added": result["added"], "skipped": skipped + result["skipped"], "backup": str(backup) if backup else None}
