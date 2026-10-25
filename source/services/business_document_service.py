"""Personal document drafts and template-positioned PDF generation."""
from __future__ import annotations

import copy
import io
import json
import os
import re
import threading
import uuid
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal, localcontext
from pathlib import Path

from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from domain import ASSETS, ConflictError, NetworkError, ValidationError, now, today
from services.price_service import atomic_bytes

KINDS = {"quotation": "报价单", "contract": "购销合同"}
PAGE_SIZES = {"quotation": (595.35, 842.0), "contract": (595.3, 841.95)}
SELLER = "南京聚隆科技股份有限公司"
MAX_ITEMS = 30
MAX_RECORDS = 200
MAX_RECORD_FILE_BYTES = 2_000_000
MAX_PENDING_FILE_BYTES = 2_000_000
SYNC_STATUSES = {"pending", "conflict", "error"}
PARTY_FIELDS = ("name", "address", "representative", "agent", "phone", "fax", "bank", "account")
SUPPLIER_FIELDS = tuple("seller_"+key for key in PARTY_FIELDS) + ("email",)
COMMON_FIELDS = (
    "date", "recipient", "sender", "subject", "cc", "valid_from", "valid_to",
    "tax_type", "email", "contract_no", "place",
)
FIELD_NAMES = COMMON_FIELDS + tuple(f"{party}_{key}" for party in ("seller", "buyer") for key in PARTY_FIELDS)
ITEM_FIELDS = ("name", "model", "price", "note", "manufacturer", "quantity", "delivery")
DEFAULT_TERMS = {
    "quote_note": "如项目正式量产原材料高于或低于10%，双方需要重新核价。",
    "quality": "质量要求按供方材料技术质量标准。",
    "delivery": "交货地点为供方仓库,供方代办运输。",
    "transport": "汽配至需方指定地点，供方负责运费。",
    "packaging": "25KG/袋。",
    "acceptance": "按条款（二）验收，提出异议期限为收货一周内。异议期内，需方不得批量投料，一经投料，供方将不承担任何经济损失。",
    "breach": "需方应按约付款，延迟一日承担货款总额万分之三的违约金。",
    "dispute": "双方协商解决，协商不成，由供方所在地法院诉讼解决。",
    "effective": "本合同经双方签字或盖章后即生效，传真件具有同等法律效力。",
}
PAYMENTS = ("款到发货", "月结30天", "月结60天")
_FONT_LOCK = threading.RLock()


def blank_item():
    return {**dict.fromkeys(ITEM_FIELDS, ""), "manufacturer": "聚隆", "delivery": "具体交期\n双方协商"}


def record_title(document):
    """Return a stable, readable label without adding a field to the document schema."""
    fields = document.get("fields", {}) if isinstance(document, dict) else {}
    buyer = str(fields.get("buyer_name", "")).strip()
    items = document.get("items", []) if isinstance(document, dict) else []
    first = items[0] if items and isinstance(items[0], dict) else {}
    product = " ".join(str(first.get(key, "")).strip() for key in ("name", "model") if first.get(key))
    parts = [part for part in (buyer, product) if part]
    return " · ".join(parts)[:120] or "未命名单据"


def new_document(kind, row=None, customer=""):
    if kind not in KINDS:
        raise ValidationError("请选择报价单或购销合同")
    fields = dict.fromkeys(FIELD_NAMES, "")
    fields.update(seller_name=SELLER, seller_address="南京高新技术开发区聚龙路8号",
                  buyer_name=(row or {}).get("customer", customer), date=today(),
                  valid_from=today(), valid_to=(date.fromisoformat(today()) + timedelta(days=30)).isoformat(),
                  tax_type="未税", subject="材料报价", place="南京",
                  contract_no="TZJP-" + today().replace("-", ""))
    item = blank_item()
    if row:
        fields["tax_type"] = row.get("tax_type", "未注明")
        item.update(name=row.get("material") or "工程塑料", model=row.get("grade", ""),
                    note=row.get("note", ""))
        # A contract explicitly quotes tax-inclusive prices; never invent a VAT conversion.
        if kind == "quotation" or row.get("tax_type") == "含税":
            item["price"] = str(row.get("price", ""))
    return {"schema": 1, "kind": kind, "fields": fields, "items": [item],
            "terms": dict(DEFAULT_TERMS), "payment": PAYMENTS[0]}


def decimal_value(text, caption, *, positive=False):
    if not isinstance(text, str) or not re.fullmatch(r"\d{1,9}(?:\.\d{1,6})?", text.strip()):
        raise ValidationError(f"{caption}须为最多9位整数、6位小数的数字")
    value = Decimal(text.strip())
    if positive and value <= 0:
        raise ValidationError(f"{caption}必须大于0")
    return value


def number_text(value):
    result = format(value, "f")
    return result.rstrip("0").rstrip(".") if "." in result else result


def item_amount(item):
    with localcontext() as context:
        context.prec = 40
        return (decimal_value(item["quantity"], "数量", positive=True) *
                decimal_value(item["price"], "单价")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def rmb_upper(amount):
    """Financial uppercase RMB, with zero gaps between four-digit groups."""
    value = Decimal(amount).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if not value.is_finite() or value < 0 or value >= Decimal("1000000000000"):
        raise ValidationError("人民币金额须在0至一万亿元之间")
    digits = "零壹贰叁肆伍陆柒捌玖"
    integer, cents = divmod(int(value * 100), 100)

    def group_text(group):
        result, zero = "", False
        for digit, unit in zip(f"{group:04}", ("仟", "佰", "拾", "")):
            n = int(digit)
            if n:
                if zero and result:
                    result += "零"
                result += digits[n] + unit
                zero = False
            elif result:
                zero = True
        return result

    groups = []
    working = integer
    while working:
        groups.append(working % 10000)
        working //= 10000
    result, gap = "", False
    for index in range(len(groups) - 1, -1, -1):
        group = groups[index]
        if not group:
            if result:
                gap = True
            continue
        if result and (gap or group < 1000):
            result += "零"
        result += group_text(group) + ("", "万", "亿")[index]
        gap = False
    result = (result or "零") + "元"
    jiao, fen = divmod(cents, 10)
    if jiao:
        result += digits[jiao] + "角"
    if fen:
        if not jiao and integer:
            result += "零"
        result += digits[fen] + "分"
    return result if cents else result + "整"


def draft_data(document):
    if not isinstance(document, dict) or document.get("schema") != 1 or document.get("kind") not in KINDS:
        raise ValidationError("单据草稿格式不正确")
    fields, terms, items = document.get("fields"), document.get("terms"), document.get("items")
    if not isinstance(fields, dict) or not isinstance(terms, dict) or not isinstance(items, list):
        raise ValidationError("单据草稿字段不完整")
    if not 1 <= len(items) <= MAX_ITEMS:
        raise ValidationError(f"每份单据最多{MAX_ITEMS}项产品")

    def strings(source, keys):
        if not isinstance(source, dict):
            raise ValidationError("单据字段格式不正确")
        result = {}
        for key in keys:
            value = source.get(key, "")
            if not isinstance(value, str) or len(value) > 2000:
                raise ValidationError("单据字段须为不超过2000字的文字")
            if any(ord(char) < 32 and char not in "\n\t\r" for char in value):
                raise ValidationError("单据中含有不可打印字符")
            result[key] = value.strip()
        return result

    payment = document.get("payment", PAYMENTS[0])
    if payment not in PAYMENTS:
        raise ValidationError("请选择结算方式")
    return {"schema": 1, "kind": document["kind"], "fields": strings(fields, FIELD_NAMES),
            "terms": strings(terms, DEFAULT_TERMS), "items": [strings(item, ITEM_FIELDS) for item in items],
            "payment": payment}


def validate_document(document):
    result = draft_data(document)
    kind, fields = result["kind"], result["fields"]
    for key, caption in (("seller_name", "供方名称"), ("buyer_name", "需方/收件单位")):
        if not fields[key]:
            raise ValidationError(f"请填写{caption}")
    date_keys = ("date", "valid_from", "valid_to") if kind == "quotation" else ("date",)
    for key in date_keys:
        try:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", fields[key]):
                raise ValueError("date format")
            date.fromisoformat(fields[key])
        except ValueError:
            raise ValidationError("请填写正确的日期") from None
    if kind == "quotation":
        if fields["valid_to"] < fields["valid_from"]:
            raise ValidationError("有效期结束日期不能早于开始日期")
        if fields["tax_type"] not in ("含税", "未税"):
            raise ValidationError("请确认报价的含税/未税口径")
    elif not fields["contract_no"]:
        raise ValidationError("请填写合同编号")
    items = []
    for index, item in enumerate(result["items"], 1):
        if not any(item[key] for key in ("name", "model", "price", "quantity", "note")):
            continue
        if not item["name"] or not item["model"]:
            raise ValidationError(f"第{index}项产品须填写材料名称和规格型号")
        item["price"] = number_text(decimal_value(item["price"], f"第{index}项单价"))
        if kind == "contract":
            item["quantity"] = number_text(decimal_value(item["quantity"], f"第{index}项数量", positive=True))
            if item_amount(item) > Decimal("999999999.99"):
                raise ValidationError(f"第{index}项金额超出模板支持范围（最多999999999.99元）")
        items.append(item)
    if not items:
        raise ValidationError("请至少填写一项产品")
    result["items"] = items
    return result


def chinese_date(value):
    parsed = date.fromisoformat(value)
    return f"{parsed.year}年{parsed.month}月{parsed.day}日"


def _fonts():
    folder = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    for name, filename in (("BD-Song", "simsun.ttc"), ("BD-YaHei", "msyh.ttc")):
        if name not in pdfmetrics.getRegisteredFontNames():
            try:
                pdfmetrics.registerFont(TTFont(name, str(folder / filename), subfontIndex=0))
            except (OSError, ValueError) as exc:
                raise ValidationError("无法加载Windows宋体或微软雅黑，请检查系统字体") from exc


class _Page:
    def __init__(self, pdf, kind, assets):
        self.pdf, self.kind, self.assets = pdf, kind, assets
        self.width, self.height = PAGE_SIZES[kind]
        self.font = "BD-YaHei" if kind == "quotation" else "BD-Song"
        pdf.setPageSize((self.width, self.height))
        self.builtin = f"{kind}.png" not in assets
        if self.builtin:
            self.base_layout()
        else:
            pdf.drawImage(assets[f"{kind}.png"], 0, 0, self.width, self.height)

    def base_layout(self):
        """Draw the vector form; the supplied reference seal is added separately."""
        pdf = self.pdf
        pdf.setStrokeColorRGB(0.15, 0.15, 0.15)
        pdf.setLineWidth(0.6)
        title = KINDS[self.kind]
        pdf.setFont(self.font, 22)
        pdf.drawCentredString(self.width / 2, self.height - 92, title)
        if self.kind == "quotation":
            xs, ys = (86.65, 192.8, 330.35, 398.3, 525.7), (377, 417.14, 433.09, 457.29, 481.49)
        else:
            xs = (52.75, 108.9, 237.55, 276.85, 345, 417, 486.3, 558.3)
            ys = (185, 220, 251)
            self.text("一、产品及价格（含税，金额单位：元）", 55, 170, 500, 15, size=11)
            for index, text in enumerate(("产品名称", "规格型号", "生产厂家", "数量(kg)", "含税单价", "金额", "交货时间")):
                self.text(text, xs[index]+2, 194, xs[index+1]-xs[index]-4, 17,
                          size=10, minimum=8, align="center")
            self.text("人民币金额（小写）：", 55, 252, 220, 14, size=11)
            self.text("人民币金额（大写）：", 55, 269, 220, 14, size=11)
            pdf.rect(47, self.height-757, 508, 157, stroke=1, fill=0)
            pdf.line(300, self.height-600, 300, self.height-757)
            self.text("供方", 54, 584, 240, 16, size=12)
            self.text("需方", 314, 584, 237, 16, size=12)
        for x in xs:
            pdf.line(x, self.height-ys[0], x, self.height-ys[-1])
        for y in ys:
            pdf.line(xs[0], self.height-y, xs[-1], self.height-y)
        self.text("请核对单据信息后使用", 56, 808, 500, 14, size=9, align="center")

    def clear(self, x, top, width, height):
        self.pdf.setFillColorRGB(1, 1, 1)
        self.pdf.rect(x, self.height - top - height, width, height, stroke=0, fill=1)
        self.pdf.setFillColorRGB(0, 0, 0)

    def text(self, text, x, top, width, height, *, size=12, minimum=9, align="left",
             caption="字段", lines=1, leading=None, font=None):
        if not text:
            return
        font = font or self.font
        face = pdfmetrics.getFont(font).face
        if any(ord(char) not in face.charToGlyph for char in text if char not in "\n\r\t"):
            raise ValidationError(f"{caption}包含当前字体无法显示的字符，请修改")
        text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\t", " ")
        sizes = [size - index / 2 for index in range(int((size - minimum) * 2) + 1)]
        chosen = None
        for current in sizes:
            rows = []
            for paragraph in text.split("\n"):
                row = ""
                for char in paragraph:
                    if pdfmetrics.stringWidth(row + char, font, current) > width:
                        if not row:
                            break
                        rows.append(row)
                        row = char
                    else:
                        row += char
                rows.append(row)
            spacing = leading or current * 1.18
            if len(rows) <= lines and current + (len(rows) - 1) * spacing <= height:
                chosen = (current, rows, spacing)
                break
        if chosen is None:
            raise ValidationError(f"{caption}内容过长，原模板位置放不下，请缩短或另拆单据")
        current, rows, spacing = chosen
        self.pdf.setFont(font, current)
        for index, row in enumerate(rows):
            offset = (width - pdfmetrics.stringWidth(row, font, current)) / 2 if align == "center" else 0
            if align == "right":
                offset = width - pdfmetrics.stringWidth(row, font, current)
            self.pdf.drawString(x + offset, self.height - top - current - index * spacing, row)

    def seal(self):
        image = self.assets["reference-seal.png"]
        width = 118 if self.kind == "quotation" else 133.08
        image_width, image_height = image.getSize()
        height = width * image_height / image_width
        x, bottom = (375.9375, 108.641228) if self.kind == "quotation" else (98.759995, 102.870008)
        self.pdf.drawImage(image, x, bottom, width, height, mask="auto")

def _quotation_page(pdf, document, items, page_index, pages, assets):
    p = _Page(pdf, "quotation", assets)
    f = document["fields"]
    if p.builtin or f["seller_name"] != SELLER:
        p.clear(89, 51, 350, 26)
        p.text(f["seller_name"], 90, 53, 350, 24, font="BD-Song", size=19.5, minimum=14, caption="供方名称")
    headers = [
        (56.4, 106.2, 323.3, 19.8, "收件单位（Company）："+f["buyer_name"], 14.5, 1),
        (381.1, 106.2, 174.8, 19.8, "发件人(From)："+f["sender"], 14.5, 1),
        (56.4, 127.7, 323.3, 35.4, "收件人（To）："+f["recipient"], 14.5, 2),
        (381.1, 127.7, 174.8, 35.4, "日期(Date)："+chinese_date(f["date"]), 14.5, 1),
        (56.4, 164.5, 323.3, 53.6, "传真号(Fax No)："+f["buyer_fax"], 14.5, 2),
        (381.1, 164.5, 174.8, 53.6, f"页数(Page-Inc this\none)：{page_index}/{pages}", 14.5, 2),
        (56.4, 219.5, 323.3, 19.9, "主题(Subject)："+f["subject"], 14, 1),
        (381.1, 219.5, 174.8, 19.9, "抄送(CC)："+f["cc"], 14, 1),
    ]
    for x, top, width, height, text, size, lines in headers:
        p.clear(x, top, width, height)
        p.text(text, x+3, top+1, width-6, height-2, size=size, minimum=9, lines=lines, caption="报价单抬头")
    p.clear(46, 347, 130, 22)
    p.text(f"（{f['tax_type']}）为：", 47, 350, 128, 19, size=14, minimum=12, caption="税口径")
    xs = (86.65, 192.8, 330.35, 398.3, 525.7)
    for column, caption in enumerate(("材料名称", "材料规格", "价格(元/kg)", "备注")):
        width = xs[column+1]-xs[column]
        p.clear(xs[column]+1, 379, width-2, 37)
        p.text(caption, xs[column]+2, 389, width-4, 17, size=11.5, minimum=10,
               align="center", caption="报价表头")
    # The source template has overlapping glyphs here; replace only its text region.
    p.clear(469, 256, 92, 17)
    p.text("★如不清晰烦请电告", 471, 258, 88, 14, size=9.5, minimum=9,
           caption="传真提示")
    ys = (417.14, 433.09, 457.29, 481.49)
    for index, item in enumerate(items):
        for column, key in enumerate(("name", "model", "price", "note")):
            width, height = xs[column+1]-xs[column]-4, ys[index+1]-ys[index]-3
            p.text(item[key], xs[column]+2, ys[index]+1, width, height, size=10.5,
                   minimum=8, lines=1 if column == 2 else 2,
                   align="center", caption=f"第{(page_index-1)*3+index+1}项{('材料名称','材料规格','单价','备注')[column]}")
    # Remove all sample dates/contacts and recreate them inside their original regions.
    p.clear(87, 483, 482, 247)
    p.text("备注：日期(Date)："+chinese_date(f["valid_from"])+" - "+chinese_date(f["valid_to"]),
           95, 487, 465, 31, size=12, minimum=10, lines=2, caption="报价有效期")
    p.text(document["terms"]["quote_note"], 110, 537, 450, 55, size=14, minimum=11,
           lines=2, leading=32, caption="报价说明")
    contact = "联系电话：" + "  ".join(filter(None, (f["seller_agent"], f["seller_phone"])))
    p.text(contact, 110, 602, 430, 23, size=14, minimum=10, caption="报价联系电话")
    p.text("顺祝商祺！", 110, 635, 240, 23, size=14)
    p.text(f["seller_name"], 325, 674, 237, 22, size=14, minimum=10, align="right", caption="落款单位")
    p.text("日期(Date)："+chinese_date(f["date"]), 365, 696, 197, 24,
           size=12, minimum=9, align="right", caption="落款日期")
    p.clear(54, 738, 520, 18)
    footer = f"ADD：{f['seller_address']}   TEL：{f['seller_phone']}   E-mail：{f['email']}"
    p.text(footer, 56, 740, 516, 14, size=10.5, minimum=8, caption="报价单页脚")
    p.seal()


def _contract_page(pdf, document, item, page_index, pages, total, assets):
    p = _Page(pdf, "contract", assets)
    f = document["fields"]
    p.clear(56, 114, 503, 51)
    for text, x, top, width in (
        ("供方："+f["seller_name"], 59, 117, 310),
        ("需方："+f["buyer_name"], 59, 135, 310),
        ("合同编号："+f["contract_no"], 380, 117, 177),
        ("合同履行地点："+f["place"], 380, 135, 177),
        ("签订时间："+f["date"].replace("-", "/"), 380, 153, 177),
    ):
        p.text(text, x, top, width, 15, size=12, minimum=9, caption="合同抬头")
    amount = item_amount(item)
    columns = (52.75, 108.9, 237.55, 276.85, 345, 417, 486.3, 558.3)
    values = (item["name"], item["model"], item["manufacturer"], item["quantity"],
              item["price"], format(amount, ".2f"), item["delivery"])
    p.clear(486.9, 220.2, 70.7, 30.3)
    for index, value in enumerate(values):
        p.text(value, columns[index]+2, 221, columns[index+1]-columns[index]-4, 28,
               size=11, minimum=8, lines=1 if index in (3, 4, 5) else 2,
               align="center", caption=f"第{page_index}项{('产品名称','规格型号','生产厂家','数量','含税单价','金额','交货时间')[index]}")
    p.text(format(amount, ".2f"), 280, 252, 275, 14, size=12, minimum=9, caption="人民币金额小写")
    p.text(rmb_upper(amount), 280, 269, 275, 14, size=11.5, minimum=8, caption="人民币金额大写")
    definitions = (
        ("quality", "二、质量要求技术标准：", 302, 18),
        ("delivery", "三、交（提）货地点、方式：", 333, 18),
        ("transport", "四、运输方式及目的地和费用负担：", 364, 18),
        ("packaging", "五、包装方式：", 396, 18),
        ("acceptance", "六、验收方法及提出异议期限：", 428, 31),
        ("breach", "八、违约责任：", 489, 18),
        ("dispute", "九、解决合同纠纷的方式：", 520, 18),
        ("effective", "十、", 551, 18),
    )
    for key, prefix, top, height in definitions:
        # Keep the original text and underlines exactly when the clause is unchanged.
        if p.builtin or document["terms"][key] != DEFAULT_TERMS[key]:
            p.clear(57, top-1, 499, height)
            p.text(prefix+document["terms"][key], 59, top, 493, height-1,
                   size=12, minimum=9, lines=2 if key == "acceptance" else 1, caption=prefix)
    p.clear(57, 458.5, 498, 20)
    p.text("七、结算方式及期限：", 59, 459, 124, 17, size=12, minimum=10)
    for index, payment in enumerate(PAYMENTS):
        x = (189, 283, 380)[index]
        p.pdf.rect(x, p.height-470.5, 7.5, 7.5, fill=int(payment == document["payment"]), stroke=1)
        p.text(payment, x+10, 459, 90, 17, size=12, minimum=10)
    # Entire signature blocks are editable; sampled personal/bank details are cleared.
    p.clear(47.1, 603.5, 250.9, 151.5)
    p.clear(300.1, 603.5, 253.4, 151.5)
    labels = ("单位名称：", "单位地址：", "法定代表人：", "委托代理人：", "电话：", "传真：", "开户银行：", "账号：")
    positions = {"seller": (608, 624, 652, 668, 684, 700, 716, 739),
                 "buyer": (608, 624, 640, 656, 672, 688, 704, 720)}
    for party, x in (("seller", 54), ("buyer", 314)):
        width = 241 if party == "seller" else 237
        for key, caption, top in zip(PARTY_FIELDS, labels, positions[party]):
            p.text(caption+f[f"{party}_{key}"], x, top, width, 15, size=11.5, minimum=8,
                   caption=("供方" if party == "seller" else "需方")+caption)
    if pages > 1:
        p.text(f"第{page_index}/{pages}页 · 本页金额{amount:.2f}元 · 全合同合计{total:.2f}元",
               58, 777, 497, 16, size=10, minimum=8, align="center", caption="续页总金额")
    p.seal()


class BusinessDocumentService:
    def __init__(self, folder, assets=None, cloud_store=None):
        self.folder = Path(folder).resolve() / "business-documents"
        private = Path(folder).resolve() / "business_templates"
        self.assets = Path(assets) if assets else private if private.is_dir() else ASSETS / "business_templates"
        self.template_directory = Path(assets) if assets else private
        self.custom_assets = assets is not None
        self.cloud_store = cloud_store

    def template_images(self, kind):
        names = (f"{kind}.png",)
        missing = [name for name in names if not (self.assets / name).is_file()]
        images = {}
        if missing:
            if self.custom_assets:
                raise ValidationError(f"{KINDS[kind]}模板图片缺失：{'、'.join(missing)}。"
                                      f"请将原模板放入：{self.template_directory}，然后重新打开单据。")
        else:
            for name in names:
                images[name] = self.read_template_image(self.assets / name)
        images["reference-seal.png"] = self.read_template_image(ASSETS / "business_templates" / "reference-seal.png")
        return images

    @staticmethod
    def read_template_image(path):
        name = path.name
        try:
            image = ImageReader(io.BytesIO(path.read_bytes()))
            image.getRGBData()
        except PermissionError as exc:
            raise ValidationError(f"模板图片无法访问：{name}，请检查文件权限或占用") from exc
        except FileNotFoundError as exc:
            raise ValidationError(f"模板图片缺失：{name}，请恢复图片或重新安装本版程序") from exc
        except (OSError, ValueError) as exc:
            raise ValidationError(f"模板图片无法读取或已损坏：{name}，请使用原始PNG图片恢复") from exc
        return image

    @staticmethod
    def supplier_fields(fields):
        if not isinstance(fields, dict):
            raise ValidationError("供方信息格式不正确")
        result = {}
        for key in SUPPLIER_FIELDS:
            if key not in fields:
                continue
            value = fields[key]
            if not isinstance(value, str) or len(value) > 2000 or any(ord(char) < 32 for char in value):
                raise ValidationError("供方信息须为不超过2000字的单行文字")
            result[key] = value.strip()
        return result

    def load_supplier(self):
        path = self.folder/"supplier.json"
        if not path.exists():
            return {}
        if path.stat().st_size > 200_000:
            raise ValidationError("已保存的供方信息文件过大，请检查文件")
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(data, dict) or data.get("schema") != 1:
                raise ValueError("unsupported supplier schema")
            return self.supplier_fields(data.get("fields"))
        except (ValueError, UnicodeError) as exc:
            raise ValidationError("已保存的供方信息已损坏，原文件已保留") from exc

    def save_supplier(self, fields):
        changes = self.supplier_fields(fields)
        saved = self.load_supplier()
        # A quotation exposes fewer fields than a contract. Preserve its bank/account fields.
        saved.update(changes)
        self.folder.mkdir(parents=True, exist_ok=True)
        atomic_bytes(self.folder/"supplier.json",
                     json.dumps({"schema": 1, "fields": saved}, ensure_ascii=False, indent=2).encode("utf-8"))
        return saved

    def save_draft(self, document):
        result = draft_data(document)
        path = self.folder / (result["kind"] + ".json")
        self.folder.mkdir(parents=True, exist_ok=True)
        atomic_bytes(path, json.dumps(result, ensure_ascii=False, indent=2).encode("utf-8"))
        return str(path)

    def _records_path(self, kind):
        if kind not in KINDS:
            raise ValidationError("不支持的单据类型")
        return self.folder / f"{kind}-records.json"

    def _pending_path(self, kind):
        if kind not in KINDS:
            raise ValidationError("不支持的单据类型")
        return self.folder / f"{kind}-pending.json"

    @staticmethod
    def _normalize_record_id(value, field_name="record id"):
        if not isinstance(value, str):
            raise ValueError(f"invalid {field_name}")
        try:
            return uuid.UUID(value).hex
        except (ValueError, AttributeError, TypeError) as exc:
            raise ValueError(f"invalid {field_name}") from exc

    @staticmethod
    def _normalize_record(raw, kind, seen):
        if not isinstance(raw, dict):
            raise ValueError("record is not an object")
        record_id = BusinessDocumentService._normalize_record_id(raw.get("id"))
        if record_id in seen:
            raise ValueError("invalid record id")
        title = raw.get("title", "")
        if (not isinstance(title, str) or not title or len(title) > 120
                or any(ord(char) < 32 and char not in "\n\t\r" for char in title)):
            raise ValueError("invalid record title")
        created_at, updated_at = raw.get("created_at"), raw.get("updated_at")
        for timestamp in (created_at, updated_at):
            if (not isinstance(timestamp, str) or not 1 <= len(timestamp) <= 64
                    or any(ord(char) < 32 for char in timestamp)):
                raise ValueError("invalid record timestamp")
        revision = raw.get("revision", 1)
        if isinstance(revision, bool) or not isinstance(revision, int) or revision < 1:
            raise ValueError("invalid record revision")
        sync_status = raw.get("sync_status", "")
        if sync_status and sync_status not in SYNC_STATUSES:
            raise ValueError("invalid record sync status")
        sync_error = raw.get("sync_error", "")
        if not isinstance(sync_error, str) or len(sync_error) > 500:
            raise ValueError("invalid record sync error")
        document = draft_data(raw.get("document"))
        if document["kind"] != kind:
            raise ValueError("record kind mismatch")
        seen.add(record_id)
        result = {"id": record_id, "title": title, "created_at": created_at,
                  "updated_at": updated_at, "revision": revision, "document": document}
        if sync_status:
            result["sync_status"] = sync_status
        if sync_error:
            result["sync_error"] = sync_error
        return result

    def _normalize_records(self, kind, records):
        if not isinstance(records, list) or len(records) > MAX_RECORDS:
            raise ValueError("too many records")
        result, seen = [], set()
        for raw in records:
            result.append(self._normalize_record(raw, kind, seen))
        return result

    def _write_records(self, kind, records):
        self.folder.mkdir(parents=True, exist_ok=True)
        atomic_bytes(self._records_path(kind), json.dumps(
            {"schema": 1, "kind": kind, "records": records},
            ensure_ascii=False, indent=2).encode("utf-8"))

    @staticmethod
    def _normalize_pending(raw, kind, seen):
        if not isinstance(raw, dict):
            raise ValueError("pending operation is not an object")
        operation = raw.get("operation")
        if operation not in ("save", "delete"):
            raise ValueError("invalid pending operation")
        local_id = raw.get("local_id")
        if not isinstance(local_id, str) or not re.fullmatch(r"[0-9a-f]{32}", local_id):
            raise ValueError("invalid pending local id")
        if local_id in seen:
            raise ValueError("duplicate pending local id")
        document_id = raw.get("document_id")
        if document_id is not None:
            document_id = BusinessDocumentService._normalize_record_id(document_id, "pending document id")
        expected_revision = raw.get("expected_revision")
        if expected_revision is not None and (isinstance(expected_revision, bool)
                                              or not isinstance(expected_revision, int)
                                              or expected_revision < 1):
            raise ValueError("invalid pending revision")
        status = raw.get("status", "pending")
        if status not in ("pending", "conflict", "error"):
            raise ValueError("invalid pending status")
        error = raw.get("error", "")
        if not isinstance(error, str) or len(error) > 500:
            raise ValueError("invalid pending error")
        result = {"operation": operation, "local_id": local_id, "document_id": document_id,
                  "expected_revision": expected_revision, "status": status, "error": error}
        if operation == "save":
            document = draft_data(raw.get("document"))
            if document["kind"] != kind:
                raise ValueError("pending kind mismatch")
            result["document"] = document
            result["title"] = raw.get("title", record_title(document))
            if not isinstance(result["title"], str) or not result["title"]:
                raise ValueError("invalid pending title")
        elif raw.get("record") is not None:
            snapshot = BusinessDocumentService._normalize_record(raw["record"], kind, set())
            if snapshot["id"] != local_id:
                raise ValueError("pending snapshot id mismatch")
            result["record"] = snapshot
        seen.add(local_id)
        return result

    def _load_pending(self, kind):
        path = self._pending_path(kind)
        if not path.exists():
            return []
        try:
            if path.stat().st_size > MAX_PENDING_FILE_BYTES:
                raise ValidationError("待同步制作记录过大，请连接网络后重试")
            payload = json.loads(path.read_text(encoding="utf-8"))
            if (not isinstance(payload, dict) or payload.get("schema") != 1
                    or payload.get("kind") != kind or not isinstance(payload.get("operations"), list)):
                raise ValueError("unsupported pending schema")
            if len(payload["operations"]) > MAX_RECORDS:
                raise ValueError("too many pending operations")
            result, seen = [], set()
            for raw in payload["operations"]:
                result.append(self._normalize_pending(raw, kind, seen))
            return result
        except ValidationError:
            raise
        except (OSError, TypeError, ValueError, UnicodeError) as exc:
            raise ValidationError("待同步制作记录已损坏，原文件已保留") from exc

    def _write_pending(self, kind, operations):
        self.folder.mkdir(parents=True, exist_ok=True)
        atomic_bytes(self._pending_path(kind), json.dumps(
            {"schema": 1, "kind": kind, "operations": operations},
            ensure_ascii=False, indent=2).encode("utf-8"))

    @staticmethod
    def _pending_counts(operations):
        return {status: sum(item["status"] == status for item in operations)
                for status in ("pending", "conflict", "error")}

    @staticmethod
    def _pending_operation(operations, local_id):
        return next((item for item in operations if item["local_id"] == local_id), None)

    @staticmethod
    def _remote_record(raw, kind):
        if isinstance(raw, dict) and isinstance(raw.get("record"), dict):
            raw = raw["record"]
        return BusinessDocumentService._normalize_record(raw, kind, set())

    @staticmethod
    def _sync_error(error):
        return str(error).strip()[:500] or "同步失败"

    @staticmethod
    def _set_record_sync_state(records, record_id, status, error=""):
        for record in records:
            if record["id"] == record_id:
                if status:
                    record["sync_status"] = status
                else:
                    record.pop("sync_status", None)
                if error:
                    record["sync_error"] = error
                else:
                    record.pop("sync_error", None)
                break

    def _merge_remote_records(self, kind, remote_records):
        """Refresh the cache without discarding unsent local or conflict records."""
        local = self.load_records(kind)
        pending = self._load_pending(kind)
        protected_local_ids = {item["local_id"] for item in pending}
        protected_remote_ids = {item["document_id"] for item in pending if item["document_id"]}
        local_only = [item for item in local if item["id"] in protected_local_ids]
        merged = local_only + [item for item in remote_records
                               if item["id"] not in protected_local_ids
                               and item["id"] not in protected_remote_ids]
        merged.sort(key=lambda item: item["updated_at"], reverse=True)
        self._write_records(kind, merged[:MAX_RECORDS])
        return copy.deepcopy(merged[:MAX_RECORDS])

    def load_records(self, kind):
        """Read the current account's editable document records in newest-first order."""
        path = self._records_path(kind)
        if not path.exists():
            return []
        try:
            if path.stat().st_size > MAX_RECORD_FILE_BYTES:
                raise ValidationError("制作记录文件过大，请删除不需要的记录后重试")
            payload = json.loads(path.read_text(encoding="utf-8"))
            if (not isinstance(payload, dict) or payload.get("schema") != 1
                    or payload.get("kind") != kind or not isinstance(payload.get("records"), list)):
                raise ValueError("unsupported records schema")
            return self._normalize_records(kind, payload["records"])
        except ValidationError:
            raise
        except (OSError, TypeError, ValueError, UnicodeError) as exc:
            raise ValidationError("已保存的制作记录已损坏，原文件已保留") from exc

    def save_record(self, document, record_id=None):
        """Create or update one editable record without changing the legacy draft contract."""
        result = draft_data(document)
        records = self.load_records(result["kind"])
        operations = self._load_pending(result["kind"]) if self.cloud_store is not None else []
        timestamp = now()
        current = None
        previous_revision = None
        if record_id:
            try:
                record_id = self._normalize_record_id(record_id)
            except ValueError as exc:
                raise ValidationError("制作记录编号无效，请重新打开记录") from exc
            current = next((item for item in records if item["id"] == record_id), None)
            if current is None:
                raise ValidationError("制作记录已不存在，请刷新记录列表")
            previous_revision = current.get("revision", 1)
            current.update(title=record_title(result), updated_at=timestamp,
                          revision=previous_revision + 1, document=result)
            saved = current
        else:
            if len(records) >= MAX_RECORDS:
                raise ValidationError(f"每种单据最多保存{MAX_RECORDS}条制作记录")
            saved = {"id": uuid.uuid4().hex, "title": record_title(result),
                     "created_at": timestamp, "updated_at": timestamp, "revision": 1,
                     "document": result}
            records.insert(0, saved)
        if self.cloud_store is not None:
            existing = self._pending_operation(operations, saved["id"])
            if existing and existing["operation"] == "delete":
                document_id = existing["document_id"]
                expected_revision = existing["expected_revision"]
                existing.update(operation="save", document_id=document_id,
                                expected_revision=expected_revision, status="pending", error="",
                                document=result, title=record_title(result))
            elif existing:
                existing.update(operation="save", document=copy.deepcopy(result),
                                title=record_title(result), status="pending", error="")
            else:
                operations.append({
                    "operation": "save", "local_id": saved["id"],
                    "document_id": record_id, "expected_revision": previous_revision,
                    "status": "pending", "error": "", "document": copy.deepcopy(result),
                    "title": record_title(result),
                })
            saved["sync_status"] = "pending"
            saved.pop("sync_error", None)
            # Queue first so a failed cache write can be recovered on the next launch.
            self._write_pending(result["kind"], operations)
        self._write_records(result["kind"], records)
        return copy.deepcopy(saved)

    def delete_record(self, kind, record_id):
        records = self.load_records(kind)
        current = next((item for item in records if item["id"] == record_id), None)
        if current is None:
            return False
        operations = self._load_pending(kind) if self.cloud_store is not None else []
        if self.cloud_store is not None:
            existing = self._pending_operation(operations, record_id)
            if existing and existing["operation"] == "save" and existing["document_id"] is None:
                operations = [item for item in operations if item is not existing]
            else:
                document_id = existing["document_id"] if existing and existing["document_id"] else record_id
                expected_revision = (existing["expected_revision"] if existing and existing["expected_revision"]
                                     else current.get("revision", 1))
                operation = {
                    "operation": "delete", "local_id": record_id, "document_id": document_id,
                    "expected_revision": expected_revision, "status": "pending", "error": "",
                    "record": copy.deepcopy(current),
                }
                operations = [item for item in operations if item["local_id"] != record_id]
                operations.append(operation)
            self._write_pending(kind, operations)
        self._write_records(kind, [item for item in records if item["id"] != record_id])
        return True

    def load_remote_records(self, kind):
        if self.cloud_store is None:
            raise ValidationError("当前未登录个人云端账号")
        try:
            payload = self.cloud_store.business_document_list(kind)
            records = payload.get("records") if isinstance(payload, dict) else None
            normalized = self._normalize_records(kind, records)
            return self._merge_remote_records(kind, normalized)
        except ValidationError:
            raise
        except (NetworkError, ConflictError):
            raise
        except (OSError, TypeError, ValueError, UnicodeError) as exc:
            raise ValidationError("云端制作记录格式无效，未覆盖本地缓存") from exc

    def _merge_record_cache(self, record, local_id=None):
        kind = record["document"]["kind"]
        try:
            records = self.load_records(kind)
        except ValidationError:
            records = []
        removed = {record["id"]}
        if local_id:
            removed.add(local_id)
        records = [item for item in records if item["id"] not in removed]
        records.insert(0, record)
        self._write_records(kind, records[:MAX_RECORDS])

    def save_remote_record(self, document, record_id=None, revision=None):
        if self.cloud_store is None:
            raise ValidationError("当前未登录个人云端账号")
        result = draft_data(document)
        try:
            raw = self.cloud_store.business_document_save(
                result["kind"], record_id, revision, record_title(result), result)
            record = self._remote_record(raw, result["kind"])
            self._merge_record_cache(record, record_id)
            return copy.deepcopy(record)
        except ValidationError:
            raise
        except (NetworkError, ConflictError):
            raise
        except (OSError, TypeError, ValueError, UnicodeError) as exc:
            raise ValidationError("云端制作记录保存响应无效，本地缓存未确认更新") from exc

    def delete_remote_record(self, kind, record_id, revision):
        if self.cloud_store is None:
            raise ValidationError("当前未登录个人云端账号")
        if not isinstance(record_id, str) or not re.fullmatch(r"[0-9a-f]{32}", record_id):
            raise ValidationError("制作记录编号无效，请刷新记录列表")
        try:
            result = self.cloud_store.business_document_delete(kind, record_id, revision)
            if not isinstance(result, dict) or result.get("deleted") is not True:
                raise ValidationError("云端制作记录删除响应无效")
            try:
                records = self.load_records(kind)
            except ValidationError:
                records = []
            self._write_records(kind, [item for item in records if item["id"] != record_id])
            return True
        except ValidationError:
            raise
        except (NetworkError, ConflictError):
            raise
        except (OSError, TypeError, ValueError, UnicodeError) as exc:
            raise ValidationError("云端制作记录删除响应无效，本地缓存未确认更新") from exc

    def sync_pending(self, kind):
        """Upload queued local operations; network failures remain retryable."""
        if kind not in KINDS:
            raise ValidationError("不支持的单据类型")
        operations = self._load_pending(kind)
        if self.cloud_store is None:
            counts = self._pending_counts(operations)
            return {"online": False, "synced": 0, "conflicts": counts["conflict"],
                    "errors": counts["error"], "pending": len(operations)}
        if not operations:
            return {"online": True, "synced": 0, "conflicts": 0, "errors": 0, "pending": 0}
        records = self.load_records(kind)
        remaining = []
        synced = conflicts = errors = 0
        online = True
        for index, operation in enumerate(operations):
            if operation["status"] != "pending":
                remaining.append(operation)
                continue
            try:
                if operation["operation"] == "save":
                    raw = self.cloud_store.business_document_save(
                        kind, operation["document_id"], operation["expected_revision"],
                        operation["title"], operation["document"])
                    remote = self._remote_record(raw, kind)
                    removed = {operation["local_id"], remote["id"]}
                    records = [record for record in records if record["id"] not in removed]
                    records.insert(0, remote)
                else:
                    result = self.cloud_store.business_document_delete(
                        kind, operation["document_id"], operation["expected_revision"])
                    if not isinstance(result, dict) or result.get("deleted") is not True:
                        raise ValidationError("云端制作记录删除响应无效")
                    removed = {operation["local_id"], operation["document_id"]}
                    records = [record for record in records if record["id"] not in removed]
                synced += 1
            except NetworkError as exc:
                operation["error"] = self._sync_error(exc)
                remaining.append(operation)
                remaining.extend(operations[index + 1:])
                online = False
                break
            except ConflictError as exc:
                operation["status"] = "conflict"
                operation["error"] = self._sync_error(exc)
                if operation["operation"] == "save":
                    self._set_record_sync_state(records, operation["local_id"], "conflict", operation["error"])
                elif operation.get("record") is not None:
                    restored = copy.deepcopy(operation["record"])
                    restored["sync_status"] = "conflict"
                    restored["sync_error"] = operation["error"]
                    records = [record for record in records if record["id"] != restored["id"]]
                    records.insert(0, restored)
                remaining.append(operation)
                conflicts += 1
            except ValidationError as exc:
                operation["status"] = "error"
                operation["error"] = self._sync_error(exc)
                self._set_record_sync_state(records, operation["local_id"], "error", operation["error"])
                remaining.append(operation)
                errors += 1
        self._write_records(kind, records[:MAX_RECORDS])
        self._write_pending(kind, remaining)
        counts = self._pending_counts(remaining)
        return {"online": online, "synced": synced, "conflicts": counts["conflict"],
                "errors": counts["error"], "pending": len(remaining)}

    def sync_all(self):
        """Refresh both document kinds and upload their queues in one background pass."""
        result = {"online": True, "synced": 0, "conflicts": 0, "errors": 0, "pending": 0,
                  "records": {}}
        for kind in KINDS:
            state = self.sync_pending(kind)
            result["synced"] += state["synced"]
            result["conflicts"] += state["conflicts"]
            result["errors"] += state["errors"]
            result["pending"] += state["pending"]
            if not state["online"]:
                result["online"] = False
                result["records"][kind] = self.load_records(kind)
                continue
            try:
                result["records"][kind] = self.load_remote_records(kind)
            except NetworkError:
                result["online"] = False
                result["records"][kind] = self.load_records(kind)
        return result

    def load_draft(self, kind):
        if kind not in KINDS:
            raise ValidationError("不支持的单据类型")
        path = self.folder / (kind+".json")
        if not path.exists():
            return None
        if path.stat().st_size > 200_000:
            raise ValidationError("草稿文件过大，请检查文件")
        try:
            document = draft_data(json.loads(path.read_text(encoding="utf-8")))
        except (ValueError, UnicodeError) as exc:
            raise ValidationError("上次草稿已损坏，请重新填写；原文件已保留") from exc
        if document["kind"] != kind:
            raise ValidationError("上次草稿类型不匹配")
        return document

    def render(self, document):
        document = validate_document(document)
        if not self.custom_assets:
            from services.source_document_renderer import SourceDocumentRenderer
            with _FONT_LOCK:
                return SourceDocumentRenderer(ASSETS/"business_templates",document["kind"]).render(document)
        kind, items = document["kind"], document["items"]
        images = self.template_images(kind)
        stream = io.BytesIO()
        with _FONT_LOCK:
            _fonts()
            pdf = canvas.Canvas(stream, pagesize=PAGE_SIZES[kind], pageCompression=1)
            pdf.setTitle(KINDS[kind]+" - "+document["fields"]["buyer_name"])
            pdf.setAuthor(document["fields"]["seller_name"])
            per_page = 3 if kind == "quotation" else 1
            pages = (len(items)+per_page-1)//per_page
            total = sum((item_amount(item) for item in items), Decimal(0)) if kind == "contract" else Decimal(0)
            for index in range(pages):
                if kind == "quotation":
                    _quotation_page(pdf, document, items[index*3:index*3+3], index+1, pages, images)
                else:
                    _contract_page(pdf, document, items[index], index+1, pages, total, images)
                pdf.showPage()
            pdf.save()
        return stream.getvalue()

    def export_word(self, document, path):
        from services.source_document_renderer import SourceDocumentRenderer

        document=validate_document(copy.deepcopy(document))
        path=Path(path)
        if path.suffix.lower()!=".docx":
            path=path.with_name(path.name+".docx")
        with _FONT_LOCK:
            payload=SourceDocumentRenderer(ASSETS/"business_templates",document["kind"]).render_word(document)
        atomic_bytes(path,payload)
        return {"path":str(path),"bytes":len(payload)}

    def export(self, document, path):
        path = Path(path)
        if path.suffix.lower() != ".pdf":
            path = path.with_name(path.name+".pdf")
        # Render and validate all pages before touching an existing target file.
        payload = self.render(copy.deepcopy(document))
        atomic_bytes(path, payload)
        return {"path": str(path), "bytes": len(payload)}
