"""Read-only MES adapter; session cookies remain in memory only."""
from __future__ import annotations

import datetime as dt
import json
import re
import threading
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from urllib.parse import urljoin, urlsplit

import requests

from domain import TZ, VERSION, now

# Keep the legacy cleartext exception limited to the MES endpoint still in use.
MES_URL = "http://mes.njjulong.cn:8081/"
LEGACY_HTTP_HOST = "mes.njjulong.cn"
LEGACY_HTTP_PORT = 8081
VIEW_ID = "WH_STOCKGRID"
RESERVE_VIEW_ID = "VIEW_CLIENTSTOCK"
SEARCH_FIELDS = {"material_code": "MATCODE", "material_name": "MATNAME"}
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
ALLOWED_REQUESTS = frozenset({
    ("GET", "Login/LogOn"), ("POST", "Login/LogOn"),
    ("POST", "Main/GetPage"), ("POST", "Main/GetView"),
    ("POST", "BD_Material/GetKeyValue"), ("POST", "BD_Material/GetAllWareHouseList"),
    ("GET", "Query/QuerySqlObjectNew"),
})


class InventoryError(ValueError):
    pass


class InventoryLoginError(InventoryError):
    pass


class InventorySessionExpired(InventoryError):
    pass


class InventoryCancelled(InventoryError):
    pass


def _validate_mes_url():
    try:
        parsed = urlsplit(MES_URL)
        port = parsed.port
    except ValueError:
        parsed, port = None, None
    if parsed is None:
        raise InventoryError("MES 连接地址无效")

    has_authority = bool(parsed.hostname) and parsed.username is None and parsed.password is None
    secure = parsed.scheme == "https" and has_authority
    legacy_http = (
        parsed.scheme == "http"
        and has_authority
        and parsed.hostname.rstrip(".").casefold() == LEGACY_HTTP_HOST
        and port == LEGACY_HTTP_PORT
        and parsed.path in ("", "/")
        and not parsed.query
        and not parsed.fragment
    )
    if not (secure or legacy_http):
        raise InventoryError(
            f"MES HTTP 地址不受允许，仅兼容原服务地址 {LEGACY_HTTP_HOST}:{LEGACY_HTTP_PORT}"
        )


@dataclass(frozen=True)
class InventoryPage:
    grade: str
    page: int
    page_size: int
    total: int
    items: tuple[dict, ...]
    queried_at: str
    search_by: str = "material_code"

    @property
    def pages(self):
        return max(1, (self.total + self.page_size - 1) // self.page_size)


@dataclass(frozen=True)
class ReservePage:
    batch: str
    page: int
    page_size: int
    total: int
    items: tuple[dict, ...]
    queried_at: str

    @property
    def pages(self):
        return max(1, (self.total + self.page_size - 1) // self.page_size)


def query_text(grade, caption="物料关键字"):
    if not isinstance(grade, str):
        raise InventoryError(f"请输入有效的{caption}文本")
    raw = str(grade)
    if any(ord(c) < 32 or ord(c) == 127 for c in raw):
        raise InventoryError(f"请输入 1–120 个字符的{caption}")
    value = raw.strip()
    if not value or len(value) > 120:
        raise InventoryError(f"请输入 1–120 个字符的{caption}")
    # The legacy MES builds its SQL condition from these strings. Keep the field
    # fixed and reject SQL delimiters; escape SQL Server LIKE metacharacters.
    if any(c in value for c in "'\";\\`") or any(c in value for c in ("--", "/*", "*/")):
        raise InventoryError(f"{caption}包含不支持的引号或分隔符，请核对输入")
    return value


def grade_pattern(grade):
    value = query_text(grade)
    return value, "%" + literal_pattern(value) + "%"


def literal_pattern(value):
    return "".join({"[": "[[]", "%": "[%]", "_": "[_]"}.get(c, c) for c in value)


def quantity(value):
    if value is None or value == "":
        return ""
    if isinstance(value, bool):
        raise InventoryError("MES 返回的库存数量格式无效")
    try:
        text_value = str(value)
        if len(text_value) > 80:
            raise InvalidOperation
        number = Decimal(text_value)
        if (not number.is_finite() or abs(number) > Decimal("1e15")
                or not -12 <= number.as_tuple().exponent <= 15):
            raise InvalidOperation
        text = format(number, "f")
        return text.rstrip("0").rstrip(".") if "." in text else text
    except (InvalidOperation, ValueError):
        raise InventoryError("MES 返回的库存数量格式无效") from None


def stock_date(value):
    text = "" if value is None else str(value)
    match = re.fullmatch(r"/Date\((-?\d+)(?:[+-]\d{4})?\)/", text)
    if match:
        try:
            result = dt.datetime.fromtimestamp(int(match[1]) / 1000, TZ)
            return result.strftime("%Y-%m-%d %H:%M:%S") if result.year > 1900 else ""
        except (ValueError, OverflowError, OSError):
            return ""
    for pattern in ("%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d", "%Y-%m-%d"):
        try:
            result = dt.datetime.strptime(text, pattern)
            return result.strftime("%Y-%m-%d %H:%M:%S") if result.year > 1900 else ""
        except ValueError:
            continue
    return text[:80]


class InventoryService:
    """One independent window/session; all calls run on a worker thread."""

    def __init__(self, *, session_factory=requests.Session, page_size=100):
        if type(page_size) is not int or not 1 <= page_size <= 200:
            raise ValueError("Invalid page size")
        self.page_size = page_size
        self._session_factory = session_factory
        self._lock = threading.Lock()
        self._session = None
        self._epoch = 0
        self._closed = False
        self._units = {}
        self._depots = {}

    @property
    def logged_in(self):
        with self._lock:
            return self._session is not None and not self._closed

    def logout(self):
        with self._lock:
            self._epoch += 1
            session, self._session = self._session, None
            self._units = {}
            self._depots = {}
        if session:
            session.cookies.clear()
            session.close()

    def close(self):
        with self._lock:
            self._closed = True
        self.logout()

    def _check(self, epoch):
        with self._lock:
            if self._closed or epoch != self._epoch:
                raise InventoryCancelled("库存查询已取消")

    def _request(self, session, epoch, method, path, data=None, *, auth=True):
        self._check(epoch)
        _validate_mes_url()
        if (method, path) not in ALLOWED_REQUESTS:
            raise InventoryError("不支持此 MES 操作")
        try:
            with session.request(method, urljoin(MES_URL, path),
                                 params=data if method == "GET" else None,
                                 data=data if method == "POST" else None,
                                 timeout=(5, 15), allow_redirects=False, stream=True,
                                 verify=True) as response:
                if auth and response.status_code in (301, 302, 303, 307, 308, 401):
                    raise InventorySessionExpired("MES 登录已过期，请重新登录")
                if response.status_code == 403:
                    raise InventorySessionExpired("MES 账号无库存查询权限，请核对后重新登录")
                if response.status_code not in (200, 302):
                    raise InventoryError(f"MES 暂时无法查询（HTTP {response.status_code}），请稍后重试")
                chunks, length = [], 0
                for chunk in response.iter_content(64 * 1024):
                    self._check(epoch)
                    length += len(chunk)
                    if length > MAX_RESPONSE_BYTES:
                        raise InventoryError("MES 响应过大，请缩小牌号查询范围")
                    chunks.append(chunk)
                content = b"".join(chunks)
                try:
                    text = content.decode("utf-8-sig")
                except UnicodeDecodeError:
                    text = content.decode("gb18030", errors="replace")
                status, location = response.status_code, response.headers.get("Location", "")
        except requests.RequestException:
            self._check(epoch)
            raise InventoryError("无法连接 MES 或请求超时，请检查网络后重试") from None
        self._check(epoch)
        if auth and (re.search(r'name\s*=\s*[\"\']Password[\"\']', text, re.I)
                     or re.search(r"<script[^>]*>.*?Login/LogOn", text, re.I | re.S)):
            raise InventorySessionExpired("MES 登录已过期，请重新登录")
        return status, location, text

    def _json(self, session, epoch, method, path, data=None):
        _, _, text = self._request(session, epoch, method, path, data)
        try:
            result = json.loads(text)
        except (ValueError, TypeError):
            raise InventoryError("MES 返回格式已变化，请稍后重试或联系管理员") from None
        if not isinstance(result, dict):
            raise InventoryError("MES 返回格式已变化，请核对库存查询权限")
        if result.get("success") is False or result.get("error"):
            # Never propagate server HTML, SQL, session details or raw exceptions.
            raise InventoryError("MES 未能完成查询，请核对账号权限或稍后重试")
        return result

    @staticmethod
    def _dictionary(data, code, name):
        rows = data.get("datas")
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise InventoryError("MES 库房或单位字典格式已变化")
        return {str(row[code]): str(row.get(name) or row[code]).strip() for row in rows if row.get(code) is not None}

    def login(self, username, password):
        if not isinstance(username, str) or not username.strip() or len(username) > 120:
            raise InventoryLoginError("请输入 MES 账号")
        if not isinstance(password, str) or not password or len(password) > 256:
            raise InventoryLoginError("请输入 MES 密码")
        if any(ord(c) < 32 for c in username + password):
            raise InventoryLoginError("账号或密码包含无效字符")
        self.logout()
        with self._lock:
            epoch = self._epoch
        self._check(epoch)
        session = self._session_factory()
        session.headers.update({"User-Agent": f"PriceManager/{VERSION}", "X-Requested-With": "XMLHttpRequest"})
        published = False
        try:
            self._request(session, epoch, "GET", "Login/LogOn", auth=False)
            status, location, _ = self._request(session, epoch, "POST", "Login/LogOn", [
                ("Username", username.strip()), ("Password", password),
                ("Language", "zh-CN"), ("Language", "None"), ("IbtnEnter", "")], auth=False)
            target = urlsplit(urljoin(MES_URL, location))
            if status != 302 or target != urlsplit(MES_URL):
                raise InventoryLoginError("MES 登录失败，请核对账号和密码")
            page = self._json(session, epoch, "POST", "Main/GetPage", {"pgcode": "WMS0301"})
            if page.get("SYSID") != "WMS0301" or page.get("CONFIGARGU") != "WH_STOCKQUERY":
                raise InventoryLoginError("此账号未开放库存综合查询，请核对 MES 权限")
            view = self._json(session, epoch, "POST", "Main/GetView", {"viewID": VIEW_ID})
            definition = view.get("viewdef") or {}
            if (not isinstance(definition, dict) or definition.get("viewID") != VIEW_ID
                    or str(definition.get("storeUrl") or "").lstrip("/") != "Query/QuerySqlObjectNew"
                    or definition.get("allowEdit") is not False):
                raise InventoryError("MES 库存页面配置已变化，请联系管理员核对")
            units = self._dictionary(self._json(session, epoch, "POST", "BD_Material/GetKeyValue", {"dictType": "Unit"}), "DATACODE", "DATANAME")
            depots = self._dictionary(self._json(session, epoch, "POST", "BD_Material/GetAllWareHouseList"), "ROOM", "ROOMNAME")
            with self._lock:
                if self._closed or epoch != self._epoch:
                    raise InventoryCancelled("库存查询已取消")
                self._session, self._units, self._depots = session, units, depots
                published = True
            return {"message": "MES 已登录，先查物料，再按批号查看备货库存"}
        finally:
            if not published:
                session.cookies.clear()
                session.close()

    def query(self, grade, page=1, *, search_by="material_code"):
        grade, pattern = grade_pattern(grade)
        if search_by not in SEARCH_FIELDS:
            raise InventoryError("请选择物料编码或物料名称查询")
        field = SEARCH_FIELDS[search_by]
        if type(page) is not int or not 1 <= page <= 1_000_000:
            raise InventoryError("库存页码无效")
        with self._lock:
            session, epoch, units, depots = self._session, self._epoch, self._units, self._depots
        self._check(epoch)
        if session is None:
            raise InventorySessionExpired("请先登录 MES 再查询库存")
        params = {"CURVIEWID": VIEW_ID, "VIEWID": VIEW_ID, field: pattern,
                  "querymodels": json.dumps([{"id": field, "type": "String", "value": [pattern]}], ensure_ascii=False),
                  "page": page, "start": (page - 1) * self.page_size, "limit": self.page_size}
        try:
            data = self._json(session, epoch, "GET", "Query/QuerySqlObjectNew", params)
            rows, total = data.get("data"), data.get("totalCount")
            if (not isinstance(rows, list) or len(rows) > self.page_size or type(total) is not int
                    or total < 0 or any(not isinstance(row, dict) or not row.get("MATCODE") for row in rows)):
                raise InventoryError("MES 库存数据格式已变化，请联系管理员核对")
            if len(rows) > total or (rows and total < (page - 1) * self.page_size + len(rows)):
                raise InventoryError("MES 库存分页数据不一致，请重新查询")
            if any(grade.casefold() not in str(row.get(field) or "").casefold() for row in rows):
                raise InventoryError("MES 返回了与物料关键字不匹配的数据，请重新查询或联系管理员")
            if any("SQTY" not in row or "UQTY" not in row for row in rows):
                raise InventoryError("MES 返回的库存数量字段缺失，请联系管理员核对")
            items = []
            for row in rows:
                unit, depot = str(row.get("UNIT") or ""), str(row.get("DEPOT") or "")
                items.append({"grade": str(row["MATCODE"]), "material": str(row.get("MATNAME") or ""),
                              "stock": quantity(row.get("SQTY")), "available": quantity(row.get("UQTY")),
                              "unit": units.get(unit, unit), "warehouse": depots.get(depot, depot),
                              "warehouse_code": depot, "site": str(row.get("SITE") or ""),
                              "batch": str(row.get("BANTCHSN") or ""), "stock_date": stock_date(row.get("STOCKDATE")),
                              "customer_code": str(row.get("CUSTID") or ""),
                              "updated_date": stock_date(row.get("UPDATETIME"))})
            self._check(epoch)
            return InventoryPage(grade, page, self.page_size, total, tuple(items), now(), search_by)
        except InventorySessionExpired:
            self.logout()
            raise

    def query_reserve(self, batch, page=1):
        batch = query_text(batch, "批号")
        pattern = literal_pattern(batch)
        if type(page) is not int or not 1 <= page <= 1_000_000:
            raise InventoryError("备货页码无效")
        with self._lock:
            session, epoch, depots = self._session, self._epoch, self._depots
        self._check(epoch)
        if session is None:
            raise InventorySessionExpired("请先登录 MES 再查询备货库存")
        try:
            # Verify the distinct, read-only reserve view before every query.
            # Permissions may differ from the comprehensive inventory page.
            config = self._json(session, epoch, "POST", "Main/GetPage", {"pgcode": "WMS0305"})
            if config.get("SYSID") != "WMS0305" or config.get("CONFIGARGU") != RESERVE_VIEW_ID:
                raise InventoryError("此账号未开放备货库存查询，请核对 MES 权限")
            view = self._json(session, epoch, "POST", "Main/GetView", {"viewID": RESERVE_VIEW_ID})
            definition = view.get("viewdef") or {}
            if (not isinstance(definition, dict) or definition.get("viewID") != RESERVE_VIEW_ID
                    or str(definition.get("storeUrl") or "").lstrip("/") != "Query/QuerySqlObjectNew"
                    or definition.get("allowEdit") is not False):
                raise InventoryError("MES 备货页面配置已变化，请联系管理员核对")
            params = {"CURVIEWID": RESERVE_VIEW_ID, "VIEWID": RESERVE_VIEW_ID, "SGBANTCH": pattern,
                      "querymodels": json.dumps([{"id": "SGBANTCH", "type": "String", "value": [pattern]}], ensure_ascii=False),
                      "page": page, "start": (page - 1) * self.page_size, "limit": self.page_size}
            data = self._json(session, epoch, "GET", "Query/QuerySqlObjectNew", params)
            rows, total = data.get("data"), data.get("totalCount")
            if (not isinstance(rows, list) or len(rows) > self.page_size or type(total) is not int or total < 0
                    or any(not isinstance(row, dict) or not row.get("SGMATCODE") or "SGQTY" not in row for row in rows)):
                raise InventoryError("MES 备货数据格式已变化，请联系管理员核对")
            if len(rows) > total or (rows and total < (page - 1) * self.page_size + len(rows)):
                raise InventoryError("MES 备货分页数据不一致，请重新查询")
            if any(str(row.get("SGBANTCH") or "").casefold() != batch.casefold() for row in rows):
                raise InventoryError("MES 返回了与批号不匹配的备货数据，请重新查询或联系管理员")
            items = []
            for row in rows:
                depot = str(row.get("SGROOM") or "")
                items.append({"grade": str(row["SGMATCODE"]), "batch": str(row["SGBANTCH"]),
                              "stock": quantity(row.get("SGQTY")), "customer_code": str(row.get("CUSTID") or ""),
                              "stock_date": stock_date(row.get("SGDATE")),
                              "delivery_date": stock_date(row.get("DILIVERDATE1") or row.get("DILIVERDATE"))[:10],
                              "customer": str(row.get("CGNAME") or ""), "quality": str(row.get("SGQUASTATE1") or ""),
                              "quality_description": str(row.get("QUADESC") or ""),
                              "salesperson": str(row.get("bussman1") or ""),
                              "salesperson_code": str(row.get("BUSSMAN") or ""),
                              "customer_tag": str(row.get("PCLIENTTAG") or ""),
                              "warehouse": depot, "warehouse_name": depots.get(depot, depot)})
            self._check(epoch)
            return ReservePage(batch, page, self.page_size, total, tuple(items), now())
        except InventorySessionExpired:
            self.logout()
            raise
