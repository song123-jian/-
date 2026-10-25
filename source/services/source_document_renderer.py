"""Preserve retained source pages and replace only declared business fields."""

from __future__ import annotations

import copy
import hashlib
import io
import json
from decimal import Decimal, InvalidOperation
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ByteStringObject, ContentStream, FloatObject, NameObject
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from domain import ValidationError


class SourceDocumentRenderer:
    def __init__(self, assets, kind):
        self.assets = Path(assets)
        self.kind = kind
        try:
            manifest = json.loads((self.assets / "source-layout.json").read_text(encoding="utf-8"))
            if manifest["schema"] != 1:
                raise ValueError("template schema")
            self.layout = manifest["kinds"][kind]
            self.reference = (self.assets / f"source-{kind}.pdf").read_bytes()
            self.word_reference = (self.assets / f"source-{kind}.docx").read_bytes()
            for data, key in ((self.reference, "pdf_sha256"), (self.word_reference, "docx_sha256")):
                if hashlib.sha256(data).hexdigest() != self.layout[key]:
                    raise ValueError("template hash")
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise ValidationError("原件单据模板缺失或已损坏，请恢复本版完整模板文件") from exc

    def pages(self, document):
        from services.business_document_service import chinese_date, item_amount, number_text, rmb_upper

        per_page = self.layout["per_page"]
        groups = [document["items"][i : i + per_page] for i in range(0, len(document["items"]), per_page)]
        pages = []
        for page, items in enumerate(groups, 1):
            values = dict(document["fields"])
            values.update({"term_" + key: value for key, value in document["terms"].items()})
            values.update(
                date_cn=chinese_date(values["date"]),
                date_year=values["date"].split("-")[0],
                date_month=str(int(values["date"].split("-")[1])),
                date_day=str(int(values["date"].split("-")[2])),
                date_slash="/".join(str(int(n)) for n in values["date"].split("-")),
                page=str(page),
                pages=str(len(groups)),
                page_label=str(len(groups)),
            )
            for index, label in enumerate(("款到发货", "月结30天", "月结60天")):
                values[f"payment{index}"] = ("■" if document["payment"] == label else "□") + label
            deliveries = []
            for index in range(per_page):
                item = items[index] if index < len(items) else {}
                for key in ("name", "model", "manufacturer", "quantity", "price", "note", "delivery"):
                    values[f"item{index}_{key}"] = item.get(key, "")
                values[f"item{index}_amount"] = (
                    format(item_amount(item), ".2f") if item and self.kind == "contract" else ""
                )
                delivery = item.get("delivery", "").replace("\n", "")
                if delivery and delivery not in deliveries:
                    deliveries.append(delivery)
            values["delivery"] = "\n".join(deliveries)
            total = sum((item_amount(item) for item in items), Decimal(0)) if self.kind == "contract" else Decimal(0)
            values.update(total=number_text(total), total_upper=rmb_upper(total))
            pages.append(values)
        return pages

    @staticmethod
    def value(slot, edit, values):
        source = slot["source"][edit["start"] : edit["end"]]
        result = values.get(edit["key"], "")
        if edit.get("numeric") and result and source:
            try:
                if Decimal(result) == Decimal(source):
                    return source
            except InvalidOperation:
                pass
        return result

    def font(self, key):
        name = "SourceDocument-" + key
        if name not in pdfmetrics.getRegisteredFontNames():
            try:
                pdfmetrics.registerFont(TTFont(name, str(self.assets / f"source-font-{key}.ttf")))
            except (OSError, ValueError) as exc:
                raise ValidationError("原件单据字体无法读取，请恢复本版字体资源") from exc
        return name

    def glyph(self, char, style):
        key = style["font"]
        name = self.font(key)
        if ord(char) not in pdfmetrics.getFont(name).face.charToGlyph:
            name = self.font("song")
        if ord(char) not in pdfmetrics.getFont(name).face.charToGlyph:
            raise ValidationError("单据包含原件字体无法显示的字符，请修改后导出")
        return name, pdfmetrics.stringWidth(char, name, style["size"])

    def lines(self, value, edit):
        style = edit["pdf"]
        lines = []
        row = []
        width = 0.0
        for char in value.replace("\r\n", "\n").replace("\r", "\n").replace("\t", " "):
            if char == "\n":
                lines.append((row, width))
                row = []
                width = 0
                continue
            font, advance = self.glyph(char, style)
            spacing = style["spacing"] if row else 0
            limit = style["width"] if not lines else style["next_width"]
            if row and width + spacing + advance > limit + 0.01:
                lines.append((row, width))
                row = []
                width = 0
                spacing = 0
            row.append((char, font, advance))
            width += spacing + advance
        lines.append((row, width))
        if len(lines) > edit["lines"] or any(
            width > (style["width"] if i == 0 else style["next_width"]) + 0.01 for i, (_, width) in enumerate(lines)
        ):
            raise ValidationError("单据字段内容过长，原件字号及位置放不下，请缩短或拆分单据")
        return lines

    def changes(self, values):
        changes = []
        for slot in self.layout["slots"]:
            for edit in slot["edits"]:
                value = self.value(slot, edit, values)
                if value != slot["source"][edit["start"] : edit["end"]]:
                    source = slot["source"][edit["start"] : edit["end"]]
                    glyphs = edit["pdf"].get("glyphs", [])
                    if edit["key"] == "date_cn" and len(value) != len(source):
                        shape = f"{len(values['date_month'])}-{len(values['date_day'])}"
                        glyphs = edit["pdf"].get("date_layouts", {}).get(shape, [])
                        if len(glyphs) != len(value):
                            raise ValidationError("原件日期排版资源缺失或日期超出模板范围，请核对日期与模板")
                        for index, (glyph, char) in enumerate(zip(glyphs, value)):
                            small = copy.deepcopy(edit)
                            small.update(align="left", lines=1)
                            small["pdf"].update(glyph, ops=edit["pdf"]["ops"] if index == 0 else [], spacing=0)
                            changes.append((small, self.lines(char, small)))
                        continue
                    fine = (
                        len(value) == len(source) == len(glyphs)
                        and all(g["offset"] == i for i, g in enumerate(glyphs))
                        and len({g["op"] for g in glyphs}) == len(glyphs)
                    )
                    if fine:
                        for glyph, char in zip(glyphs, value):
                            original_font, original_width = self.glyph(glyph["text"], glyph)
                            new_font, new_width = self.glyph(char, glyph)
                            if original_font != new_font or abs(original_width - new_width) > 0.001:
                                fine = False
                                break
                    if fine:
                        for glyph, char in zip(glyphs, value):
                            if char == glyph["text"]:
                                continue
                            small = copy.deepcopy(edit)
                            small.update(align="left", lines=1)
                            small["pdf"].update(glyph, ops=[glyph["op"]], spacing=0)
                            changes.append((small, self.lines(char, small)))
                    else:
                        changes.append((edit, self.lines(value, edit)))
        return changes

    def _compact_contract_row(self, stream, values):
        if self.kind != "contract" or any(value.strip() for key, value in values.items() if key.startswith("item1_")):
            return 0
        delivery = next(edit for slot in self.layout["slots"] for edit in slot["edits"] if edit["key"] == "delivery")
        height = 31.4 if len(self.lines(values["delivery"], delivery)) > 1 else 22.9
        shift = 38.9 - height
        removed = 0
        # Coordinates belong to the hash-checked source PDF, whose content uses top-down units.
        for index, (operands, operator) in enumerate(stream.operations):
            if operator == b"S" and index >= 2:
                prior = stream.operations[max(0, index - 6) : index]
                move = next((op for op in reversed(prior) if op[1] == b"m"), None)
                line = next((op for op in reversed(prior) if op[1] == b"l"), None)
                if move and line and move[0][0] == 52.63 and line[0][0] == 486.42 and all(abs(float(op[0][1]) - 242.57) < 0.001 for op in (move, line)):
                    stream.operations[index] = ([], b"n")
                    removed += 1
            positions = {b"Tm": (5,), b"m": (1,), b"l": (1,), b"re": (1,)}.get(operator, ())
            if operator == b"cm" and float(operands[3]) != -1:
                positions = (5,)
            for position in positions:
                if float(operands[position]) >= 258.45 - 0.001:
                    operands[position] = FloatObject(round(float(operands[position]) - shift, 5))
            if operator == b"re" and abs(float(operands[1]) - 219.55) < 0.001 and 22 < float(operands[3]) < 40:
                operands[3] = FloatObject(height)
        if removed != 1:
            raise ValidationError("原件商品行定位已失效，请恢复完整模板")
        return shift

    def render(self, document):
        pages = self.pages(document)
        all_changes = [self.changes(values) for values in pages]
        if len(pages) == 1 and not all_changes[0]:
            return self.reference
        writer = PdfWriter()
        for values, changes in zip(pages, all_changes):
            reader = PdfReader(io.BytesIO(self.reference))
            page = writer.add_page(reader.pages[0])
            stream = ContentStream(page.get_contents(), writer)
            for edit, _ in changes:
                for index in edit["pdf"]["ops"]:
                    operands, operator = stream.operations[index]
                    if operator != b"Tj":
                        raise ValidationError("原件字段定位已失效，请恢复完整模板")
                    stream.operations[index] = ([ByteStringObject(b"")], operator)
            foreground = self.layout["foreground"]
            for image in foreground:
                for index in image["ops"]:
                    stream.operations[index] = ([], b"n")
            shift = self._compact_contract_row(stream, values)
            page.replace_contents(stream)
            overlay = io.BytesIO()
            pdf = canvas.Canvas(overlay, pagesize=self.layout["page_size"], pageCompression=1)
            for edit, lines in changes:
                pdf.saveState()
                style = edit["pdf"]
                for line_index, (glyphs, width) in enumerate(lines):
                    x = style["x"] if line_index == 0 else style["next_x"]
                    if edit["align"] == "center":
                        x += (style["width"] - width) / 2
                    elif edit["align"] == "right":
                        x += style["width"] - width
                    y = style["y"] - line_index * style["leading"]
                    if self.layout["page_size"][1] - style["y"] >= 258.45:
                        y += shift
                    for index, (char, font, advance) in enumerate(glyphs):
                        text = pdf.beginText(round(x, 3), round(y, 3))
                        text.setFont(font, style["size"])
                        text.setTextRenderMode(style["render_mode"])
                        pdf.setLineWidth(style["stroke_width"])
                        text.textOut(char)
                        pdf.drawText(text)
                        x += advance + (style["spacing"] if index < len(glyphs) - 1 else 0)
                pdf.restoreState()
            pdf.showPage()
            pdf.save()
            page.merge_page(PdfReader(io.BytesIO(overlay.getvalue())).pages[0])
            if foreground:
                contents = ContentStream(page.get_contents(), writer)
                for image in foreground:
                    contents.operations.extend(
                        [
                            ([], b"q"),
                            (
                                [
                                    FloatObject(v)
                                    for v in (image["width"], 0, 0, image["height"], image["x"], image["y"] + shift)
                                ],
                                b"cm",
                            ),
                            ([NameObject("/" + image["name"])], b"Do"),
                            ([], b"Q"),
                        ]
                    )
                page.replace_contents(contents)
        writer.add_metadata({"/Title": document["fields"]["buyer_name"], "/Author": document["fields"]["seller_name"]})
        output = io.BytesIO()
        writer.write(output)
        return output.getvalue()

    def render_word(self, document):
        from services.source_document_docx import build_docx

        pages = self.pages(document)
        for values in pages:
            self.changes(values)
        return build_docx(self.word_reference, self.layout["slots"], pages)
