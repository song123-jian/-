"""Behavior contracts for bounded previews and reduced ledger reads."""
import csv
from unittest.mock import patch

import pytest

from domain import ValidationError, customer_key
from services.customer_service import CustomerService
from services.price_service import PriceService
from storage.supabase_store import SupabaseStore


def import_file(tmp_path, count=123):
    path = tmp_path / "all-rows.csv"
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["客户", "牌号", "材料", "颜色", "价格", "税口径", "备注"])
        for index in range(count):
            writer.writerow(["分页客户", f"PAGE-{index + 1:03}", "PP", "白色", "9.734513", "未税", f"核对备注{index + 1}"])
    return path


def test_preview_can_read_every_row_without_consuming_it(service, context, tmp_path):
    preview = service.preview_import(import_file(tmp_path), context.storage_generation,
                                     {"customer_mode": "all", "core_only": True})
    assert hasattr(service, "get_import_page"), "Preview needs full browsing after row 50"
    pages = [service.get_import_page(preview["preview_id"], context.storage_generation, page) for page in (1, 2, 3)]
    assert [len(page["items"]) for page in pages] == [50, 50, 23]
    rows = [row for page in pages for row in page["items"]]
    assert [row["grade"] for row in rows] == [f"PAGE-{index + 1:03}" for index in range(123)]
    assert rows[50]["note"] == "核对备注51" and rows[-1]["note"] == "核对备注123"
    assert all(row["import_action"] == "新增牌号" for row in rows)
    result = service.commit_import(preview["preview_id"], context.storage_generation)
    assert result["added"] == len(rows)
    saved = context.store.list({"customer": "分页客户"})["items"]
    assert {r["grade"]: r["note"] for r in saved} == {r["grade"]: r["note"] for r in rows}


def test_preview_pages_include_duplicates_and_respect_expiry(service, context, tmp_path):
    path = import_file(tmp_path, 51)
    options = {"customer_mode": "all", "core_only": True}
    first = service.preview_import(path, context.storage_generation, options)
    service.commit_import(first["preview_id"], context.storage_generation)
    second = service.preview_import(path, context.storage_generation, options)
    assert hasattr(service, "get_import_page")
    page = service.get_import_page(second["preview_id"], context.storage_generation, 2)
    assert page["items"][0]["grade"] == "PAGE-051"
    assert page["items"][0]["import_action"] == "重复跳过"
    with pytest.raises(ValidationError):
        service.get_import_page(second["preview_id"], context.storage_generation, 0)
    context.previews[second["preview_id"]]["expires"] = 0
    with pytest.raises(ValidationError, match="过期"):
        service.get_import_page(second["preview_id"], context.storage_generation, 1)


def test_refresh_ranks_once_and_matches_independent_results(service, context):
    assert hasattr(service, "refresh_quotes"), "Directory and quotes need one read snapshot"
    expected_meta = context.store.meta()
    expected_quotes = context.store.list({"customer": "金华"})
    with patch.object(context.store, "list", wraps=context.store.list) as listing:
        result = service.refresh_quotes({"customer": "金华"}, context.storage_generation)
    assert listing.call_count == 1
    assert result["meta"]["customers"] == expected_meta["customers"]
    assert result["quotes"]["items"] == expected_quotes["items"]
    assert result["quotes"]["stats"] == expected_quotes["stats"]


def test_customer_counts_and_details_do_not_load_all_history(context):
    service = CustomerService(context)
    expected = service.list_customers("active", context.storage_generation)
    key = customer_key(expected["items"][0]["display_name"])
    expected_detail = context.store.customer_details(key)
    with patch.object(context.store, "all", side_effect=AssertionError("All history must not be loaded")):
        actual = service.list_customers("active", context.storage_generation)
        detail = service.preview_delete(key, context.storage_generation)
    assert actual == expected
    assert detail["items"] == expected_detail["items"]
    assert detail["records"] == expected_detail["records"]


def test_customer_directory_cache_is_invalidated_by_quote_write(context):
    directory = CustomerService(context)
    with patch.object(context.store, "customer_summaries", wraps=context.store.customer_summaries) as summaries:
        first = directory.list_customers("active", context.storage_generation)
        second = directory.list_customers("active", context.storage_generation)
        assert first == second and summaries.call_count == 1

        PriceService(context).add_quote({
            "customer": "目录缓存新客户", "grade": "CACHE-01", "material": "PP", "color": "本色",
            "price": "10", "tax_type": "含税", "effective_date": "2026-10-25", "note": "", "reason": "",
            "storage_generation": context.storage_generation,
        })
        refreshed = directory.list_customers("active", context.storage_generation)

    assert any(row["display_name"] == "目录缓存新客户" for row in refreshed["items"])
    assert summaries.call_count == 2


def test_customer_directory_cache_is_invalidated_by_import(context, service, tmp_path):
    directory = CustomerService(context)
    directory.list_customers("active", context.storage_generation)
    path = tmp_path / "directory-import.csv"
    path.write_text("客户,牌号,材料,颜色,价格,税口径,更新日期,备注\n"
                    "目录导入新客户,IMPORT-01,PP,本色,10,含税,2026-10-25,\n", encoding="utf-8")
    preview = service.preview_import(path, context.storage_generation,
                                     {"customer_mode": "all", "core_only": True})
    service.commit_import(preview["preview_id"], context.storage_generation)
    refreshed = directory.list_customers("active", context.storage_generation)
    assert any(row["display_name"] == "目录导入新客户" for row in refreshed["items"])


def test_cloud_customer_directory_uses_summary_rpc(context, tmp_path):
    cloud = SupabaseStore(tmp_path, "https://qa.supabase.co", "sb_secret_" + "q" * 32)
    expected = context.store.customer_summaries("active")
    seen = []

    def request(route, body=None, count=False):
        seen.append((route, body, count))
        if route == "rpc/pm_customer_summaries_v165":
            return expected, ""
        raise AssertionError("Customer directory must use the summary RPC")

    cloud.request = request
    assert cloud.customer_summaries("active") == expected
    assert seen == [("rpc/pm_customer_summaries_v165", {"p_status": "active"}, False)]


def test_cloud_current_query_uses_ranked_rpc(context, tmp_path):
    cloud = SupabaseStore(tmp_path, "https://qa.supabase.co", "sb_secret_" + "q" * 32)
    rows = context.store.list()["items"]
    # SQL returns one ranked row per identity, with predecessor provenance.
    ranked = [{**row, "previous_date": None, "previous_source_type": None} for row in rows]
    seen = []

    def request(route, body=None, count=False):
        seen.append(route)
        if route == "rpc/pm_current_quotes_v165":
            return ranked, ""
        raise AssertionError("Current query must not fetch all history")

    cloud.request = request
    actual = cloud.list({"customer": "金华"})
    assert len(actual["items"]) == 16 and seen == ["rpc/pm_current_quotes_v165"]


def test_cloud_details_are_scoped_when_read_api_is_missing(context, tmp_path):
    from storage.supabase_store import ReadApiUnavailable
    cloud = SupabaseStore(tmp_path, "https://qa.supabase.co", "sb_secret_" + "q" * 32)
    key = next(iter(context.store.customer_states()))
    expected = context.store.customer_details(key)
    seen = []

    def request(route, body=None, count=False):
        seen.append(route)
        if route == "rpc/pm_customer_details_v165":
            raise ReadApiUnavailable("云端尚未安装可选读取优化接口")
        if route == "rpc/pm_customer_states":
            return list(context.store.customer_states().values()), ""
        assert "customer_key=eq." + key in route, "Only selected customer's history may be read"
        return expected["items"], f"0-{len(expected['items'])-1}/{len(expected['items'])}"

    cloud.request = request
    actual = cloud.customer_details(key)
    assert actual == expected
    assert len(seen) == 3
