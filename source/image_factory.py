"""Controlled Chinese quotation images for isolated source/EXE acceptance."""
import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def quote_image(*, customer="图片验收客户", grade="PA12-01", price="9.734513", date="2026-09-30", dual_tax=False):
    lines = ["原材料报价", f"客户名称：{customer}", f"牌号：{grade}", "产品名称：PA12",
             "材料/颜色：PA12 黑色", f"未税单价：{price}"]
    if dual_tax:
        lines.append("含税单价：11.000000")
    if date:
        lines.append(f"报价日期：{date}")
    lines.extend(("数量：1000", "总金额：9734.513"))
    font_path = Path("C:/Windows/Fonts/msyh.ttc")
    if not font_path.is_file():
        raise RuntimeError("Chinese image acceptance requires Microsoft YaHei on Windows")
    font = ImageFont.truetype(str(font_path), 32)
    image = Image.new("RGB", (1100, len(lines) * 58 + 48), "white")
    draw = ImageDraw.Draw(image)
    for index, text in enumerate(lines):
        draw.text((28, 20 + index * 58), text, font=font, fill="#111111")
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()
