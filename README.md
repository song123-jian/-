# 价格查询桌面端

桌面端源码快照和代码审查文档，2026-10-18。

## 文件

- [桌面端源码-20261018.zip](桌面端源码-20261018.zip)：解压后保留 source、docs 和配置示例目录结构。
- [桌面端代码审查总结](桌面端代码审查总结-20261018.md)：问题证据、影响和优先级。
- [桌面端临时数据清理记录](桌面端临时数据清理记录-20261018.md)：本地待删文件归集结果。
- [UPLOAD_MANIFEST.json](UPLOAD_MANIFEST.json)：上传内容、排除范围和 SHA256。

## 本地运行

使用 Windows 与 Python 3.13，创建虚拟环境，并安装 source/desktop-requirements.lock.txt。

将 source/account_config.example.json 复制为 source/account_config.json，填写自己的 Supabase 项目地址和 publishable key，再运行 python source/desktop_main.py。源码包内 seed.json 为空白模板，不含原项目真实报价。单据导出所需的四张私有模板图片需在本机自行准备，详见 source/business_templates/README.md。

构建入口为 source/build.ps1。原审查记录：447 个桌面测试通过，compileall 通过；Ruff 仍有 3 个 I001，尚未整改。本次仅整理上传，未对公开副本执行完整构建或功能验收，不能将上传成功视为程序发布验收通过。

本仓库不含安卓代码、APK、EXE、本地数据库、账号凭据、生产配置、真实报价种子、印章/银行信息图片、缓存或“可以删除文件”目录。原项目文件未修改。
