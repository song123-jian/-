# 桌面源码公开快照测试交接

实际对象：2026-10-18 Windows 桌面源码上传副本，入口 source/desktop_main.py；依赖 source/desktop-requirements.lock.txt。

本轮验证：复制文件与原文件 SHA256 一致；空白 seed 和配置示例可解析；Python 源文件仅做 AST 语法检查；ZIP 条目和 SHA256 与清单一致；敏感配置、真实报价、私有模板、安卓、业务库和缓存排除。上传提交结果以仓库实际提交为准。

复用结果：原项目审查记录 447 tests passed、compileall 退出 0；Ruff 3 个 I001 未修复。本轮不重跑测试，不把静态语法/归档校验当作真实功能验收。

尚未完成验证：公开副本的真实 Supabase、单据模板、全量构建和界面功能；需要用户自己的配置及资源。原始项目验证记录保留于本机。
