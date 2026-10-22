"""Date selection and persistence across every supported import format."""
import datetime as dt
from unittest.mock import patch

import pytest
from pdf_factory import quotation_pdf
from test_core_import import csv_bytes, xlsx_bytes

from domain import ValidationError, today, validate_record
from importer import read_prices
from storage.sqlite_store import SQLiteStore

FORMATS = [(csv_bytes, "csv"), (xlsx_bytes, "xlsx"), (lambda rows: quotation_pdf([rows]), "pdf")]


def import_options(mode):
    return ({"customer_mode": "selected", "selected_customer": "金华领先", "core_only": True}
            if mode == "selected" else {"customer_mode": mode, "core_only": mode == "all"})


@pytest.mark.parametrize("encoder,extension", FORMATS)
@pytest.mark.parametrize("mode", ["legacy", "all", "selected"])
@pytest.mark.parametrize("date_column", [True, False])
def test_missing_dates_use_one_beijing_day_and_keep_file_dates(encoder, extension, mode, date_column):
    rows = [["客户", "牌号", "未税价格", "含税价格"],
            ["日期测试客户", "DATE-EMPTY", "9", "10"],
            ["日期测试客户", "DATE-PAST", "11", "12"],
            ["日期测试客户", "DATE-FUTURE", "13", "14"]]
    if date_column:
        for row, date in zip(rows, ["更新日期", "", "2026-09-23", "2026-10-13"], strict=True):
            row.append(date)
    with patch("importer.today", side_effect=["2026-10-10", "2026-10-11"]) as clock:
        result = read_prices(encoder(rows), "dates." + extension, import_options(mode))
    assert clock.call_count == 1
    assert not result["errors"] and len(result["records"]) == 6
    expected = ["2026-10-10"] * 2 + ["2026-09-23"] * 2 + ["2026-10-13"] * 2 if date_column else ["2026-10-10"] * 6
    assert [row["effective_date"] for row in result["records"]] == expected
    assert [row["tax_type"] for row in result["records"]] == ["未税", "含税"] * 3


@pytest.mark.parametrize("encoder,extension", FORMATS)
def test_confirmed_date_only_fills_blanks_and_invalid_file_date_blocks_batch(service, context, tmp_path, encoder, extension):
    rows = [["客户", "牌号", "含税价格", "报价日期"],
            ["日期测试客户", "DATE-BLANK", "10", ""],
            ["日期测试客户", "DATE-VALID", "11", "2026-10-13"],
            ["日期测试客户", "DATE-BAD", "12", "2026-02-30"]]
    path = tmp_path / ("invalid." + extension)
    path.write_bytes(encoder(rows))
    options = {**import_options("all"), "effective_date": "2026-09-23"}
    before = context.store.all()
    preview = service.preview_import(path, context.storage_generation, options)
    assert [row["effective_date"] for row in preview["samples"]] == ["2026-09-23", "2026-10-13"]
    assert preview["error_count"] == 1 and "日期" in preview["errors"][0]["message"]
    with pytest.raises(ValidationError, match="错误行"):
        service.commit_import(preview["preview_id"], context.storage_generation)
    assert context.store.all() == before


@pytest.mark.parametrize("encoder,extension", FORMATS)
def test_preview_date_stays_fixed_on_commit_repeat_and_restart(service, context, tmp_path, encoder, extension):
    rows = [["客户", "牌号", "含税价格"], ["日期持久化客户", "DATE-SAVE", "14.89"]]
    path = tmp_path / ("no-date." + extension)
    path.write_bytes(encoder(rows))
    options = import_options("all")
    with patch("importer.today", side_effect=["2026-10-10", "2026-10-11"]) as clock:
        preview = service.preview_import(path, context.storage_generation, options)
    assert clock.call_count == 1 and preview["samples"][0]["effective_date"] == "2026-10-10"
    with patch("importer.today", return_value="2026-10-11") as later:
        assert service.commit_import(preview["preview_id"], context.storage_generation)["added"] == 1
    later.assert_not_called()
    saved = [row for row in SQLiteStore(context.folder).all() if row["customer"] == "日期持久化客户"]
    assert len(saved) == 1 and saved[0]["effective_date"] == "2026-10-10"
    with patch("importer.today", return_value="2026-10-10"):
        repeated = service.preview_import(path, context.storage_generation, options)
    assert (repeated["added"], repeated["skipped"], repeated["error_count"]) == (0, 1, 0)
    with patch("importer.today", return_value="2026-10-11"):
        next_day = service.preview_import(path, context.storage_generation, options)
    assert next_day["added"] == 1 and next_day["samples"][0]["effective_date"] == "2026-10-11"
    assert service.commit_import(next_day["preview_id"], context.storage_generation)["added"] == 1
    history = context.store.history(saved[0]["id"])["items"]
    assert {row["effective_date"] for row in history} == {"2026-10-10", "2026-10-11"}


def test_today_uses_beijing_calendar_date_at_utc_boundary():
    class FixedDateTime(dt.datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 10, 10, 16, 30, tzinfo=dt.timezone.utc).astimezone(tz)

    with patch("domain.dt.datetime", FixedDateTime):
        assert today() == "2026-10-11"


def test_missing_date_is_not_implicitly_added_to_manual_records():
    with pytest.raises(ValidationError, match="业务日期"):
        validate_record({"customer": "客户", "grade": "DATE-MANUAL", "price": "10"})
