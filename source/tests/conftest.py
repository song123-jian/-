import json
import sys
from pathlib import Path

import pytest

SOURCE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SOURCE))

from services.app_context import AppContext
from services.price_service import PriceService
from storage.sqlite_store import SQLiteStore


@pytest.fixture
def qa_records():
    """Synthetic data, never a reconstruction of private quotations."""
    clients = [("金华领先", 16), ("QA客户甲", 7), ("QA客户乙", 6), ("QA客户丙", 6), ("QA客户丁", 6)]
    rows = []
    for client, count in clients:
        for _ in range(count):
            index = len(rows)
            rows.append({"customer": client, "grade": f"QA-GRADE-{index:02}",
                         "material": f"QA-MATERIAL-{index % 17:02}", "color": "本色",
                         "price": "9.734513", "tax_type": "含税", "effective_date": "2026-09-06",
                         "note": "合成QA数据", "reason": "", "source_file": "synthetic-qa-prices.xlsx",
                         "source_sheet": "价格明细", "source_row": index + 2})
    return rows


@pytest.fixture
def qa_workbook(tmp_path, qa_records):
    from test_core_import import xlsx_bytes

    fields = ("customer", "grade", "material", "color", "price", "tax_type", "effective_date", "note")
    rows = [["客户", "牌号", "材料", "颜色", "价格", "税口径", "更新日期", "备注"]]
    rows.extend([item[field] for field in fields] for item in qa_records)
    path = tmp_path / "synthetic-qa-prices.xlsx"
    path.write_bytes(xlsx_bytes(rows))
    return path


@pytest.fixture(autouse=True)
def qa_assets(qa_records, tmp_path_factory, monkeypatch):
    assets = tmp_path_factory.mktemp("qa-assets")
    seed = {"summary": {"records": 41, "customers": 5, "source_file": "synthetic-qa-prices.xlsx",
                        "synthetic_qa": True}, "records": qa_records}
    (assets / "seed.json").write_text(json.dumps(seed, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr("storage.sqlite_store.ASSETS", assets)
    monkeypatch.setattr("storage.supabase_store.ASSETS", assets)
    return assets


@pytest.fixture
def store(tmp_path):
    return SQLiteStore(tmp_path)


@pytest.fixture
def context(store, tmp_path):
    return AppContext(store, tmp_path)


@pytest.fixture
def service(context):
    return PriceService(context)


def record(**changes):
    value = {"customer": "QA隔离客户", "grade": "QA-PP", "material": "PP-TD20", "color": "本色",
             "price": "10.5", "tax_type": "含税", "effective_date": "2026-09-01", "note": "原报价", "reason": ""}
    value.update(changes)
    return value
