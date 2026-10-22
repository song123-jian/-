import csv
import json
import sqlite3
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

import pytest
from conftest import record

from credentials import protect, unprotect
from domain import BackendChangedError, StorageError, ValidationError
from services.backend_service import BackendService, read_config
from services.price_service import QuoteCommand


def write_csv(path, valid=True):
    path.write_text("客户,牌号,价格,更新日期,备注\nQA新客户,PP,9.734513,2026-10-09,不含税\n" + ("错误客户,PA,0,2026-10-09,\n" if not valid else ""), encoding="utf-8")
    return path


def test_all_writes_require_generation(service, context, tmp_path):
    initial = len(context.store.all())
    path = write_csv(tmp_path / "quotes.csv")
    with pytest.raises(ValidationError, match="缺少存储代次"):
        service.add_quote(record())
    with pytest.raises(ValidationError, match="缺少存储代次"):
        service.preview_import(path, None)
    with pytest.raises(ValidationError, match="缺少存储代次"):
        service.commit_import("unknown", None)
    assert len(context.store.all()) == initial


def test_preview_commit_once_dedupe_and_backup(service, context, tmp_path):
    path = write_csv(tmp_path / "quotes.csv")
    generation = context.storage_generation
    preview = service.preview_import(path, generation)
    assert preview["added"] == 1 and preview["error_count"] == 0
    assert len(context.store.all()) == 41
    result = service.commit_import(preview["preview_id"], generation)
    assert result["added"] == 1 and result["skipped"] == 0
    assert Path(result["backup"]).is_file()
    with sqlite3.connect(result["backup"]) as db:
        assert db.execute("pragma integrity_check").fetchone()[0] == "ok"
        assert db.execute("select count(*) from quotes").fetchone()[0] == 41
    with pytest.raises(ValidationError, match="已使用"):
        service.commit_import(preview["preview_id"], generation)
    renamed = tmp_path / "renamed.csv"
    renamed.write_bytes(path.read_bytes())
    again = service.preview_import(renamed, generation)
    assert again["added"] == 0 and again["skipped"] == 1
    committed = service.commit_import(again["preview_id"], generation)
    assert committed == {"added": 0, "skipped": 1, "backup": None, "storage_generation": generation}


def test_synthetic_excel_preview_all_duplicates(service, context, qa_workbook):
    path = qa_workbook
    preview = service.preview_import(path, context.storage_generation)
    assert (preview["added"], preview["skipped"], preview["error_count"]) == (0, 41, 0)


def test_any_error_rejects_whole_batch(service, context, tmp_path):
    path = write_csv(tmp_path / "bad.csv", False)
    preview = service.preview_import(path, context.storage_generation)
    assert preview["error_count"] == 1
    with pytest.raises(ValidationError, match="错误行"):
        service.commit_import(preview["preview_id"], context.storage_generation)
    assert len(context.store.all()) == 41


def test_preview_expiry_and_bounded_cache(service, context, tmp_path):
    path = write_csv(tmp_path / "file.csv")
    generation = context.storage_generation
    preview = service.preview_import(path, generation)
    context.previews[preview["preview_id"]]["expires"] = 0
    with pytest.raises(ValidationError, match="过期"):
        service.commit_import(preview["preview_id"], generation)
    for _ in range(13):
        service.preview_import(path, generation)
    assert len(context.previews) == 12


def test_export_decimal_formula_injection_and_complete_history(service, context, tmp_path):
    generation = context.storage_generation
    first = service.add_quote({**record(customer="=QA客户", price="9.734513"), "storage_generation": generation})
    service.add_quote({**record(customer="=QA客户", price="11.123456", reason="调价", effective_date="2026-10-09", base_id=first["id"]), "storage_generation": generation})
    current, history = tmp_path / "current.csv", tmp_path / "history.csv"
    filters = {"customer": "=QA客户", "from": "2026-10-09", "to": "2026-10-09"}
    service.export_quotes(filters, "current", current, generation)
    service.export_quotes(filters, "history", history, generation)
    assert "11.123456" in current.read_text(encoding="utf-8")
    assert "9.734513" in history.read_text(encoding="utf-8")
    rows = list(csv.DictReader(history.open(encoding="utf-8")))
    assert len(rows) == 2
    assert all(row["客户"].startswith("'=") for row in rows)


def test_backup_can_be_restored_exactly(service, context, tmp_path):
    path = tmp_path / "export.sqlite3"
    service.backup_database(path, context.storage_generation)
    with sqlite3.connect(path) as db:
        assert db.execute("pragma integrity_check").fetchone()[0] == "ok"
        assert list(db.execute("select * from quotes order by id")) == [tuple(row.values()) for row in sorted(context.store.all(), key=lambda row: row["id"])]
    from storage.sqlite_store import SQLiteStore
    restore = tmp_path / "restored"
    restore.mkdir()
    (restore / "prices.sqlite3").write_bytes(path.read_bytes())
    assert SQLiteStore(restore).all() == context.store.all()


def test_export_refuses_active_database_and_config(service, context):
    for name in ("prices.sqlite3", "config.local.json", "instance.lock", "ui.ini"):
        with pytest.raises(ValidationError):
            service.export_quotes({}, "current", context.folder / name, context.storage_generation)


def test_import_failure_rolls_back_every_row(service, context, tmp_path):
    path = tmp_path / "batch.csv"
    path.write_text("客户,牌号,价格,更新日期\nQA新,PP,10,2026-10-09\nQA新,PA,11,2026-10-09\n", encoding="utf-8")
    generation = context.storage_generation
    preview = service.preview_import(path, generation)
    insert = context.store.insert
    calls = []

    def fail_second(*args):
        calls.append(1)
        if len(calls) == 2:
            raise sqlite3.IntegrityError("injected failure")
        return insert(*args)

    with patch.object(context.store, "insert", side_effect=fail_second):
        with pytest.raises(StorageError, match="回滚"):
            service.commit_import(preview["preview_id"], generation)
    assert len(context.store.all()) == 41


def test_switch_invalidates_forms_previews_and_old_read_results(service, context, tmp_path):
    generation = context.storage_generation
    path = write_csv(tmp_path / "batch.csv")
    preview = service.preview_import(path, generation)
    backend = BackendService(context)
    switched = backend.switch_backend("sqlite", generation=generation)
    assert switched["storage_generation"] != generation
    assert not context.previews
    for action in (
        lambda: service.add_quote({**record(), "storage_generation": generation}),
        lambda: service.commit_import(preview["preview_id"], generation),
        lambda: service.list_quotes({}, generation),
    ):
        with pytest.raises(BackendChangedError):
            action()
    assert len(context.store.all()) == 41


def test_switch_and_write_share_critical_section(service, context):
    generation = context.storage_generation
    started, release = threading.Event(), threading.Event()
    original = context.store.add

    def slow_add(data):
        started.set()
        assert release.wait(5)
        return original(data)

    with ThreadPoolExecutor(max_workers=2) as pool, patch.object(context.store, "add", side_effect=slow_add):
        write = pool.submit(service.add_quote, {**record(), "storage_generation": generation})
        assert started.wait(3)
        switch = pool.submit(BackendService(context).switch_backend, "sqlite", "", "", generation)
        assert not switch.done()
        release.set()
        assert write.result(5)["added"]
        assert switch.result(5)["storage_generation"] != generation
    assert len(context.store.list({"customer": "QA隔离客户"})["items"]) == 1


def test_dpapi_round_trip_and_no_plaintext_config(context):
    secret = "sb_secret_QA-only-no-real-secret-123456789"
    encrypted = protect(secret)
    assert secret not in encrypted
    assert unprotect(encrypted) == secret
    with patch("services.backend_service.SupabaseStore.check", return_value={"message": "mock connection", "records": "0"}):
        BackendService(context).switch_backend("supabase", "https://qa-isolated.supabase.co", secret, context.storage_generation)
    raw = (context.folder / "config.local.json").read_text(encoding="utf-8")
    assert secret not in raw
    assert "key_protected" in read_config(context.folder)
    assert "key" not in BackendService(context).get_backend_status()
    assert unprotect(json.loads(raw)["key_protected"]) == secret


def test_template_schema_and_command_contract(service, context, tmp_path):
    template, schema = tmp_path / "template.csv", tmp_path / "schema.sql"
    service.save_import_template(template)
    service.save_cloud_schema(schema)
    assert "客户,牌号,材料,颜色,价格,税口径,备注" in template.read_text(encoding="utf-8")
    assert "pg_advisory_xact_lock" in schema.read_text(encoding="utf-8")
    command = QuoteCommand(**record(), storage_generation=context.storage_generation)
    assert service.add_quote(command)["added"]
