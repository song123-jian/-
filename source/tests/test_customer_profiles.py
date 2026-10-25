import pytest

from domain import ConflictError, ValidationError
from services.app_context import AppContext
from services.customer_profile_service import CustomerProfileService, _profile_workbook, parse_customer_profiles
from storage.sqlite_store import SQLiteStore


def empty_profile(**changes):
    return {"name": "", "contact": "", "phone": "", "industry": "", "address": "", **changes}


def test_customer_notes_persist_edit_and_template_round_trip(context):
    service = CustomerProfileService(context)
    saved = service.save_profile(empty_profile(notes="首次试样\n允许空白与手动修改"), context.storage_generation)
    assert saved["notes"] == "首次试样\n允许空白与手动修改"
    assert parse_customer_profiles(service.export_xlsx(context.storage_generation))[0]["notes"] == saved["notes"]
    changed = service.save_profile({**saved, "notes": ""}, context.storage_generation)
    assert changed["notes"] == "" and changed["revision"] == saved["revision"] + 1


def legacy_workbook(profiles):
    import io
    import xml.etree.ElementTree as ET
    import zipfile

    source = zipfile.ZipFile(io.BytesIO(_profile_workbook(profiles)))
    output = io.BytesIO()
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(output, "w") as archive:
        for name in source.namelist():
            data = source.read(name)
            if name == "xl/worksheets/sheet1.xml":
                tree = ET.fromstring(data)
                for row in tree.findall("m:sheetData/m:row", ns):
                    for cell in list(row):
                        if cell.attrib.get("r", "").startswith("H"):
                            row.remove(cell)
                data = ET.tostring(tree, encoding="utf-8")
            archive.writestr(name, data)
    return output.getvalue()


def test_customer_legacy_template_import_defaults_notes_empty():
    assert parse_customer_profiles(legacy_workbook([empty_profile(contact='旧模板')]))[0].get('notes', '') == ''


def test_old_template_update_preserves_existing_notes(context, tmp_path):
    service = CustomerProfileService(context)
    saved = service.save_profile(empty_profile(notes='必须保留的备注'), context.storage_generation)
    path = tmp_path / '旧模板.xlsx'
    path.write_bytes(legacy_workbook([{**saved, 'contact': '旧模板修改'}]))
    service.import_file(path, context.storage_generation)
    updated = service.list_profiles(context.storage_generation)[0]
    assert updated['contact'] == '旧模板修改'
    assert updated['notes'] == '必须保留的备注'


def test_blank_profiles_have_distinct_stable_ids_and_allow_manual_edits(context):
    service = CustomerProfileService(context)
    first = service.save_profile(empty_profile(), context.storage_generation)
    second = service.save_profile(empty_profile(), context.storage_generation)

    assert first["profile_id"] != second["profile_id"]
    assert all(first[field] == "" for field in ("name", "contact", "phone", "industry", "address"))

    updated = service.save_profile(
        {**first, "name": "华东汽车部件", "contact": "王工", "phone": "", "industry": "汽车零部件", "address": ""},
        context.storage_generation,
    )
    assert updated["profile_id"] == first["profile_id"]
    assert updated["revision"] == first["revision"] + 1
    assert updated["phone"] == updated["address"] == ""
    with pytest.raises(ConflictError):
        service.save_profile(first, context.storage_generation)


def test_customer_template_round_trip_preserves_blank_fields_and_ids(context, tmp_path):
    source = CustomerProfileService(context)
    profile = source.save_profile(empty_profile(contact="李工", phone="", industry=""), context.storage_generation)
    workbook = tmp_path / "客户资料.xlsx"
    source.export_file(workbook, context.storage_generation)

    target_folder = tmp_path / "target"
    target_context = AppContext(SQLiteStore(target_folder), target_folder)
    imported = CustomerProfileService(target_context).import_file(workbook, target_context.storage_generation)

    assert imported == {"created": 1, "updated": 0, "skipped": 0}
    copied = CustomerProfileService(target_context).list_profiles(target_context.storage_generation)
    assert len(copied) == 1
    exchanged = ("profile_id", "name", "contact", "phone", "industry", "address", "notes")
    assert {field: copied[0][field] for field in exchanged} == {field: profile[field] for field in exchanged}
    assert copied[0]["revision"] == 1


def test_customer_template_skips_fully_empty_rows_but_accepts_blank_names(context, tmp_path):
    service = CustomerProfileService(context)
    workbook = tmp_path / "客户模板.xlsx"
    service.save_template(workbook)

    assert service.import_file(workbook, context.storage_generation) == {
        "created": 0, "updated": 0, "skipped": 0,
    }
    assert service.list_profiles(context.storage_generation) == []


def test_missing_cloud_api_uses_account_local_profiles_and_keeps_them_on_restart(tmp_path):
    from storage.supabase_store import ReadApiUnavailable

    class MissingCloud:
        backend = "supabase"

        def customer_profiles_list(self):
            raise ReadApiUnavailable("未部署")

    context = AppContext(MissingCloud(), tmp_path / "profile-one")
    service = CustomerProfileService(context)
    saved = service.save_profile(empty_profile(contact="李工"), context.storage_generation)
    assert service.local_only
    reopened = CustomerProfileService(context)
    assert reopened.list_profiles(context.storage_generation) == [saved]
    assert reopened.local_only
    other = AppContext(MissingCloud(), tmp_path / "profile-two")
    assert CustomerProfileService(other).list_profiles(other.storage_generation) == []


def test_initial_cloud_customer_list_uses_one_request_and_refreshes_afterwards(tmp_path):
    class Cloud:
        backend = 'supabase'
        calls = 0

        def customer_profiles_list(self):
            self.calls += 1
            return [{'profile_id': 'one', 'name': str(self.calls)}]

    cloud = Cloud()
    context = AppContext(cloud, tmp_path)
    service = CustomerProfileService(context)
    assert service.list_profiles(context.storage_generation)[0]['name'] == '1'
    assert cloud.calls == 1
    assert service.list_profiles(context.storage_generation)[0]['name'] == '2'
    assert cloud.calls == 2


def test_cloud_network_and_permission_errors_do_not_silently_create_local_database(tmp_path):
    from domain import NetworkError

    class FailedCloud:
        backend = "supabase"

        def customer_profiles_list(self):
            raise NetworkError("网络中断")

    context = AppContext(FailedCloud(), tmp_path)
    with pytest.raises(NetworkError):
        CustomerProfileService(context).list_profiles(context.storage_generation)
    assert not (tmp_path / "customer-profiles-local").exists()


@pytest.mark.parametrize("status,code,local", [(404, "PGRST202", True), (403, "42501", False)])
def test_real_account_route_missing_rpc_fallback_differs_from_permission_error(tmp_path, monkeypatch, status, code, local):
    import io
    import json
    import urllib.error
    from types import SimpleNamespace

    from storage.account_store import AccountStore

    session = SimpleNamespace(config={"url": "https://isolated.supabase.co", "publishable_key": "isolated"},
                              token=lambda: "isolated-token")
    store = AccountStore(tmp_path, session)
    routes = []
    def unavailable(request, **_kwargs):
        routes.append(request.full_url)
        raise urllib.error.HTTPError(request.full_url, status, "controlled", {},
                                     io.BytesIO(json.dumps({"code": code}).encode()))
    monkeypatch.setattr("urllib.request.urlopen", unavailable)
    context = AppContext(store, tmp_path)
    service = CustomerProfileService(context)
    if local:
        item = service.save_profile(empty_profile(), context.storage_generation)
        assert service.local_only and item["revision"] == 1
    else:
        with pytest.raises(ValueError, match="登录"):
            service.save_profile(empty_profile(), context.storage_generation)
        assert not (tmp_path / "customer-profiles-local").exists()
    assert len(routes) == 1 and routes[0].endswith("/rpc/pmu_customer_profiles_v1")


def test_fixed_template_preserves_phone_and_rejects_wrong_header_and_duplicate_ids():
    import uuid

    item = {"profile_id": str(uuid.uuid4()), "revision": 1, **empty_profile(phone="0013800012345")}
    assert parse_customer_profiles(_profile_workbook([item]))[0]["phone"] == item["phone"]
    with pytest.raises(ValidationError, match="重复"):
        parse_customer_profiles(_profile_workbook([item, item]))
    import io
    import zipfile

    source = zipfile.ZipFile(io.BytesIO(_profile_workbook()))
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        for name in source.namelist():
            data = source.read(name)
            if name == "xl/worksheets/sheet1.xml":
                data = data.replace("联系人".encode(), "错误字段".encode())
            archive.writestr(name, data)
    with pytest.raises(ValidationError, match="表头不匹配"):
        parse_customer_profiles(output.getvalue())

