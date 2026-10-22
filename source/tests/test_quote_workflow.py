"""Business acceptance for immediate imports and completion of saved quotes."""
import csv
import io

import pytest
from conftest import record
from test_import_dates import FORMATS

from domain import ConflictError, ValidationError, customer_key, import_key, validate_record
from storage.sqlite_store import SQLiteStore


def update(service, context, base, **changes):
    fill = changes.pop("fill", False)
    return service.add_quote({**base, "base_id": base["id"], "reason": "完善报价", **changes,
                              "fill_missing_identity": fill,
                              "storage_generation": context.storage_generation,
                              "data_generation": context.data_generation})


@pytest.mark.parametrize("encoder,extension", FORMATS)
def test_future_import_effective_with_date_and_note_preserved(service, context, tmp_path, encoder, extension):
    first = context.store.add(record(customer="即时导入客户", color=""))
    rows = [["客户", "牌号", "材料", "颜色", "价格", "税口径", "更新日期", "备注"],
            ["文件其他客户", "QA-PP", "PP-TD20", "", "11.123456", "含税", "2199-01-01", "保留备注"]]
    path = tmp_path / ("immediate." + extension)
    path.write_bytes(encoder(rows))
    options = {"customer_mode": "selected", "selected_customer": "即时导入客户", "core_only": True}
    preview = service.preview_import(path, context.storage_generation, options)
    assert not preview["error_count"]
    service.commit_import(preview["preview_id"], context.storage_generation)
    base = context.store.list({"customer": "即时导入客户"})["items"][0]
    assert not base["scheduled"] and base["effective_date"] == "2199-01-01"
    assert base["price"] == "11.123456" and base["note"] == "保留备注" and base["future_count"] == 0
    assert context.store.list_from_all({"customer": "即时导入客户"})["items"] == [base]
    history = context.store.history(first["id"])["items"]
    assert sum(row["is_current"] for row in history) == 1 and not any(row["scheduled"] for row in history)
    assert SQLiteStore(context.folder).list({"customer": "即时导入客户"})["items"][0]["id"] == base["id"]
    result = update(service, context, base, color="本色", fill=True)
    assert result["record"]["color"] == "本色" and not result["added"]
    assert len(context.store.history(first["id"])["items"]) == 2
    result = update(service, context, result["record"], material="补充材料", price="12")
    assert result["record"]["price"] == "12" and not context.store.list({"customer": "即时导入客户"})["items"][0]["scheduled"]


def test_identity_fill_preserves_all_original_history_and_rejects_stale(service, context):
    row = validate_record(record(customer="完善客户", color="", tax_type="未注明"))
    context.store.commit([row, {**row, "price": "12", "effective_date": "2026-09-02"}])
    base = context.store.list({"customer": "完善客户"})["items"][0]
    before = context.store.history(base["id"])["items"]
    result = update(service, context, base, color="白色", tax_type="含税", fill=True)
    assert not result["added"] and result["backup"]
    after = context.store.history(base["id"])["items"]
    keep = ("id", "price", "effective_date", "material", "note", "reason", "source_file", "source_sheet", "source_row", "created_at", "source_type")
    assert [tuple(row[key] for key in keep) for row in before] == [tuple(row[key] for key in keep) for row in after]
    assert all(row["color"] == "白色" and row["tax_type"] == "含税" and row["import_key"] == import_key(row) for row in after)
    assert context.store.list({"customer": "完善客户"})["stats"]["items"] == 1
    with pytest.raises(ConflictError):
        update(service, context, base, color="白色", tax_type="含税", fill=True)
    assert context.store.history(base["id"])["items"] == after
    repeated = [{**row, "color": "白色", "tax_type": "含税"}, {**row, "color": "白色", "tax_type": "含税", "price": "12", "effective_date": "2026-09-02"}]
    assert context.store.commit(repeated)["added"] == 0


def test_identity_collision_and_invalid_complete_values_roll_back(service, context):
    context.store.add(record(customer="冲突客户", color=""))
    context.store.add(record(customer="冲突客户", color="白色"))
    base = next(row for row in context.store.list({"customer": "冲突客户"})["items"] if not row["color"])
    before = context.store.all()
    revision = context.store.customer_states()[customer_key(base["customer"])]
    with pytest.raises(ConflictError, match="已有报价"):
        update(service, context, base, color="白色", fill=True)
    assert context.store.all() == before and context.store.customer_states()[customer_key(base["customer"])] == revision
    with pytest.raises(ValidationError, match="仅能补齐"):
        update(service, context, base, color="黑色", tax_type="未税", fill=True)
    assert context.store.all() == before


def test_fill_and_append_share_transaction_and_return_new_base(service, context):
    context.store.add(record(customer="继续保存客户", color=""))
    base = context.store.list({"customer": "继续保存客户"})["items"][0]
    result = update(service, context, base, color="黑色", price="12", fill=True)
    assert result["added"] and result["record"]["id"] == result["id"]
    result2 = update(service, context, result["record"], material="PA12", note="补充备注", price="13")
    assert result2["record"]["price"] == "13" and result2["record"]["customer_revision"] == base["customer_revision"] + 3
    history = context.store.history(base["id"])["items"]
    assert len(history) == 3 and all(row["color"] == "黑色" for row in history)


def test_invalid_append_rolls_back_identity_completion(context):
    context.store.add(record(customer="事务回滚客户", color=""))
    base = context.store.list({"customer": "事务回滚客户"})["items"][0]
    before = context.store.all()
    with pytest.raises(ValueError, match="原因"):
        context.store.add({**base, "color": "本色", "price": "13", "reason": "", "base_id": base["id"], "fill_missing_identity": True})
    assert context.store.all() == before


def test_simple_template_round_trip_preserves_note(service, context, tmp_path):
    path = tmp_path / "template.csv"
    service.save_import_template(path)
    headers = next(csv.reader(io.StringIO(path.read_text(encoding="utf-8-sig"))))
    assert headers == ["客户", "牌号", "材料", "颜色", "价格", "税口径", "备注"]
    with path.open("a", encoding="utf-8", newline="") as handle:
        csv.writer(handle).writerow(["七列客户", "QA-7", "PA12", "本色", "9.734513", "未税", "用户备注"])
    preview = service.preview_import(path, context.storage_generation, {"customer_mode": "all", "core_only": True})
    assert not preview["error_count"]
    service.commit_import(preview["preview_id"], context.storage_generation)
    row = context.store.list({"customer": "七列客户"})["items"][0]
    assert row["note"] == "用户备注" and row["price"] == "9.734513"
