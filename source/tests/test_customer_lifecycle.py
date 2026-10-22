"""Lifecycle regression: exact scope, unchanged ledger, stale writes and snapshots."""
import json
import secrets
import shutil
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import pytest
from conftest import record

from domain import ConflictError, NetworkError, ValidationError, customer_key, identity, today
from services.app_context import AppContext
from services.customer_service import CustomerService
from storage.sqlite_store import SQLiteStore
from storage.supabase_store import SupabaseStore


def change(context, key, action="delete", request=None):
    service = CustomerService(context)
    preview = service.preview_delete(key, context.storage_generation)
    method = service.delete_customer if action == "delete" else service.restore_customer
    return method(key, preview["revision"], context.storage_generation, request or secrets.token_urlsafe(24))


def target(context):
    return next(row["customer_key"] for row in context.store.meta()["customers"] if row["count"] == 16)


def test_delete_restore_exact_ledger_and_default_scopes(context, service, tmp_path):
    key = target(context)
    original = context.store.all()
    preview = CustomerService(context).preview_delete(key, context.storage_generation)
    assert (preview["specs"], preview["records"]) == (16, 16)
    result = change(context, key)
    assert context.store.all() == original
    assert context.store.meta()["stats"]["customers"] == 4
    assert context.store.list()["stats"]["items"] == 25
    assert len(CustomerService(context).list_customers("deleted", context.storage_generation)["items"]) == 1
    with pytest.raises(ValidationError, match="回收站"):
        service.get_history(preview["items"][0]["id"], context.storage_generation)
    output = tmp_path / "normal.csv"
    service.export_quotes({}, "history", output, context.storage_generation)
    assert preview["display_name"] not in output.read_text(encoding="utf-8")
    restored = change(context, key, "restore")
    assert restored["revision"] == result["revision"] + 1
    assert context.store.all() == original
    assert context.store.meta()["stats"]["customers"] == 5
    assert context.store.list()["stats"]["items"] == 41


def test_similar_names_normalization_and_future_history(context):
    assert customer_key("ＡＢＣ\u3000公司") == customer_key("abc 公司")
    context.store.add(record(customer="QA公司", grade="A"))
    context.store.add(record(customer="QA公司分店", grade="B"))
    first = context.store.list({"customer": "QA公司"})["items"][0]
    context.store.add(record(customer="QA公司", grade="A", price="20", effective_date="2099-01-01", reason="未来", base_id=first["id"]))
    key = customer_key("QA公司")
    preview = CustomerService(context).preview_delete(key, context.storage_generation)
    assert preview["records"] == 2 and preview["future_records"] == 1
    change(context, key)
    assert len(context.store.list({"customer": "QA公司"})["items"]) == 1
    change(context, key, "restore")
    with patch("storage.sqlite_store.today", return_value="2100-01-01"):
        assert next(r for r in context.store.list()["items"] if r["customer_key"] == key)["price"] == "20"


@pytest.mark.parametrize("key", ["", "全部客户", "金华", None, "0" * 63])
def test_invalid_selection_refuses_delete(context, key):
    with pytest.raises(ValidationError, match="具体客户"):
        CustomerService(context).preview_delete(key, context.storage_generation)


def test_revision_conflict_idempotency_and_audit(context):
    key = target(context)
    service = CustomerService(context)
    preview = service.preview_delete(key, context.storage_generation)
    row = next(r for r in context.store.list()["items"] if r["customer_key"] == key)
    context.store.add({**row, "price": "11", "base_id": row["id"], "reason": "变化", "effective_date": today()})
    with pytest.raises(ConflictError):
        service.delete_customer(key, preview["revision"], context.storage_generation, secrets.token_urlsafe(24))
    request = secrets.token_urlsafe(24)
    preview = service.preview_delete(key, context.storage_generation)
    first = service.delete_customer(key, preview["revision"], context.storage_generation, request)
    again = service.delete_customer(key, preview["revision"], context.storage_generation, request)
    assert again["revision"] == first["revision"]
    with context.store.connection() as db:
        assert db.execute("SELECT count(*) FROM customer_audit").fetchone()[0] == 1
    with pytest.raises(ConflictError):
        service.restore_customer(key, preview["revision"], context.storage_generation, request)


def test_import_preview_deleted_refuses_entire_batch_and_old_forms(context, service, tmp_path):
    key = target(context)
    name = context.store.customer_states()[key]["display_name"]
    csv = tmp_path / "batch.csv"
    csv.write_text(f"客户,牌号,价格,更新日期\n{name},QA新,10,2026-10-10\nQA健康客户,QA,11,2026-10-10\n", encoding="utf-8")
    preview = service.preview_import(csv, context.storage_generation)
    old_revision = context.store.customer_states()[key]["revision"]
    before = context.store.all()
    change(context, key)
    deleted = service.preview_import(csv, context.storage_generation)
    assert deleted["error_count"] == 1 and "回收站" in deleted["errors"][0]["message"]
    with pytest.raises(ValidationError, match="错误行"):
        service.commit_import(deleted["preview_id"], context.storage_generation)
    with pytest.raises(ValidationError, match="已使用"):
        service.commit_import(preview["preview_id"], context.storage_generation)
    with pytest.raises(ValidationError, match="回收站"):
        context.store.commit([record(customer=name)])
    change(context, key, "restore")
    with pytest.raises(ConflictError, match="变化"):
        service.add_quote({**record(customer=name), "customer_revision": old_revision, "storage_generation": context.storage_generation})
    assert context.store.all() == before


def test_schema1_migration_exact_original_columns_and_backup(tmp_path):
    from domain import FIELDS, import_key, validate_record
    row = validate_record(record(price="9.734513"))
    with sqlite3.connect(tmp_path / "prices.sqlite3") as db:
        columns = ("id", "identity") + FIELDS + ("created_at", "source_type", "import_key")
        declarations = ["id INTEGER PRIMARY KEY AUTOINCREMENT", "identity TEXT NOT NULL"]
        declarations += [f"{k} {'INTEGER' if k == 'source_row' else 'TEXT'} NOT NULL" for k in FIELDS]
        declarations += ["created_at TEXT NOT NULL", "source_type TEXT NOT NULL", "import_key TEXT UNIQUE"]
        db.execute(f"CREATE TABLE quotes ({','.join(declarations)})")
        values = (7, identity(row)) + tuple(row[k] for k in FIELDS) + ("2026-10-09T12:00:00+08:00", "文件导入", import_key(row))
        db.execute(f"INSERT INTO quotes VALUES ({','.join('?' for _ in columns)})", values)
        db.execute("CREATE TABLE settings (key TEXT PRIMARY KEY,value TEXT NOT NULL)")
        db.executemany("INSERT INTO settings VALUES (?,?)", [("schema_version","1"),("seed_loaded","1"),("seed_summary","{}")])
        original = list(db.execute("SELECT * FROM quotes ORDER BY id"))
    migrated = SQLiteStore(tmp_path)
    with migrated.connection() as db:
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert db.execute("SELECT value FROM settings WHERE key='schema_version'").fetchone()[0] == "2"
        assert [tuple(r)[:-1] for r in db.execute("SELECT * FROM quotes ORDER BY id")] == original
    backups = list((tmp_path / "backups").glob("*-before-schema-2-*.sqlite3"))
    assert len(backups) == 1
    with sqlite3.connect(backups[0]) as db:
        assert db.execute("SELECT value FROM settings WHERE key='schema_version'").fetchone()[0] == "1"
    assert SQLiteStore(tmp_path).all() == migrated.all()


def test_backup_preserves_deleted_states_audit_and_restart(context, tmp_path):
    key = target(context)
    change(context, key)
    backup = context.store.backup("deleted")
    folder = tmp_path / "restore"
    folder.mkdir()
    shutil.copyfile(backup, folder / "prices.sqlite3")
    restored = SQLiteStore(folder)
    assert restored.customer_states()[key]["status"] == "deleted"
    assert len(restored.list()["items"]) == 25
    assert restored.all() == context.store.all()
    restored_context = AppContext(restored, folder)
    assert len(CustomerService(restored_context).list_customers("deleted", restored_context.storage_generation)["items"]) == 1
    with restored.connection() as db:
        assert db.execute("SELECT count(*) FROM customer_audit").fetchone()[0] == 1


def test_concurrent_write_prevents_stale_delete(context):
    key = target(context)
    preview = CustomerService(context).preview_delete(key, context.storage_generation)
    row = next(r for r in context.store.list()["items"] if r["customer_key"] == key)
    with ThreadPoolExecutor(max_workers=2) as pool:
        added = pool.submit(context.store.add, {**row, "price": "21", "effective_date": today(), "base_id": row["id"], "reason": "并发"})
        added.result(5)
        deleted = pool.submit(context.store.change_customer, key, "delete", preview["revision"], secrets.token_urlsafe(24))
        with pytest.raises(ConflictError):
            deleted.result(5)


def test_network_loss_reads_committed_audit_once(context):
    key = target(context)
    service = CustomerService(context)
    preview = service.preview_delete(key, context.storage_generation)
    request = secrets.token_urlsafe(24)
    original = context.store.change_customer
    def response_lost(*args):
        original(*args)
        raise NetworkError("response lost")
    with patch.object(context.store, "change_customer", side_effect=response_lost) as called:
        result = service.delete_customer(key, preview["revision"], context.storage_generation, request)
    assert result["action"] == "delete" and called.call_count == 1
    assert context.store.customer_states()[key]["status"] == "deleted"


def test_cloud_snapshot_complete_states_and_audit(context, tmp_path):
    key = target(context)
    result = change(context, key)
    payload = {"schema_version": 2, "quotes": context.store.all(), "customers": list(context.store.customer_states().values()),
               "audit": [{k:v for k,v in result.items() if k in ("request_id","customer_key","action","expected_revision","revision","reason","created_at")}]}
    cloud = SupabaseStore(tmp_path / "cloud", "https://qa-contract.supabase.co", "sb_secret_QA-contract-only-123456789")
    with patch.object(cloud, "request", return_value=(payload, "")):
        backup = cloud.backup("qa")
    with sqlite3.connect(backup) as db:
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert db.execute("SELECT status FROM customers WHERE customer_key=?", (key,)).fetchone()[0] == "deleted"
        assert db.execute("SELECT count(*) FROM quotes").fetchone()[0] == 41
        assert db.execute("SELECT count(*) FROM customer_audit").fetchone()[0] == 1
        assert json.loads(db.execute("SELECT value FROM settings WHERE key='seed_summary'").fetchone()[0])
    assert len({identity(r) for r in payload["quotes"]}) == 41


def test_synthetic_xlsx_and_pdf_reject_deleted_customer(service,context,tmp_path,qa_workbook):
    from pdf_factory import quotation_pdf
    key=target(context)
    name=context.store.customer_states()[key]["display_name"]
    change(context,key)
    original=qa_workbook
    preview=service.preview_import(original,context.storage_generation)
    assert preview["error_count"]==16 and all("回收站" in r["message"] for r in preview["errors"])
    path=tmp_path/"deleted.pdf"
    path.write_bytes(quotation_pdf([[["客户","牌号","价格","更新日期"],[name,"QA-PDF","10","2026-10-10"]]]))
    preview=service.preview_import(path,context.storage_generation)
    assert preview["error_count"]==1 and "回收站" in preview["errors"][0]["message"]
    with pytest.raises(ValidationError):
        service.commit_import(preview["preview_id"],context.storage_generation)
    assert len(context.store.all())==41


def test_remote_delete_restore_invalidates_old_duplicate_preview(service,context,tmp_path):
    path=tmp_path/"duplicate.csv"
    key=target(context)
    row=next(r for r in context.store.all() if r["customer_key"]==key)
    path.write_text("客户,牌号,材料,颜色,价格,税口径,更新日期,备注\n"+
                    ','.join(str(row[k]) for k in ("customer","grade","material","color","price","tax_type","effective_date","note"))+"\n",encoding="utf-8")
    preview=service.preview_import(path,context.storage_generation)
    assert preview["added"]==0
    revision=context.store.customer_states()[key]["revision"]
    context.store.change_customer(key,"delete",revision,secrets.token_urlsafe(24))
    context.store.change_customer(key,"restore",revision+1,secrets.token_urlsafe(24))
    with pytest.raises(ConflictError):
        service.commit_import(preview["preview_id"],context.storage_generation)
