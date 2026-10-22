"""Representative ledger size, with measured results rather than invented SLA."""
import json
import platform
import time
from pathlib import Path

from conftest import record

from domain import validate_record
from storage.sqlite_store import SQLiteStore


def test_10000_history_customer_query_under_one_second(tmp_path):
    store = SQLiteStore(tmp_path, load_seed=False)
    started = time.perf_counter()
    with store.connection() as db:
        for customer in range(10):
            for grade in range(100):
                for history in range(10):
                    row = validate_record(record(customer=f"性能客户{customer}", grade=f"PP-{grade}", price=f"{10 + history}.123456", effective_date=f"2026-09-{history + 1:02d}"))
                    store.insert(db, row, "QA性能测试")
    insertion = time.perf_counter() - started
    measurements = []
    for _ in range(4):
        start = time.perf_counter()
        result = store.list({"customer": "性能客户3"})
        measurements.append(time.perf_counter() - start)
    assert result["stats"]["items"] == 100
    assert result["stats"]["records"] == 1000
    assert max(measurements) < 1.0
    output = Path(__file__).resolve().parents[2] / "work/qa/native"
    output.mkdir(parents=True, exist_ok=True)
    report = {"platform": platform.platform(), "python": platform.python_version(), "history_records": 10000,
              "identities": 1000, "histories_per_identity": 10, "returned": 100, "insertion_seconds": insertion,
              "query_seconds": measurements, "target_seconds": 1.0, "passed": True}
    (output / "performance.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
