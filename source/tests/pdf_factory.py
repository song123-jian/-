"""Generate independent PDF fixtures with real Chinese text and table geometry."""
import io

from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle


def quotation_pdf(pages=None, *, grid=True, metadata=(), encrypt=None, image_only=False):
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    stream = io.BytesIO()
    writer = canvas.Canvas(stream, pagesize=(900, 700), encrypt=encrypt)
    pages = pages or [[["客户", "材料规格", "材料名称", "颜色", "价格（元/kg）", "报价日期", "税口径", "备注"],
                       ["PDF隔离客户", "QA-PP", "PP-TD20", "黑色", "9.734513", "2026-09-23", "未税", "PDF真实文本"]]]
    for rows in pages:
        if image_only:
            # A page image without a PDF text layer.
            from PIL import Image
            from reportlab.lib.utils import ImageReader
            writer.drawImage(ImageReader(Image.new("RGB", (100, 100), "white")), 40, 400)
        else:
            writer.setFont("STSong-Light", 11)
            writer.drawString(40, 660, "材料报价单")
            for index, line in enumerate(metadata):
                writer.drawString(40, 635 - index * 16, line)
        if rows and not image_only:
            table = Table(rows, colWidths=[820 / len(rows[0])] * len(rows[0]))
            style = [("FONT", (0, 0), (-1, -1), "STSong-Light", 10),
                     ("LEADING", (0, 0), (-1, -1), 14), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                     ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]
            if grid:
                style.append(("GRID", (0, 0), (-1, -1), 0.5, colors.black))
            table.setStyle(TableStyle(style))
            _, height = table.wrapOn(writer, 820, 600)
            table.drawOn(writer, 40, 560 - height)
        writer.showPage()
    writer.save()
    return stream.getvalue()
