# 第三方组件许可说明

客户价格查询 1.6.0 使用 Python 3.13.14、PySide6 / Qt 6.8.3、Shiboken6 6.8.3 和 Lucide 图标。PyInstaller 6.22.3 用于构建 Windows EXE。1.6.0布局与补填升级没有增加运行依赖，沿用1.5.0内置OCR模型。

PySide6、Shiboken6 及所用 Qt Core、Gui、Widgets、Network、SVG、Test 模块采用相应发行版提供的 LGPL / GPL 或商业许可。随包保留 LGPLv3、GPLv2、GPLv3 及 Qt 商业许可说明。程序以动态 DLL 方式加载 Qt；EXE 的临时资源目录含 Qt DLL，完整应用源码和构建脚本随交付提供，可使用兼容的修改版 Qt 重新构建。第三方组件的许可不限制其允许的修改、重新链接或为调试这些修改而进行的逆向工程。

Qt 源码与组件细分许可：

- https://download.qt.io/archive/qt/6.8/6.8.3/single/
- https://code.qt.io/cgit/qt/qtbase.git/tree/LICENSES?h=v6.8.3
- https://code.qt.io/cgit/pyside/pyside-setup.git/tree/?h=v6.8.3
- https://doc.qt.io/qt-6.8/licenses-used-in-qt.html
- https://www.qt.io/licensing/open-source-lgpl-obligations

Lucide 为 ISC 许可，文本位于 `LUCIDE-LICENSE.txt`。Python 的 PSF 许可及其内含第三方声明位于 `PYTHON-LICENSE.txt`；Python 源码可从 https://www.python.org/downloads/release/python-31314/ 获取。PyInstaller 许可和 bootloader 例外位于 `PYINSTALLER-LICENSE.txt`，项目地址 https://pyinstaller.org/。

Qt 内含的第三方组件仍依各自许可发布，细分许可目录见 `qt-third-party`。许可证和原始来源应随程序分发保留。本文件只记录本次交付的组件与来源。

1.2.0文字表格PDF导入增加pdfplumber、pdfminer.six及其依赖Pillow、pypdfium2/PDFium、cryptography、cffi、pycparser、charset-normalizer。对应发行版许可及PDFium内含第三方许可完整复制于 `pdf-import`，版本清单为其中的versions.json。ReportLab仅用于生成自动化PDF测试夹具，源代码测试和许可随包提供。

原始项目：https://github.com/jsvine/pdfplumber 、https://github.com/pdfminer/pdfminer.six 、https://github.com/python-pillow/Pillow 、https://github.com/pypdfium2-team/pypdfium2 、https://pdfium.googlesource.com/pdfium/ 、https://github.com/pyca/cryptography 、https://cffi.readthedocs.io/ 、https://github.com/eliben/pycparser 、https://github.com/jawah/charset_normalizer 、https://www.reportlab.com/ 。

1.5.0图片报价识别使用 RapidOCR 3.10.0、ONNX Runtime 1.31.0 CPU、NumPy、OpenCV、OmegaConf、Pyclipper、Shapely及相关依赖。17个新增依赖的发行版原许可和第三方声明位于 `image-ocr`，包括 ONNX Runtime ThirdPartyNotices、NumPy内含组件、OpenCV第三方和Shapely/GEOS声明；版本、来源和许可文件哈希见 `image-ocr/versions.json`。FlatBuffers发行版未携带独立许可文本，另保留其声明的Apache-2.0官方许可文本。

EXE随附三个未经本项目修改的RapidOCR默认ONNX模型：PP-OCRv6_det_small、PP-OCRv6_rec_small、ch_ppocr_mobile_v2.0_cls_mobile。模型版权属于百度和/或PaddleOCR相应权利人，按Apache-2.0分发。完整归属与转换来源见 `image-ocr/rapidocr/rapidocr-3.10.0.dist-info/licenses/MODEL_LICENSES.md`，实际字节大小与SHA256见 `image-ocr/models.json`，已与上游发行版声明一致。运行时明确使用随包模型，不下载模型、不上传报价图片；操作系统中的微软雅黑字体未复制分发。

项目来源：https://github.com/RapidAI/RapidOCR 、https://github.com/microsoft/onnxruntime 、https://github.com/PaddlePaddle/PaddleOCR 。
