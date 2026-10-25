"""SQLite append-only quotes and reversible customer lifecycle (schema 2)."""
from __future__ import annotations

import datetime as dt
import json
import secrets
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path

from domain import (
    ASSETS,
    FIELDS,
    IMMEDIATE_SOURCES,
    MAX_ROWS,
    TZ,
    VERSION,
    Conflict,
    ValidationError,
    customer_key,
    history_result,
    identity,
    import_key,
    is_effective,
    norm,
    now,
    quote_order,
    today,
    validate_record,
)
from services.project_progress_service import DEFAULT_PROJECT_RULES
from services.read_control import ReadCancelled, check_read_cancelled, read_was_cancelled


class SQLiteStore:
    backend = "sqlite"

    def __init__(self, folder, load_seed=True):
        self.folder = Path(folder).resolve()
        self.folder.mkdir(parents=True, exist_ok=True)
        self.path = self.folder / "prices.sqlite3"
        self.lock = threading.RLock()
        with self.connection() as db:
            if db.execute("SELECT 1 FROM sqlite_master WHERE name='settings'").fetchone():
                version = db.execute("SELECT value FROM settings WHERE key='schema_version'").fetchone()
                if version and version[0] not in ("1", "2"):
                    raise ValidationError("数据库版本不兼容，请使用匹配版本的程序")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS quotes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, identity TEXT NOT NULL,
                    customer TEXT NOT NULL, grade TEXT NOT NULL, material TEXT NOT NULL,
                    color TEXT NOT NULL, price TEXT NOT NULL, tax_type TEXT NOT NULL,
                    effective_date TEXT NOT NULL, note TEXT NOT NULL, reason TEXT NOT NULL,
                    source_file TEXT NOT NULL, source_sheet TEXT NOT NULL, source_row INTEGER NOT NULL,
                    created_at TEXT NOT NULL, source_type TEXT NOT NULL,
                    import_key TEXT UNIQUE
                );
                CREATE INDEX IF NOT EXISTS idx_quotes_identity_date ON quotes(identity, effective_date DESC, id DESC);
                CREATE TABLE IF NOT EXISTS project_progress (
                    project_id TEXT PRIMARY KEY, industry TEXT NOT NULL, customer_type TEXT NOT NULL,
                    customer_name TEXT NOT NULL, material TEXT NOT NULL, recommended_grade TEXT NOT NULL,
                    material_value TEXT NOT NULL, color TEXT NOT NULL, competitor TEXT NOT NULL,
                    product_name TEXT NOT NULL, stage_code INTEGER NOT NULL, customer_value TEXT NOT NULL,
                    competition TEXT NOT NULL, next_action TEXT NOT NULL, milestone_date TEXT NOT NULL,
                    notes TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_project_progress_updated ON project_progress(updated_at DESC, project_id);
                CREATE TABLE IF NOT EXISTS customer_profiles (
                    profile_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '',
                    phone TEXT NOT NULL DEFAULT '', industry TEXT NOT NULL DEFAULT '',
                    address TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL CHECK(revision >= 1),
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_customer_profiles_name ON customer_profiles(name COLLATE NOCASE, profile_id);
            """)
            project_columns = {row["name"] for row in db.execute("PRAGMA table_info(project_progress)")}
            profile_columns = {row["name"] for row in db.execute("PRAGMA table_info(customer_profiles)")}
            if "notes" not in profile_columns:
                db.execute("ALTER TABLE customer_profiles ADD COLUMN notes TEXT NOT NULL DEFAULT ''")
            for column in ("custom_stage_label", "custom_customer_value", "custom_material_value", "custom_competition"):
                if column not in project_columns:
                    db.execute(f"ALTER TABLE project_progress ADD COLUMN {column} TEXT NOT NULL DEFAULT ''")
            version = db.execute("SELECT value FROM settings WHERE key='schema_version'").fetchone()
            if not version or version[0] == "1":
                db.execute("BEGIN IMMEDIATE")
                original = [tuple(r) for r in db.execute("SELECT * FROM quotes ORDER BY id")]
                if version:
                    self.backup("before-schema-2")
                db.execute("CREATE TABLE customers (customer_key TEXT PRIMARY KEY, display_name TEXT NOT NULL, "
                           "status TEXT NOT NULL CHECK(status IN ('active','deleted')), revision INTEGER NOT NULL, "
                           "deleted_at TEXT, deleted_reason TEXT NOT NULL DEFAULT '')")
                db.execute("CREATE TABLE customer_audit (request_id TEXT PRIMARY KEY, customer_key TEXT NOT NULL "
                           "REFERENCES customers(customer_key), action TEXT NOT NULL CHECK(action IN ('delete','restore')), "
                           "expected_revision INTEGER NOT NULL, revision INTEGER NOT NULL, reason TEXT NOT NULL, "
                           "created_at TEXT NOT NULL)")
                db.execute("ALTER TABLE quotes ADD COLUMN customer_key TEXT REFERENCES customers(customer_key)")
                for row in db.execute("SELECT customer, count(*) AS n FROM quotes GROUP BY customer ORDER BY min(id)").fetchall():
                    key = customer_key(row["customer"])
                    db.execute("INSERT INTO customers VALUES (?,?,'active',?,NULL,'') "
                               "ON CONFLICT(customer_key) DO UPDATE SET revision=revision+excluded.revision",
                               (key, row["customer"], row["n"]))
                    db.execute("UPDATE quotes SET customer_key=? WHERE customer=?", (key, row["customer"]))
                db.execute("CREATE INDEX idx_quotes_customer ON quotes(customer_key,identity,effective_date DESC,id DESC)")
                if original != [tuple(r)[:-1] for r in db.execute("SELECT * FROM quotes ORDER BY id")]:
                    raise ValidationError("迁移校验失败，原报价字段未保持一致；事务已回滚")
                db.execute("INSERT INTO settings VALUES ('schema_version','2') ON CONFLICT(key) DO UPDATE SET value='2'")
            db.execute("INSERT OR IGNORE INTO settings(key,value) VALUES ('project_progress_rules',?)",
                       (json.dumps(DEFAULT_PROJECT_RULES, ensure_ascii=False),))
            if not db.execute("SELECT 1 FROM settings WHERE key='seed_loaded'").fetchone():
                seed = json.loads((ASSETS / "seed.json").read_text(encoding="utf-8"))
                for item in seed["records"] if load_seed else []:
                    self.insert(db, validate_record(item), "原始导入", import_key(item))
                db.execute("INSERT INTO settings VALUES ('seed_loaded','1')")
                db.execute("INSERT INTO settings VALUES ('seed_summary',?)", (json.dumps(seed["summary"], ensure_ascii=False),))

    @contextmanager
    def connection(self):
        check_read_cancelled()
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.create_function("pm_norm", 1, norm, deterministic=True)
        db.set_progress_handler(lambda: int(read_was_cancelled()), 1000)
        try:
            with db:
                yield db
                check_read_cancelled()
        except sqlite3.OperationalError:
            if read_was_cancelled():
                raise ReadCancelled("读取已被最新查询替代") from None
            raise
        finally:
            db.close()

    @staticmethod
    def insert(db, row, source_type, key=None):
        customer = customer_key(row["customer"])
        SQLiteStore.assert_customer(db, customer)
        db.execute("INSERT INTO customers VALUES (?,?,'active',0,NULL,'') ON CONFLICT(customer_key) DO NOTHING", (customer, row["customer"]))
        columns = ("identity",) + FIELDS + ("created_at", "source_type", "import_key", "customer_key")
        values = (identity(row),) + tuple(row[k] for k in FIELDS) + (now(), source_type, key, customer)
        cursor = db.execute(f"INSERT INTO quotes ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})", values)
        db.execute("UPDATE customers SET revision=revision+1 WHERE customer_key=?", (customer,))
        return cursor.lastrowid

    @staticmethod
    def assert_customer(db, key, expected_revision=None):
        customer = db.execute("SELECT * FROM customers WHERE customer_key=?", (key,)).fetchone()
        if customer and customer["status"] != "active":
            raise ValidationError(f"客户“{customer['display_name']}”已在回收站，请先恢复客户")
        actual = customer["revision"] if customer else 0
        if expected_revision is not None and actual != expected_revision:
            raise Conflict("客户或报价已变化，请重新打开表单或重新预览")
        return customer

    def customer_states(self):
        with self.connection() as db:
            return {r["customer_key"]: dict(r) for r in db.execute("SELECT * FROM customers")}

    def customer_profiles_list(self):
        with self.connection() as db:
            return [dict(row) for row in db.execute(
                "SELECT * FROM customer_profiles ORDER BY name COLLATE NOCASE,profile_id")]

    def save_customer_profiles(self, profiles):
        fields = ("name", "contact", "phone", "industry", "address", "notes")
        created = updated = skipped = 0
        saved = []
        with self.lock, self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            seen = set()
            for profile in profiles:
                profile_id = profile.get("profile_id") or str(uuid.uuid4())
                if profile_id in seen:
                    raise ValidationError("客户资料批次包含重复编号")
                seen.add(profile_id)
                values = tuple(profile.get(field, "") for field in fields)
                existing = db.execute("SELECT * FROM customer_profiles WHERE profile_id=?", (profile_id,)).fetchone()
                if existing is None:
                    db.execute(
                        "INSERT INTO customer_profiles(profile_id,name,contact,phone,industry,address,notes,revision,created_at,updated_at) "
                        "VALUES (?,?,?,?,?,?,?,1,?,?)",
                        (profile_id, *values, now(), now()),
                    )
                    created += 1
                else:
                    expected = profile.get("revision")
                    if 'notes' not in profile:
                        values = (*values[:-1], existing['notes'])
                    if expected is None or expected != existing["revision"]:
                        raise Conflict("客户资料已被其他操作修改，请刷新后重新编辑")
                    if all(existing[field] == value for field, value in zip(fields, values)):
                        skipped += 1
                    else:
                        revision = existing["revision"] + 1
                        db.execute(
                            "UPDATE customer_profiles SET name=?,contact=?,phone=?,industry=?,address=?,notes=?,revision=?,updated_at=? "
                            "WHERE profile_id=?",
                            (*values, revision, now(), profile_id),
                        )
                        updated += 1
                saved.append(dict(db.execute(
                    "SELECT * FROM customer_profiles WHERE profile_id=?", (profile_id,)).fetchone()))
        return {"created": created, "updated": updated, "skipped": skipped, "profiles": saved}

    def active_all(self):
        with self.connection() as db:
            return [dict(r) for r in db.execute("SELECT q.*,c.revision AS customer_revision FROM quotes q JOIN customers c USING(customer_key) "
                                               "WHERE c.status='active' ORDER BY effective_date DESC,id DESC")]

    def customer_details(self, key):
        with self.connection() as db:
            state = db.execute("SELECT * FROM customers WHERE customer_key=?", (key,)).fetchone()
            if state is None:
                raise ValidationError("客户不存在，请刷新客户目录")
            rows = [dict(r) for r in db.execute("SELECT * FROM quotes WHERE customer_key=? "
                                               "ORDER BY effective_date DESC,id DESC", (key,))]
        return {**dict(state), "items": rows, "specs": len({r["identity"] for r in rows}),
                "records": len(rows), "future_records": sum(r["effective_date"] > today() for r in rows)}

    def customer_summaries(self, status):
        with self.connection() as db:
            return [dict(row) for row in db.execute(
                "SELECT c.*,COUNT(DISTINCT q.identity) AS specs,COUNT(q.id) AS records "
                "FROM customers c LEFT JOIN quotes q USING(customer_key) WHERE c.status=? "
                "GROUP BY c.customer_key ORDER BY c.display_name", (status,))]

    def customer_request(self, request_id):
        with self.connection() as db:
            row = db.execute("SELECT * FROM customer_audit WHERE request_id=?", (request_id,)).fetchone()
            return dict(row) if row else None

    def change_customer(self, key, action, expected_revision, request_id, reason=""):
        status = "deleted" if action == "delete" else "active"
        with self.lock, self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            prior = db.execute("SELECT * FROM customer_audit WHERE request_id=?", (request_id,)).fetchone()
            if prior:
                if (prior["customer_key"], prior["action"], prior["expected_revision"], prior["reason"]) != (key, action, expected_revision, reason):
                    raise Conflict("请求编号被用于其他客户操作，请重新预览")
                return dict(prior)
            customer = db.execute("SELECT * FROM customers WHERE customer_key=?", (key,)).fetchone()
            if not customer or customer["revision"] != expected_revision or customer["status"] == status:
                raise Conflict("客户状态或报价已变化，请重新预览后操作")
            revision, timestamp = expected_revision + 1, now()
            db.execute("UPDATE customers SET status=?,revision=?,deleted_at=?,deleted_reason=? WHERE customer_key=?",
                       (status, revision, timestamp if action == "delete" else None, reason if action == "delete" else "", key))
            db.execute("INSERT INTO customer_audit VALUES (?,?,?,?,?,?,?)", (request_id, key, action, expected_revision, revision, reason, timestamp))
            return dict(db.execute("SELECT * FROM customer_audit WHERE request_id=?", (request_id,)).fetchone())

    def all(self):
        with self.connection() as db:
            return [dict(r) for r in db.execute("SELECT * FROM quotes ORDER BY effective_date DESC, id DESC")]

    @staticmethod
    def current(groups):
        cutoff = today()
        items = []
        for rows in groups.values():
            check_read_cancelled()
            active = [r for r in rows if is_effective(r, cutoff)]
            row = dict(max(active or rows, key=lambda r: quote_order(r, cutoff)))
            row["scheduled"] = not bool(active)
            row["future_count"] = len(rows) - len(active)
            row["history_count"] = len(rows)
            ordered = sorted(active, key=lambda r: quote_order(r, cutoff), reverse=True)
            row["previous_price"] = ordered[1]["price"] if len(ordered) > 1 else None
            row["delta"] = format(Decimal(ordered[0]["price"]) - Decimal(ordered[1]["price"]), "f") if len(ordered) > 1 else None
            age = (dt.date.fromisoformat(cutoff) - dt.date.fromisoformat(row["effective_date"])).days
            row["age_days"] = age
            row["stale"] = age > 60 and bool(active)
            items.append(row)
        return sorted(items, key=lambda r: (r["customer"], r["grade"], r["color"], r["tax_type"]))

    def list_from_all(self, filters=None):
        filters = filters or {}
        rows = self.active_all()
        groups = {}
        for row in rows:
            groups.setdefault(row["identity"], []).append(row)
        current = self.current(groups)
        return self.filter_current(current, filters)

    @classmethod
    def filter_current(cls, current, filters=None):
        filters = filters or {}
        check_read_cancelled()
        customer = norm(filters.get("customer", ""))
        term = norm(filters.get("q", ""))
        material = filters.get("material", "")
        tax = filters.get("tax", "")
        start, end = filters.get("from", ""), filters.get("to", "")
        for value in (start, end):
            if value:
                dt.date.fromisoformat(value)
        if start and end and start > end:
            raise ValueError("开始日期不能晚于结束日期")
        result = [r for r in current if (not customer or customer in norm(r["customer"]))
                  and (not term or term in norm(" ".join(r[k] for k in ("grade", "material", "color", "note"))))
                  and (not material or material == r["material"])
                  and (not tax or tax == r["tax_type"])
                  and (not start or r["effective_date"] >= start)
                  and (not end or r["effective_date"] <= end)
                  and (filters.get("stale") != "1" or r["stale"])]
        check_read_cancelled()
        return cls.result_with_stats(result)

    @staticmethod
    def result_with_stats(result):
        prices = [Decimal(r["price"]) for r in result if not r["scheduled"]]
        return {"items": result, "stats": {
            "customers": len({norm(r["customer"]) for r in result}), "items": len(result),
            "records": sum(r["history_count"] for r in result), "stale": sum(r["stale"] for r in result),
            "min_price": format(min(prices), "f") if prices else None,
            "max_price": format(max(prices), "f") if prices else None,
            "last_date": max((r["effective_date"] for r in result if not r["scheduled"]), default=None),
        }}

    def list(self, filters=None):
        """Rank inside SQLite; filter chosen current rows rather than history."""
        filters = filters or {}
        cutoff = today()
        start, end = filters.get("from", ""), filters.get("to", "")
        for value in (start, end):
            if value:
                dt.date.fromisoformat(value)
        if start and end and start > end:
            raise ValidationError("开始日期不能晚于结束日期")
        params = {"today": cutoff, "customer": norm(filters.get("customer", "")),
                  "term": norm(filters.get("q", "")), "material": filters.get("material", ""),
                  "tax": filters.get("tax", ""), "start": start, "end": end}
        sql = """
            WITH ranked AS (
                SELECT q.*, c.revision AS customer_revision, ROW_NUMBER() OVER chosen AS rn,
                    COUNT(*) OVER (PARTITION BY identity) AS history_count,
                    SUM(effective_date > :today AND source_type NOT IN ('文件导入','图片导入','导入更新')) OVER (PARTITION BY identity) AS future_count,
                    LEAD(price) OVER chosen AS previous_price,
                    LEAD(effective_date) OVER chosen AS previous_date,
                    LEAD(source_type) OVER chosen AS previous_source_type
                FROM quotes q JOIN customers c USING(customer_key) WHERE c.status='active'
                WINDOW chosen AS (PARTITION BY identity
                    ORDER BY (source_type IN ('文件导入','图片导入','导入更新') OR effective_date <= :today) DESC, effective_date DESC, id DESC)
            )
            SELECT * FROM ranked WHERE rn=1
                AND (:customer='' OR instr(pm_norm(customer), :customer)>0)
                AND (:term='' OR instr(pm_norm(grade||' '||material||' '||color||' '||note), :term)>0)
                AND (:material='' OR material=:material) AND (:tax='' OR tax_type=:tax)
                AND (:start='' OR effective_date>=:start) AND (:end='' OR effective_date<=:end)
            ORDER BY customer, grade, color, tax_type
        """
        with self.connection() as db:
            rows = [dict(row) for row in db.execute(sql, params)]
        result = self.decorate_ranked(rows, cutoff)
        if filters.get("stale") == "1":
            result = [row for row in result if row["stale"]]
        return self.result_with_stats(result)

    @staticmethod
    def decorate_ranked(rows, cutoff):
        result = []
        for row in rows:
            check_read_cancelled()
            row.pop("rn", None)
            previous_date = row.pop("previous_date")
            previous_source = row.pop("previous_source_type")
            row["scheduled"] = not is_effective(row, cutoff)
            if row["scheduled"] or previous_date is None or (previous_date > cutoff and previous_source not in IMMEDIATE_SOURCES):
                row["previous_price"] = None
            row["delta"] = format(Decimal(row["price"]) - Decimal(row["previous_price"]), "f") if row["previous_price"] else None
            row["age_days"] = (dt.date.fromisoformat(cutoff) - dt.date.fromisoformat(row["effective_date"])).days
            row["stale"] = row["age_days"] > 60 and not row["scheduled"]
            result.append(row)
        return result

    def meta(self):
        result = self.list()
        return self.meta_from_result(result)

    def refresh(self, filters=None):
        result = self.list()
        return {"meta": self.meta_from_result(result), "quotes": self.filter_current(result["items"], filters)}

    def meta_from_result(self, result):
        customers = {}
        for row in result["items"]:
            key = norm(row["customer"])
            entry = customers.setdefault(key, {"name": row["customer"], "customer_key": customer_key(row["customer"]),
                                               "revision": row["customer_revision"], "count": 0, "last_date": ""})
            entry["count"] += 1
            if not row["scheduled"]:
                entry["last_date"] = max(entry["last_date"], row["effective_date"])
        seed = self.seed_summary()
        return {"version": VERSION, "today": today(), "stats": result["stats"], "seed": seed,
                "customers": sorted(customers.values(), key=lambda r: (-r["count"], r["name"])),
                "materials": sorted({r["material"] for r in result["items"] if r["material"]}),
                "data_path": str(self.path), "backend": self.backend}

    def seed_summary(self):
        with self.connection() as db:
            return json.loads(db.execute("SELECT value FROM settings WHERE key='seed_summary'").fetchone()[0])

    def history(self, row_id):
        with self.connection() as db:
            selected = db.execute("SELECT identity,customer_key FROM quotes WHERE id=?", (row_id,)).fetchone()
            if not selected:
                raise ValueError("该报价不存在，请刷新查询")
            self.assert_customer(db, selected["customer_key"])
            rows = [dict(r) for r in db.execute("SELECT * FROM quotes WHERE identity=? ORDER BY effective_date DESC,id DESC", (selected[0],))]
        return history_result(rows)

    def add(self, data):
        row = validate_record(data)
        base_id = data.get("base_id")
        fill = bool(data.get("fill_missing_identity"))
        backup = self.backup("before-fill-missing") if fill else None
        with self.lock, self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            self.assert_customer(db, customer_key(row["customer"]), data.get("customer_revision"))
            if fill:
                self._fill_missing_identity(db, base_id, row, data.get("customer_revision"))
            previous = db.execute("SELECT * FROM quotes WHERE identity=? ORDER BY (source_type IN ('文件导入','图片导入','导入更新') OR effective_date<=?) DESC,effective_date DESC,id DESC LIMIT 1", (identity(row), today())).fetchone()
            if base_id is not None:
                if not previous or str(previous["id"]) != str(base_id):
                    raise Conflict("该报价已变化，或客户/牌号/颜色/税口径被更改，请刷新后再操作")
                if not row["reason"]:
                    raise ValueError("请填写调价或补录原因")
                if all(str(previous[k]) == str(row[k]) for k in ("price", "effective_date", "material", "note")):
                    return {"added": False, "id": previous["id"], "record": self._saved_record(db, identity(row)), "backup": str(backup) if backup else None,
                            "message": "已补齐缺失字段，历史价格和日期保留" if fill else "价格、日期和备注均未变化，无需重复保存"}
            elif previous:
                raise Conflict("该客户牌号已有报价，请从查询结果中点击“更新价格”")
            source = "图片导入" if data.get("import_immediate") else "导入更新" if previous and previous["source_type"] in IMMEDIATE_SOURCES else "手工录入"
            if source != "图片导入":
                row.update(source_file="", source_sheet="", source_row=0)
            new_id = self.insert(db, row, source)
            record = self._saved_record(db, identity(row))
        return {"added": True, "id": new_id, "record": record, "backup": str(backup) if backup else None,
                "message": "已补齐缺失字段并保存新报价，历史价格和日期保留" if fill else "已保存新报价，原有历史完整保留"}

    @staticmethod
    def _saved_record(db, group):
        return dict(db.execute("SELECT q.*,c.revision AS customer_revision FROM quotes q JOIN customers c USING(customer_key) "
                               "WHERE identity=? ORDER BY (source_type IN ('文件导入','图片导入','导入更新') OR effective_date<=?) DESC,"
                               "effective_date DESC,id DESC LIMIT 1", (group, today())).fetchone())

    def _fill_missing_identity(self, db, base_id, target, expected_revision):
        if expected_revision is None or isinstance(expected_revision, bool) or not isinstance(expected_revision, int):
            raise ValidationError("缺少客户版本，请刷新后重新打开")
        if base_id is None:
            raise ValidationError("补齐缺失字段需要已有报价")
        base = db.execute("SELECT * FROM quotes WHERE id=?", (base_id,)).fetchone()
        if not base:
            raise Conflict("报价已变化，请刷新后重新打开")
        self.assert_customer(db, base["customer_key"], expected_revision)
        current = db.execute("SELECT id FROM quotes WHERE identity=? ORDER BY "
                             "(source_type IN ('文件导入','图片导入','导入更新') OR effective_date<=?) DESC,effective_date DESC,id DESC LIMIT 1",
                             (base["identity"], today())).fetchone()
        if not current or current["id"] != base_id or target["customer"] != base["customer"] or target["grade"] != base["grade"]:
            raise Conflict("报价基准已变化，请刷新后重新打开")
        color, tax = target["color"], target["tax_type"]
        if (base["color"] and color != base["color"]) or (base["tax_type"] != "未注明" and tax != base["tax_type"]):
            raise ValidationError("仅能补齐原来空白的颜色或未注明税口径")
        if (color, tax) == (base["color"], base["tax_type"]):
            raise ValidationError("没有需要补齐的颜色或税口径")
        new_group = identity({**dict(base), "color": color, "tax_type": tax})
        if db.execute("SELECT 1 FROM quotes WHERE identity=? LIMIT 1", (new_group,)).fetchone():
            raise Conflict("目标颜色和税口径已有报价，请核对后再操作")
        rows = [dict(row) for row in db.execute("SELECT * FROM quotes WHERE identity=?", (base["identity"],))]
        for row in rows:
            key = import_key({**row, "color": color, "tax_type": tax}) if row["import_key"] else None
            db.execute("UPDATE quotes SET identity=?,color=?,tax_type=?,import_key=? WHERE id=?",
                       (new_group, color, tax, key, row["id"]))
        db.execute("UPDATE customers SET revision=revision+1 WHERE customer_key=?", (base["customer_key"],))

    def backup(self, label="auto"):
        with self.lock:
            folder = self.folder / "backups"
            folder.mkdir(exist_ok=True)
            target = folder / f"prices-{dt.datetime.now(TZ):%Y%m%d-%H%M%S}-{label}-{secrets.token_hex(3)}.sqlite3"
            with self.connection() as source:
                backup = sqlite3.connect(target)
                try:
                    source.backup(backup)
                finally:
                    backup.close()
            return target

    def project_progress_list(self):
        with self.connection() as db:
            row = db.execute("SELECT value FROM settings WHERE key='project_progress_rules'").fetchone()
            rules = json.loads(row["value"]) if row else DEFAULT_PROJECT_RULES
            projects = [dict(item) for item in db.execute(
                "SELECT * FROM project_progress ORDER BY updated_at DESC, project_id")]
        return {"rules": rules, "projects": projects}

    def save_project_progress(self, record):
        columns = (
            "industry", "customer_type", "customer_name", "material", "recommended_grade", "material_value",
            "color", "competitor", "product_name", "stage_code", "customer_value", "competition",
            "custom_stage_label", "custom_customer_value", "custom_material_value", "custom_competition",
            "next_action", "milestone_date", "notes",
        )
        values = tuple(record.get(key, "") or "" for key in columns)
        project_id = record["project_id"]
        with self.lock, self.connection() as db:
            existing = db.execute("SELECT revision FROM project_progress WHERE project_id=?", (project_id,)).fetchone()
            if record.get("revision") is None:
                if existing:
                    raise Conflict("项目编号已存在，请刷新后重试")
                revision = 1
                db.execute(
                    f"INSERT INTO project_progress(project_id,{','.join(columns)},revision,updated_at) "
                    f"VALUES ({','.join('?' for _ in range(len(columns) + 3))})",
                    (project_id, *values, revision, now()),
                )
            else:
                if not existing or existing["revision"] != record["revision"]:
                    raise Conflict("项目已被其他操作修改，请刷新后重新编辑")
                revision = record["revision"] + 1
                assignments = ",".join(f"{column}=?" for column in columns)
                db.execute(f"UPDATE project_progress SET {assignments},revision=?,updated_at=? WHERE project_id=?",
                           (*values, revision, now(), project_id))
            return dict(db.execute("SELECT * FROM project_progress WHERE project_id=?", (project_id,)).fetchone())

    def preview(self, records):
        with self.connection() as db:
            for row in records:
                self.assert_customer(db, customer_key(row["customer"]))
            keys = {import_key(dict(row)) for row in db.execute("SELECT * FROM quotes")}
        fresh = []
        duplicates = 0
        for row in records:
            key = import_key(row)
            if key in keys:
                duplicates += 1
            else:
                keys.add(key)
                fresh.append(row)
        return fresh, duplicates

    def commit(self, records, customer_revisions=None):
        if len(records) > MAX_ROWS:
            raise ValidationError("一次最多导入 20000 条报价")
        records = [validate_record(row) for row in records]
        with self.lock:
            fresh, skipped = self.preview(records)
            backup = self.backup("before-import") if fresh else None
            with self.connection() as db:
                db.execute("BEGIN IMMEDIATE")
                for row in records:
                    key = customer_key(row["customer"])
                    expected = (customer_revisions or {}).get(key)
                    if not fresh and expected is not None:
                        changed = db.execute("SELECT 1 FROM customer_audit WHERE customer_key=? AND revision>? LIMIT 1", (key, expected)).fetchone()
                        if not changed:
                            expected = None  # Already committed quotes may still be deduplicated.
                    self.assert_customer(db, key, expected)
                for row in fresh:
                    self.insert(db, row, "文件导入", import_key(row))
            return {"added": len(fresh), "skipped": skipped, "backup": str(backup) if backup else None}


