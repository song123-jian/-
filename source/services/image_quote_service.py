"""Bounded local image decoding and lazy CPU OCR, with no image uploads."""
from __future__ import annotations

import io
import threading
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from domain import MAX_FILE_BYTES, ValidationError, today
from image_importer import OcrToken, extract_quotes

MAX_IMAGE_PIXELS = 24_000_000
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".bmp", ".webp"}
IMAGE_FORMATS = {"PNG", "JPEG", "BMP", "WEBP"}
_ENGINE = None
_ENGINE_LOCK = threading.Lock()


def load_image(source):
    if "path" in source:
        path = Path(source["path"])
        if path.suffix.lower() not in IMAGE_SUFFIXES or not path.is_file():
            raise ValidationError("请选择 PNG、JPG、BMP 或 WebP 图片")
        with path.open("rb") as handle:
            content = handle.read(MAX_FILE_BYTES + 1)
        filename = path.name[:250]
    else:
        content = source.get("content", b"")
        filename = "截图.png"
    if not isinstance(content, bytes) or not 0 < len(content) <= MAX_FILE_BYTES:
        raise ValidationError("图片须大于0且不超过20 MB，请截图报价明细区域")
    try:
        with Image.open(io.BytesIO(content)) as original:
            if original.format not in IMAGE_FORMATS:
                raise ValidationError("请选择 PNG、JPG、BMP 或 WebP 图片")
            if original.width * original.height > MAX_IMAGE_PIXELS:
                raise ValidationError("图片超过2400万像素，请缩小或截图报价明细区域")
            image = ImageOps.exif_transpose(original).convert("RGBA")
            background = Image.new("RGBA", image.size, "white")
            background.alpha_composite(image)
            image = background.convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ValidationError("图片无法读取，请重新截图或另存为PNG/JPG") from None
    return image, filename


def recognize_image(source, *, selected_customer="", default_date=None, cancelled=None):
    default_date = default_date or today()
    image, filename = load_image(source)
    if cancelled is not None and cancelled.is_set():
        raise ValidationError("已取消图片识别")
    global _ENGINE
    with _ENGINE_LOCK:
        if cancelled is not None and cancelled.is_set():
            raise ValidationError("已取消图片识别")
        if _ENGINE is None:
            import rapidocr
            from rapidocr import RapidOCR

            models = Path(rapidocr.__file__).resolve().parent / "models"
            paths = {"Det.model_path": models / "PP-OCRv6_det_small.onnx",
                     "Rec.model_path": models / "PP-OCRv6_rec_small.onnx",
                     "Cls.model_path": models / "ch_ppocr_mobile_v2.0_cls_mobile.onnx"}
            if not all(path.is_file() for path in paths.values()):
                raise ValidationError("图片识别模型缺失，请重新安装完整程序")
            _ENGINE = RapidOCR(params={**{key: str(path) for key, path in paths.items()},
                                      "Global.log_level": "error", "Global.text_score": .3,
                                      "EngineConfig.onnxruntime.intra_op_num_threads": 2,
                                      "EngineConfig.onnxruntime.inter_op_num_threads": 1})
        import numpy as np

        output = _ENGINE(np.asarray(image))
    if cancelled is not None and cancelled.is_set():
        raise ValidationError("已取消图片识别")
    if output.boxes is None or not output.txts:
        raise ValidationError("图片没有可识别的文字，请选择清晰的报价截图")
    tokens = []
    for box, text, score in zip(output.boxes, output.txts, output.scores):
        points = list(box)
        tokens.append(OcrToken(text, min(float(point[0]) for point in points), min(float(point[1]) for point in points),
                               max(float(point[0]) for point in points), max(float(point[1]) for point in points), float(score)))
    result = extract_quotes(tokens, filename, selected_customer=selected_customer, default_date=default_date)
    preview = image.copy()
    preview.thumbnail((2400, 2400))
    buffer = io.BytesIO()
    preview.save(buffer, format="PNG")
    result.update(filename=filename, preview_png=buffer.getvalue())
    return result
