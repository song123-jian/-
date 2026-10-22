# Windows 安装与卸载

## 当前方案

默认安装器使用 Inno Setup 6 原生安装卸载。当前候选为应用 1.7.7、安装器修订 r8，使用单用户 HKCU 登记，不提权；旧安装器源码和构建脚本保留在 `SetupBootstrap.cs`、`install.ps1`、`uninstall.ps1` 与 `build_legacy_installer.ps1`，仅供历史包和兼容测试，不再作为默认构建路径。

候选包：`工作-1.7.7-r8-Setup.exe`（根目录）及 `work/release-native-installer-1.7.7-r8/工作-1.7.7-r8-Setup.exe`。SHA256：`9AE4B1F892C5D8003B9352ECC86FA0C2B42E562185DCA15AB1B6DBDCFE88FA91`。应用载荷 SHA256：`CF46B35253EDFD83F495F1E1B4A64097FCF19F91E1528CA23932D71069A3B57B`。发布记录在 `工作-1.7.7-r8-Setup.release.json`，`verificationStatus=not_run`：r8 未以正式 AppId 安装，随机 QA AppId 的验收不能替代正式登记验收。r6 的现场限制仍见[安装卸载替换方案与验收](../../docs/安装卸载方案-20261022.md)。

## 构建

运行 `source/build.ps1` 默认生成 `work/release-work-<VERSION>/工作.exe` 并运行完整测试门禁；安装器默认从同版本目录取载荷，输出 `work/release-native-installer-<VERSION>-<修订号>`。需要独立输出目录时可显式传参：

```powershell
powershell.exe -NoProfile -File source/build_installer.ps1 `
  -ApplicationExe <已验收的工作.exe> `
  -OutputDirectory <新的发布目录> `
  -InstallerRevision r8
```

构建器默认读取 `.build/toolchain/inno-6.7.3/compiler/ISCC.exe`，也可通过 `-CompilerPath` 或 `PRICEQUERY_ISCC` 指定；正式构建要求同目录存在且内容哈希、版本、入口相符的 `build-verification.json`。它拒绝覆盖已有包或发布记录，先把 Setup 和清单写入唯一临时文件，再同目录改名发布；若第二个文件提交失败，会撤回本次新建的 Setup。相邻 `.release.json` 记录应用版本、载荷及安装包 SHA256；构建初始状态为 `verificationStatus=not_run`，只有完成相应实际验收后才更新验证状态。测试包可用 `-TestIdentity qa-<32位小写十六进制>` 建立隔离 AppId，不能冒充正式包。

安装器由 Inno Setup 6.7.3 编译器构建。按用户明确要求，本次 Setup 不做代码签名；Windows 可能显示“未知发布者”或 SmartScreen 提示。不要在应用包中放置服务密钥或用户私密配置。

## 安装

双击安装包，接受许可条款，在“选择目标位置”页输入目录或通过“浏览”选择。默认目录为 `%LOCALAPPDATA%\Programs\PriceQueryDesktop`；支持本地固定或可移动磁盘以及中文、空格和 `&`。无需管理员权限。安装目录必须是专用可写目录：空目录，或仅含普通目录 `data` 的目录。会拒绝网络路径、盘符根目录、Windows/Program Files/ProgramData、链接或联接路径、保留设备名、非法尾随点/空格和超过 200 字符的路径。

安装会创建开始菜单“工作桌面端”中的“工作”和“卸载工作”，并以 `PriceQueryDesktop_is1` 写入当前用户的标准 Windows 卸载登记。快捷方式、`InstallLocation`、`UninstallString` 与 `QuietUninstallString` 均引用选择的实际路径。桌面快捷方式是可选任务，默认关闭。

## 便携启动

当前便携版为根目录 `工作-1.7.7.exe`；`工作快捷启动.lnk` 指向该文件，工作目录为 EXE 所在目录，使用 EXE 同级 `data`，不带额外参数。通过 `source/update_portable_shortcut.ps1` 更新时，会先写入并回读临时快捷方式，确认目标、工作目录、参数和图标后再原子替换。

已有本产品登记时仅允许对登记路径原位重装，并要求 `install-info.ini` 产品归属标记与原生卸载器均存在；更换目录前先卸载旧版本。发现活跃旧 C#/PowerShell 安装会停止安装并保留旧数据，防止新旧卸载入口交叉删除。失效旧登记不会被安装器自动清除。不得直接移动安装目录，也不会跨目录自动迁移 `data`。

## 卸载与数据

优先通过 Windows“已安装的应用”或“程序和功能”中的应用条目卸载；也可从开始菜单“工作桌面端 > 卸载工作”启动。原生卸载器校验安装路径归属并检测正在运行/占用的 EXE；遇到运行或归属不匹配时会停止。交互卸载会询问“是否保留个人资料（data 文件夹）”：选择“是”保留，选择“否”删除 `data`；安装目录内其他非受管个人文件始终保留。删除前会递归检查目录链接，属性读取或目录枚举失败、发现联接点/符号链接时均保留整份 `data`。静默卸载默认保留；只有显式传入 `/PURGEDATA` 才请求删除，并执行同样的路径保护检查。

迁移目录前，先退出应用、备份 `data`、记录当前目录，再使用旧安装自己的卸载入口；确认数据留存后安装到新目录。不要同时运行两个安装器，也不要手工删除卸载登记来绕过归属检查。卸载程序缺失或系统登记指向不存在路径时，暂停操作并先备份注册表项与快捷方式信息，按[替换方案](../../docs/安装卸载方案-20261022.md)中的恢复流程处理。

## 最新验收

Windows 11 x64 Build 26200 上，应用 1.7.7 完整构建测试为 538 passed，报告见 `.build/desktop-0dd15a93265d48f18bc053fd6c1a2bd4/tests.xml`。冻结 EXE 通过隔离 SQLite 桌面壳 smoke；另用临时 Windows Shell 快捷方式启动同一 EXE，5 项托盘/导航/关闭恢复/退出检查通过，数据均位于 `.build/portable-release-1.7.7/`。

r8 随机 QA AppId 安装包使用同一 1.7.7 EXE 载荷完成安装、登记/快捷方式哈希核对、实际 EXE smoke 及静默卸载；安装文件、菜单和登记清除，合成 `data` 卸载前后哈希一致。证据见 `.build/portable-release-1.7.7/verification.json` 和 `installed-exe-smoke/report/report.json`。原生安装器回归 21 项通过，报告为 `.build/portable-release-1.7.7/native-installer-tests.xml`。这些 QA 身份结果不等同于正式 AppId 安装；正式包仍为 `verificationStatus=not_run`，Windows 设置列表可见性与既有正式登记不确定状态未触碰。

## 历史验收状态

旧版 r6 自动化原生安装器集成测试：`.build/native-install-qa-20261022/native-installer-tests-after-publication.xml`，15 项通过，覆盖中文/空格/符号路径、原位重装、改目录拒绝、错误路径、链接路径、占用保护、注册及卸载后数据保留；该轮同时回归了临时文件发布和不覆盖已有包。旧构建入口的 15 个路径兼容测试见 `.build/native-install-qa-20261022/legacy-path-tests.xml`，使用 `build_legacy_installer.ps1`。

正式 r6 已在 Windows 11 x64 的临时 D 盘目录通过真实向导安装；已核对所选路径、载荷哈希、HKCU 登记、开始菜单两个快捷方式和实际安装 EXE 的 5 项 Qt 桌面壳验收。独立 QA AppId 的同一原生卸载代码另有 0 退出、清除登记/程序/菜单并保留 `data` 和个人文件哈希的实测记录。

但正式 r6 的那次 Shell 快捷方式启动出现“操作已被用户取消”，之后观察到安装文件消失而卸载登记仍在；Windows 设置与控制面板筛选也未能显示该正式条目。原因未确定，正式包完整卸载、系统应用列表可见性与数据保留因此仍为**未完成验证**。已恢复本次纯合成 QA 标记文件并保留其哈希；不得把隔离 AppId 测试结果替代为正式 r6 安装/卸载全通过。

旧登记 `PriceQueryDesktop` 仍指向 `D:\PriceQuery-QA-20261020-0949\工作 安装`，但该目录及其原 data 在本轮开始前已不存在，旧开始菜单链接仍残留且失效。清理请求被执行策略拒绝后已停止重试，未通过脚本或其他工具绕过。

应用打包与运行验收是另一条证据链。`--smoke-test` 必须同时传入独立 `--data-dir`，严禁使用安装目录默认 `data`；业务云/MES/账号或真实数据链路不会因安装器测试通过而自动获得通过结论。

应用配置内嵌于 EXE。公开源码示例配置不能用于登录，打包前需准备本机有效的 `source/account_config.json`；不要提交账号密码、令牌或私有配置。
