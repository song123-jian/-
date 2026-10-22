import json
from decimal import Decimal

import pytest
from conftest import record

from domain import ValidationError, business_date, identity, import_key, money, validate_record


@pytest.mark.parametrize("text,expected", [("9.734513", "9.734513"), ("10.50000000", "10.5"), ("1e3", "1000"), ("1000000000", "1000000000"), ("0.000001", "0.000001")])
def test_exact_money(text, expected):
    assert money(text) == expected


@pytest.mark.parametrize("text", ["0", "-1", "NaN", "sNaN", "Infinity", "-Infinity", "1000000000.000001", "0.0000001", "9.7345131", "", "1.00000000000000000000000000001", "9" * 129])
def test_invalid_money_rejected(text):
    with pytest.raises(ValidationError):
        money(text)


@pytest.mark.parametrize("value,epoch,expected", [("2026/9/6", False, "2026-09-06"), ("2026-09-06 00:00:00", False, "2026-09-06"), (1, False, "1900-01-01"), (59, False, "1900-02-28"), (61, False, "1900-03-01"), (0, True, "1904-01-01"), ("0", True, "1904-01-01")])
def test_business_dates(value, epoch, expected):
    assert business_date(value, epoch) == expected


@pytest.mark.parametrize("value", ["", "2026-02-29", "1899-12-31", "2201-01-01", "2026-10-09 12:00:00", 60, float("nan"), -1])
def test_invalid_dates(value):
    with pytest.raises(ValidationError):
        business_date(value)


def test_identity_normalizes_without_material_merging():
    lhs = validate_record(record(customer="ＡＢＣ　客户", grade=" pp  td20 "))
    rhs = validate_record(record(customer="abc 客户", grade="PP TD20", material="PPTD20"))
    assert identity(lhs) == identity(rhs)
    assert lhs["material"] == "PP-TD20"
    assert rhs["material"] == "PPTD20"
    assert identity(lhs) != identity({**rhs, "grade": "PPTD20"})
    assert identity(lhs) != identity({**rhs, "tax_type": "未税"})
    assert identity(lhs) != identity({**rhs, "color": "黑色"})


def test_import_fingerprint_ignores_filename_and_row():
    lhs = validate_record(record())
    rhs = {**lhs, "source_file": "renamed.xlsx", "source_row": 123}
    assert import_key(lhs) == import_key(rhs)
    for key, value in (("material", "PPTD20"), ("price", "9.734513"), ("note", "变化"), ("reason", "变更")):
        assert import_key(lhs) != import_key({**rhs, key: value})


@pytest.mark.parametrize("note,explicit,expected", [("不含税但含税字样", "", "未税"), ("未税", "", "未税"), ("含税", "", "含税"), ("", "", "未注明"), ("含税", "未税", "未税")])
def test_tax_precedence(note, explicit, expected):
    assert validate_record(record(note=note, tax_type=explicit))["tax_type"] == expected


@pytest.mark.parametrize("changes", [{"customer": ""}, {"grade": ""}, {"note": "中" * 2001}, {"reason": "中" * 1001}, {"source_row": -1}, {"source_row": "1.5"}, {"tax_type": "其他"}, {"customer": "a\x01"}])
def test_field_boundaries(changes):
    with pytest.raises(ValidationError):
        validate_record(record(**changes))


def test_seed_and_preserved_provenance(store, qa_assets):
    original = json.loads((qa_assets / "seed.json").read_text(encoding="utf-8"))["records"]
    rows = store.all()
    assert store.meta()["stats"]["customers"] == 5
    assert len(rows) == 41
    fields = ("customer", "grade", "material", "color", "price", "tax_type", "effective_date", "note", "source_file", "source_sheet", "source_row")
    assert sorted(tuple(row[key] for key in fields) for row in rows) == sorted(tuple(validate_record(row)[key] for key in fields) for row in original)
    assert len(store.list({"customer": "金华"})["items"]) == 16
    assert not store.list({"customer": "不存在的客户"})["items"]
    assert len(store.meta()["materials"]) == 17


def test_append_precision_old_future_and_same_day(store):
    first = store.add(record())
    second = store.add(record(price="11.123456", effective_date="2026-09-02", reason="调整", base_id=first["id"]))
    selected = store.list({"customer": "QA隔离客户"})["items"][0]
    assert selected["id"] == second["id"]
    assert selected["delta"] == "0.623456"
    assert store.history(second["id"])["items"][-1]["price"] == "10.5"
    store.add(record(price="8", effective_date="2026-08-01", reason="补录", base_id=second["id"]))
    store.add(record(price="12", effective_date="2199-01-01", reason="预约", base_id=second["id"]))
    current = store.list({"customer": "QA隔离客户"})["items"][0]
    assert current["id"] == second["id"]
    assert current["future_count"] == 1
    assert not current["scheduled"]
    latest = store.add(record(price="9.734513", effective_date="2026-09-02", reason="同日", base_id=second["id"]))
    assert store.list({"customer": "QA隔离客户"})["items"][0]["id"] == latest["id"]
    history = store.history(latest["id"])["items"]
    assert len(history) == 5
    assert sum(item["is_current"] for item in history) == 1
    assert sum(item["scheduled"] for item in history) == 1
    assert any(Decimal(item["price"]) == Decimal("9.734513") for item in history)


def test_only_future_uses_latest_business_date(store):
    first = store.add(record(effective_date="2198-01-01"))
    latest = store.add(record(effective_date="2199-01-01", price="12", reason="预约", base_id=first["id"]))
    row = store.list({"customer": "QA隔离客户"})["items"][0]
    assert row["id"] == latest["id"] and row["scheduled"]


def test_conflict_does_not_change_ledger(store):
    from domain import ConflictError
    first = store.add(record())
    second = store.add(record(price="11", reason="调整", base_id=first["id"]))
    with pytest.raises(ConflictError):
        store.add(record(price="12", reason="旧表单", base_id=first["id"]))
    with pytest.raises(ConflictError):
        store.add(record(price="12"))
    assert len(store.history(second["id"])["items"]) == 2


def test_sql_current_selection_matches_reference(store):
    first = store.add(record())
    store.add(record(price="11", effective_date="2026-09-02", base_id=first["id"], reason="调整"))
    store.add(record(grade="future", effective_date="2199-01-01"))
    for filters in ({}, {"customer": "金华"}, {"q": "PP"}, {"tax": "未税"}, {"from": "2026-09-02", "to": "2200-01-01"}, {"stale": "1"}):
        assert store.list(filters) == store.list_from_all(filters)
