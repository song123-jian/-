"""Extract editable core quote candidates from local OCR text and geometry."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from domain import FIELDS, business_date, clean, money, today
from importer import (
    ALIASES,
    COLOR_SUFFIX,
    CORE_FIELDS,
    PRICE_KEYS,
    SPEC_PREFIX,
    expand_combined_fields,
    header_key,
    merged_value,
    tax_text,
)

MAX_OCR_TOKENS = 3000
MAX_CANDIDATES = 100
DATE_LABELS = ("业务日期", "日期", "时间", "订单日期", "合同日期", "签订日期")
ALLOWED_KEYS = CORE_FIELDS | {"customer", "effective_date", "tax_type"}
LABELS = {unicodedata.normalize("NFKC", name): key for key, names in ALIASES.items()
          if key in ALLOWED_KEYS for name in names}
LABELS.update({name: "effective_date" for name in DATE_LABELS})
LABEL_PATTERN = re.compile(
    r"(?<![\w/])(?P<label>" + "|".join(re.escape(name) for name in sorted(LABELS, key=len, reverse=True))
    + r")\s*(?:\((?:元|RMB|CNY)(?:/(?:kg|公斤|千克))?\))?\s*(?:[:：]|(?=\s))\s*", re.I)
GRADE_KEYS = {"grade", "material_spec", "grade_product", "product_grade"}


@dataclass(frozen=True)
class OcrToken:
    text: str
    left: float
    top: float
    right: float
    bottom: float
    score: float

    @property
    def center(self):
        return (self.left + self.right) / 2, (self.top + self.bottom) / 2


def field_key(text):
    value = unicodedata.normalize("NFKC", str(text)).strip().rstrip(":：").strip()
    return "effective_date" if value in DATE_LABELS else header_key(value)


def group_lines(tokens):
    """Use vertical overlap so labels and values at the same height stay together."""
    if len(tokens) > MAX_OCR_TOKENS:
        raise ValueError("图片文字过多，请截图仅包含报价明细的区域")
    rows = []
    for token in sorted(tokens, key=lambda item: (item.center[1], item.left)):
        if not token.text.strip():
            continue
        target = next((row for row in reversed(rows[-4:])
                       if abs(token.center[1] - sum(item.center[1] for item in row) / len(row))
                       <= max(4, min(token.bottom - token.top, max(item.bottom - item.top for item in row)) * .55)), None)
        if target is None:
            rows.append([token])
        else:
            target.append(token)
    return [sorted(row, key=lambda item: item.left) for row in rows]


def labelled_values(row):
    text = "  ".join(unicodedata.normalize("NFKC", token.text).strip() for token in row)
    matches = list(LABEL_PATTERN.finditer(text))
    values = []
    for offset, match in enumerate(matches):
        end = matches[offset + 1].start() if offset + 1 < len(matches) else len(text)
        value = text[match.end():end].strip()
        # Stop at explicitly irrelevant fields instead of using an amount as a price.
        value = re.split(r"\s+(?:数量|总金额|金额|合计|总计|联系人|备注)\s*[:：]", value, maxsplit=1)[0].strip()
        if value:
            values.append((LABELS.get(match["label"], field_key(match["label"])), value))
    return values


def _label_records(rows, ignored=()):
    records, current, defaults, scores, issues = [], {}, {}, [], []

    def finish():
        if any(key in current for key in CORE_FIELDS):
            records.append(({**defaults, **current}, list(scores), list(issues)))

    for row in rows:
        for key, value in labelled_values(row):
            if key not in ALLOWED_KEYS or key in ignored:
                continue
            if key in GRADE_KEYS and any(item in current for item in GRADE_KEYS) and any(item in current for item in PRICE_KEYS):
                finish()
                current, scores, issues = {}, [], []
            elif key == "customer" and current.get("customer") and current["customer"] != value and any(item in current for item in PRICE_KEYS):
                finish()
                current, scores, issues = {}, [], []
            if key in ("customer", "effective_date", "tax_type") and not any(item in current for item in CORE_FIELDS):
                defaults[key] = value
            try:
                current[key] = merged_value(key, (current.get(key), value))
            except ValueError as exc:
                issues.append(str(exc))
            scores.extend(token.score for token in row)
    finish()
    return records


def _table_records(rows, ignored=()):
    records, columns, defaults = [], None, {}
    for row in rows:
        keys = [field_key(token.text) for token in row]
        if any(key in GRADE_KEYS | {"material"} for key in keys) and any(key in PRICE_KEYS for key in keys):
            columns = [(token.center[0], key if key in ALLOWED_KEYS and key not in ignored else None) for token, key in zip(row, keys)]
            continue
        if columns is None:
            for key, value in labelled_values(row):
                if key in ("customer", "effective_date", "tax_type") and key not in ignored:
                    defaults[key] = value
            continue
        if any(re.fullmatch(r"(?:合计|总计|汇总)[:：]?", token.text.strip()) for token in row):
            continue
        # A new labelled section terminates this table rather than becoming a row.
        if labelled_values(row):
            columns = None
            continue
        cells = [[] for _ in columns]
        boundaries = [(columns[index][0] + columns[index + 1][0]) / 2 for index in range(len(columns) - 1)]
        for token in row:
            column = sum(token.center[0] > boundary for boundary in boundaries)
            cells[column].append(token)
        raw, scores, issues = dict(defaults), [], []
        for (_, key), cell in zip(columns, cells):
            if key is None or not cell:
                continue
            value = " ".join(token.text.strip() for token in cell)
            try:
                raw[key] = merged_value(key, (raw.get(key) if key not in defaults else None, value))
            except ValueError as exc:
                issues.append(str(exc))
            scores.extend(token.score for token in cell)
        if any(raw.get(key) for key in PRICE_KEYS) or any(raw.get(key) for key in GRADE_KEYS):
            records.append((raw, scores, issues))
    return records


def _price_text(value):
    text = unicodedata.normalize("NFKC", str(value or "")).strip()
    match = re.fullmatch(r"(?:人民币|RMB|CNY|[¥￥])?\s*([0-9]+(?:\.[0-9]+)?|[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?)"
                         r"\s*(?:元(?:/(?:kg|公斤|千克))?|/(?:kg|公斤|千克))?", text, re.I)
    return match[1].replace(",", "") if match else text


def _drafts(raw, filename, line, scores, issues, selected_customer, default_date):
    raw = dict(raw)
    warnings = list(issues)
    blocking = list(issues)
    if selected_customer:
        raw["customer"] = selected_customer
    try:
        expand_combined_fields(raw)
        material = clean(raw.get("material"))
        match = COLOR_SUFFIX.fullmatch(re.sub(r"\s+", " ", material))
        if match:
            raw["color"] = merged_value("color", (raw.get("color"), match[2]))
            raw["material"] = match[1]
    except ValueError as exc:
        warnings.append(str(exc))
        blocking.append(str(exc))
    raw["grade"] = raw.get("grade") or raw.get("material_spec") or raw.get("material") or ""
    spec = str(raw.get("material_spec") or "").strip()
    raw["note"] = SPEC_PREFIX + spec if spec and spec != raw["grade"] else ""
    date = unicodedata.normalize("NFKC", str(raw.get("effective_date") or default_date)).strip()
    date = date.replace("年", "-").replace("月", "-").replace("日", "")
    try:
        date = business_date(date)
    except ValueError:
        warnings.append("图片日期无效，请按原图修正业务日期")
    variants = [(raw[key], tax) for key, tax in (("untaxed_price", "未税"), ("taxed_price", "含税")) if raw.get(key)]
    if not variants:
        variants = [(raw.get("price", ""), tax_text(raw.get("tax_type")) or "未注明")]
    result = []
    for price, tax in variants:
        row = {key: str(raw.get(key) or "").strip() for key in FIELDS if key not in ("source_row", "price", "tax_type", "effective_date")}
        row.update(price=_price_text(price), tax_type=tax, effective_date=date, source_file=filename,
                   source_sheet="图片识别", source_row=line)
        item_warnings = list(warnings)
        for key, caption in (("customer", "客户"), ("grade", "牌号"), ("price", "单价")):
            if not row[key]:
                item_warnings.append(f"未识别到{caption}，请补充")
        try:
            if row["price"]:
                row["price"] = money(row["price"])
        except ValueError:
            item_warnings.append("单价识别不明确，请核对小数点、数字和价格单位")
        score = min(scores, default=0)
        if score < .9:
            item_warnings.append("部分文字清晰度不足，请逐项对照原图")
        if tax == "未注明":
            item_warnings.append("图片未标明含税/未税，请核对税口径")
        result.append({"record": row, "warnings": list(dict.fromkeys(item_warnings)),
                       "confidence": round(score, 4), "blocking_issues": blocking})
    return result


def extract_quotes(tokens, filename="截图.png", *, selected_customer="", default_date=None):
    """Return drafts; final matching and saving always validate the user's form."""
    default_date = default_date or today()
    rows = group_lines(tokens)
    ignored = ("customer",) if selected_customer else ()
    business = _table_records(rows, ignored) or _label_records(rows, ignored)
    candidates = []
    for line, (raw, scores, issues) in enumerate(business, 1):
        candidates.extend(_drafts(raw, filename, line, scores, issues, selected_customer, default_date))
        if len(candidates) > MAX_CANDIDATES:
            raise ValueError("图片超过100条报价候选，请分开截图识别")
    if not candidates:
        raise ValueError("未找到报价核心字段，请选择包含牌号/产品名称和单价的清晰图片")
    return {"candidates": candidates, "default_date": default_date,
            "text": "\n".join("  ".join(token.text for token in row) for row in rows)}
