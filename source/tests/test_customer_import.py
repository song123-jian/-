import sqlite3
from unittest.mock import patch

import pytest
from conftest import record
from pdf_factory import quotation_pdf

from domain import ConflictError, StorageError, ValidationError
from importer import material_spec, read_prices
from pdf_importer import inspect_pdf
from storage.sqlite_store import SQLiteStore
from storage.supabase_store import SupabaseStore


def selected_options(customer="金华领先", **extra):
    return {"customer_mode": "selected", "selected_customer": customer, "core_only": True,
            "effective_date": "2026-10-10", **extra}


def test_selected_import_forces_customer_and_ignores_extra_columns():
    content = "客户,客户名称,产品名称,牌号,未税价格,数量,合计,联系人,备注,颜色\n新客户,其他抬头,PA12,QA-1,9.734513,500,999999,张三,不参与,红色\n"
    result = read_prices(content.encode(), "core.csv", selected_options())
    assert not result["errors"]
    row = result["records"][0]
    assert (row["customer"], row["material"], row["price"], row["tax_type"]) == ("金华领先", "PA12", "9.734513", "未税")
    assert (row["note"], row["color"]) == ("不参与", "红色")


def test_total_word_and_long_text_in_ignored_fields_do_not_drop_quote():
    text = "牌号,含税价格,备注,联系人\nQA-1,10,合计," + "无关" * 3000 + "\n"
    result = read_prices(text.encode(), "extra.csv", selected_options())
    assert len(result["records"]) == 1 and not result["errors"] and result["omitted"] == 0


def test_all_customers_require_row_customer_and_cannot_use_common_customer():
    result = read_prices("牌号,含税价格\nQA-1,10\n".encode(), "no-client.csv",
                         {"customer_mode": "all", "customer": "错误兜底", "effective_date": "2026-10-10"})
    assert not result["records"] and "客户" in result["errors"][0]["message"]


def test_dual_prices_and_distinct_spec_are_preserved_atomically():
    content = "产品名称,牌号,材料规格,未税价格（元/kg）,含税价格（元/kg）\n尼龙,QA-1,PA12,9.734513,11.000001\n"
    result = read_prices(content.encode(), "two-prices.csv", selected_options())
    assert not result["errors"]
    assert [(r["price"], r["tax_type"]) for r in result["records"]] == [("9.734513", "未税"), ("11.000001", "含税")]
    assert all(r["grade"] == "QA-1" and material_spec(r) == "PA12" for r in result["records"])
    bad = read_prices(content.replace("11.000001", "错误").encode(), "bad.csv", selected_options())
    assert not bad["records"] and len(bad["errors"]) == 1


def test_missing_date_uses_today_but_missing_price_is_still_an_error(monkeypatch):
    monkeypatch.setattr("importer.today", lambda: "2026-10-10")
    missing_date = read_prices("牌号,未税价格\nQA-1,10\n".encode(), "no-date.csv",
                               {"customer_mode": "selected", "selected_customer": "金华领先"})
    assert not missing_date["errors"] and missing_date["records"][0]["effective_date"] == "2026-10-10"
    missing_price = read_prices("牌号,含税价格,数量,合计\nQA-1,,1000,14890\n".encode(), "no-price.csv", selected_options())
    assert not missing_price["records"] and "价格" in missing_price["errors"][0]["message"]


def test_spec_fallback_synthetic_xlsx_remains_supported(qa_workbook):
    original = qa_workbook
    result = read_prices(original.read_bytes(), original.name)
    assert len(result["records"]) == 41 and not result["errors"]
    result = read_prices("产品名称,规格型号,单价含税（元/Kg）\nPP-TD20,PM4BK-S04,14.89\n".encode(), "order.csv", selected_options())
    assert (result["records"][0]["grade"], result["records"][0]["tax_type"]) == ("PM4BK-S04", "含税")


def test_expanded_tax_prices_cannot_exceed_quote_limit(monkeypatch):
    monkeypatch.setattr("importer.MAX_ROWS", 2)
    with pytest.raises(ValueError, match="分别计数"):
        read_prices("牌号,未税价格,含税价格\nQA-1,10,11\nQA-2,10,11\n".encode(), "limit.csv", selected_options())


@pytest.mark.parametrize("mode", ["selected", "all"])
def test_pdf_headers_never_choose_customer_in_new_modes(mode):
    rows = [["产品名称", "规格型号", "单价含税（元/Kg）", "数量", "合计（元）"],
            ["PA6-GF30", "BG6BK", "14.89", "1000", "14890"]]
    content = quotation_pdf([rows], metadata=["客户：文件抬头客户", "日期：2026-09-30", "不含税"])
    options = selected_options() if mode == "selected" else {"customer_mode": "all", "effective_date": "2026-10-10"}
    inspected = inspect_pdf(content, "order.pdf", options)
    assert inspected["defaults"] == {}
    result = read_prices(content, "order.pdf", options)
    if mode == "selected":
        assert not result["errors"]
        row = result["records"][0]
        assert (row["customer"], row["grade"], row["tax_type"]) == ("金华领先", "BG6BK", "含税")
    else:
        assert not result["records"] and "客户" in result["errors"][0]["message"]


def test_order_pdf_total_label_in_price_column_is_not_a_quote():
    rows = [["序号", "物料名称", "规格型号", "数量", "单价含税\n（元/Kg）", "合计（元）"],
            ["1", "PP-TD20", "PM4BK-S04", "1000", "", ""],
            ["2", "PP-TD30", "PM6-S01", "200", "", ""],
            ["3", "PA6-GF30", "BG6BK", "1000", "14.89", "14890"],
            ["4", "PA6-GF50", "BG6BK", "200", "", ""],
            ["", "", "", "", "合计：", "14890"]]
    result = read_prices(quotation_pdf([rows]), "order.pdf", selected_options())
    assert len(result["records"]) == 1 and len(result["errors"]) == 3 and result["omitted"] == 1
    assert result["records"][0]["price"] == "14.89"


def test_selected_matching_updates_and_merges_without_new_customer(service, context, tmp_path):
    first = context.store.add(record(customer="QA已有客户", color="本色", note="保留原备注"))
    path = tmp_path / "quotes.csv"
    path.write_text("客户,产品名称,牌号,含税价格\n文件新客户,,QA-PP,9.734513\n文件新客户,PA12,QA-NEW,12\n", encoding="utf-8")
    options = selected_options("QA已有客户")
    preview = service.preview_import(path, context.storage_generation, options)
    assert (preview["created"], preview["updated"], preview["new_customers"], preview["error_count"]) == (1, 1, 0, 0)
    assert {r["customer"] for r in preview["samples"]} == {"QA已有客户"}
    updated = next(r for r in preview["samples"] if r["grade"] == "QA-PP")
    assert (updated["material"], updated["color"], updated["note"]) == ("PP-TD20", "本色", "保留原备注")
    saved = service.commit_import(preview["preview_id"], context.storage_generation)
    assert saved["added"] == 2
    assert len(context.store.history(first["id"])["items"]) == 2
    assert not context.store.list({"customer": "文件新客户"})["items"]
    repeated = service.preview_import(path, context.storage_generation, options)
    assert (repeated["added"], repeated["skipped"], repeated["error_count"]) == (0, 2, 0)
    assert SQLiteStore(context.folder).list({"customer": "QA已有客户"})["stats"]["items"] == 2


def test_selected_customer_must_already_exist(service, context, tmp_path):
    path = tmp_path / "new.csv"
    path.write_text("牌号,未税价格\nQA-NEW,10\n", encoding="utf-8")
    with pytest.raises(ValidationError, match="全部客户"):
        service.preview_import(path, context.storage_generation, selected_options("不存在的客户"))
    assert len(context.store.all()) == 41


def test_all_customers_may_create_from_explicit_customer_column(service, context, tmp_path):
    path = tmp_path / "all.csv"
    path.write_text("客户,产品名称,牌号,含税价格\nQA新客户,PA12,QA-NEW,10\n", encoding="utf-8")
    preview = service.preview_import(path, context.storage_generation, {"customer_mode": "all", "effective_date": "2026-10-10", "core_only": True})
    assert preview["new_customers"] == 1
    service.commit_import(preview["preview_id"], context.storage_generation)
    assert context.store.list({"customer": "QA新客户"})["items"][0]["price"] == "10"


def test_manual_record_same_content_is_skipped(service, context, tmp_path):
    context.store.add(record(customer="QA已有客户", effective_date="2026-10-10"))
    path = tmp_path / "manual.csv"
    path.write_text("牌号,含税价格\nQA-PP,10.5\n", encoding="utf-8")
    preview = service.preview_import(path, context.storage_generation, selected_options("QA已有客户"))
    assert (preview["added"], preview["skipped"]) == (0, 1)


def test_all_customer_synthetic_core_import_merges_existing_fields(service, context, qa_workbook):
    path = qa_workbook
    preview = service.preview_import(path, context.storage_generation, {"customer_mode": "all", "core_only": True})
    assert (preview["added"], preview["skipped"], preview["error_count"], preview["new_customers"]) == (0, 41, 0, 0)


def test_ambiguous_colors_block_entire_import(service, context, tmp_path):
    context.store.add(record(customer="QA已有客户", color="白色"))
    context.store.add(record(customer="QA已有客户", color="黑色"))
    path = tmp_path / "ambiguous.csv"
    path.write_text("牌号,含税价格\nQA-PP,10\nQA-NEW,12\n", encoding="utf-8")
    preview = service.preview_import(path, context.storage_generation, selected_options("QA已有客户"))
    assert preview["error_count"] == 1 and "多个" in preview["errors"][0]["message"]
    with pytest.raises(ValidationError, match="错误行"):
        service.commit_import(preview["preview_id"], context.storage_generation)
    assert len(context.store.all()) == 43


def test_conflicting_specs_in_same_batch_are_blocked(service, context, tmp_path):
    path = tmp_path / "specs.csv"
    path.write_text("牌号,材料规格,含税价格\nQA-NEW,PA12,10\nQA-NEW,PA6,11\n", encoding="utf-8")
    preview = service.preview_import(path, context.storage_generation, selected_options())
    assert preview["error_count"] == 1 and "规格" in preview["errors"][0]["message"]


def test_quote_change_after_selected_preview_requires_new_preview(service, context, tmp_path):
    first = context.store.add(record(customer="QA已有客户"))
    path = tmp_path / "race.csv"
    path.write_text("牌号,含税价格\nQA-PP,10\n", encoding="utf-8")
    preview = service.preview_import(path, context.storage_generation, selected_options("QA已有客户"))
    context.store.add(record(customer="QA已有客户", price="11", base_id=first["id"], reason="其他调整"))
    with pytest.raises(ConflictError, match="重新预览"):
        service.commit_import(preview["preview_id"], context.storage_generation)
    assert len(context.store.history(first["id"])["items"]) == 2


def test_new_matching_color_after_preview_does_not_create_wrong_identity(service, context, tmp_path):
    path = tmp_path / "race-new.csv"
    path.write_text("牌号,含税价格\nQA-NEW,10\n", encoding="utf-8")
    preview = service.preview_import(path, context.storage_generation, selected_options())
    context.store.add(record(customer="金华领先", grade="QA-NEW", color="白色"))
    with pytest.raises(ConflictError, match="重新预览"):
        service.commit_import(preview["preview_id"], context.storage_generation)


def test_selected_preview_skips_already_committed_identical_records(service, context, tmp_path):
    path = tmp_path / "identical.csv"
    path.write_text("牌号,含税价格\nQA-NEW,10\n", encoding="utf-8")
    first = service.preview_import(path, context.storage_generation, selected_options())
    second = service.preview_import(path, context.storage_generation, selected_options())
    service.commit_import(second["preview_id"], context.storage_generation)
    result = service.commit_import(first["preview_id"], context.storage_generation)
    assert (result["added"], result["skipped"], result["backup"]) == (0, 1, None)


def test_product_conflict_does_not_overwrite_existing_material(service, context, tmp_path):
    context.store.add(record(customer="QA已有客户"))
    path = tmp_path / "product-conflict.csv"
    path.write_text("产品名称,牌号,含税价格\nPA12,QA-PP,10\n", encoding="utf-8")
    preview = service.preview_import(path, context.storage_generation, selected_options("QA已有客户"))
    assert preview["error_count"] == 1 and "产品名称" in preview["errors"][0]["message"]


def test_selected_update_and_new_row_roll_back_together(service, context, tmp_path):
    context.store.add(record(customer="QA已有客户"))
    path = tmp_path / "atomic.csv"
    path.write_text("牌号,含税价格\nQA-PP,10\nQA-NEW,12\n", encoding="utf-8")
    preview = service.preview_import(path, context.storage_generation, selected_options("QA已有客户"))
    insert = context.store.insert
    calls = []

    def fail_second(*args):
        calls.append(1)
        if len(calls) == 2:
            raise sqlite3.IntegrityError("QA failure")
        return insert(*args)

    with patch.object(context.store, "insert", side_effect=fail_second):
        with pytest.raises(StorageError, match="回滚"):
            service.commit_import(preview["preview_id"], context.storage_generation)
    assert len(context.store.all()) == 42


def test_supabase_preview_deduplicates_manual_quotes(tmp_path, monkeypatch):
    cloud = SupabaseStore(tmp_path, "https://qa-only.supabase.co", "sb_secret_QA-isolated-123456789")
    existing = read_prices("客户,牌号,含税价格,更新日期\nQA客户,QA-PP,10,2026-10-10\n".encode(), "old.csv")["records"][0]
    monkeypatch.setattr(cloud, "all", lambda: [{**existing, "import_key": None}])
    monkeypatch.setattr(cloud, "customer_states", lambda: {})
    assert cloud.preview([existing]) == ([], 1)
