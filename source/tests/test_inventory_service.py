"""Inventory authentication, read-only protocol and response failure boundaries."""
import json
import threading
from unittest.mock import Mock

import pytest
import requests

import services.inventory_service as inventory_module
from services.inventory_service import (
    InventoryCancelled,
    InventoryError,
    InventoryLoginError,
    InventoryService,
    InventorySessionExpired,
    grade_pattern,
    quantity,
    stock_date,
)

DEFAULT_MES_URL = inventory_module.MES_URL


@pytest.fixture(autouse=True)
def isolate_mes_transport(monkeypatch):
    monkeypatch.setattr(inventory_module, "MES_URL", "https://mes-qa.invalid/")


def response(payload=None, *, text=None, status=200, location=""):
    value = Mock()
    value.__enter__ = Mock(return_value=value)
    value.__exit__ = Mock(return_value=False)
    value.status_code = status
    value.headers = {"Location": location}
    value.iter_content.return_value = [(text if text is not None else json.dumps(payload)).encode()]
    return value


def session():
    value = Mock()
    value.headers = {}
    value.request.side_effect = [
        response(text='<input name="Password" type="password">'),
        response(text="", status=302, location="/"),
        response({"SYSID": "WMS0301", "CONFIGARGU": "WH_STOCKQUERY"}),
        response({"viewdef": {"viewID": "WH_STOCKGRID", "storeUrl": "Query/QuerySqlObjectNew", "allowEdit": False}}),
        response({"datas": [{"DATACODE": "3382", "DATANAME": "KG"}]}),
        response({"datas": [{"ROOM": "XN", "ROOMNAME": "虚拟库"}]}),
    ]
    return value


def stock(**changes):
    row = {"MATCODE": "AG6[2213]", "MATNAME": "AG6[2213]", "SQTY": "50.0000", "UQTY": "25.0000",
           "UNIT": "3382", "DEPOT": "XN", "SITE": "XN01", "BANTCHSN": "B-001",
           "STOCKDATE": "/Date(1788220800000)/", "UPDATETIME": "/Date(1788220800000)/"}
    row.update(changes)
    return row


def logged_service(page_size=2):
    transport = session()
    service = InventoryService(session_factory=lambda: transport, page_size=page_size)
    service.login("test-account", "test-secret")
    return service, transport


def test_known_legacy_http_endpoint_can_login_with_mock_transport(monkeypatch):
    assert DEFAULT_MES_URL.startswith("http://")
    monkeypatch.setattr(inventory_module, "MES_URL", DEFAULT_MES_URL)
    transport = session()
    service = InventoryService(session_factory=lambda: transport)

    service.login("test-account", "test-secret")

    assert transport.request.call_count == 6
    assert all(call.args[1].startswith("http://mes.njjulong.cn:8081/")
               for call in transport.request.call_args_list)
    assert all(call.kwargs["verify"] is True for call in transport.request.call_args_list)
    assert service.logged_in
    service.close()


@pytest.mark.parametrize("url", (
    "http://mes-qa.invalid/",
    "http://mes.njjulong.cn/",
    "http://mes.njjulong.cn:8081/unexpected/",
))
def test_unapproved_http_endpoint_is_rejected_before_credentials_are_sent(monkeypatch, url):
    monkeypatch.setattr(inventory_module, "MES_URL", url)
    transport = session()
    service = InventoryService(session_factory=lambda: transport)

    with pytest.raises(InventoryError, match="HTTP.*原服务地址"):
        service.login("test-account", "test-secret")

    assert transport.request.call_count == 0
    transport.close.assert_called_once()
    assert not service.logged_in


def test_login_duplicate_language_fields_and_no_persistent_credentials(tmp_path):
    service, transport = logged_service()
    request = transport.request.call_args_list[1]
    assert request.args == ("POST", "https://mes-qa.invalid/Login/LogOn")
    assert [item for item in request.kwargs["data"] if item[0] == "Language"] == [("Language", "zh-CN"), ("Language", "None")]
    assert request.kwargs["allow_redirects"] is False
    assert request.kwargs["verify"] is True
    assert not any(value in str(service.__dict__) for value in ("test-account", "test-secret"))
    assert not list(tmp_path.iterdir())
    service.close()
    assert not service.logged_in
    transport.cookies.clear.assert_called_once()
    transport.close.assert_called_once()


def test_query_exact_parameters_paging_numeric_and_dictionary_values():
    service, transport = logged_service()
    transport.request.side_effect = [response({"totalCount": 3, "data": [stock()]})]
    result = service.query("AG6[2213]", 2)
    params = transport.request.call_args.kwargs["params"]
    assert params["start"] == 2 and params["page"] == 2 and params["limit"] == 2
    assert params["CURVIEWID"] == params["VIEWID"] == "WH_STOCKGRID"
    assert json.loads(params["querymodels"]) == [{"id": "MATCODE", "type": "String", "value": ["%AG6[[]2213]%"]}]
    assert result.total == 3 and result.pages == 2 and len(result.items) == 1
    assert result.items[0]["stock"] == "50" and result.items[0]["available"] == "25"
    assert result.items[0]["unit"] == "KG" and result.items[0]["warehouse"] == "虚拟库"
    assert result.items[0]["stock_date"] == "2026-09-01 08:00:00"
    assert "price" not in result.items[0]
    service.close()


def test_empty_and_nullable_stock_preserve_unknown_values():
    service, transport = logged_service()
    transport.request.side_effect = [response({"totalCount": 0, "data": []}),
                                     response({"totalCount": 1, "data": [stock(SQTY=None, UQTY="", UNIT="new-code", DEPOT="new-room")]})]
    empty = service.query("nonexistent")
    assert empty.total == 0 and empty.pages == 1 and not empty.items
    row = service.query("AG6").items[0]
    assert row["stock"] == row["available"] == ""
    assert row["unit"] == "new-code" and row["warehouse"] == "new-room"
    service.close()


@pytest.mark.parametrize("login_response", [response(text="invalid", status=200),
                                          response(text="", status=302, location="http://external.example/")])
def test_login_failure_is_sanitized_and_clears_session(login_response):
    transport = session()
    transport.request.side_effect = [response(text="login"), login_response]
    service = InventoryService(session_factory=lambda: transport)
    with pytest.raises(InventoryLoginError, match="登录失败"):
        service.login("test-account", "test-secret")
    assert not service.logged_in
    transport.close.assert_called_once()
    assert transport.request.call_count == 2


@pytest.mark.parametrize("expiration", [response(text="", status=302, location="/Login/LogOn"),
                                       response(text='<input name="Password">'),
                                       response(text='<script>window.location="Login/LogOn";</script>'),
                                       response(text="", status=401), response(text="", status=403)])
def test_session_expired_clears_all_cookies(expiration):
    service, transport = logged_service()
    transport.request.side_effect = [expiration]
    with pytest.raises(InventorySessionExpired):
        service.query("AG6")
    assert not service.logged_in
    transport.cookies.clear.assert_called_once()


@pytest.mark.parametrize("payload", [{"data": [], "totalCount": -1}, {"data": [], "totalCount": "1"},
                                    {"data": [stock()], "totalCount": 0}, {"data": [{}], "totalCount": 1},
                                    {"data": [stock(), stock(), stock()], "totalCount": 3},
                                    {"success": False, "error": "SQL: test-secret"}])
def test_invalid_server_payload_is_never_used_as_inventory(payload):
    service, transport = logged_service()
    transport.request.side_effect = [response(payload)]
    with pytest.raises(InventoryError) as exc:
        service.query("AG6")
    assert "test-secret" not in str(exc.value) and "SQL" not in str(exc.value)
    service.close()


@pytest.mark.parametrize("failure", [requests.Timeout("test-secret"), response(text="invalid-json"), response(text="server-secret", status=500)])
def test_connection_and_format_failures_do_not_reveal_response(failure):
    service, transport = logged_service()
    transport.request.side_effect = [failure]
    with pytest.raises(InventoryError) as exc:
        service.query("AG6")
    assert "secret" not in str(exc.value)
    assert service.logged_in
    service.close()


@pytest.mark.parametrize("grade", ["", "%\n", "X'; DROP TABLE X", "X--Y", "X/*Y", "A" * 121])
def test_grade_validation_before_any_network_request(grade):
    service, transport = logged_service()
    count = transport.request.call_count
    with pytest.raises(InventoryError):
        service.query(grade)
    assert transport.request.call_count == count
    service.close()


def test_literal_metacharacters_dates_and_quantities():
    assert grade_pattern("  G_1%[A] ") == ("G_1%[A]", "%G[_]1[%][[]A]%")
    assert quantity("0.0000") == "0" and quantity("-10.5") == "-10.5"
    for value in ("NaN", "Infinity", "invalid", True, "1e-999999999", "0" * 81):
        with pytest.raises(InventoryError):
            quantity(value)
    assert stock_date("/Date(-62135596800000)/") == ""
    assert stock_date(None) == ""
    assert stock_date("2013/8/7 8:41:21") == "2013-08-07 08:41:21"


def test_readonly_request_allowlist_and_session_required():
    service = InventoryService()
    with pytest.raises(InventorySessionExpired):
        service.query("AG6")
    with pytest.raises(InventoryError, match="不支持"):
        service._request(Mock(), 0, "POST", "Query/Save")


def test_close_during_login_cannot_publish_late_session():
    transport = session()
    started, resume = threading.Event(), threading.Event()
    original = list(transport.request.side_effect)

    def request(*args, **kwargs):
        started.set()
        assert resume.wait(2)
        return original.pop(0)

    transport.request.side_effect = request
    service = InventoryService(session_factory=lambda: transport)
    errors = []

    def run():
        try:
            service.login("test-account", "test-secret")
        except InventoryCancelled as exc:
            errors.append(exc)

    worker = threading.Thread(target=run)
    worker.start()
    assert started.wait(2)
    service.close()
    resume.set()
    worker.join(3)
    assert not worker.is_alive() and errors and not service.logged_in
    transport.close.assert_called_once()


@pytest.mark.parametrize("row", [stock(MATCODE="UNRELATED"), {"MATCODE": "AG6", "SQTY": "50"}])
def test_missing_quantities_or_ignored_server_filter_are_rejected(row):
    service, transport = logged_service()
    transport.request.side_effect = [response({"data": [row], "totalCount": 1})]
    with pytest.raises(InventoryError):
        service.query("AG6")
    service.close()


def reserve_response(rows=None, total=1):
    row = {"SGMATCODE": "C.A.AG6BK-S20(HZ)", "SGBANTCH": "C264671001", "SGQTY": "18.0000", "CUSTID": "00C064",
           "SGDATE": "2026/9/17 19:27:52", "DILIVERDATE1": "2026-09-12", "CGNAME": "备货示例客户", "SGQUASTATE1": "合格", "SGROOM": "XN"}
    return [response({"SYSID": "WMS0305", "CONFIGARGU": "VIEW_CLIENTSTOCK"}),
            response({"viewdef": {"viewID": "VIEW_CLIENTSTOCK", "storeUrl": "Query/QuerySqlObjectNew", "allowEdit": False}}),
            response({"data": [row] if rows is None else rows, "totalCount": total})]


def test_material_name_uses_verified_field_and_rejects_ignored_filter():
    service, transport = logged_service()
    transport.request.side_effect = [response({"totalCount": 1, "data": [stock(MATNAME="尼龙 PA12")]})]
    result = service.query("尼龙", search_by="material_name")
    params = transport.request.call_args.kwargs["params"]
    assert json.loads(params["querymodels"]) == [{"id": "MATNAME", "type": "String", "value": ["%尼龙%"]}]
    assert "MATCODE" not in params and result.search_by == "material_name"
    transport.request.side_effect = [response({"totalCount": 1, "data": [stock(MATNAME="其他物料")]})]
    with pytest.raises(InventoryError, match="不匹配"):
        service.query("尼龙", search_by="material_name")
    count = transport.request.call_count
    with pytest.raises(InventoryError):
        service.query("AG6", search_by="unknown")
    assert transport.request.call_count == count
    service.close()


def test_reserve_batch_exact_parameters_fields_and_pagination():
    service, transport = logged_service()
    transport.request.side_effect = reserve_response(total=3)
    result = service.query_reserve(" C264671001 ", 2)
    params = transport.request.call_args.kwargs["params"]
    assert params["CURVIEWID"] == params["VIEWID"] == "VIEW_CLIENTSTOCK"
    assert params["start"] == 2 and params["limit"] == 2 and params["SGBANTCH"] == "C264671001"
    assert json.loads(params["querymodels"]) == [{"id": "SGBANTCH", "type": "String", "value": ["C264671001"]}]
    row = result.items[0]
    assert row["stock"] == "18" and row["customer_code"] == "00C064" and row["customer"] == "备货示例客户"
    assert row["stock_date"] == "2026-09-17 19:27:52" and row["delivery_date"] == "2026-09-12"
    assert row["quality"] == "合格" and row["warehouse"] == "XN" and row["warehouse_name"] == "虚拟库" and "unit" not in row
    assert result.batch == "C264671001" and result.pages == 2
    service.close()


def test_reserve_all_mes_columns_keep_original_values_and_lowercase_salesperson():
    service, transport = logged_service()
    raw = {"SGMATCODE": "C.A.AG6", "SGBANTCH": "G262234201", "SGQTY": "355.0000",
           "CUSTID": "000JLHX", "SGDATE": "2026/6/3 11:09:13", "DILIVERDATE1": "2026-06-15",
           "CGNAME": "示例股份有限公司", "SGQUASTATE1": "合格", "QUADESC": "检验说明",
           "bussman1": "张三", "BUSSMAN": "S001", "PCLIENTTAG": "C.A.AG6", "SGROOM": "XN"}
    transport.request.side_effect = reserve_response([raw])
    row = service.query_reserve("G262234201").items[0]
    assert row["quality_description"] == "检验说明" and row["salesperson"] == "张三"
    assert row["salesperson_code"] == "S001" and row["customer_tag"] == "C.A.AG6"
    assert row["warehouse"] == "XN" and row["warehouse_name"] == "虚拟库"
    assert row["stock_date"] == "2026-06-03 11:09:13" and row["stock"] == "355"
    service.close()


def test_reserve_missing_optional_fields_stay_empty():
    service, transport = logged_service()
    transport.request.side_effect = reserve_response([{"SGMATCODE": "AG6", "SGBANTCH": "B01", "SGQTY": "0"}])
    row = service.query_reserve("B01").items[0]
    assert all(row[key] == "" for key in ("quality_description", "salesperson", "salesperson_code", "customer_tag", "warehouse"))
    assert row["stock"] == "0"
    service.close()


@pytest.mark.parametrize("batch", ["", "B';SELECT", "B--X", "X\n", "X" * 121])
def test_invalid_reserve_batch_has_no_network_or_sql_wildcards(batch):
    service, transport = logged_service()
    count = transport.request.call_count
    with pytest.raises(InventoryError):
        service.query_reserve(batch)
    assert transport.request.call_count == count
    service.close()


def test_reserve_literal_wildcard_characters_are_escaped_without_partial_matching():
    service, transport = logged_service()
    transport.request.side_effect = reserve_response([{"SGMATCODE": "AG6", "SGBANTCH": "B_1%[X]", "SGQTY": "0"}])
    result = service.query_reserve("B_1%[X]")
    params = transport.request.call_args.kwargs["params"]
    assert params["SGBANTCH"] == "B[_]1[%][[]X]"
    assert result.batch == "B_1%[X]" and result.items[0]["stock"] == "0"
    service.close()


@pytest.mark.parametrize("rows,total", [([{"SGMATCODE": "AG6", "SGQTY": "18", "SGBANTCH": "OTHER"}], 1),
                                       ([{"SGMATCODE": "AG6", "SGBANTCH": "C264671001"}], 1),
                                       ([], "1"), ([], -1), ([{}], 1)])
def test_reserve_malformed_or_unrelated_response_is_rejected(rows, total):
    service, transport = logged_service()
    transport.request.side_effect = reserve_response(rows, total)
    with pytest.raises(InventoryError):
        service.query_reserve("C264671001")
    service.close()


def test_reserve_no_results_preserves_login_and_expiration_clears_it():
    service, transport = logged_service()
    transport.request.side_effect = reserve_response([], 0)
    result = service.query_reserve("NO-RESULT")
    assert result.total == 0 and result.pages == 1 and service.logged_in
    transport.request.side_effect = [response(text="", status=302, location="/Login/LogOn")]
    with pytest.raises(InventorySessionExpired):
        service.query_reserve("C264671001")
    assert not service.logged_in
    transport.cookies.clear.assert_called_once()


@pytest.mark.parametrize("configuration", [response({"SYSID": "WMS0305", "CONFIGARGU": "OTHER"}),
                                          response({"success": False, "error": "internal secret"})])
def test_reserve_permission_failures_are_sanitized_without_discarding_stock_login(configuration):
    service, transport = logged_service()
    transport.request.side_effect = [configuration]
    with pytest.raises(InventoryError) as exc:
        service.query_reserve("C264671001")
    assert "secret" not in str(exc.value) and service.logged_in
    service.close()


def test_reserve_view_editability_change_blocks_data_query():
    service, transport = logged_service()
    sequence = reserve_response()
    sequence[1] = response({"viewdef": {"viewID": "VIEW_CLIENTSTOCK", "storeUrl": "Query/QuerySqlObjectNew", "allowEdit": True}})
    transport.request.side_effect = sequence
    count = transport.request.call_count
    with pytest.raises(InventoryError, match="配置已变化"):
        service.query_reserve("C264671001")
    assert transport.request.call_count == count + 2 and service.logged_in
    service.close()
