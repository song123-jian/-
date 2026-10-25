"""Compile local, retained Word references into shared mobile/desktop assets."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import struct
from pathlib import Path
from zipfile import ZipFile

import pdfplumber
from lxml import etree
from pypdf import PdfReader
from pypdf.generic import ContentStream

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
FONT_NAMES = {
    "SimSun": "song",
    "SimHei": "hei",
    "KaiTi": "kai",
    "ArialMT": "arial",
    "Arial-BoldMT": "arial-bold",
    "ArialNarrow-Bold": "arial-narrow-bold",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def ttc_face(data, index=0):
    """Keep one TrueType face and relocate its original tables without subsetting."""
    assert data[:4] == b"ttcf"
    offset = struct.unpack_from(">I", data, 12 + index * 4)[0]
    count = struct.unpack_from(">H", data, offset + 4)[0]
    result = bytearray(data[offset : offset + 12])
    result.extend(b"\0" * (count * 16))
    head_offset = None
    for i in range(count):
        tag, checksum, start, length = struct.unpack_from(">4sIII", data, offset + 12 + i * 16)
        new_start = len(result)
        struct.pack_into(">4sIII", result, 12 + i * 16, tag, checksum, new_start, length)
        result.extend(data[start : start + length])
        result.extend(b"\0" * ((-length) % 4))
        if tag == b"head":
            head_offset = new_start
    assert head_offset is not None
    struct.pack_into(">I", result, head_offset + 8, 0)
    checksum = sum(struct.unpack(">" + "I" * (len(result) // 4), result)) & 0xFFFFFFFF
    struct.pack_into(">I", result, head_offset + 8, (0xB1B0AFBA - checksum) & 0xFFFFFFFF)
    return result


def compile_kind(kind, docx, pdf, date_references=None):
    reader = PdfReader(pdf)
    assert len(reader.pages) == 1, "Each retained reference must have exactly one page"
    page = reader.pages[0]
    chars = pdfplumber.open(pdf).pages[0].chars
    fonts = page["/Resources"]["/Font"]
    char_ops = []
    operation_styles = {}
    current_font = None
    state = {"render_mode": 0, "stroke_width": 1.0}
    stack = []
    for index, (args, operator) in enumerate(ContentStream(page.get_contents(), reader).operations):
        if operator == b"q":
            stack.append(dict(state))
        elif operator == b"Q":
            state = stack.pop()
        elif operator == b"Tr":
            state["render_mode"] = int(args[0])
        elif operator == b"w":
            state["stroke_width"] = float(args[0])
        if operator == b"Tf":
            current_font = fonts[args[0]]
        if operator == b"Tj":
            raw = bytes(args[0]) if isinstance(args[0], bytes) else args[0].original_bytes
            count = len(raw) // (2 if current_font["/Subtype"] == "/Type0" else 1)
            char_ops.extend([index] * count)
            operation_styles[index] = dict(state)
        assert operator != b"TJ", "Review the character-operation mapping for this PDF"
    assert len(char_ops) == len(chars), (kind, len(char_ops), len(chars))
    pdf_indices = [index for index, char in enumerate(chars) if not char["text"].isspace()]
    pdf_text = "".join(chars[index]["text"] for index in pdf_indices)
    result = {
        "per_page": 2 if kind == "contract" else 1,
        "page_size": [float(page.mediabox.width), float(page.mediabox.height)],
        "docx_sha256": digest(docx.read_bytes()),
        "pdf_sha256": digest(pdf.read_bytes()),
        "slots": [],
        "foreground": [],
    }
    for image in pdfplumber.open(pdf).pages[0].images:
        if kind == "contract" and image["top"] > 500 and image["width"] > 100:
            operations = ContentStream(page.get_contents(), reader).operations
            result["foreground"].append(
                {
                    "name": image["name"],
                    "x": image["x0"],
                    "y": image["y0"],
                    "width": image["width"],
                    "height": image["height"],
                    "ops": [
                        i
                        for i, (args, op) in enumerate(operations)
                        if op == b"Do" and str(args[0]) == "/" + image["name"]
                    ],
                }
            )
    with ZipFile(docx) as package:
        trees = {
            name: etree.fromstring(package.read(name))
            for name in package.namelist()
            if name == "word/document.xml" or re.fullmatch(r"word/(?:header|footer)\d+\.xml", name)
        }
        source_paragraphs = {}
        for name, tree in trees.items():
            source_paragraphs[name] = tree.xpath("//w:p", namespaces=NS)
        slots = {}

        def add(
            paragraph,
            key,
            *,
            part="word/document.xml",
            after=None,
            value=None,
            end=None,
            width=None,
            align="left",
            lines=1,
            numeric=False,
        ):
            p = source_paragraphs[part][paragraph]
            text_nodes = p.xpath(".//w:t", namespaces=NS)
            text = "".join(n.text or "" for n in text_nodes)
            start = (
                text.index(value) if value is not None else text.index(after) + len(after) if after is not None else 0
            )
            stop = start + len(value) if value is not None else len(text) if end is None else end
            slot_key = (part, paragraph)
            if slot_key not in slots:
                all_nodes = trees[part].xpath("//w:t", namespaces=NS)
                offset = 0
                nodes = []
                for node in text_nodes:
                    nodes.append({"index": all_nodes.index(node), "start": offset, "text": node.text or ""})
                    offset += len(node.text or "")
                slots[slot_key] = {"part": part, "paragraph": paragraph, "source": text, "nodes": nodes, "edits": []}
            slots[slot_key]["edits"].append(
                {
                    "key": key,
                    "start": start,
                    "end": stop,
                    "width": width,
                    "align": align,
                    "lines": lines,
                    "numeric": numeric,
                }
            )

        if kind == "contract":
            for paragraph, key, label, width in [
                (11, "seller_name", "供方：", 274),
                (12, "buyer_name", "需方：", 274),
                (16, "contract_no", "合同编号：", 110),
                (17, "place", "合同履行地点：", 102),
                (18, "date", "签订时间：", 131),
            ]:
                add(paragraph, key, after=label, width=width)
            keys = ("name", "model", "manufacturer", "quantity", "price", "amount")
            widths = (53, 126, 37, 66, 70, 67)
            for row, first in enumerate((35, 42)):
                for column, key in enumerate(keys):
                    add(
                        first + column,
                        f"item{row}_{key}",
                        width=widths[column],
                        align="left" if column < 3 else "center",
                        numeric=key in ("price", "amount", "quantity"),
                    )
            add(41, "delivery", width=66, align="center", lines=2)
            add(50, "total", width=270, numeric=True)
            add(52, "total_upper", width=270)
            terms = [
                (54, "quality", "："),
                (56, "delivery", "："),
                (58, "transport", "："),
                (60, "packaging", "："),
                (62, "acceptance", "："),
                (65, "breach", "："),
                (67, "dispute", "："),
                (69, "effective", "十、"),
            ]
            for paragraph, key, label in terms:
                p = "".join(source_paragraphs["word/document.xml"][paragraph].xpath(".//w:t/text()", namespaces=NS))
                prefix = p[: p.index(label) + len(label)]
                # Keep the source's intentional padding before underlined clauses.
                prefix += p[len(prefix) : len(prefix) + len(p[len(prefix) :]) - len(p[len(prefix) :].lstrip())]
                add(
                    paragraph,
                    "term_" + key,
                    after=prefix,
                    width=494 if key == "effective" else None,
                    lines=2 if key == "acceptance" else 1,
                )
            for index, value in enumerate(("■款到发货", "□月结30天", "□月结60天")):
                add(63, f"payment{index}", value=value, width=92)
            party_keys = ("name", "address", "representative", "agent", "phone", "fax", "bank", "account")
            for side, base in (("seller", 73), ("buyer", 74)):
                for index, key in enumerate(party_keys):
                    paragraph = base + index * 2
                    p = "".join(source_paragraphs["word/document.xml"][paragraph].xpath(".//w:t/text()", namespaces=NS))
                    prefix = p[: p.index("：") + 1]
                    prefix += p[len(prefix) : len(prefix) + len(p[len(prefix) :]) - len(p[len(prefix) :].lstrip())]
                    add(paragraph, f"{side}_{key}", after=prefix, width=None, lines=2 if key == "address" else 1)
        else:
            for paragraph, key, label in [
                (0, "buyer_name", "收件单位（Company）："),
                (1, "sender", "发件人(From)："),
                (2, "recipient", "收件人（To）："),
                (3, "date_cn", "日期(Date)："),
                (4, "buyer_fax", "传真号(Fax No)："),
                (5, "page_label", "页数(Page-Inc this one)："),
                (6, "subject", "主题(Subject)： "),
                (7, "cc", "抄送（CC）："),
            ]:
                add(paragraph, key, after=label)
            add(10, "tax_type", value="未税", width=28)
            for paragraph, key, width in [(15, "name", 103), (16, "model", 101), (17, "price", 60), (18, "note", 123)]:
                add(paragraph, "item0_" + key, width=width, align="center", numeric=key == "price")
            add(21, "term_quote_note", width=449)
            add(23, "seller_agent", value="宋建", width=32)
            add(23, "seller_phone", value="15589233039", width=160)
            add(25, "seller_name", value="南京聚隆科技股份有限公司", width=175)
            add(26, "date_slash", value="2026/10/23", width=110)
            add(0, "seller_name", part="word/header3.xml", value="南京聚隆科技股份有限公司", width=350)
            add(0, "seller_address", part="word/footer3.xml", value="南京高新技术开发区聚龙路8号", width=185)
            add(0, "seller_phone", part="word/footer3.xml", value="15589233039", width=72)
            add(0, "email", part="word/footer3.xml", value="songjian@njjulong.cn", width=134)

        cursors = {}
        for (part, paragraph), slot in sorted(slots.items()):
            text = slot["source"]
            normalized = re.sub(r"\s", "", text)
            cursor = cursors.get(part, 0)
            # The header contains text boxes repeated in the paragraph inventory;
            # match the actual company string rather than duplicated FAX text.
            matching = normalized
            source_offset = 0
            if part.startswith("word/header"):
                edit = slot["edits"][0]
                matching = re.sub(r"\s", "", text[edit["start"] : edit["end"]])
                source_offset = edit["start"]
            found = pdf_text.find(matching, cursor)
            assert found >= 0, (kind, part, paragraph, matching, pdf_text[cursor : cursor + 100])
            cursors[part] = found + len(matching)
            mapping = {}
            number = found
            for index, char in enumerate(text[source_offset:]):
                if not char.isspace():
                    if number >= found + len(matching):
                        break
                    mapping[index + source_offset] = pdf_indices[number]
                    number += 1
            for edit in slot["edits"]:
                selected = [mapping[i] for i in range(edit["start"], edit["end"]) if i in mapping]
                prior = [mapping[i] for i in range(edit["start"]) if i in mapping]
                anchor = chars[selected[0]] if selected else chars[prior[-1]]
                last = chars[selected[-1]] if selected else anchor
                left = anchor["x0"] if selected else anchor["x1"]
                right = last["x1"]
                font = anchor["fontname"].split("+", 1)[-1]
                font_key = FONT_NAMES.get(font)
                assert font_key, (kind, edit["key"], font)
                y = anchor["matrix"][5]
                baselines = sorted({round(chars[i]["matrix"][5], 4) for i in selected}, reverse=True)
                leading = (baselines[0] - baselines[1]) if len(baselines) > 1 else None
                size = round(anchor["size"], 5)
                limit = 557 if kind == "contract" else 556
                if kind == "contract" and paragraph in (35, 36, 37, 42, 43, 44):
                    limit = {35: 108.7, 36: 237.6, 37: 276.8, 42: 108.7, 43: 237.6, 44: 276.8}[paragraph]
                if kind == "contract" and paragraph >= 73:
                    limit = 297 if paragraph % 2 == 1 else 553
                if kind == "quotation" and paragraph <= 7 and part == "word/document.xml":
                    limit = 376 if paragraph % 2 == 0 else 555
                width = edit.pop("width") or limit - left - 2
                if kind == "contract" and paragraph in (35, 36, 37, 42, 43, 44):
                    width = limit - left - 0.5
                edit["lines"] = min(edit["lines"], max(1, len(baselines)))
                x = left
                if edit["align"] == "center":
                    x = (left + right - width) / 2
                elif edit["align"] == "right":
                    x = right - width
                source_ops = sorted(set(char_ops[index] for index in selected))
                for op in source_ops:
                    assert all(
                        i in selected or chars[i]["text"].isspace() for i, v in enumerate(char_ops) if v == op
                    ), (kind, edit["key"], "partial operation")
                # Remove source spaces in the editable region as well.
                if selected:
                    all_indices = range(selected[0], selected[-1] + 1)
                    source_ops = sorted(set(char_ops[i] for i in all_indices))
                underline = False
                p = source_paragraphs[part][paragraph]
                position = 0
                spacing = 0
                bold = False
                for node in p.xpath(".//w:t", namespaces=NS):
                    n = len(node.text or "")
                    if position <= edit["start"] < position + n or edit["start"] == position + n == len(text):
                        run = node.getparent()
                        rpr = run.find("w:rPr", NS)
                        if rpr is not None:
                            sp = rpr.find("w:spacing", NS)
                            spacing = int(sp.get("{" + NS["w"] + "}val")) / 20 if sp is not None else 0
                            b = rpr.find("w:b", NS)
                            bold = b is not None and b.get("{" + NS["w"] + "}val", "1") not in ("0", "false")
                            underline = rpr.find("w:u", NS) is not None
                        break
                    position += n
                edit["pdf"] = {
                    "ops": source_ops,
                    "x": round(x, 5),
                    "y": round(y, 5),
                    "width": round(width, 5),
                    "size": size,
                    "font": font_key,
                    "spacing": spacing,
                    "bold": bold,
                    "underline": underline,
                    "leading": leading or size * 1.2,
                    "next_x": round(
                        chars[
                            next((i for i in selected if round(chars[i]["matrix"][5], 4) < baselines[0]), selected[0])
                        ]["x0"],
                        5,
                    )
                    if len(baselines) > 1 and edit["align"] == "left"
                    else round(x, 5),
                    "next_width": round(
                        limit
                        - chars[
                            next((i for i in selected if round(chars[i]["matrix"][5], 4) < baselines[0]), selected[0])
                        ]["x0"]
                        - 2,
                        5,
                    )
                    if len(baselines) > 1 and edit["align"] == "left"
                    else round(width, 5),
                    "render_mode": operation_styles[char_ops[selected[0] if selected else prior[-1]]]["render_mode"],
                    "stroke_width": operation_styles[char_ops[selected[0] if selected else prior[-1]]]["stroke_width"],
                    "source_bounds": [
                        left,
                        min(chars[i]["top"] for i in selected) if selected else anchor["top"],
                        right,
                        max(chars[i]["bottom"] for i in selected) if selected else anchor["bottom"],
                    ],
                }
                edit["pdf"]["glyphs"] = [
                    {
                        "offset": offset - edit["start"],
                        "text": chars[index]["text"],
                        "op": char_ops[index],
                        "x": round(chars[index]["x0"], 5),
                        "y": round(chars[index]["matrix"][5], 5),
                        "size": round(chars[index]["size"], 5),
                        "font": FONT_NAMES[chars[index]["fontname"].split("+", 1)[-1]],
                        **operation_styles[char_ops[index]],
                    }
                    for offset, index in mapping.items()
                    if edit["start"] <= offset < edit["end"]
                ]
                if edit["key"] == "date_cn":
                    date_match = re.fullmatch(r"([0-9]+)年([0-9]+)月([0-9]+)日", text[edit["start"] : edit["end"]])
                    assert date_match is not None
                    edit["word_edits"] = [
                        {"key": key, "start": edit["start"] + date_match.start(i), "end": edit["start"] + date_match.end(i)}
                        for i, key in enumerate(("date_year", "date_month", "date_day"), 1)
                    ]
                    if date_references is not None:
                        layouts = {}
                        for month, day in ((9, 1), (9, 23), (10, 1), (10, 23)):
                            shape = f"{len(str(month))}-{len(str(day))}"
                            native_pdf = pdf if shape == "2-2" else date_references / f"quotation-date-{shape}.pdf"
                            with pdfplumber.open(native_pdf) as native:
                                native_chars = native.pages[0].chars
                                native_text = "".join(c["text"] for c in native_chars)
                                date_text = f"2026年{month}月{day}日"
                                date_start = native_text.index(date_text)
                                layouts[shape] = [
                                    {
                                        "text": c["text"], "x": round(c["x0"], 5), "y": round(c["matrix"][5], 5),
                                        "size": round(c["size"], 5),
                                        "font": FONT_NAMES[c["fontname"].split("+", 1)[-1]],
                                        "render_mode": edit["pdf"]["render_mode"],
                                        "stroke_width": edit["pdf"]["stroke_width"],
                                    }
                                    for c in native_chars[date_start : date_start + len(date_text)]
                                ]
                        edit["pdf"]["date_layouts"] = layouts
            result["slots"].append(slot)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--references", type=Path, required=True)
    parser.add_argument("--date-references", type=Path)
    args = parser.parse_args()
    target = Path(__file__).parent / "business_templates"
    android = Path(__file__).parent / "android/app/src/main/assets/business_templates"
    target.mkdir(exist_ok=True)
    android.mkdir(exist_ok=True, parents=True)
    kinds = {}
    for kind, docx in [
        ("contract", next(Path("C:/Users/Administrator/Desktop").glob("*TZJP20261021.docx"))),
        ("quotation", Path("C:/Users/Administrator/Desktop/聚隆报价单.docx")),
    ]:
        pdf = args.references / f"{kind}-reference.pdf"
        kinds[kind] = compile_kind(kind, docx, pdf, args.date_references)
        shutil.copyfile(docx, target / f"source-{kind}.docx")
        shutil.copyfile(pdf, target / f"source-{kind}.pdf")
        print(kind, "slots", len(kinds[kind]["slots"]), "edits", sum(len(s["edits"]) for s in kinds[kind]["slots"]))
    fonts = {
        "song": ("simsun.ttc", 0),
        "hei": ("simhei.ttf", None),
        "kai": ("simkai.ttf", None),
        "arial": ("arial.ttf", None),
        "arial-bold": ("arialbd.ttf", None),
        "arial-narrow-bold": ("ARIALNB.TTF", None),
    }
    for name, (filename, number) in fonts.items():
        path = Path("C:/Windows/Fonts") / filename
        if number is not None:
            (target / f"source-font-{name}.ttf").write_bytes(ttc_face(path.read_bytes(), number))
        else:
            shutil.copyfile(path, target / f"source-font-{name}.ttf")
    manifest = {"schema": 1, "kinds": kinds}
    (target / "source-layout.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    for asset in target.glob("source-*"):
        shutil.copyfile(asset, android / asset.name)
    print("Shared source assets written; retained originals were read only")


if __name__ == "__main__":
    main()
