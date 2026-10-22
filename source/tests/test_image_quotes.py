"""Financial-field extraction and read-only matching boundaries for image quotes."""
import io

import pytest
from conftest import record
from PIL import Image

from domain import BackendChangedError, ValidationError, customer_key, validate_record
from image_importer import OcrToken, extract_quotes
from services.image_quote_service import load_image


def labelled(*lines, score=.99):
    return [OcrToken(line, 10, row * 40, 10 + len(line) * 16, row * 40 + 24, score) for row, line in enumerate(lines)]


def table(rows, score=.99):
    return [OcrToken(value, col * 220 + 20, row * 40, col * 220 + 180, row * 40 + 24, score)
            for row, values in enumerate(rows) for col, value in enumerate(values) if value]


def test_labelled_combined_fields_dual_tax_and_chinese_date():
    result = extract_quotes(labelled("客户名称：测试客户", "牌号/产品名称：PA12-01 | 尼龙",
                                    "材料/颜色：尼龙 黑色", "未税价格：9.734513 元/kg",
                                    "含税价格：11.000000", "日期：2026年9月30日", "总金额：99999"))
    assert len(result["candidates"]) == 2
    rows = [validate_record(item["record"]) for item in result["candidates"]]
    assert [(row["grade"], row["material"], row["color"], row["tax_type"], row["price"], row["effective_date"])
            for row in rows] == [("PA12-01", "尼龙", "黑色", "未税", "9.734513", "2026-09-30"),
                                 ("PA12-01", "尼龙", "黑色", "含税", "11", "2026-09-30")]


def test_table_geometry_multiple_products_ignores_quantity_amount_totals():
    rows = [["客户", "牌号", "材料/颜色", "数量", "未税价格", "含税价格", "金额", "报价日期"],
            ["客户甲", "PC/ABS-01", "PC/ABS 黑色", "5000", "12.6", "14.238", "71190", "2026-09-30"],
            ["客户乙", "PA12", "尼龙 本色", "800", "9.734513", "11", "8800", ""],
            ["合计", "", "", "5800", "", "", "79990", ""]]
    result = extract_quotes(table(rows), default_date="2026-10-10")
    quotes = [candidate["record"] for candidate in result["candidates"]]
    assert len(quotes) == 4
    assert {item["price"] for item in quotes} == {"12.6", "14.238", "9.734513", "11"}
    assert quotes[0]["grade"] == "PC/ABS-01" and quotes[0]["material"] == "PC/ABS"
    assert quotes[-1]["effective_date"] == "2026-10-10"


def test_selected_customer_ignores_image_header_and_search_like_names():
    result = extract_quotes(labelled("某公司采购合同", "客户：图片客户", "牌号：PA12", "单价：9.7"),
                            selected_customer="已点击客户", default_date="2026-10-10")
    assert result["candidates"][0]["record"]["customer"] == "已点击客户"
    partial = extract_quotes(labelled("某公司采购合同", "牌号：PA12", "单价：9.7"))
    assert partial["candidates"][0]["record"]["customer"] == ""
    with pytest.raises(ValidationError):
        validate_record(partial["candidates"][0]["record"])


@pytest.mark.parametrize("value", ["9.O7", "I2.3", "0", "9.1234567", "5元/吨"])
def test_uncertain_price_is_not_guessed_or_converted(value):
    result = extract_quotes(labelled("客户：QA", "牌号：PA12", f"单价：{value}"), default_date="2026-10-10")
    candidate = result["candidates"][0]
    assert candidate["record"]["price"] == value
    assert candidate["warnings"]
    with pytest.raises(ValidationError):
        validate_record(candidate["record"])


def test_bad_date_is_retained_for_manual_correction():
    result = extract_quotes(labelled("客户：QA", "牌号：PA12", "价格：9.7", "日期：2026-02-30"))
    candidate = result["candidates"][0]
    assert candidate["record"]["effective_date"] == "2026-02-30"
    assert any("日期无效" in warning for warning in candidate["warnings"])


def test_price_and_amount_on_same_line_and_low_confidence():
    result = extract_quotes(labelled("客户：QA", "牌号：PA12", "单价：￥9.734513  总金额：97345.13", score=.65))
    candidate = result["candidates"][0]
    assert candidate["record"]["price"] == "9.734513"
    assert any("清晰度" in warning for warning in candidate["warnings"])


def test_multiple_labelled_products_share_explicit_customer_date_only():
    result = extract_quotes(labelled("客户名称：QA", "日期：2026-09-30", "牌号：PA12", "单价：9.7",
                                    "牌号：PP-02", "含税价格：12.5"))
    rows = [item["record"] for item in result["candidates"]]
    assert [item["grade"] for item in rows] == ["PA12", "PP-02"]
    assert {item["customer"] for item in rows} == {"QA"}
    assert {item["effective_date"] for item in rows} == {"2026-09-30"}


def test_duplicate_label_conflict_is_reported_for_review():
    candidate = extract_quotes(labelled("客户：QA", "牌号：PA12", "单价：9.7", "价格：12.5"))["candidates"][0]
    assert candidate["blocking_issues"] and "冲突" in candidate["blocking_issues"][0]


def test_total_price_is_not_interpreted_as_unit_price():
    candidate = extract_quotes(labelled("客户：QA", "牌号：PA12", "总价格：5000"))["candidates"][0]
    assert candidate["record"]["price"] == ""
    with pytest.raises(ValidationError):
        validate_record(candidate["record"])


def test_selected_customer_ignores_conflicting_image_customer_labels():
    result = extract_quotes(labelled("客户：文件客户甲", "牌号：PA12", "价格：9.7", "客户：文件客户乙"),
                            selected_customer="目录客户")
    assert len(result["candidates"]) == 1
    assert result["candidates"][0]["record"]["customer"] == "目录客户"
    assert not result["candidates"][0]["blocking_issues"]


def test_match_preserves_manually_entered_note_and_reason(service, context):
    context.store.add(record())
    result = service.match_image_quote(record(note="用户手工补充", reason="新的调价原因", price="9.7"), context.storage_generation)
    assert result["record"]["note"] == "用户手工补充"
    assert result["record"]["reason"] == "新的调价原因"


def test_image_match_does_not_reuse_previous_adjustment_reason(service, context):
    context.store.add(record(reason="上一轮调价原因"))
    matched = service.match_image_quote(record(reason="", price="11"), context.storage_generation)
    assert matched["record"]["reason"] == ""
    with pytest.raises(ValidationError, match="原因"):
        service.add_quote({**matched["record"], "base_id": matched["base"]["id"],
                           "storage_generation": context.storage_generation,
                           "customer_revision": matched["customer_revision"]})


@pytest.mark.parametrize("lines", [("客户：QA", "总金额：5000"), ("数量", "含税金额", "500", "5000")])
def test_amount_only_is_not_a_quote(lines):
    with pytest.raises(ValueError, match="核心字段"):
        extract_quotes(labelled(*lines))


def test_token_and_candidate_limits():
    with pytest.raises(ValueError, match="文字过多"):
        extract_quotes(labelled(*(["文本"] * 3001)))
    lines = ["客户：QA"] + [value for index in range(101) for value in (f"牌号：PA-{index}", "单价：9.7")]
    with pytest.raises(ValueError, match="100"):
        extract_quotes(labelled(*lines))


def test_match_is_read_only_and_preserves_existing_identity_and_note(service, context):
    first = context.store.add(record())
    initial = len(context.store.all())
    result = service.match_image_quote(record(customer="qa隔离客户", grade="qa-pp", material="", color="", tax_type="未注明", note="", price="9.734513"), context.storage_generation)
    assert result["base"]["id"] == first["id"]
    assert (result["record"]["color"], result["record"]["tax_type"], result["record"]["note"]) == ("本色", "含税", "原报价")
    assert result["customer_revision"] == context.store.customer_states()[customer_key("QA隔离客户")]["revision"]
    assert len(context.store.all()) == initial


def test_match_selected_customer_and_new_spec(service, context):
    context.store.add(record())
    result = service.match_image_quote(record(customer="不应创建", grade="NEW-GRADE", price="9.734513"),
                                       context.storage_generation, selected_customer="QA隔离客户")
    assert result["base"] is None
    assert result["record"]["customer"] == "QA隔离客户"
    assert all(row["customer"] != "不应创建" for row in context.store.all())


def test_match_ambiguous_colors_and_material_conflict_rejected(service, context):
    context.store.add(record())
    context.store.add(record(color="黑色"))
    with pytest.raises(ValidationError, match="多个"):
        service.match_image_quote(record(color="", tax_type="未注明"), context.storage_generation)
    with pytest.raises(ValidationError, match="产品名称"):
        service.match_image_quote(record(material="另一材料"), context.storage_generation)


def test_match_deleted_customer_and_old_generations_rejected(service, context):
    context.store.add(record())
    state = context.store.customer_states()[customer_key("QA隔离客户")]
    context.store.change_customer(state["customer_key"], "delete", state["revision"], "image-delete-test")
    with pytest.raises(ValidationError, match="回收站"):
        service.match_image_quote(record(), context.storage_generation)
    with pytest.raises(BackendChangedError):
        service.match_image_quote(record(), "old-generation")
    context.invalidate_customer_data()
    with pytest.raises(ValidationError, match="状态已变化"):
        service.match_image_quote(record(), context.storage_generation, data_generation=0)


def test_match_and_append_rejects_newer_customer_revision(service, context):
    context.store.add(record())
    matched = service.match_image_quote(record(price="9.734513"), context.storage_generation)
    context.store.add(record(grade="OTHER"))
    with pytest.raises(ValueError, match="已变化"):
        service.add_quote({**matched["record"], "reason": "截图调价", "base_id": matched["base"]["id"],
                           "storage_generation": context.storage_generation, "customer_revision": matched["customer_revision"]})


def test_decode_transparency_and_bad_image_limits():
    buffer = io.BytesIO()
    Image.new("RGBA", (100, 60), (0, 0, 0, 0)).save(buffer, "PNG")
    image, filename = load_image({"content": buffer.getvalue()})
    assert image.getpixel((10, 10)) == (255, 255, 255) and filename == "截图.png"
    for content in (b"broken", b"", b"x" * (20 * 1024 * 1024 + 1)):
        with pytest.raises(ValidationError):
            load_image({"content": content})
