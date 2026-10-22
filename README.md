# 价格查询桌面端

Windows 桌面端源码、安装包、独立 EXE、快捷启动文件和验收资料。当前公开上传版本为 **1.7.8 / installer r9**。本仓库本次只做文件归档和远端同步，不替代正式安装验收、业务上线审批或生产发布。

## 下载

- [工作-1.7.8-r9-Setup.exe](工作-1.7.8-r9-Setup.exe)：Inno Setup 安装包，Git LFS 管理。
- [工作-1.7.8.exe](工作-1.7.8.exe)：独立便携 EXE，Git LFS 管理。
- [工作快捷启动.lnk](工作快捷启动.lnk)：当前电脑生成的快捷方式，仅记录本机绝对路径，换电脑或换目录后请用 `source/update_portable_shortcut.ps1` 重新生成。
- [工作图标.ico](工作图标.ico) 和 [工作-1.7.8-r9-Setup.release.json](工作-1.7.8-r9-Setup.release.json)：图标与发布元数据。

GitHub 网页端显示的大型二进制由 Git LFS 提供。克隆后请确认已安装 Git LFS，并执行 `git lfs pull`。

## 源码和资料

- `source/`：桌面端源码、安装器、测试、迁移和公开配置示例。
- `docs/`：实施方案、代码审查、安装卸载方案和项目交接记录。
- `work/`：已授权公开的非敏感构建/验收资料、业务模板、合同/报价单 PDF 样例、图像和对应发布副本。
- [UPLOAD_MANIFEST-20261023.json](UPLOAD_MANIFEST-20261023.json)：本次文件范围、SHA256、排除项和安全检查摘要。
- [UPLOAD_MANIFEST.json](UPLOAD_MANIFEST.json)：远端保留的 2026-10-18 源码快照清单。

## 本地运行

使用 Windows 与 Python 3.13，创建虚拟环境，并安装 `source/desktop-requirements.lock.txt`。将 `source/account_config.example.json` 复制为本机未提交的 `source/account_config.json`，填写自己的 Supabase 项目地址和 publishable key，再运行 `python source/desktop_main.py`。`source/seed.json` 和 `source/account_seed.json` 是空白模板，不含真实报价。

构建入口为 `source/build.ps1`，安装器入口为 `source/build_installer.ps1`。发布元数据仍为 `verificationStatus=not_run`，正式 AppId 安装验收未在本次上传中重跑；历史验收记录和限制见 `docs/` 与 `work/`。

## 公开范围和排除项

用户已明确授权公开现有安装包、EXE、快捷方式、合同印章/业务模板及验收资料。真实账户、密码、MES 登录资料、Supabase 密钥、`data/` 本机数据、虚拟环境、`.build/` 构建中间物、缓存和本机凭据不上传。公开仓库中的业务样例应按公开资料处理，不得当作生产数据。
