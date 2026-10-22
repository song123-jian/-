from pathlib import Path

import pytest
from conftest import record

from domain import ValidationError
from services.backend_service import BackendService


def test_current_date_filter_is_not_historical_as_of(store):
    first = store.add(record(effective_date="2026-09-01"))
    store.add(record(effective_date="2026-09-10", price="11", base_id=first["id"], reason="调价"))
    assert not store.list({"customer": "QA隔离客户", "to": "2026-09-05"})["items"]


def test_stale_reminder_does_not_invalidate_price(store):
    store.add(record(effective_date="2000-01-01"))
    row = store.list({"customer": "QA隔离客户", "stale": "1"})["items"][0]
    assert row["stale"] and not row["scheduled"] and row["price"] == "10.5"


def test_preview_rechecks_duplicates_added_after_preview(service, context, tmp_path):
    path = tmp_path / "later.csv"
    path.write_text("客户,牌号,价格,更新日期\nQA新,PP,10,2026-10-09\n", encoding="utf-8")
    first = service.preview_import(path, context.storage_generation)
    second = service.preview_import(path, context.storage_generation)
    service.commit_import(second["preview_id"], context.storage_generation)
    result = service.commit_import(first["preview_id"], context.storage_generation)
    assert result["added"] == 0 and result["skipped"] == 1 and result["backup"] is None


def test_failed_backend_switch_does_not_publish_new_store(context, monkeypatch):
    original = context.store
    generation = context.storage_generation

    def fail(*args, **kwargs):
        raise OSError("QA permission failure")

    monkeypatch.setattr("services.backend_service.atomic_bytes", fail)
    with pytest.raises(OSError):
        BackendService(context).switch_backend("sqlite", generation=generation)
    assert context.store is original
    assert context.storage_generation == generation
    assert not (context.folder / "config.local.json").exists()


def test_storage_adapters_do_not_import_http_entry():
    source = Path(__file__).resolve().parents[1]
    for path in (source / "domain.py", *(source / "services").glob("*.py"), *(source / "storage").glob("*.py"), *(source / "ui").glob("*.py")):
        content = path.read_text(encoding="utf-8")
        assert "from app import" not in content, str(path)
        assert "import webbrowser" not in content, str(path)


def test_manual_quotes_do_not_have_file_fingerprints(service, context):
    added = service.add_quote({**record(), "storage_generation": context.storage_generation})
    assert context.store.history(added["id"])["items"][0]["import_key"] is None


def test_same_content_update_is_not_duplicated(service, context):
    generation = context.storage_generation
    first = service.add_quote({**record(), "storage_generation": generation})
    result = service.add_quote({**record(base_id=first["id"], reason="未发生实际变化"), "storage_generation": generation})
    assert not result["added"]
    assert len(context.store.history(first["id"])["items"]) == 1


@pytest.mark.parametrize("generation", [None, "", 0, False, [], {}])
def test_invalid_generations_rejected_before_writes(service, context, generation):
    with pytest.raises(ValidationError):
        service.add_quote({**record(), "storage_generation": generation})
    assert len(context.store.all()) == 41


def test_bad_or_missing_quote_base_rejected(service, context):
    generation = context.storage_generation
    for base in (True, False, 0, -1, "1.5"):
        with pytest.raises(ValidationError):
            service.add_quote({**record(base_id=base, reason="变更"), "storage_generation": generation})
    assert len(context.store.all()) == 41


def test_explicit_cloud_to_local_switch_works_when_offline(context, monkeypatch):
    from domain import NetworkError
    from storage.supabase_store import SupabaseStore
    cloud = SupabaseStore(context.folder, "https://qa-offline.supabase.co", "sb_secret_QA-offline-123456789")
    context.store = cloud

    def offline(*args):
        raise NetworkError("offline")

    monkeypatch.setattr(cloud, "backup", offline)
    result = BackendService(context).switch_backend("sqlite", generation=context.storage_generation)
    assert context.store.backend == "sqlite"
    assert result["backup"] is None and result["warning"]
    assert len(context.store.all()) == 41
