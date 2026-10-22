# 工作桌面端交接

## 当前状态

2026-10-23 公开仓库归档进行中：用户已明确授权将当前 1.7.8/r9 安装包、独立 EXE、快捷启动文件、图标、合同印章/业务模板和非敏感验收资料上传到公开仓库 `https://github.com/song123-jian/-`。本次只同步文件，不重建、不安装、不操作 Supabase/MES 或本机业务数据；真实账户、密码、登录凭据、`data/`、`.build/`、虚拟环境和缓存排除。正式 AppId 安装验收仍以发布清单的 `verificationStatus=not_run` 为准。

本公开副本不包含本机 `.build/`、`data/` 和 `手动删除/`；历史记录中指向这些目录的链接只在原工作区有效，不是公开仓库可下载文件。

2026-10-22 最新增量为 MES 历史 HTTP 功能恢复及 1.7.8 发布。用户明确要求恢复 `http://mes.njjulong.cn:8081/`，并将 HTTPS 443 证书验收排除在本轮范围外。代码只允许该历史主机/端口使用 HTTP；其他 HTTP 地址仍在请求前拒绝，HTTPS 请求显式启用证书验证且不跟随重定向。已知 HTTP 会明文传输凭据；本轮未使用真实 MES 凭据或访问真实 MES。

交付：[工作-1.7.8.exe](../工作-1.7.8.exe)，SHA256=`E409E4D926E5DC6A96D0FBC5818A54C0DEB23A2F6F163ADD7E9B5414DA502671`；[工作-1.7.8-r9-Setup.exe](../工作-1.7.8-r9-Setup.exe)，SHA256=`0355501D2C83262E77333FD38D53958DBAF2010529FB4225AFB43ACD02794E45`，未签名。发布清单 `verificationStatus=not_run`，未对正式 AppId 安装。全套 542 项测试通过。冻结 EXE 在隔离 SQLite 和真实 Qt 界面中完成六个本地合成 HTTP 响应登录、退出及数据未变检查；无外发网络，真实 MES 登录未运行，报告见[验收记录](../.build/qa-inventory-http-1.7.8/report.json)。便携快捷方式现指向 `工作-1.7.8.exe`，工作目录为项目根目录，图标正确且参数为空。

按用户要求，根目录及 `work/` 中 33 个旧发布物（27 个 EXE、6 个 `*.release.json`）已移动、未删除；原目录结构保留在[手动删除清单](../手动删除/移入清单.json)，每项路径与 SHA256 可查。构建验证记录、QA 证据、源码和 `data` 未移动。

2026-10-22 历史增量为工作 1.7.7 EXE/安装器发布与快捷方式重构。`source/domain.py` 为版本源；构建默认目录按版本联动，安装器修订为 r8。该版本此前的隔离安装验收记录仍有效；旧版 EXE 与安装包现已移入[手动删除归档](../手动删除/移入清单.json)，例如[1.7.7 EXE](../手动删除/root/工作-1.7.7.exe)和[1.7.7-r8 安装包](../手动删除/root/工作-1.7.7-r8-Setup.exe)，未删除。当前交付以本节 1.7.8 为准。

2026-10-22 上一增量为 r7 卸载个人资料选择：交互卸载询问保留/删除 `data`；默认“是”保留，“否”只删除 `data`，其他非受管个人文件始终保留；静默卸载默认保留。发现 reparse point、属性读取失败或目录枚举失败时整份 `data` 保留。Windows 11 Pro x64 Build 26200 上，以随机 QA AppId 和最小载荷完成真实交互“保留/删除”及静默/显式删除等21项测试，均通过，见 `.build/native-personal-data-qa-20261022-final/verification.json`。历史候选 `work/release-native-installer-1.7.6-r7/工作-1.7.6-r7-Setup.exe` SHA256=`5FF5F4F807283287DD1961DBE9F2B999BA398EA722165CC5934A44EFE0B7738E`，载荷复用 r5；正式 AppId 未安装。用户明确要求不签名。正式 r6 的 Windows 列表可见性/登记残留不确定状态未触碰、未解决。构建器遗留 `.build/setup-native-4718add309c04b419d7b86a1b576e33b/setup.exe`，清理曾被策略拒绝，保留原样且不绕过。

2026-10-22 当前增量为安装卸载替换：用户已明确要求卸载旧 D 盘安装并支持系统快捷卸载，此授权替代历史“保留 D 盘安装”限制。原目录 `D:\PriceQuery-QA-20261020-0949\工作 安装` 及 data 已不存在，本轮没有执行该程序卸载或证明旧 data 保留。旧失效 HKCU 登记与菜单清理两次被自动审批拒绝，停止重试，不通过其他方式绕过；备份在 `../.build/legacy-install-cleanup-20261022/`。以下旧 D 盘存在/不得卸载的记载仅为历史事实，不代表当前状态。

新版默认采用 Inno Setup 6 原生单用户安装/卸载，使用独立 `PriceQueryDesktop_is1` 登记及“工作桌面端”菜单，保留旧构建器。15 项原生安装器集成测试通过。正式 r6 Setup SHA256=`C7FD9020E2200692ED06CBAD72848D8AE16C0BD1973CC858CDF191E3DC24F69F`，载荷复用 r5。真实向导安装、路径、登记、菜单目标和实际 EXE 的 5 项隔离 Qt 壳验收通过；独立 QA AppId 原生卸载清除登记/程序/菜单且 data/个人文件哈希留存通过。正式安装那次 Shell 卸载启动返回取消，随后程序目录消失但正式卸载登记仍残留；Windows 设置和控制面板筛选未展示新条目。因此正式 r6 卸载收尾、Windows 列表可见性和同包 data 留存为未完成验证，发布元数据为 `partial`。详见[安装卸载替换方案与验收](安装卸载方案-20261022.md)和脱敏记录`../.build/native-install-qa-20261022/verification.json`。r6 Setup 未签名。当前范围不涉及云/MES操作。

目标状态：整体优化目标仍未全部完成；Supabase 项目不是隔离测试库，后端迁移、写入/清理、真实注册及密钥轮换均未验收。现用项目 `fvnacayonhyretsqcqqc/main` 的只读诊断结果及限制见[验收矩阵](优化实施验收矩阵-20261021.md)。MES 443 自签名证书链失败是历史检查事实；用户已明确将该 HTTPS 验收排除于本轮，不作为当前阻塞。没有初始化、部署、业务写入、注册、清理或轮换。

2026-10-21阶段性记录：完成单据 PDF 滚轮翻页、阶段三本地稳定性改进、阶段二本地传输/入口边界及阶段四性能测量。当时的 r5 候选 SHA256=`EF0E1F8D5B801F98A9DF235EBBF428358F1915CA546906D0D349015156DBE52C`，513 项构建测试通过；旧版 EXE 后已移入[手动删除归档](../手动删除/移入清单.json)，其构建与验收记录保留。该日的 MES 明文阻止结论已由用户后续要求取代；1.7.8 恢复限定的历史 HTTP 入口。其他云端契约迁移、跨账号及真实注册仍未完成验收，详见[验收矩阵](优化实施验收矩阵-20261021.md)。

用户合同 DOCX/PDF 核验：两者各1页，逐页归一化文本完全一致并目视版式相符；页面尺寸差0.02×0.03 pt、300 DPI渲染高度差1 px，因此不是像素级相同。未提供报价单参考附件；报价单和合同分别通过应用生成 PDF 的页数、关键内容和滚轮/预览验收。脱敏摘要见 `../.build/contract-page-audit-20261021/contract-page-audit.json`。合同转换 PDF 与页面对比图清理命令被执行策略拦截，仍留在同目录；原始附件未修改。

2026-10-20自选目录包与安装成功是历史记录。2026-10-22 本轮恢复时 `D:\PriceQuery-QA-20261020-0949\工作 安装` 及其中工作.exe/data 均已不存在；旧 HKCU 登记和“工作”开始菜单运行/卸载链接仍存在且路径失效。清理命令被自动审批拒绝后停止，未宣称旧安装已卸载或旧 data 已保留。不要因目录名称含 QA 自动清理；详见本轮安装卸载记录。

阶段一验证：完整测试498 passed；安装器/构建契约专项16 passed；Ruff和6个PowerShell脚本解析通过。新EXE SHA256=`A9243E3B491200FEEAA4521E8FFC6CAD90CF2F3E5DCC57A9A9F733B3569A5344`，r2 Setup SHA256=`D54CFA320371380DB38FC92108EF85A722C0F30FB457A3A4BB2FD17B79AF69F2`；版本/修订/载荷记录在 `../work/release-build-recovery-1.7.6-r2/工作-1.7.6-r2-Setup.release.json`。隔离安装、实际EXE界面、卸载和测试SQLite/标记文件保留共14项通过，见 `../.build/phase1-runtime-28a90ca6d90b4d0eb7438d6125086141/verification.json`。由于现有普通安装登记必须保留，新r2包的正常HKCU登记模式未复测；验证期间确认既有登记未变化。测试截图包含受控PermissionError提示，不代表界面全程无错误。

当前版本为“工作”1.7.8，根目录交付 [工作-1.7.8.exe](../工作-1.7.8.exe)、[工作快捷启动.lnk](../工作快捷启动.lnk)、[工作-1.7.8-r9-Setup.exe](../工作-1.7.8-r9-Setup.exe)、[发布清单](../工作-1.7.8-r9-Setup.release.json) 和 [工作图标.ico](../工作图标.ico)。旧版发布 EXE、安装包及其发布清单共 33 项已移入[手动删除目录](../手动删除/移入清单.json)，由用户自行删除；源码、构建/验收证据和个人 `data` 保留。r9 正式 AppId 安装状态为 `not_run`，不宣称完成正式身份安装验收。安装器说明见 [source/installer/README.md](../source/installer/README.md)。

报价单、合同已有内置矢量版式，并统一使用用户提供合同PDF中直接提取的同一原章。实际安装版两类单据已预览、导出；两份PDF图章RGB和alpha逐像素与原图一致。模板缺失、损坏、文件权限和导入存储错误提示已细化。

桌面同步读取接口、版本表和触发器已完成授权升级及ACL收紧；最终只读11项true，业务计数保留1成员、0客户、0报价。客户端缺接口时60秒重检、手动刷新立即重试，接口恢复后回到15秒检测。此次检测对象为云端业务数据变化。不得重复迁移、初始化或演练，不创建测试账号、不改密码、不写真实报价。

本机登录项目公开配置、15个总账号上限和拒绝重名规则保持；真实用户成功登录、真实云写入及跨电脑同步仍尚未完成验证。1.7.6实际隔离安装版8项窄验收通过，安装/程序/卸载均0，3个快捷方式、payload和data保留通过。2026-10-20已补做普通安装模式注册表入口与注册表卸载命令验收，11项检查通过；另有D盘交互安装成功并保留。阶段一前7项依赖旧私有seed或原XLSX的测试失败，现已改用自包含合成QA fixture；当前完整测试498项通过，见下文阶段一记录。

1.7.5数据库设置按钮、托盘、明确退出及元数据复用继续保留，其已通过的窄验收仍作为对应历史证据。历史发布二进制已移入“手动删除”；源码、验收记录和用户 `data` 保留，未执行删除。

## 已完成需求

| 需求 | 结果与范围 | 验证 |
| --- | --- | --- |
| 占位登录配置修复 | 实际本机配置；无效配置校验和 9 个配置用例 | health 200；配置 9 项、账号/注册/Qt 登录 28 项通过；真实成功登录未完成 |
| 图标和安装包 | SVG、多尺寸 ICO、Qt/EXE 图标、C# 安装外壳和卸载脚本 | 图标预览已查看；最终 Setup 隔离安装/卸载与 data 保留通过 |
| 自助注册后台 | 完成空结构初始化及pmu-register公开专用入口；数据库限制15个总账号并拒绝重名 | 回滚演练、正式初始化和只读权限核验通过；真实接口405/400符合预期，无测试账号残留 |
| 1.7.4统一改名及文件夹最外层交付 | 应用、窗口、EXE、安装提示、快捷方式和开始菜单改名“工作”；可运行EXE、启动快捷方式、安装包及图标放在最外层 | 登录UI 5项通过，实际安装EXE标题/版本核对、安装/卸载和文件副本/快捷方式核验通过 |
| 1.7.5设置入口、托盘与安全提速 | 设置移到存储状态旁；主窗口关闭到托盘、恢复/明确退出；同内容目录/补全/材料选项复用，权限与写入规则保持 | 14项相关Qt测试通过，真实安装EXE窄验收5项通过、退出0；安装/卸载、data与最外层交付核验通过 |
| 1.7.6同章单据、导入提示与云端同步补齐 | 两单据共用指定PDF原章、内置矢量版式；细化文件/模板/存储错误；缺同步接口可恢复轮询；云端同步读取最小迁移与ACL收紧完成；版本化交付 | 实际安装版8项、安装/卸载与data保留通过；原章逐像素一致；云只读11项true；真实桌面云业务链路尚未验证，7项旧fixture辅助测试失败 |
| 2026-10-20自选安装目录与优化方案 | C#目录输入/浏览、--install-dir、路径保护和分阶段优化路线图；随后完成阶段一合成QA fixture、隔离可重复构建、r2安装器修订及机器可读记录 | 原新版11项安装器回归和正常模式验收通过；D盘安装按用户要求保留。新r2包498项完整测试通过、16项安装器/构建专项通过，隔离实际程序验收14项全通过；新r2正常HKCU登记未复测 |
| 2026-10-21单据滚轮与阶段三稳定性 | PDF预览支持滚轮翻页；备份原子复制、异步任务排空、注册后登录错误分类和脱敏关联日志已实施 | 全量510通过；定向Qt/服务93通过、原子文件/备份/适配器38通过；源码和冻结 EXE 均完成隔离真实 Qt 单据滚轮及PDF验收。合同 DOCX/PDF文本逐页一致但尺寸略有差异；r3候选未安装/发布，D盘旧安装未变 |
| 2026-10-21阶段二本地安全边界（历史结论，MES范围后续已调整） | 遗留入口明确停用且不分发；当时的MES明文阻止版本 r5 已归档 | 513项构建通过；源码和冻结Qt拒绝场景各3项通过、请求数0；归档审计无遗留模块；后续 1.7.8 恢复指定 HTTP 地址，真实 MES 登录/查询未验收；HTTPS 443 证书验收按用户要求排除 |
| 2026-10-21本地性能与写入退出 | 实测五条路径，受控真实SQLite事务中通过托盘退出 | 7组首开/重开共14次运行，逐次导入后回读1250条；保持提交前事务301.8ms期间25次心跳，退出后1001条及完整性通过；未新增性能重构，不外推云端或冻结启动 |
| 2026-10-21已登录项目只读诊断 | 核对现用main项目结构、计数和执行ACL，保存脱敏记录及待授权测试清单；MES新增443入口无凭据检查 | 两次SELECT成功，45条计数/权限导出；项目非空、隔离用途待确认；443证书链验证失败、未发送凭据。真实写入、跨账号、注册及MES正常TLS仍未完成；证据见`../.build/supabase-readiness-20261021/summary.json` |
| 2026-10-22安装卸载实现替换 | 默认安装器切为 Inno Setup 6 单用户引擎，可选本地目录、HKCU 原生卸载登记、独立菜单组；保留旧构建入口 | 15 项集成测试通过；r6 真实向导、路径/哈希/登记/菜单及安装 EXE 5 项 Qt 冒烟通过；独立 QA AppId 原生卸载及合成数据留存通过。正式 r6 卸载后登记残留，系统应用列表 UI 未显示，完整发布验收 partial；旧 D 目录不存在但旧登记/链接残留且清理受策略阻止。详见 `../docs/安装卸载方案-20261022.md` 和 `.build/native-install-qa-20261022/verification.json` |
| 2026-10-22 r7卸载资料选择 | 交互选择保留/删除 `data`；静默默认保留；链接及扫描失败时保留 | Windows 11 Pro x64 随机 QA AppId 实测交互“是/否”、静默保留、显式删除和链接目标保护；21项通过。r7 候选哈希和 `not_run` 边界见 `.build/native-personal-data-qa-20261022-final/verification.json` |

| 2026-10-23公开仓库归档 | 保留远端历史快照；追加当前源码、文档、非敏感 `work/` 资料、1.7.8/r9 安装包、独立 EXE、快捷启动文件和图标；EXE 由 Git LFS 管理 | 独立克隆暂存前检查：源码313文件、文档8文件、work 44文件；根目录与 work 发布副本 SHA256 相符；本机凭据、data、.build、虚拟环境未复制。远端推送与 LFS 远端回读待完成 |

## 本轮主要变更

2026-10-22 默认安装器重写为 Inno Setup：`source/build_installer.ps1` 生成 r6，最终 Setup 与清单先落到唯一临时文件再提交，失败回滚本次 Setup；`source/installer/PriceQuery.iss` 实施路径防护、原生单用户卸载登记、开始菜单快捷方式、归属/运行占用检查；旧构建器保留为 `source/build_legacy_installer.ps1`，旧路径测试明确调用它。新增 `source/tests/test_native_installer.py`（15 项）和 `docs/安装卸载方案-20261022.md`；更新安装 README 和本路线图。无应用业务代码、数据库或 MES 操作。正式 Setup SHA256=`C7FD9020E2200692ED06CBAD72848D8AE16C0BD1973CC858CDF191E3DC24F69F`，状态 `partial`，其原因与定向证据见 `.build/native-install-qa-20261022/verification.json`。

r7 增量只改 `source/installer/PriceQuery.iss` 和 `source/tests/test_native_installer.py`：加入交互卸载资料选择；静默默认不删除；属性或枚举失败/链接节点时安全保留整份 `data`。完整安装器回归21 passed，Ruff通过，QA交互界面确实分别点击“是/否”并核对数据状态。r7正式身份Setup未执行安装，`verificationStatus=not_run`；未操作旧正式/失效登记、用户业务数据、Supabase 或 MES。签名按用户明确要求省略，不是本轮阻塞项。

自选目录修改 `source/installer/SetupBootstrap.cs`、`install.ps1`、`uninstall.ps1` 和 `source/build_installer.ps1`，增加目录选择、命令行路径传递、可写性探测、专用目录校验及安装归属核对。新增 `source/tests/test_installer_paths.py`（11项）及显式正常安装验收脚本 `source/installer/verify-custom-install.ps1`；后者发现已有安装或同名快捷方式就停止，不用于当前保留的安装。更新安装器说明与优化方案。无应用Python业务源码改动、无新增依赖、无数据库写入或数据迁移。

1.7.6修改单据服务、单据对话框、后台任务错误处理、账号存储同步能力探测及主窗口轮询；新增自包含导入回归与operation_sync_qa窄验收入口，版本更新至1.7.6。单据资源在导出前校验，内置背景不依赖缺失旧PNG。reference-seal.png直接来自用户合同PDF的原图像与透明蒙版，189×192，两种单据共用；用户已明确授权本次将该印章及业务模板作为公开业务资源上传，不能视为生产凭据。

新增source/migrations/desktop_sync_v176.sql与desktop_sync_v176_acl_fix.sql，保留现有写入RPC、账号及业务数据，仅补齐桌面读取同步子集。缺RPC缓存60秒，手动刷新直接重检；网络错误不冒充缺接口。首次远程核验发现默认EXECUTE授权未收紧，已完成最小ACL修复演练及正式修复，最终只读核验通过；不得重复执行。

1.7.5修改`source/ui/main_window.py`、`account_controller.py`、`domain.py`、`desktop_main.py`，新增`ui/system_tray.py`和专用`desktop_shell_qa.py`。托盘由账号控制器持有，每次注销解绑旧窗口，继续沿用主窗口等待任务、表单确认和会话释放机制；延迟回调绑定窗口生命周期。独立设置按钮打开原有页面，账号模式仍禁用数据库切换。仅显示内容相同才跳过目录与选项重建，修订版本照常更新。

`source/services/account_service.py` 校验本机配置并提供明确的注册404提示；`source/ui/login_dialog.py` 说明禁止重复和最多15个总账号。1.7.4改名阶段在`source/domain.py`集中定义 `APP_NAME="工作"`，供应用、登录和主窗口标题引用。构建与安装模板、C#外壳、安装/卸载脚本同步改名；开始菜单目录改用显示名称，内部APP_ID、productId、安装路径、账号域名和数据标识继续沿用原值。其他函数和业务权限保持现状。

新增 `source/migrations/registration_account_limit_v173.sql`，将原来的 15 个启用账号上限改为 15 个总账号，保留数据库唯一约束和同一事务锁；停用不会释放名额。新增 `registration_limits_verify.sql` 供空账号项目在事务回滚内测试。`source/build_registration_setup.py` 复用 7 个现有迁移，生成具有防覆盖前置检查的单事务正式脚本、演练脚本及来源哈希。

图标源文件在 `source/assets/app-icon.svg`、`app-icon.ico`；构建通过 `build_app_icon.py`、`resources.qrc`、`ui/resources_rc.py` 和 `desktop_main.py` 接入 Qt/EXE。安装器位于 `source/installer/`，由 `source/build_installer.ps1` 构建；无新增第三方安装依赖。

## 有效验证与待办

阶段一（2026-10-20）已完成：把缺失私有seed/原XLSX的回归输入改成明确标记的合成QA fixture，保留41条、5客户、17材料等既有行为断言；测试临时目录生成数据，不恢复业务数据、不新增依赖。修复 `supabase_store.py` 单个Ruff导入排序。`build.ps1` 在唯一 `.build/desktop-*` 源码快照中生成图标和Qt资源，防覆盖输出并写入 `build-verification.json`。`build_installer.ps1` 以独立 `installerRevision=r2` 命名包，生成相邻 `.release.json`；包清单和安装状态都记录修订。隔离验收支持 `-Isolated`，不会写普通HKCU安装登记。

- 完整测试：`.venv/Scripts/python.exe -m pytest source/tests -q --tb=short --junitxml=.build/phase1-release-gate-green.xml`，498 passed，0 failed，85.75s；Windows Qt offscreen。Ruff对 `source` 全通过。
- 构建：`work/release-build-recovery-1.7.6-r2/工作.exe`，版本1.7.6，SHA256=`A9243E3B491200FEEAA4521E8FFC6CAD90CF2F3E5DCC57A9A9F733B3569A5344`；构建JSON为 `work/release-build-recovery-1.7.6-r2/build-verification.json`。该次构建显式复用前述未变化测试结果，JSON如实写明 `checks=skipped by explicit switch`、`testReport=null`；测试通过证据以独立JUnit报告为准。
- 安装器：`work/release-build-recovery-1.7.6-r2/工作-1.7.6-r2-Setup.exe`，SHA256=`D54CFA320371380DB38FC92108EF85A722C0F30FB457A3A4BB2FD17B79AF69F2`；`工作-1.7.6-r2-Setup.release.json`记录应用/Setup哈希和r2修订，构建时状态为 `not_run`。
- 专项回归：`.build/phase1-installer-tests.xml`，16 passed，包括修订贯通、发布输出不覆盖、无效revision拒绝和隔离验收。
- 实际程序验收：Windows 11 x64，隔离安装的冻结EXE 1.7.6，入口及SHA写在报告内；版本/修订/载荷哈希、安装位置、快捷方式、真实Qt窗口操作（CSV持久化与重复导入、报价/合同预览导出、受控权限错误、同步恢复）、卸载、标记文件和SQLite保留、现有注册表未变，共14项true。报告 `.build/phase1-runtime-28a90ca6d90b4d0eb7438d6125086141/verification.json`；界面报告 `.build/phase1-runtime-28a90ca6d90b4d0eb7438d6125086141/actual-ui/report.json`；截图 `.build/phase1-runtime-28a90ca6d90b4d0eb7438d6125086141/actual-ui/operation-sync-1280.png`，截图展示受控权限错误用例。
- 只读差异审查未发现阶段一新增高置信度缺陷。6个PowerShell脚本解析通过；16个直接修改的代码/配置/验收脚本检查UTF-8、无BOM及无U+FFFD。生成资源回读hash与修改前相同。工作区无Git仓库，阶段前备份见 `.build/phase1-before-20261020/`。
- 未验证：新r2包正常HKCU安装/卸载入口（会接管用户已经安装的普通模式登记，因此跳过）；真实云/MES/账号/跨设备业务链路；第二至四阶段优化。D盘现有安装、程序、用户数据均未操作。

自选目录验证：Windows 11 x64；`.venv/Scripts/python.exe -m pytest source/tests/test_installer_paths.py -q --junitxml=.build/custom-install-tests.xml` 为11通过，测试载荷为最小EXE，只证明安装器行为。真实1.7.6新版Setup普通模式安装/注册表卸载11项true，见 `.build/自选目录普通安装验收/verification.json`，原记录的applicationVersion为空，应用版本由安装状态和同源EXE哈希对应确认，不伪补原始证据。新版Setup SHA256=`9FA4B8A0AB4441F65A29C97887EB540555135E7C05911772A50FF985002386F8`，payload与原1.7.6哈希相同；汇总见 `.build/custom-install-delivery.json`。D盘交互验收报告 `.build/custom-install-ui-drive-d-result.txt` 为EXIT_CODE=0、INSTALL_OK；用户确认成功，安装已保留。曾因工具未观察到后台确认框误判阻塞；没有修改生产逻辑，临时针对未实施重构的失败测试已移除，原11项结果继续有效。不以该误判宣称修复故障。

一次安装器增量差异审查完成，未发现新增高置信度问题；测试文件Ruff通过，PowerShell解析和文本编码最终核对见交付汇总。旧报告3个Ruff问题经定向复核现仅supabase_store.py仍有1个I001，本轮不改无关源码、不宣称完整应用重建通过。ACL拒绝、磁盘满和所有DPI尚未完成验证；云端真实业务链路仍沿用原限制。

1.7.6实际验收对象为Windows 11 x64、原生Qt的已安装工作.exe，版本1.7.6、frozen=true、入口及独立data目录均写入报告。CSV导入持久化、重复导入、报价预览/带章导出、合同预览/带章导出、权限错误提示、同步恢复共8项通过，进程退出0。文件选择器返回、同步metadata及PermissionError为受控替代，后端为隔离SQLite，未覆盖真实云业务读写。实际安装EXE哈希与发布原件相同；安装/程序/卸载均0、3个快捷方式移除、data标记哈希不变。[安装记录](../work/release-work-1.7.6/安装验证记录.json)、[实际界面验收](../work/release-work-1.7.6/实际程序界面验证.json)、[交付核验](../work/release-work-1.7.6/最外层交付记录.json)。

两份实际安装版PDF的原章RGB和alpha逐像素一致，均为1页；渲染版式已查看。[原章核验](../work/release-work-1.7.6/原章像素核验.json)、[两单据预览](../work/release-work-1.7.6/两份单据同章预览.png)。受控权限错误的UI截图是异常提示用例，不作“无可见错误”的整体验收结论。

云端最终只读11项true：现有成员RPC读取与未注册身份拒绝、版本、函数所有者、forced RLS、读取RPC ACL、版本表ACL、触发器、executor限制、原membership保留、业务计数与schema epoch。[脱敏只读记录](../work/release-work-1.7.6/云端只读核验.json)；原始只读状态与截图在.build/desktop-sync-1.7.6/final-verify-result.txt、final-verify.png。SQL角色与主体设置仅证明数据库权限，不代表真实桌面登录或跨设备同步。

辅助组合测试55通过、7失败、1排除；7项依赖旧私有41条seed或缺失原XLSX，日志.build/import-sync-old-fixture-failures.log。自包含导入回归3项通过，日志.build/import-operation-self-contained.log；另有导入/同步定向10通过、22未选，日志.build/import-sync-green.log。原生源码窄验收8项已通过，.build/operation-sync-source-qa-1.7.6-v2/report.json。受影响Python Ruff、15个直接文件AST/JSON/UTF-8无BOM检查通过；一次增量差异审查未发现新增高置信度缺陷。未恢复私有测试数据，不作全量通过结论。[源码核验](../work/release-work-1.7.6/源码定向验证.json)、[增量审查](../work/release-work-1.7.6/增量代码审查.json)。

1.7.5：`.venv/Scripts/python.exe -X faulthandler -m pytest source/tests/qt/test_system_tray_ui.py source/tests/qt/test_login_ui.py -q`在Qt offscreen下14项通过、退出0；相关7个Python文件Ruff、AST和UTF-8无BOM检查通过，完成增量差异审查。测试清理顺序与窗口生命周期问题已修正，失败记录保存在`.build/settings-tray-ui-cleanup-failure.log`，不计为通过。

实际Windows安装EXE1.7.5使用显式独立测试目录与`acceptance-desktop-shell.json`，仅运行本次设置/托盘窄验收，5项通过、进程退出0，截图已查看；当前设备、页面、视口和数据状态下无可见错误。安装/卸载均退出0，payload、3个快捷方式、data保留和最外层交付核对通过。验收最初因使用安装EXE默认data目录而被安全检查拒绝；改用单独测试目录后通过，未修改保护规则。证据见[1.7.5安装记录](../work/release-work-1.7.5/安装验证记录.json)、[实际程序界面验证](../work/release-work-1.7.5/实际程序界面验证.json)与[最外层交付记录](../work/release-work-1.7.5/最外层交付记录.json)。

目录刷新测量：真实MainWindow、1,000个合成客户、30次相同元数据回调，Qt offscreen中位18.9845ms降到0.4220ms；仅证明该回调开销下降，不代表整体程序或云端速度。业务数据和云端读取未参与测量。

1.7.4改名检查：4个Python文件Ruff、10个修改文件AST/UTF-8无BOM/异常替换字符/换行检查、相关PowerShell解析通过，人工增量差异审查完成。`QT_QPA_PLATFORM=offscreen .venv/Scripts/python.exe -X faulthandler -m pytest source/tests/qt/test_login_ui.py -q` 为5项通过、退出0，日志 `.build/login-name-tests.log`。首次原生Qt测试在5项输出后异常退出，不能计为通过；离屏测试和实际安装EXE窗口观察分别记录，不把离屏测试当作完整真实登录链路。前轮15项注册客户端/Qt与配置检查继续作为对应范围证据，不累加重复用例。

旧虚拟环境的基础Python运行时已失效，已备份 `.venv/pyvenv.cfg` 后改指本机现有Python3.13.16，既有依赖导入正常，无新增依赖。Windows 11 x64最终1.7.4 Setup隔离安装退出0，payload与发布EXE哈希相符，3个快捷方式的名称、目标和工作目录正确；实际EXE显示“工作 · 程序账号登录”和“登录工作”，runtime版本为1.7.4。验收进程随后清理，卸载退出0，程序和快捷方式移除，data标记哈希不变。记录见 [安装验证JSON](../work/release-work-1.7.4/安装验证记录.json)，截图及窗口状态在 `.build/work-1.7.4-login.png`、`work-1.7.4-login-state.txt`。

数据库回滚演练结果 `duplicate_and_total_15_limit=passed`、临时成员15；演练后无结构/账号残留。正式初始化只执行一次，最终只读结果 registration_version=1.7.3、max_accounts=15、registered_accounts=0、app_auth_accounts=0，客户端管理RPC被阻止、RLS启用、执行角色受限均true。注册函数完整源码回读相符后部署，专用旧JWT校验关闭并保存；GET=405/method_not_allowed、无效用户名=400/invalid_username、空密码=400/invalid_password。证据在 `.build/registration-deployment/`，部署说明见 [后台记录](../work/release-registration-15/backend/部署说明.md)。这些检查不创建真实账号；成功注册、自动登录和用户业务数据读写尚未完成验证。

2026-10-21本轮实际程序：构建门禁 `.build/desktop-ecc5811303e1499e9e1efaea48b1f6e9/tests.xml` 为510 passed，Ruff通过。冻结程序入口 `work/release-document-scroll-1.7.6-r3/工作.exe`，版本1.7.6、Windows 11 x64、SHA256见同目录 `build-verification.json`；使用全新 `.build/document-scroll-qa-20261021/frozen/data`，隔离SQLite后端，报告 `.build/document-scroll-qa-20261021/frozen/report/report.json` 状态passed，10项检查、4份报价/合同样例PDF导出。冻结 EXE 截图 `.build/document-scroll-qa-20261021/frozen/report/contract-preview.png` 已查看。源码入口报告在 `.build/document-scroll-qa-20261021/report/report.json`。测试不访问云/MES、不使用真实业务数据。

合同附件对比只读取用户 DOCX/PDF：逐页提取文本并做 NFKC/空白归一、核对页面尺寸及300 DPI栅格尺寸；单页文本一致，视觉版式对应，但栅格高度差1 px，不称像素完全一致。JSON `.build/contract-page-audit-20261021/contract-page-audit.json` 不含合同正文。转换出的 `word-render.pdf` 与 `page-comparison-150dpi.png` 清理请求被执行策略拦截，尚未清理；源附件未修改。

阶段三直接回归：单据、注册、后台任务、库存、托盘相关 Qt/服务测试93通过；原子文件、备份与存储适配器测试38通过。r3完整构建门禁510通过，最新r5为513通过。阶段三代码差异的回退对照在 `.build/phase3-before-20261020/source/`。r3 Setup `.release.json` 哈希正确，`verificationStatus=not_run`；未安装/发布。后续实际源码Qt已完成本地事务中退出验收，阶段四本地测量见下；真实云/MES/注册链路仍未验证。

截至 2026-10-21 的阶段二本地边界记录：`source/app.py` 的公开 `main()` 输出弃用提示并退出2，保留 `_legacy_main()` 供审计；`source/build.ps1` 在源快照复制时排除 `app.py`、`supabase_backend.py` 并断言，记录排除项。当时 `InventoryService._request()` 在网络调用前拒绝非HTTPS；该 MES 传输结论已由用户 2026-10-22 的后续要求取代。1.7.8 仅允许原 MES 主机/端口使用 HTTP，其他 HTTP 地址请求前拒绝；HTTPS 仍校验证书且不跟随重定向。共享 Supabase 配置旧路径仍可接受高权限凭据，不能把本地门禁当成服务端迁移完成。

- 最新构建：[r5构建JSON](../work/release-phase2-local-security-1.7.6-r5/build-verification.json)，全量513 passed、82.82秒，JUnit为 `.build/desktop-6e0571af2ad845e3865e1e717d25dae1/tests.xml`；此前68项直接组合回归见 `.build/phase2-local-security-targeted.xml`。构建时 `actualProgramVerification=not_run` 不覆盖后续独立运行报告。
- HTTP实际程序：[源码报告](../.build/phase2-mes-transport-20261021/source/report/report.json)、[冻结报告](../.build/phase2-mes-transport-20261021/frozen/report/report.json)；Qt实际输入合成凭据，核对拒绝提示、清空密码和0请求，各3项通过，冻结进程退出0。冻结截图已查看，展示预期拒绝，不作正常MES登录通过证据。
- 分发与审查：[归档审计](../.build/phase2-mes-transport-20261021/distribution-audit.json)、[增量审查](../.build/phase2-mes-transport-20261021/incremental-review.json)，所查账号配置和37个自有Python模块常量无高权限凭据，实际归档不含遗留两模块；未发现新增高置信度问题。并非全机器或第三方依赖审计，不输出配置值。
- 写入退出：[实际报告](../.build/phase4-performance-20261021/runs-v2/write-exit/report/report.json)，入口为本轮源码 `desktop_main.py`、版本1.7.6、Windows原生Qt及隔离SQLite。通过真实服务/任务池执行INSERT，提交前受控保持301.8ms；先关闭到托盘保留写入，再由实际退出菜单开始异步等待，等待期间25次心跳。释放后退出0，独立进程重读1001条、精确价格和完整性通过，7项检查true。受控替代仅为提交前等待，不替代真实云/MES延迟；退出期间UI回调按设计抑制，验收在真实工作函数记录完成结果。
- 性能：[汇总](../.build/phase4-performance-20261021/performance-summary-v2.json)，1000条/100客户、每次导入250条，7组首开与重复打开、共14次实际Qt运行，均退出0且回读1250条。首开中位：启动1337.650ms、首次查询43.165ms、连续查询28.601ms、刷新279.610ms、导入预览+提交823.350ms、退出进程132.461ms；p95和重开数据见验收矩阵。未清OS缓存；启动不含真实账号登录、冻结解包，CSV文件选择器为受控路径，其他UI/存储均真实。旧强制重绘样本弃用，新驱动保持不变且各报告记录同一SHA；没有新增缓存、分页、批处理或架构重构。
- 剩余依赖：Supabase 隔离项目与受控写入/清理边界、服务端迁移和密钥轮换仍未完成；本轮真实 MES 登录/查询未运行，用户提供的测试账号未用于 HTTP 明文链路，HTTPS 443 证书验收按用户要求排除。没有登录生产 MES、写真实报价、部署或轮换密钥；阶段二及三其余外部范围仍未完成验证。

## 约束与恢复

自选目录代码基线及旧交接在 `.build/custom-install-before/`。需要回退时仅恢复本轮对应源码，使用保留的旧安装包；不得对正在运行的D盘安装直接覆盖、移动或清理。安装器继续单用户单实例登记；换目录需先备份数据、明确退出、卸载，再装到新目录，data不会自动迁移。交互卸载询问是否保留 `data`，用户选删除才清除该目录；其他非受管个人文件保留，遇到链接或扫描失败则保留整份 data。系统目录、根目录、网络目录、链接目录及超过200字符路径不支持。不因本轮客户端改动回滚或重复执行云迁移。

1.7.6 EXE SHA256为5F2B7E267C7BF3D6E768B48B059C912A650310260756479AF6CB5FD7AC24CAFB，Setup为AE2C303647F7A6C949308176708331C44C800AC15B2329E963B86D677092F97D。新版最外层使用版本化文件名，旧工作.exe保持1.7.5；明确退出新版后可运行旧EXE回退。源码备份在.build/import-sync-before/source，旧快捷方式及本次交接文档备份在.build/import-sync-before。没有移动或迁移用户data；不自动回退云数据库。云端增量读取接口与旧写入RPC兼容，不得因客户端回退重复迁移。

1.7.5回退：退出运行中程序后可恢复`.build/settings-tray-before/工作.exe`，源文件备份在同目录source子目录；旧1.7.4发布保留。当前1.7.5最外层EXE SHA256为37427EEE449D8E0227D48E7AB8039C868F1843CF29BF578338E646A3BD91D20F，安装包为A88CBF0D1944CB545A3197125D6723CF86C63EA5BAECE396217FEEBE88E68852。本次不迁移用户data，不扩大账号数据库权限。

保留原 `work/release/` 程序和业务数据。登录修复前备份在 `.build/login-config-fix-before/`，改名前文件与虚拟环境配置备份在 `.build/rename-work-before/`。安装版拒绝覆盖旧安装，应先退出并卸载旧安装版；卸载保留data，便携数据不会自动迁移。原项目工作区目录未移动；当时最外层启动快捷方式指向同层工作-1.7.6.exe并设置同层工作目录。本任务曾放在桌面的旧1.7.3安装包已在核对哈希后归档至 `.build/rename-work-desktop-previous/`，其他已有文件保留。

本轮不代建可登录账号、不改密码、不执行完整 `--account-qa`。数据库和函数已按授权执行，不重复初始化；正式初始化后不自动删除表或账号。如需停止注册，可在核对用户数据后停用专用注册入口，账号和业务数据需单独处理。本地检查点见 `.build/TASK_CHECKPOINT.md`。“记住账号密码（仅本机当前Windows用户）”指本地凭据的Windows用户加密保护范围；应用账号可在其他电脑重新输入凭据登录。

## 公开源码快照历史

原公开快照包含桌面源码、SQL、测试、资源和第三方许可证；不含安卓和本机业务数据。通过网页上传源码 ZIP，内部目录结构完整。本次公开归档在保留历史快照的基础上追加已授权的合同印章和业务模板；使用公开副本前仍须配置自己的账号项目，真实账号密码和本机凭据不在仓库内。

历史交接记录有 8 项审查问题、3 个 Ruff I001 和原版本 447 项测试，本轮未重新审查这些范围，不将其作为本轮完整运行验收证据。原项目数据和私有资源仍在本机；公开快照不能用于覆盖或恢复生产数据库。
