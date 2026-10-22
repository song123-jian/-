"""Cloud contract tests; these do not substitute for real-project acceptance."""
import io
import json
import sqlite3
import urllib.error
import urllib.parse

import pytest
from conftest import record

from domain import ConflictError, NetworkError, ValidationError, customer_key, identity, import_key, validate_record
from storage.supabase_store import SupabaseStore, validate_config

URL = "https://qa-contract.supabase.co"
KEY = "sb_secret_QA-contract-only-123456789"


@pytest.mark.parametrize("url,key", [("http://qa.supabase.co", KEY), ("https://evil.example", KEY), ("https://user@qa.supabase.co", KEY), ("https://qa.supabase.co:443", KEY), ("https://qa.supabase.co?x=1", KEY), (URL, "sb_publishable_anon"), (URL, "bad.jwt.value"), ("https://qa.supabase.co:bad", KEY)])
def test_invalid_cloud_configuration(url, key):
    with pytest.raises(ValueError):
        validate_config(url, key)


def test_https_timeout_secret_header_and_json_string_prices(tmp_path, monkeypatch):
    store = SupabaseStore(tmp_path, URL, KEY)
    captured = []

    class Response:
        headers = {"Content-Range": "0-0/1"}

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def read(self, size):
            return b'{"added":true,"id":1}'

    def urlopen(request, timeout):
        captured.append((request, timeout))
        return Response()

    monkeypatch.setattr("urllib.request.urlopen", urlopen)
    result, content_range = store.request("rpc/pm_add_quote", {"p_record": {"price": "9.734513"}})
    request, timeout = captured[0]
    assert timeout == 15
    assert request.full_url.startswith(URL + "/rest/v1/")
    assert request.get_header("Apikey") == KEY
    assert request.get_header("Authorization") is None
    assert json.loads(request.data)["p_record"]["price"] == "9.734513"
    assert result["added"] and content_range.endswith("/1")


@pytest.mark.parametrize("code,error_code,expected", [(401, "", ValueError), (403, "", ValueError), (404, "42P01", ValueError), (400, "22023", ValueError), (409, "P0001", ConflictError), (500, "XX000", ValueError)])
def test_cloud_http_errors_are_actionable(tmp_path, monkeypatch, code, error_code, expected):
    store = SupabaseStore(tmp_path, URL, KEY)

    def urlopen(*args, **kwargs):
        raise urllib.error.HTTPError(URL, code, "failure", {}, io.BytesIO(json.dumps({"code": error_code, "message": "报价已变化"}).encode()))

    monkeypatch.setattr("urllib.request.urlopen", urlopen)
    with pytest.raises(expected) as error:
        store.request("pm_quotes")
    assert KEY not in str(error.value)


def test_network_interruption_does_not_retry_write(tmp_path, monkeypatch):
    store = SupabaseStore(tmp_path, URL, KEY)
    calls = []

    def urlopen(*args, **kwargs):
        calls.append(1)
        raise urllib.error.URLError("offline")

    monkeypatch.setattr("urllib.request.urlopen", urlopen)
    with pytest.raises(NetworkError, match="先刷新历史核对"):
        store.request("rpc/pm_add_quote", {"p_record": {}})
    assert len(calls) == 1


def test_history_pagination_reads_only_selected_identity(tmp_path, monkeypatch):
    store = SupabaseStore(tmp_path, URL, KEY)
    row = validate_record(record(price="9.734513"))
    group = identity(row)
    key = customer_key(row["customer"])
    rows = [{**row, "id": index, "identity": group, "created_at": "2026-10-09T12:00:00+08:00", "source_type": "文件导入", "import_key": None} for index in (3, 2, 1)]
    seen = []

    def request(route, body=None, count=False):
        seen.append(route)
        if "select=identity,customer_key&" in route:
            return [{"identity": group,"customer_key":key}], "0-0/1"
        assert f"identity=eq.{group}" in route
        offset = int(urllib.parse.parse_qs(urllib.parse.urlsplit("https://qa/" + route).query)["offset"][0])
        return rows[offset:offset + 2], f"{offset}-{min(2, offset + 1)}/3"

    monkeypatch.setattr(store, "request", request)
    monkeypatch.setattr(store, "customer_states", lambda: {key:{"status":"active"}})
    result = store.history(3)
    assert len(result["items"]) == 3
    assert result["items"][0]["is_current"]
    assert len(seen) == 3


def test_cloud_snapshot_preserves_exact_fields(tmp_path, store, monkeypatch):
    cloud = SupabaseStore(tmp_path / "cloud", URL, KEY)
    rows = store.all()

    def request(route, body=None, count=False):
        assert route == "rpc/pm_export_snapshot"
        return {"schema_version":2,"quotes":rows,"customers":list(store.customer_states().values()),"audit":[]}, ""

    monkeypatch.setattr(cloud, "request", request)
    backup = cloud.backup("qa")
    assert KEY.encode() not in backup.read_bytes()
    with sqlite3.connect(backup) as db:
        db.row_factory = sqlite3.Row
        assert db.execute("pragma integrity_check").fetchone()[0] == "ok"
        assert [dict(row) for row in db.execute("select * from quotes order by effective_date desc,id desc")] == rows


def test_cloud_snapshot_copy_failure_leaves_no_partial_backup(tmp_path, monkeypatch):
    cloud = SupabaseStore(tmp_path / "cloud", URL, KEY)
    monkeypatch.setattr(cloud, "request", lambda *args, **kwargs: ({"quotes": [], "customers": [], "audit": []}, ""))

    def fail_copy(*args):
        raise OSError("injected backup copy failure")

    monkeypatch.setattr("storage.supabase_store.atomic_copy", fail_copy)
    with pytest.raises(OSError, match="injected backup copy failure"):
        cloud.backup("qa")

    backup_folder = tmp_path / "cloud" / "backups"
    assert not list(backup_folder.glob("*.sqlite3"))
    assert not list(backup_folder.glob("snapshot-*"))


def test_cloud_commit_accounts_for_race_duplicates(tmp_path, monkeypatch):
    cloud = SupabaseStore(tmp_path, URL, KEY)
    row = validate_record(record())
    monkeypatch.setattr(cloud, "all", lambda: [])
    monkeypatch.setattr(cloud, "customer_states", lambda: {})
    monkeypatch.setattr(cloud, "backup", lambda label: tmp_path / "before.sqlite3")
    calls = []

    def request(route, body=None, count=False):
        calls.append(route)
        assert route == "rpc/pm_import_quotes"
        assert body["p_records"][0]["import_key"] == import_key(row)
        return {"added": 0, "skipped": 1}, ""

    monkeypatch.setattr(cloud, "request", request)
    result = cloud.commit([row])
    assert result["added"] == 0 and result["skipped"] == 1 and len(calls) == 1


def test_cloud_fill_requires_installed_workflow_before_write(tmp_path, monkeypatch):
    cloud = SupabaseStore(tmp_path, URL, KEY)
    calls = []

    def request(route, body=None, count=False):
        calls.append((route, body))
        return [], ""

    monkeypatch.setattr(cloud, "request", request)
    with pytest.raises(ValidationError, match="升级 SQL"):
        cloud.add({**record(color=""), "fill_missing_identity": True, "base_id": 1})
    assert calls == [("pm_settings?select=value&key=eq.quote_workflow_version", None)]


def test_cloud_fill_routes_complete_history_keys_atomically(tmp_path, monkeypatch):
    cloud = SupabaseStore(tmp_path, URL, KEY)
    prior = {**validate_record(record(color="")), "id": 1, "source_type": "文件导入", "customer_revision": 1}
    prior.update(identity=identity(prior), customer_key=customer_key(prior["customer"]), import_key=import_key(prior))
    target = {**prior, "color": "白色", "reason": "补齐颜色", "fill_missing_identity": True, "base_id": 1}
    seen = []

    def request(route, body=None, count=False):
        seen.append((route, body))
        if route.startswith("pm_settings?"):
            return [{"value": "1.6.0"}], ""
        if route.startswith("pm_quotes?select=*&id="):
            return [prior], ""
        assert route == "rpc/pm_save_quote_v160"
        assert body["p_base_id"] == 1 and body["p_record"]["identity"] == identity(target)
        assert body["p_history_keys"] == [{"id": 1, "import_key": import_key({**prior, "color": "白色"})}]
        return {"id": 1, "added": False, "record": {**target, "customer_revision": 2}}, ""

    monkeypatch.setattr(cloud, "request", request)
    monkeypatch.setattr(cloud, "customer_states", lambda: {prior["customer_key"]: {"status": "active", "revision": 1}})
    monkeypatch.setattr(cloud, "history", lambda _: {"items": [prior]})
    monkeypatch.setattr(cloud, "backup", lambda _: tmp_path / "before-fill.sqlite3")
    result = cloud.add(target)
    assert result["record"]["customer_revision"] == 2 and result["backup"].endswith("before-fill.sqlite3")
    assert len([entry for entry in seen if entry[0].startswith("rpc/")]) == 1


def test_cloud_image_has_null_history_keys_and_immediate_flag(tmp_path, monkeypatch):
    cloud = SupabaseStore(tmp_path, URL, KEY)
    calls = []

    def request(route, body=None, count=False):
        calls.append(route)
        if route.startswith("pm_settings?"):
            return [{"value": "1.6.0"}], ""
        assert route == "rpc/pm_save_quote_v160"
        assert body["p_history_keys"] is None and body["p_record"]["import_immediate"] is True
        return {"id": 1, "added": True, "record": {**record(), "customer_revision": 1}}, ""

    monkeypatch.setattr(cloud, "request", request)
    monkeypatch.setattr(cloud, "customer_states", lambda: {})
    assert cloud.add({**record(), "import_immediate": True})["added"]
    assert calls[-1] == "rpc/pm_save_quote_v160"
