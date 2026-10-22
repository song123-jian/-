"""Import persistence and rollback checks with explicit disposable fixtures."""
import sqlite3
from unittest.mock import patch

import pytest
from conftest import record

from domain import StorageError
from services.app_context import AppContext
from services.price_service import PriceService
from storage.sqlite_store import SQLiteStore


@pytest.fixture
def empty_context(tmp_path):
    return AppContext(SQLiteStore(tmp_path, load_seed=False), tmp_path)


def options(customer=None):
    return {"customer_mode": "selected" if customer else "all", "selected_customer": customer or "",
            "core_only": True, "effective_date": "2026-10-10"}


def test_empty_import_and_duplicate_are_persisted(empty_context, tmp_path):
    service = PriceService(empty_context)
    path = tmp_path / "new.csv"
    path.write_text("客户,产品名称,牌号,含税价格\n隔离客户,PA12,QA-NEW,9.734513\n", encoding="utf-8")
    preview = service.preview_import(path, empty_context.storage_generation, options())
    assert (preview["added"], preview["new_customers"], preview["error_count"]) == (1, 1, 0)
    assert service.commit_import(preview["preview_id"], empty_context.storage_generation)["added"] == 1
    repeated = service.preview_import(path, empty_context.storage_generation, options())
    assert (repeated["added"], repeated["skipped"]) == (0, 1)
    result = service.commit_import(repeated["preview_id"], empty_context.storage_generation)
    assert (result["added"], result["skipped"]) == (0, 1)
    rows = SQLiteStore(tmp_path, load_seed=False).all()
    assert len(rows) == 1 and rows[0]["price"] == "9.734513"


def test_selected_import_updates_existing_without_adding_file_customer(empty_context, tmp_path):
    service = PriceService(empty_context)
    first = empty_context.store.add(record(customer="隔离已有客户", note="保留备注"))
    path = tmp_path / "selected.csv"
    path.write_text("客户,牌号,含税价格\n文件客户,QA-PP,9.734513\n文件客户,QA-NEW,12\n", encoding="utf-8")
    preview = service.preview_import(path, empty_context.storage_generation, options("隔离已有客户"))
    assert (preview["created"], preview["updated"], preview["new_customers"], preview["error_count"]) == (1, 1, 0, 0)
    assert service.commit_import(preview["preview_id"], empty_context.storage_generation)["added"] == 2
    reloaded = SQLiteStore(tmp_path, load_seed=False)
    assert {row["customer"] for row in reloaded.all()} == {"隔离已有客户"}
    history = reloaded.history(first["id"])["items"]
    assert len(history) == 2 and any(row["price"] == "9.734513" and row["note"] == "保留备注" for row in history)


def test_failed_second_insert_rolls_back_entire_selected_import(empty_context, tmp_path):
    service = PriceService(empty_context)
    first = empty_context.store.add(record(customer="隔离已有客户"))
    baseline = empty_context.store.all()
    path = tmp_path / "atomic.csv"
    path.write_text("牌号,含税价格\nQA-PP,10\nQA-NEW,12\n", encoding="utf-8")
    preview = service.preview_import(path, empty_context.storage_generation, options("隔离已有客户"))
    insert = empty_context.store.insert
    calls = 0

    def fail_second(*args):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise sqlite3.IntegrityError("controlled failure")
        return insert(*args)

    with patch.object(empty_context.store, "insert", side_effect=fail_second):
        with pytest.raises(StorageError, match="回滚"):
            service.commit_import(preview["preview_id"], empty_context.storage_generation)
    reloaded = SQLiteStore(tmp_path, load_seed=False)
    assert calls == 2 and reloaded.all() == baseline
    assert len(reloaded.history(first["id"])["items"]) == 1
