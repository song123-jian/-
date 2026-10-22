"""Actual bundled-model recognition; external downloads/uploads are forbidden."""
import threading

import pytest
import requests

from domain import ValidationError
from image_factory import quote_image
from services import image_quote_service


@pytest.fixture
def offline(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("OCR must not make a network request")

    monkeypatch.setattr(requests.sessions.Session, "request", forbidden)
    monkeypatch.setattr(image_quote_service, "_ENGINE", None)


def test_bundled_cpu_ocr_chinese_fields_exact_price_and_date(offline):
    result = image_quote_service.recognize_image({"content": quote_image()})
    assert len(result["candidates"]) == 1, result["text"]
    row = result["candidates"][0]["record"]
    assert {key: row[key] for key in ("customer", "grade", "material", "color", "tax_type", "price", "effective_date")} == {
        "customer": "图片验收客户", "grade": "PA12-01", "material": "PA12", "color": "黑色",
        "tax_type": "未税", "price": "9.734513", "effective_date": "2026-09-30"}, result["text"]


def test_bundled_cpu_ocr_dual_tax_selected_customer_and_default_date(offline):
    result = image_quote_service.recognize_image({"content": quote_image(customer="文件客户", date="", dual_tax=True)},
                                                 selected_customer="目录客户", default_date="2026-10-10")
    rows = [item["record"] for item in result["candidates"]]
    assert [(row["customer"], row["tax_type"], row["price"], row["effective_date"]) for row in rows] == [
        ("目录客户", "未税", "9.734513", "2026-10-10"), ("目录客户", "含税", "11", "2026-10-10")], result["text"]


def test_cancel_before_engine_initialization(offline):
    token = threading.Event()
    token.set()
    with pytest.raises(ValidationError, match="取消"):
        image_quote_service.recognize_image({"content": quote_image()}, cancelled=token)
    assert image_quote_service._ENGINE is None
