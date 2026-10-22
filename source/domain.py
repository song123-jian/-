"""Shared price rules. No GUI, HTTP, or storage dependencies."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import sys
import unicodedata
from decimal import Decimal, InvalidOperation, localcontext
from pathlib import Path

VERSION = "1.7.8"
APP_NAME = "工作"
APP_ID = "local-price-manager-desktop"
TZ = dt.timezone(dt.timedelta(hours=8))
ASSETS = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
FIELDS = ("customer", "grade", "material", "color", "price", "tax_type",
          "effective_date", "note", "reason", "source_file", "source_sheet", "source_row")
TAX_TYPES = ("含税", "未税", "未注明")
IMMEDIATE_SOURCES = ("文件导入", "图片导入", "导入更新")
MAX_ROWS = 20_000
MAX_FILE_BYTES = 20 * 1024 * 1024


class ValidationError(ValueError):
    def __init__(self, message, fields=None):
        super().__init__(message)
        self.fields = fields or {}


class ConflictError(ValueError):
    pass


class BackendChangedError(ConflictError):
    pass


class NetworkError(ValueError):
    pass


class StorageError(RuntimeError):
    pass


Conflict = ConflictError  # Compatibility for the retained browser adapter.


def now():
    return dt.datetime.now(TZ).isoformat(timespec="seconds")


def today():
    return dt.datetime.now(TZ).date().isoformat()


def clean(value, limit=250):
    text = "" if value is None else str(value).strip()
    if len(text) > limit or any(ord(c) < 32 and c not in "\t\n\r" for c in text):
        raise ValidationError(f"文本过长或包含无效字符（最多 {limit} 字）")
    return text


def norm(value):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", clean(value, 5000))).upper()


def customer_key(value):
    """Stable exact customer identity; never derived from a search match."""
    normalized = norm(value)
    if not normalized:
        raise ValidationError("请选择具体客户，不能删除全部客户")
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def money(value):
    text = clean(value, 128)
    try:
        number = Decimal(text)
        if not number.is_finite() or number <= 0 or number > 1_000_000_000:
            raise ValidationError("价格必须大于 0，且不超过 10 亿元/kg")
        # Decimal.normalize() otherwise rounds under the default 28-digit context.
        with localcontext() as context:
            context.prec = max(28, len(number.as_tuple().digits))
            normalized = number.normalize()
        if normalized.as_tuple().exponent < -6:
            raise ValidationError("价格最多保留 6 位有效小数")
        return format(normalized, "f")
    except (InvalidOperation, TypeError, OverflowError):
        raise ValidationError("价格必须是有效数字") from None


def display_price(value):
    text = money(value)
    return text + ".00" if "." not in text else text


def business_date(value, epoch1904=False):
    if isinstance(value, (int, float, Decimal)) or (
        isinstance(value, str) and re.fullmatch(r"\d{1,6}(\.\d+)?", value.strip())
    ):
        try:
            serial = Decimal(str(value))
            if not serial.is_finite() or not (0 if epoch1904 else 1) <= serial <= 150000:
                raise ValidationError("Excel 日期序列无效")
            days = int(serial)
            if not epoch1904 and days == 60:
                raise ValidationError("Excel 的 1900-02-29 不是真实日期")
            base = dt.date(1904, 1, 1) if epoch1904 else dt.date(1899, 12, 31 if days < 60 else 30)
            value = (base + dt.timedelta(days=days)).isoformat()
        except (InvalidOperation, OverflowError):
            raise ValidationError("Excel 日期序列无效") from None
    text = clean(value, 40).replace("/", "-")
    match = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]00:00:00(?:\.0+)?)?", text)
    if not match:
        raise ValidationError("日期须为 YYYY-MM-DD")
    try:
        date = dt.date(*map(int, match.groups()))
    except ValueError:
        raise ValidationError("日期无效") from None
    if not 1900 <= date.year <= 2200:
        raise ValidationError("日期年份须在 1900–2200 之间")
    return date.isoformat()


def validate_record(row, epoch1904=False):
    if not isinstance(row, dict):
        raise ValidationError("报价内容无效")
    result, errors = {}, {}
    limits = {"customer": 250, "grade": 250, "material": 250, "color": 250,
              "note": 2000, "reason": 1000, "source_file": 250, "source_sheet": 250}
    for key, limit in limits.items():
        try:
            result[key] = clean(row.get(key), limit)
            if key in ("customer", "grade") and not result[key]:
                raise ValidationError("不能为空")
        except ValueError as exc:
            errors[key] = str(exc)
    for key, validator in (("price", money), ("effective_date", lambda v: business_date(v, epoch1904))):
        try:
            result[key] = validator(row.get(key))
        except ValueError as exc:
            errors[key] = str(exc)
    try:
        tax = clean(row.get("tax_type"), 20)
        note = result.get("note", "")
        if not tax:
            tax = "未税" if "未税" in note or "不含税" in note else "含税" if "含税" in note else "未注明"
        if tax not in TAX_TYPES:
            raise ValidationError("税口径须为含税、未税或未注明")
        result["tax_type"] = tax
    except ValueError as exc:
        errors["tax_type"] = str(exc)
    source_row = row.get("source_row", 0)
    if not re.fullmatch(r"\d+", str(source_row)) or not 0 <= int(source_row) <= 2_147_483_647:
        errors["source_row"] = "来源行须为非负整数"
    else:
        result["source_row"] = int(source_row)
    if errors:
        labels = {"customer": "客户", "grade": "牌号", "price": "价格", "effective_date": "业务日期"}
        message = "；".join(f"{labels.get(k, k)}：{v}" for k, v in errors.items())
        raise ValidationError(message, errors)
    return {key: result[key] for key in FIELDS}


def identity(row):
    parts = [norm(row[k]) for k in ("customer", "grade", "color", "tax_type")]
    return hashlib.sha256(json.dumps(parts, ensure_ascii=False).encode("utf-8")).hexdigest()


def import_key(row):
    parts = [identity(row)] + [row[k] for k in ("material", "price", "effective_date", "note", "reason")]
    return hashlib.sha256(json.dumps(parts, ensure_ascii=False).encode("utf-8")).hexdigest()


def is_effective(row, cutoff=None):
    return row.get("source_type") in IMMEDIATE_SOURCES or row["effective_date"] <= (cutoff or today())


def quote_order(row, cutoff=None):
    return is_effective(row, cutoff), row["effective_date"], row["id"]


def history_result(rows, cutoff=None):
    cutoff = cutoff or today()
    active_rows = [row for row in rows if is_effective(row, cutoff)]
    active = max(active_rows, key=lambda row: quote_order(row, cutoff))["id"] if active_rows else None
    previous = None
    for row in reversed(rows):
        row["delta"] = format(Decimal(row["price"]) - previous, "f") if previous is not None else None
        previous = Decimal(row["price"])
        row["is_current"] = row["id"] == active
        row["scheduled"] = not is_effective(row, cutoff)
    return {"items": rows}
