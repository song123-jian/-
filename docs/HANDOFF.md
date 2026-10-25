## 仓库上传检查点（2026-10-25，进行中）

- 目标：完整上传项目源码、文档、模板及正式发布包到 https://github.com/song123-jian/- 的 main；凭据、正式业务数据、机器配置和缓存排除。不写Supabase，不改程序功能或重建。
- 基线df119974be9783c5f6d1b01fa632f229b0596a72；本地快照68a61e62d8b7e59476861845b0ac66329ced885a，250文件。APK正式发布包已纳入LFS；传输期间出现Android1.24及并发更新，保留待补提交。
- 首次git push静默超过一小时，远端main未变；28个唯一LFS对象中7可用、21缺失。已核实并仅停止本任务19104，原会话77768以exit1结束，未修改远端分支。
- 当前续传会话27270启用强制进度、4并发和字节记录，约170–450KB/s；已有对象复用。独立1.24 APK代理传输curl exit28，120秒上传11,550,115字节（96,250B/s）。
- 网络诊断：存储域github-cloud.s3.amazonaws.com直连HEAD返回403，连接0.30秒/TLS0.56秒/总0.81秒，表明该域可直连；此结果不证明上传成功。下一步对同一APK仅改变存储传输路由为直连，GitHub鉴权继续走代理；成功后再切换大文件续传，失败则保留现行可传输路径并如实记录。
- 证据/检查点：.build/repository-upload-20261025/；尚未完成远端上传及完整性验收。待办：补齐LFS、补提交并发更新与1.24 APK、推送main、远端SHA与对象核验、双交接。使用Skill：无。
- 路由实测：1.24 APK直连PUT HTTP200，93,883,688字节/17.286784秒/5,430,952B/s，curl exit0且LFS verify完成。将停止本任务慢速续传，后续用NO_PROXY=github-cloud.s3.amazonaws.com进行LFS存储直连，GitHub仍走代理；不改系统全局网络配置。

## 当前交付：1.8.6统一Enter查询与客户目录折叠（2026-10-25，已完成）

- 最终需求：依用户纠正，在“客户目录”标题新增折叠/展开，整段列表隐藏/显示并按账号记忆；“全部客户”行仍查询全部报价。查询框与筛选控件统一Enter/小键盘Enter，不在项目页新增无需求搜索框。
- 交付：[工作-1.8.6.exe](E:/工作/工作-1.8.6.exe)、[安装包](E:/工作/工作-1.8.6-安装包.exe)。版本1.8.5→1.8.6，沿用补丁+1；EXE SHA256 1353B7A33DB8EE35C02308E72BFE9922AB3FECA87D71CB202C91AD8DCB6757E9；安装包SHA256 02944B4D7EED787476788170229E66D73F3152D6FD8C44C3EB33D627AD47D21A。候选/根目录/原生安装EXE相同。

| 需求 | 实际变更及结果 | 证据 |
| --- | --- | --- |
| 统一Enter查询 | 公共绑定覆盖报价客户/关键词/材料/税口径/日期及开关、客户资料搜索、待办搜索/类别/状态/优先级、库存物料/查询字段/批号；无修饰键Enter执行当前查询一次，组合框弹出选择保持原行为 | [回归](E:/工作/.build/release-1.8.6-20261025/queries-regression.xml) |
| 客户目录折叠 | 标题按钮显示方向箭头、鼠标/空格切换、可访问名称；按账号ui.ini即时保存，刷新/新窗口恢复，原客户筛选与报价记录保留 | [实际根程序验收](E:/工作/.build/release-1.8.6-20261025/root-shell-qa/report/report.json) |
| 安装及覆盖 | 1.8.5→1.8.6原生升级exit0、登记/载荷/数据sentinel通过；旧根及包归档，快捷方式/菜单参数更新，11正式data文件哈希不变 | [替换](E:/工作/.build/release-1.8.6-20261025/replacement.json)、[安装验收](E:/工作/.build/release-1.8.6-20261025/installer-verification.json) |

- 本轮10文件语义差异见[审查](E:/工作/.build/release-1.8.6-20261025/REVIEW.md)及increment.diff/review-hashes.json；继承1.8.5目录错跳修复。48项定向回归、4目标各19项真实桌面验收通过，每次含22种Enter及20种导航。项目/客户/待办/模板/历史/托盘直接路径一起验收。库存服务使用现有受控替代，未访问实际MES。
- 构建方式沿用source/build.ps1，CPython3.12.14锁定环境、配置.build/cloud-target-fvnac-20261025/account_config.json及-SkipTests，另做定向及实际验收；候选work/release-work-1.8.6-20261025/工作.exe，原生Inno6.7.3和source/build_installer.ps1输出work/release-native-installer-1.8.6-r1。全套测试显式跳过，不声称全项目通过。源码与冻结snapshot一致。
- 正式入口E:/工作/工作-1.8.6.exe、原生C:/Users/Administrator/AppData/Local/Programs/PriceQueryDesktop/工作.exe；根快捷方式已实际启动中文登录窗，账号预填/密码掩码，验收未提交正式登录。当前进程pid24608/父29496，关闭登录窗可退出；登录后用“退出程序”，主窗关闭可入托盘。开始菜单参数--data-dir E:/工作/data已恢复，未来重新安装可能重置须核对。
- 无强杀用户进程：替换前旧1.8.5准确路径已无进程；备份[rollback](E:/工作/.build/release-1.8.6-20261025/rollback)保留旧EXE/包/快捷方式/原生payload。退出新版后恢复旧文件/快捷方式，需原生回退时运行旧安装包，保留data。此次无云迁移/正式业务写入，fvnac配置不改，1.8.5真实Auth/云读结果对未变代码仍有效，不称1.8.6重新登录通过。
- 清理：本轮4个明确QA data已清理，报告、截图、回退、测试源码保留，见[清单](E:/工作/.build/release-1.8.6-20261025/cleanup.json)。有限构建/测试/安装均已结束，登录窗作为可使用入口保留运行。
- 边界：安装包仍未签名；不改手机端/云结构/真实业务。最终截图当前设备960×640受控报价状态无本次可见布局或错页错误，原报价横滚保留。不扩大为整个系统无漏洞。
- 使用Skill：systematic-debugging、test-driven-development、computer-use:computer-use。直接范围轻量洞悉没有达到90分的额外候选，停止范围外扩展。

以下为历史阶段记录；本节为当前交付结论。

## 当前交付：1.8.5客户目录报价导航修复（2026-10-25，已完成）

- 用户目标：点击客户目录应显示对应报价，并检查其他功能同类导航缺陷。此次只改桌面导航及验收，不改Supabase结构/正式业务记录，不扩展移动端。
- 根因修复：source/ui/main_window_quotes.py的select_customer由navigate(0)改navigate(self.PAGE_QUERY)，避免第0页变为客户管理后错跳；客户筛选、目录选中、导入目标和原异步报价查询继续沿用。其他业务实现未作无证据重写。
- 同类检查：桌面UI 35处navigate/setCurrentIndex/setCurrentWidget调用及直接入口核查，唯一主页面硬编码已消除；独立页签和组合框索引不混判。五主导航、搜索快捷键、客户主档查看报价/建项目/建待办、报价更新与历史、托盘恢复已定向验证，没有发现其他同类高置信度业务缺陷；不表示全系统无漏洞。
- 正式版本1.8.4→1.8.5，补丁+1映射不变，失败复测不递增。程序：[工作-1.8.5.exe](E:/工作/.build/release-1.8.6-20261025/rollback/工作-1.8.5.exe)，安装包：[工作-1.8.5-安装包.exe](E:/工作/.build/release-1.8.6-20261025/rollback/工作-1.8.5-安装包.exe)。EXE SHA256为8C84083736B0CE69FAB9EAF831738ED6586BA0CC1BE815FA7083857E2CC8C10C；安装包SHA256为3DDDA9EB5D1F5C312FF5B5D16B3E2CA19AE804ADB2080D54B70D644261235E31。候选、根目录与原生安装EXE一致。

| 需求 | 实际结果 | 证据 |
| --- | --- | --- |
| 客户目录鼠标/键盘与全部客户 | 从五主页面共20种实际操作均到报价页且结果/选中一致，报价记录数不变 | [根路径验收](E:/工作/.build/release-1.8.5-20261025/root-shell-qa/report/report.json) |
| 其他入口检查 | 20项定向pytest；源码/冻结候选/安装后/根程序各16项实际桌面验收 | navigation-green-final.xml、navigation-inventory.json |
| 真实登录与云读 | 最终候选真实Auth、首页/客户/项目/设置/同步元数据8项通过，0业务写入 | [云验收](E:/工作/.build/release-1.8.5-20261025/candidate-account-qa/report/report.json) |
| 旧程序覆盖与安装升级 | 1.8.4→1.8.5安装升级exit0，10个业务及界面文件哈希不变；凭据替换后变化，当前可读取且保留，原因未确认，根/菜单入口更新 | [替换清单](E:/工作/.build/release-1.8.5-20261025/replacement.json)、[安装验收](E:/工作/.build/release-1.8.5-20261025/installer-verification.json) |

- 构建：CPython3.12.14锁定环境，source/build.ps1 -Python ... -AccountConfigPath .build/cloud-target-fvnac-20261025/account_config.json -SkipTests，输出work/release-work-1.8.5-20261025/工作.exe；source/build_installer.ps1、既有官方Inno6.7.3，输出work/release-native-installer-1.8.5-r1。全套构建测试明确跳过，另行本轮定向与实际程序验收；snapshot业务修复/版本/QA与当前源码一致，云配置仍fvnacayonhyretsqcqqc。
- 授权替换：用户明确允许结束E:/工作/工作-1.8.4.exe，已核实并结束25292/11528两个旧进程；旧根1.8.4及安装包已归档，根1.8.5及新包就位。原生安装路径C:/Users/Administrator/AppData/Local/Programs/PriceQueryDesktop/工作.exe；根快捷方式指向1.8.5，开始菜单参数--data-dir指E:/工作/data。重新安装可能重置该参数，需复核。未改变业务data。
- 正式根快捷方式已启动中文账号登录窗，保存账号预填、密码掩码；未在正式data窗口提交登录。根进程pid30948/父31700留运行，runtime版本1.8.5。登录窗关闭可退出；登录后用“退出程序”，主窗关闭可能入托盘。真实登录检查在同一哈希候选的隔离data执行通过。
- 回退：[目录](E:/工作/.build/release-1.8.5-20261025/rollback)，保留旧1.8.4 EXE/安装包/快捷方式和原生安装payload，旧EXE哈希5C2845633A3623A0AE48FF19736E920842263B96C99B4FDB316F68C8E0FC5249。退出新版后恢复旧EXE/快捷方式，原生安装可运行旧包恢复登记，不删除data；本轮无云迁移或数据库回退。
- 审查：4文件本轮差异，Ruff/py_compile/AST/UTF8和diff-check通过，旧模板/云迁移等1.8.4未变结果继续有效；[增量审查](E:/工作/.build/release-1.8.5-20261025/REVIEW.md)。初始RED正确复现错页；QA脚本缺目录refresh修正，首冻结测试受控客户名变d，提示暂停键盘后同一二进制新隔离目录通过，不改业务掩盖。
- 清理：本轮7个明确QA data已清理，报告/截图/测试源码/SQL旧证据/回退保留，见[清理清单](E:/工作/.build/release-1.8.5-20261025/cleanup.json)；历史其他任务临时目录未扩大处理。有限构建、测试、安装均完成。
- 边界：安装包仍未签名，生产非空客户主档跨设备写入不属本次验收；库存MES真实登录/写入及单据外发没有执行。截图仅当前设备/960×640/受控报价状态验证，报价表既有横滚保留，未改列宽或删列。轻量洞悉无证据充分且达到90分的范围外追加方案，不扩展重构。
- 使用Skill：systematic-debugging、test-driven-development、computer-use:computer-use。

以下为历史阶段记录；本节为当前交付结论。

## 当前交付：1.8.4客户备注、历史迁移与桌面正式上线（2026-10-25，已完成）



- 正式交付：[工作-1.8.4.exe](E:/工作/.build/release-1.8.5-20261025/rollback/工作-1.8.4.exe)、[安装包](E:/工作/.build/release-1.8.5-20261025/rollback/工作-1.8.4-安装包.exe)。版本1.8.3→1.8.4，沿用SemVer补丁+1，r1/r2重建不再递增。

- EXE SHA256：5C2845633A3623A0AE48FF19736E920842263B96C99B4FDB316F68C8E0FC5249；安装包SHA256：6458B008A2CCC32E742C30851A6C26E3DA6BE94DECD3E6D560722041451499F1。候选、正式根和安装后EXE一致。



| 需求 | 实际变更与完成状态 | 证据 |

| --- | --- | --- |

| 客户备注和布局 | 地址后新增可空手改多行备注（2000字）；六列自适应，960×640无横滚；搜索含备注、旧SQLite补列 | [最终UI报告](E:/工作/.build/release-1.8.4-20261025/root-shell-qa/report/report.json) |

| 固定模板兼容 | 新XLSX含备注，兼容旧7列，更新旧模板不抹已有备注，导出导入实际回读通过 | final-r2-regression.xml、root-shell-qa/report/report.json |

| 历史业务迁移 | saodtwnvbanjlkwwivcb→fvnacayonhyretsqcqqc，新增16报价/8报价客户/10审计，总120/26/11；原104/18/1逐条不变 | [内容核验](E:/工作/.build/release-1.8.4-20261025/history-content-verification.json) |

| 登录和增量审查 | 首次客户列表复用一次探测消除重复请求，主动刷新及写入后真实读取；旧模板清备注问题已修复 | [审查](E:/工作/.build/release-1.8.4-20261025/REVIEW.md)、[真实云验收](E:/工作/.build/release-1.8.4-20261025/root-account-qa/report/report.json) |

| EXE与安装包覆盖 | 首次安装/覆盖升级exit0，原生登记1.8.4；旧EXE及安装包备份归档、快捷方式更新，未强杀用户进程 | [替换清单](E:/工作/.build/release-1.8.4-20261025/replacement.json)、[安装验收](E:/工作/.build/release-1.8.4-20261025/installer-verification.json) |



- 云迁移一次正式事务HTTP201，notes v2保留旧RPC签名/revision/RLS，anon拒绝保存、authenticated可保存，临时CREATE/自授grant无残留。报价ID避冲突分配144–159，identity序列独立一次向前校准159，120报价不变。源库未改；源零业务成员默认规则留源和私有备份，不造账号或串户；目标同内容规则保留，成员/规则/项目/单据/主档不变，后三者0条。

- 隔离PGlite PG17.5（生产17.6）按实际快照、约束、RLS/角色及触发器完成历史/备注实际RPC和回退17项、序列前移及不倒退演练。不在生产演练；历史回退仅新增记录未变且无新关联可执行，非空备注拒绝删列，序列不倒退，真实生产回退须另核授权与当前数据。

- 构建沿用CPython3.12.14锁定环境、source/build.ps1 -AccountConfigPath ... -SkipTests，候选work/release-work-1.8.4-20261025-r2/工作.exe。显式跳过全套构建测试，另做18项及实际程序验收。Inno Setup6.7.3官方编译器签名有效；程序/安装包未签名，未有发布者证书，不能承诺其他电脑无SmartScreen提示。编译器错位安装已用原卸载器清理，现位于证据根inno/compiler。

- 验收：18项定向回归通过；最终r2候选、安装后、根EXE各实际桌面13项及真实Auth/云读取8项通过/exit0。根程序登录至首页单次9.281秒、安装后7.968秒，网络/服务波动未控制，不作稳定提升比例承诺。Ruff/语法/diff-check/11文件增量审查通过。

- 原生程序路径C:/Users/Administrator/AppData/Local/Programs/PriceQueryDesktop/工作.exe；开始菜单“工作桌面端/工作”目标及--data-dir指向E:/工作/data已只读核对，未另点菜单登录，重新安装可能重置此参数，之后须复核共享数据绑定。根快捷方式目标1.8.4，工作目录E:/工作。

- 正式data保留：10个非凭据文件最终哈希不变；登录凭据文件正常登录后加密封装哈希变化，未输出秘密或覆盖业务数据。原生UI已观察根1.8.4登录首页、云同步正常；pid22456/父13096留运行，用“退出程序”停止，关闭主窗可能仅入托盘，重启用根快捷方式。

- 回退：[备份目录](E:/工作/.build/release-1.8.4-20261025/rollback)，旧1.8.3 EXE SHA256为5CA774000A3CB8C0128C138C209398E78A38AE1B11498E17C216C8F852D6DDCA。退出新版后恢复旧EXE和快捷方式，data保留；程序与数据库回退独立。私有快照/manifest/SQL保留本机，不向交接复制业务正文。

- 清理：本轮9个明确QA data目录全部删除，报告、截图、SQL、私有备份及回退保留，见[清理清单](E:/工作/.build/release-1.8.4-20261025/cleanup.json)。历史手动删除目录未扩大处理；无有限构建、测试、安装或迁移任务待完成。

- 限制：生产客户主档0，未造非空生产客户，未执行非空主档跨设备写入；隔离RPC通过不能替代该链路。待办仍本机账号保存；移动端不在范围。当前设备/客户页/960×640/受控数据状态无可见错误，不泛化全系统。

- 洞悉评估：无具有足够收益证据且达到90分准入门槛的范围外重构候选，不追加无关改造。使用Skill：systematic-debugging、test-driven-development、computer-use:computer-use。



以下为历史阶段记录，仅表示当时状态；本节为最新交付结论。



## 当前状态：桌面与fvnac云端切换已交付（2026-10-25）



- 最终程序：[工作-1.8.3.exe](E:/工作/.build/release-1.8.4-20261025/rollback/工作-1.8.3.exe)，SHA256 `5CA774000A3CB8C0128C138C209398E78A38AE1B11498E17C216C8F852D6DDCA`。快捷方式目标为此文件、工作目录E:/工作；旧根1.8.2已归档。版本映射沿用SemVer补丁+1，1.8.2→1.8.3，失败重建r2不重复递增。

- 构建：CPython3.12.14锁定环境，source/build.ps1 -AccountConfigPath（目标公开配置）-SkipTests；候选work/release-work-1.8.3-fvnac-20261025-r2/工作.exe。全套构建测试显式跳过，不称全套通过；源文件与构建快照及部署SQL一致。首次路径转义在构建前失败已改正，r1通过后补回退SQL资源、r2正式交付。

- 云端目标为https://fvnacayonhyretsqcqqc.supabase.co。一次事务正式部署桥接、客户资料、项目v1/v2、单据RPC，HTTP201；最终只读核验104报价、18报价客户、3成员内容摘要及旧同步函数不变，三张新表0记录；RLS强制、匿名拒绝、authenticated权限正常，无残留CREATE或自授SET。

- 回退：程序和快捷方式在.build/cloud-target-fvnac-20261025/rollback；旧哈希50757F542FC4469E1379DF89BDF8B9BF6438972D2BDFF1C6B3568AFA673CA5C5。退出新版后恢复旧EXE/快捷方式即可，不删除data。新旧项目的账号目录均保留；已核实同一保存账号并仅复制5个缺失待办/草稿/UI文件，哈希一致，不自动提交草稿。

- 数据库回退只移除本次新增模块，新增模块有业务记录时明确拒绝；不得在生产演练。隔离PostgreSQL17.5 WASM与目标17.6匹配必要约束/RLS/角色契约，完整及单独桥接回退均实际通过；非完全相同PG二进制。正式回滚另行核对授权和业务记录。

- 限制：旧项目saodt的历史业务未全量跨库合并；客户主档当前0条，与原报价客户目录分开。待办仍按本机账号目录保存。客户云保存逻辑已在隔离实际RPC演练，生产仅登录/读取和空批保存，没有虚构业务客户或跨设备编辑冲突验收。

- 清理：五个QA数据目录已移至E:/工作/手动删除/cloud-target-fvnac-1.8.3-对应QA名称-data，凭据副本已清除；详情cleanup.json。报告、回退、演练依赖和必要证据保留。



| 需求 | 实际变更与完成状态 | 证据 |

| --- | --- | --- |

| 桌面客户管理/待办/中文/设置 | 1.8.2阶段完成；1.8.3保留客户五字段可空手改、固定XLSX导入导出、关联入口、待办细分筛选、数据与导入进设置 | customer-desktop-1.8.2-20261025报告；本轮根路径12项通过 |

| 新云端客户RPC与程序连接 | 桥接旧同步不覆盖；客户保存/读取、项目自定义v2、单据RPC已正式部署；公开配置打包 | [生产只读核验](E:/工作/.build/cloud-target-fvnac-20261025/production-verification.json) |

| 1.8.3覆盖与启动 | 候选和正式哈希一致，快捷方式已更新，实际打开中文登录窗 | [替换清单](E:/工作/.build/cloud-target-fvnac-20261025/replacement.json) |



- 当前运行：正式快捷方式启动的登录窗保留，runtime pid28960、Windows父/子进程27568/28960（PyInstaller onefile）；未在此正式窗口提交登录。实际登录验收在显式隔离data对同一正式EXE完成。退出登录窗即可停止；重启使用正式快捷方式。

- 增量审查基线和九个文件哈希见[审查记录](E:/工作/.build/cloud-target-fvnac-20261025/REVIEW.md)。桥接单独回退owner权限缺陷已修复并定向复审；无本次未解决高置信度问题。轻量洞悉评估未发现具备足够证据、属于当前范围之外且达90分门槛的额外改造项，不扩展重构。

- 以下为历史阶段记录，仅表示当时状态；本节为最新交付结论。



## 云迁移实际项目写入验证：列引用歧义（2026-10-25）



- 客户RPC空值保存/更新/电话前导零/冲突拒绝/账号隔离/同步版本及客户回滚已通过隔离演练；项目结构和权限升级通过，但扩大到实际项目保存时发现42702 project_id歧义，函数局部变量与列同名。未生产写入。

- 定向替代：v1/v2的RETURNING及UPDATE过滤引用限定到项目表，不重命名字段或改变接口；复验项目新增、修改、旧接口、计分和回滚。客户已通过且未变化的结果继续有效。



## 云迁移增量恢复：项目v2权限（2026-10-25）



- 原客户迁移权限顺序修复后，隔离客户表与RPC创建通过，anon不可执行、authenticated可读写。桥接保留既有同步RPC和触发器；v1项目结构通过。

- 新失败：project_progress_v2_custom_values.sql以非owner的postgres修改由pmu_executor持有的表，42501 must be owner of table pmu_project_progress。证据rehearsal-v2-failure.json，未生产写入。

- 方案调整仅限权限路径：v2借SET角色执行ALTER TABLE和函数创建，RESET后写settings，保留原数据/接口和管理员原grantor。回滚按相同owner路径并保留非空数据拒绝门禁。随后实际隔离RPC与回滚验证。



## 云端目标fvnac迁移：隔离演练发现权限顺序错误（2026-10-25）



- 用户要求先交付桌面，1.8.2桌面阶段已完成，现进入授权目标fvnacayonhyretsqcqqc客户RPC部署及程序连接切换。

- 目标只读：PostgreSQL17.6，3个成员、18个报价客户、104条报价；已有pmu_data_versions和pmu_sync_meta_v1/pmu_bump_version；缺少desktop_schema标记、桌面helper、客户资料和项目接口。保留现有同步结构，不执行desktop_sync_v176覆盖。

- 隔离：便携PG下载分别TLS EOF/连接超时；改用本地PGlite PostgreSQL17.5，复制相关表/约束/RLS/角色授权契约，使用虚构用户，不复制业务数据。Postgres管理角色为非superuser与NOBYPASSRLS，借SET角色转移所有权。

- 首次客户脚本实际失败42501 permission denied for table pmu_customer_profiles；根因为转移表所有权后CREATE TRIGGER和ACL仍以非继承的postgres执行。生产未执行。证据.build/cloud-target-fvnac-20261025/rehearsal-diagnostic.json。

- 替代方案：在pmu_executor作用域创建触发器并设置RPC ACL，再RESET；完善安全回滚和同步依赖桥接。演练实际RPC保存/更新/冲突/跨账号/回滚后再正式一次执行。程序连接修改及1.8.3构建须等待云端核验，1.8.2保持可回退。



## 当前桌面客户管理与待办增强（2026-10-25，1.8.2桌面交付完成）



- 已完成：客户管理位于待办上方，五字段可空且手改；固定XLSX模板导入导出及编号/版本校验；客户到报价/项目预填/待办关联；数据与导入移至设置；待办增加四状态与今日/逾期/优先级/类别筛选；原生Qt中文。移动端未改。

- 验证：定向66项和后补RPC8项通过，源码/冻结候选/正式根路径各12项原生Qt smoke通过；定向Ruff/py_compile/diff-check通过。构建快照与业务源码哈希一致，增量审查REVIEW.md未发现未解决高置信度问题。

- 构建source/build.ps1，锁定CPython3.12.14，首轮中文资源参数编码失败，r2采用ASCII JSON协议后成功；构建全套检查显式跳过，不称全套测试通过。

- 版本：1.8.1→1.8.2（补丁+1映射），正式程序 `工作-1.8.2.exe`，SHA256=`50757F542FC4469E1379DF89BDF8B9BF6438972D2BDFF1C6B3568AFA673CA5C5`，与r2候选及清单一致；快捷方式已指向新版且实际显示中文登录窗，未登录，保留窗口。旧根1.8.1已归档，data和配置未覆盖。

- 回退：`.build/customer-desktop-1.8.2-20261025/rollback/工作-1.8.1.exe`与旧快捷方式；旧哈希`1A6973D829EF8975C34625C990B19AE1E4BADEEE3E279372427FC6D0A8639E9A`。退出新版后恢复旧程序和快捷方式，不删除data。替换前旧进程已退出，没有实际结束用户进程。

- 清理：本轮source-qa/candidate-qa/root-qa隔离data已移至根目录手动删除/customer-desktop-1.8.2-对应名称-data；report和回滚保留。

- 云端边界：本包仍使用原saodtwnvbanjlkwwivcb账号配置，客户RPC缺失时明确仅本机保存，待办按账号本机保存。真实云写入/跨设备尚未验收。用户新增目标fvnacayonhyretsqcqqc，要求本阶段结束再执行；仅确认控制台可用，未运行SQL或切换配置。



## 当前增量：待办、项目进度自定义字段与1.8.1交付（2026-10-25，进行中）



- 目标：待办页面和项目自定义文字已实现；1.8.1已覆盖旧版并设为正式程序；生产迁移与合同云端写入尚未完成。

- 测试失败诊断：旧 SQLite 迁移保留测试首次回归为16通过/1失败；失败断言在保存第二个项目后直接读取列表第0行。实际查询按 `updated_at, project_id` 排序，秒级相同更新时间下不保证新记录位于第0行；旧记录保留断言已通过，未发现迁移丢数据。

- 恢复结果：测试已按 `save_project_progress()` 返回的新项目 ID 定位回读记录；只修改测试断言。复测项目进度与待办服务17项通过，桌面待办/项目进度Qt 9项通过；Ruff、语法编译和差异检查通过。

- 账号项目状态修复：账号模式从实际存储读取 `url`，而非共享项目常量；缺少URL时回退默认值。使用临时 `AccountStore` 配置 `saodtwnvbanjlkwwivcb` 的测试及兼容上下文测试均通过。

- RPC路由契约复核：客户端项目进度请求使用 `rpc/pm_*_v2`，账号存储适配器统一映射为 `rpc/pmu_*_v2`，与迁移函数名和账号鉴权路径一致；定向契约用例2项通过，未发现名称错配。未调用真实生产RPC。

- 定向复测：账号隔离、项目进度及待办服务21项通过；Ruff、语法和差异检查通过。桌面待办/项目进度Qt 9项通过；1.8.1候选及替换后的正式根路径各有10项隔离smoke通过。

- 冻结候选：`work/release-work-1.8.1-todo-custom-20261025-r3/工作.exe`，版本1.8.1，SHA256=`1A6973D829EF8975C34625C990B19AE1E4BADEEE3E279372427FC6D0A8639E9A`，构建清单哈希一致；私有打包账号配置项目ID核对为 `saodtwnvbanjlkwwivcb`。构建显式跳过全套测试，另有定向测试和实际冻结 smoke 证据。

- 冻结程序验收：Windows原生Qt、隔离SQLite，候选与正式根路径均10项smoke全通过，涵盖待办新增/筛选/完成/编辑持久化、自定义文字保存且计零分、960px侧栏、托盘恢复和退出。正式路径报告为 `.build/project-progress-1.8.1-root-qa-20261025/report/report.json`，版本1.8.1、退出码0。未实际登录账号或访问云端。

- 正式程序状态：正式路径为 `工作-1.8.1.exe`，SHA256=`1A6973D829EF8975C34625C990B19AE1E4BADEEE3E279372427FC6D0A8639E9A`，与候选一致；快捷方式 `工作快捷启动.lnk` 指向该路径，工作目录为 `E:\工作`，目标进程0。旧根路径 `工作-1.8.0.exe` 已移至 `.build/project-progress-1.8.1-replacement-20261025/rollback/工作-1.8.0.exe`，SHA256=`5FCE7F377D722A725C11C5AF14F8E603E6D22BC1B851C44672F1F9F6E62CDDDB`；原快捷方式副本也保存在该回退目录。

- 阻塞与数据边界：本机未发现PostgreSQL、Docker命令或已安装的WSL发行版，未建立隔离数据库。本轮只读核验确认程序交接及1.8.1 EXE配置目标 `saodtwnvbanjlkwwivcb` 为 `main PRODUCTION`，分支页仅列生产主分支、无隔离分支；用户本轮提供的 `fvnacayonhyretsqcqqc` 则显示为另一组织项目 `baoxiao` 的 `main PRODUCTION`，其创建分支入口不可用。两者均不是隔离副本，且目标与既有生产授权不一致；未运行SQL或更改生产结构/业务数据。`project_progress_v2_custom_values.sql` 与 `business_documents_v1.sql` 的迁移/回滚、合同草稿查重/写入仍未完成。继续前须确认目标项目；若在生产项目创建Supabase隔离分支，还须明确允许复制生产数据并接受相关资源成本。

- 临时数据：此前三个候选smoke数据目录已移至对应 `手动删除/project-progress-1.8.1-shell-qa*`；正式根路径smoke的隔离SQLite和标记文件已移至 `手动删除/project-progress-1.8.1-root-qa-data`。测试报告与截图保留在相应 `.build/project-progress-1.8.1-*` 目录。



## 本轮报价单/购销合同制作记录（2026-10-25，已完成）



- 当前目标：在桌面端制作报价单和购销合同中增加“制作记录”，支持双击已有记录继续编辑、双击列表空白处新建，并允许手动修改单据内容；手机端、EXE重建和Supabase业务写入不在本轮范围。

- 实际变更：`source/services/business_document_service.py` 增加报价单/合同独立记录文件、创建/更新/读取/删除、记录标题、账号目录隔离、最多200条和2MB文件边界；`source/ui/business_document_dialog.py` 增加“制作记录”页签、记录列表、双击载入、空白视口双击新建、保存/删除操作，以及产品明细双击/F2编辑提示。PDF/Word导出成功后继续保存草稿并同步保存当前制作记录。

- 数据边界：记录沿用当前账号本地 `business-documents` 目录，报价单与合同分文件保存，不写Supabase、不修改已有报价/合同，不改变旧草稿格式或模板资源。

- 失败恢复：首轮回归发现PySide6的`itemDoubleClicked`实际只传一个项目参数，处理函数已改为兼容单参数；增量审查又发现空白双击事件过滤器安装在视口但判断了表格本体，已修正并补充回归。

- 有效验证：`source/tests/test_business_documents.py` 定向Qt/服务回归36项通过；相关生产/测试文件Ruff、`py_compile`和`git diff --check`通过。测试对象为源码Qt对话框和本地临时目录，不访问网络或真实业务数据。

- 已知限制：本轮未重建EXE、未登录真实账号、未做Supabase同步、手机端和实体设备未验收；制作记录当前是每个程序账号目录的桌面本地记录。后续如需跨设备同步，需另行设计云端表/RPC和迁移验收。

- 回退说明：本轮无数据库迁移、无外部发布；回退只需按本轮相关源码差异恢复，不能删除用户现有`business-documents`数据。



## 本轮桌面 UI 重构融合实施方案交付（2026-10-25，方案已形成；未实施代码变更）



- 当前目标：融合附件《UI体系重构方案-20261025.md》和上一版桌面 UI 评审建议，形成可执行的桌面端 UI 重构方案；移动端不在范围内。

- 实际交付：新增 `docs/UI体系重构融合实施方案-20261025.md`。采用附件的“规范/组件→主窗口→对话框→主题/DPI→灰度”主线，吸收阶段门禁、增量迁移、回滚、团队周期和基线先行原则。

- 事实修正：记录当前主窗口已有 960×640 最小尺寸；表格为 `QTableView`/`QTableWidget` 混用；12 个 Qt 测试文件和 17 类 smoke runner 的入口范围已区分；当前工作区模块行数只作为动态快照，不能替代实施基线。

- 范围约束：本轮只读评估和文档交付；未修改 UI、服务、数据库、Supabase、EXE、安装包或正式业务数据；未运行测试、启动程序或采集截图。

- 关键决策：保持 PySide6/Qt Widgets；先建立基线和组件试点；暗色主题、资源文件迁移、绝对行数/覆盖率门槛改为有证据后再决定；17 个 smoke runner 需逐项运行或先验证聚合入口。

- 方案评分：融合方案自评 91/100；附件主稿 84/100，上一版 78/100。评分仅用于方案选择，不代表代码完成度。

- 交付限制：正式实施前需重新读取本节、确定当前改动归属和最新版本基线；本方案不授权生产发布、云端写入或 EXE 覆盖。



## 当前桌面 UI 体系重构实施（2026-10-25，进行中）



- 当前目标：按已确认的融合方案整理桌面 PySide6 UI，并交付可用版本；移动端、服务层、业务规则、Supabase 和正式业务数据均不在范围。

- 已完成源码结构整理：59个主窗方法按客户目录、报价查询/操作、文件操作和项目进度职责拆入 mixin；10个对话框/控件定义拆入独立模块，`ui.dialogs` 兼容导出保留。

- 样式变更：新增统计数字/紧凑态/日期数字和库存单元格间距 token；改用动态属性及主题 QSS，已运行 Qt RCC 更新 `source/ui/resources_rc.py`。

- 回归修复：报价对话框在收到自身成功写入结果后，按 `added` 或本次身份补齐标记将预期数据代次推进一次；并发写入仍使用原有代次冲突校验。图片报价测试同时适配 offscreen 空剪贴板与迁移后的识别 mock 所属模块。

- 验证：锁定环境下桌面 Qt 与单据定向回归 `142 passed`；构建契约测试 `7 passed`；本轮 UI/直接测试 Ruff、Python 语法和跟踪文件差异检查通过；最终增量审查未发现未解决的高置信度问题。

- 版本与交付：用户确认 `1.7.9` 映射到 `1.8.0`。版本源为 `source/domain.py`，程序窗口、PyInstaller 清单和安装器脚本均从该源读取。最终 UI 候选 `r4` 为 `work/release-work-1.8.0-ui-refactor-20261025-r4/工作.exe`；r1、r2、r3 保留作诊断证据。实际交付目标为根目录 `工作-1.8.0.exe`，快捷方式指向该路径。

- 替换基线与回滚：当前根目录 `工作-1.8.0.exe` SHA256=`5FCE7F377D722A725C11C5AF14F8E603E6D22BC1B851C44672F1F9F6E62CDDDB`，快捷方式目标为该文件、工作目录为 `E:\工作`，目标进程数为0。替换前1.8.0程序SHA256=`651BDD4DEC65F29388FF2F94B318803A4403E5D1AD9670C3CA7F7E1670753544`，回滚副本保存在 `.build/ui-refactor-1.8.0-20261025/rollback/current-工作-1.8.0.exe`；既有1.7.9回退副本继续保留在离线同步交接目录。用户数据与配置未覆盖。

- 当前状态：源码已将侧栏主布局间距从12px调为8px，并保留存储标签/设置按钮垂直居中。原生 Windows Qt 回归通过：设置按钮高度至少38px、客户目录高度至少50px、中心差不超过1px；桌面主窗与构建契约42项、定向Ruff、Python语法和差异检查通过。最终 `r4` 候选与根目录 `工作-1.8.0.exe` SHA256均为`5FCE7F377D722A725C11C5AF14F8E603E6D22BC1B851C44672F1F9F6E62CDDDB`。最终根路径在Windows原生Qt隔离SQLite下完成真实冻结程序 smoke，六项检查全通过，报告位于 `.build/ui-refactor-1.8.0-20261025/final-root-shell/report/report.json`；截图 `.build/ui-refactor-1.8.0-20261025/final-root-shell/report/settings-tray-1280.png`。替换前根程序 `651BDD4DEC65F29388FF2F94B318803A4403E5D1AD9670C3CA7F7E1670753544` 已保存在 `.build/ui-refactor-1.8.0-20261025/rollback/current-工作-1.8.0.exe`。快捷方式仍指向根目录1.8.0文件且工作目录正确；验收后目标进程0。r3唯一失败来自陈旧smoke页索引断言，已修复为保留数据页索引2并在r4/根程序实测通过。未触碰Supabase或正式业务数据。

- 临时数据清理：PowerShell删除本轮隔离SQLite运行文件被执行策略拒绝，未改用其他删除方式；三个仅含空SQLite/日志/锁/UI设置/smoke标记的目录已从 `.build/ui-refactor-1.8.0-20261025/{isolated-shell/data,isolated-shell-r4/data,final-root-shell/data}` 移至 `E:\工作\手动删除\ui-refactor-1.8.0-20261025/{isolated-shell-data,isolated-shell-r4-data,final-root-shell-data}` 待手动清理。对应验收报告、截图、r3失败证据和回滚副本仍保留在原路径。



## 本轮桌面客户目录结构重构（2026-10-25，已完成；项目进度 UI 按要求跳过）



- 当前目标：按已确认的融合方案，把桌面客户目录从报价查询的 `meta` 结果中拆出，使用独立目录读取、独立异步调度和可失效缓存；本轮不实施项目进度 UI 失败用例、不改手机端、不执行 Supabase 迁移。

- 实际变更：`CustomerService.list_customers()` 复用 SQLite/Supabase 的 `customer_summaries`，按存储代次、客户数据代次和状态缓存；主窗口新增 `customer-directory` 序列与取消键，目录与报价刷新、错误和旧结果丢弃相互独立。

- 数据一致性：报价新增、补齐缺失身份和批量导入成功后推进客户数据代次；客户删除、恢复和核对结果继续失效目录缓存并清理预览。为保留既有并行导入预览契约，报价写入只推进代次、不清空其他导入预览。

- 兼容性：`meta_loaded()` 仍负责材料下拉框，并保留直接测试和托盘调用；目录读取兼容 `name/count` 与 `display_name/specs` 两种现有摘要字段。未修改客户改名、合并、`customer_key` 迁移、Supabase 结构和正式业务数据。

- 实际验证：服务/导入/报价/客户生命周期/读优化定向测试 `84 passed`；相关桌面 UI `9 passed`，客户生命周期与托盘 UI `13 passed`；Ruff、Python 语法和差异格式检查通过。

- 失败恢复：首轮扩大回归发现报价写入清理导入预览导致 `2` 项既有用例失败；新增 `clear_previews=False` 的代次失效路径后复测 `83 passed`。该修复不改变客户生命周期写入的预览清理行为。

- 当前限制：未重建根目录 EXE，未连接实体手机，未执行真实 Supabase 业务写入；项目进度 UI 失败用例仍按用户要求保留为未处理，不得写作已修复。



## 本轮已完成：项目进度显示、编辑与滚动体验（2026-10-25）



- 当前目标：在“报价查询 → 项目进度”完善并默认收起材料项目方案，移除台账分项得分/总分列，重排项目明细，支持表内手动修改并在保存/刷新后保留滚动位置；按既有构建流程重建并覆盖根目录 `工作-1.7.9.exe`。

- 范围与约束：仅修改项目进度 UI、直接 Qt 回归和双交接；保留完整编辑窗、模板导入导出、评分档位及既有版本冲突校验。不创建虚构业务项目、不触碰 Supabase 或正式 `data`。

- 计划调整证据：CPython 3.12.14、离屏 Qt 下首轮增量测试 `4 passed, 1 failed`。失败用例为30行台账时外层页面滚动最大值仍为0，说明此视口下下滑由台账自身滚动区域承载；新增用例改为验证表内纵向滚动及刷新后滚动位置，页面外层位置仍由实现保存/恢复。

- 失败记录：失败命令为 `python -m pytest -p pytestqt.plugin source/tests/qt/test_desktop_ui.py -k project_progress -q --tb=short`；失败断言为 `page_scroll.maximum() > 0`，实际为 `0`。这是滚动容器假设不符；台账限高后，后续回归已验证表内滚动和新增后位置保持。

- 最新验证：项目进度 Qt 回归 `5 passed, 26 deselected`，覆盖方案默认收起/展开、9列无得分、30行表内滚动、新增后位置保持、F2单元格编辑与SQLite保存回读（revision 1→2）；服务测试 `12 passed` 仍有效。offscreen `QTest.mouseDClick` 在最小标准表格中不启动编辑器，故不作为程序双击的验收证据。

- 当前代码状态：`source/ui/main_window.py` 增加默认收起方案区、9列表格、六个文字字段的白名单内联编辑、F2提示、420px表格高度上限与加载时页面/表格滚动恢复；用户仍可双击或按F2进入编辑。真实云端账号链路未触碰。

- 增量审查：仅检查本轮项目进度 UI 与对应 Qt 回归差异；编辑字段白名单、版本校验、滚动恢复和折叠状态与验收目标一致，未发现需要修复的高置信度问题。Ruff、Python 语法及差异格式检查已通过。

- 构建与替换：候选 `work/release-work-1.7.9-project-progress-ui-20261025/工作.exe` SHA256=`C989F1BEBE77C947E90E3C64D004523272379E5E88051433AF9DAE3FD162B748`；构建清单记录自动检查由显式开关跳过，`actualProgramVerification=not_run`。另一次隔离数据目录启动只确认程序账号登录窗口可见，未登录或打开项目进度页。

- 根 EXE 已使用同卷暂存和 `File.Replace` 覆盖。`工作-1.7.9.exe` 与候选哈希均为 `C989F1BEBE77C947E90E3C64D004523272379E5E88051433AF9DAE3FD162B748`；旧根程序回退副本 `.build/project-progress-ui-20261025/rollback-current-root-60F2CDE5.exe` 哈希为 `60F2CDE5D26D74AACE77920FA72179DC32AE7A99F0163E93FF432DF52251B6BF`，替换时及完成后目标进程数为0。

- 未完成验证：本轮未登录真实账号，因此冻结 EXE 内项目进度页面的实际交互、真实 Supabase 读取/保存及跨设备同步未验收；没有提交业务记录，正式 `data` 未触碰。



## 桌面项目进度台账与同步恢复（2026-10-24，EXE已更新；真实客户端同步待验收）



- 目标：按 Excel 的评分规则，在“报价查询 → 项目进度”提供可编辑台账；为程序账号写入 Supabase `saodtwnvbanjlkwwivcb/main` 的隔离表与 RPC；重建并覆盖桌面 EXE，确认双击可见启动。Excel 当前无真实项目行，初始项目数保持 0。

- 当前交付：根目录 `工作-1.7.9.exe` 与候选包 SHA256 均为 `60F2CDE5D26D74AACE77920FA72179DC32AE7A99F0163E93FF432DF52251B6BF`；替换前根版本以 `.build/project-progress-sync-actual/rollback-current-root-95DBA131.exe` 保留，SHA256=`95DBA131CB5DEB3882011CD160AE200DCA66A9D30F2C4F2B7ADCF57417FB069C`。

- 上一阶段双击修复有效：`工作-1.7.9.exe` SHA256=`BFAF83F8647B1981F4136FB06A5BF0B9D84A417A0407BEF39528F976EBA78749`，但它尚不包含本轮台账编辑和云同步代码。

- 首轮定向测试：CPython 3.12.14，`source/tests/test_project_progress.py` 为 1 passed、2 failed。失败证据：B 档用例实际 51 分/C 档，与 69 分/B 档预期不符；新 SQLite 库初始化在 `BEGIN IMMEDIATE` 处报 `cannot start a transaction within a transaction`。

- 失败根因：初始化在显式 schema 事务之前插入默认规则，开启了隐式事务；评分样例阶段代码与其声明的 B 档预期不一致。编辑窗把数据库 `NULL` 时间节点转为 `None` 文本。

- 生产只读角色核验：PostgreSQL 17.6，当前角色 `postgres`；`pmu_executor` 成员关系由 `supabase_admin` 授权，`admin_option=true`、`inherit_option=false`、`set_option=false`；执行角色无 `public CREATE`，已有 `pmu_data_versions` INSERT/UPDATE 权限。迁移需拒绝已有 `postgres` 自身授予记录，并仅撤销本次临时 grant。

- 修复方案：将默认规则插入移到 schema 初始化后；让 B 档样例使用阶段 5（总分 69）；把可选空值显示为空文本；保持既有表、RPC、版本同步、账号隔离设计，补充当前失败范围的回归。

- Supabase 生产迁移：`saodtwnvbanjlkwwivcb/main` 一次事务成功。创建账号隔离项目表/规则表、RPC 与版本触发器；为2个启用账号写入默认评分规则，项目台账记录数为0。只读核验确认强制 RLS、行策略、表无直接访问、authenticated 仅执行两项业务 RPC、anon/service_role 无执行权限；执行角色所有权与同步触发器正确；原 `supabase_admin` 授权保留，本次 `postgres` 临时成员授权已撤销；不记录数据库秘密。

- 方案调整：构建前增量审查发现新项目表单默认选中第一项分类（包含吉利战略/高材料价值/已定点），遗漏选择时可能虚增评分。暂停构建；改为客户类型、客户战略价值、材料价值、阶段、竞争均明确选择后才可保存。沿用既有评分算法、数据结构和已部署 RPC/权限，不改迁移、不增加生产写入。调整后重跑评分/空字段服务测试、Qt 新建与编辑表单测试，再构建。

- 风险与限制：无隔离数据库副本，无法做独立回滚演练；程序账号真实登录后的 RPC 读取、保存和跨设备传播仍需实际账号验收。

- 已完成：必选评分分类回归、候选 EXE 构建和根目录覆盖、根目录 EXE 实际双击可见启动及退出清理；生产迁移一次执行并只读验收，迁移时项目行数为0。

- 遗留：真实程序账号 RPC 读取、保存及跨设备传播尚未验证；无隔离数据库副本，未做回滚演练。临时构建配置与隔离 QA 数据目录因本机执行策略拒绝删除命令仍保留，未尝试绕过。

- 修复后回归：评分、输入校验、SQLite 初始化/新增/编辑冲突、本地备份、云端快照到本机备份定向用例 4 passed。Qt 用例命令曾因 `pytest-qt` 重复注册在收集前退出；按正确插件加载方式复测后，项目进度 UI 3 passed。

- Qt 复测命令调整：沿用 Python 3.12.14 和现有依赖，设置 `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1` 后再显式 `-p pytestqt.plugin`，仅运行 `test_desktop_ui.py -k project_progress`。

- Qt 项目进度页面、录入和空日期回读复测 3 passed，26 个非目标用例未运行；云端快照备份模拟已通过，明确不覆盖真实网络账号链路。针对本轮修改 Python 文件的 Ruff 检查通过。

- 可复用构建配置：本机从已交付 EXE 内提取的配置仅暂存于 `.build/project-progress-build-config/account_config.json`，核验 URL 指向 `saodtwnvbanjlkwwivcb`、publishable key 格式和账号域有效；不记录配置值。构建后清理。

- 构建前核验：桌面版本仍为 1.7.9；根目录旧 EXE SHA256=`BFAF83F8647B1981F4136FB06A5BF0B9D84A417A0407BEF39528F976EBA78749`，目标快捷方式存在、目标未运行；隔离新输出目录不存在。复用配置仅在本机临时目录，构建后清理。



### 本轮最终覆盖与同步核验（2026-10-24，根目录已更新；真实项目写入待验收）



- 候选包：`work/release-work-1.7.9-project-progress-sync/工作.exe`，版本1.7.9，SHA256=`60F2CDE5D26D74AACE77920FA72179DC32AE7A99F0163E93FF432DF52251B6BF`；构建清单记录全量测试由显式 `-SkipTests` 跳过。隔离 smoke 状态为 failed：空库的 `baseline_customers`、`original_41`、`customer_partial_16` 为 false，其余6项为 true；不作为整包通过证据。

- 定向验证：CPython 3.12.14 下 `source/tests/test_project_progress.py` 为 12 passed，覆盖评分、验证、SQLite、模板导入导出和 Supabase RPC 请求体；项目进度 Qt 测试 4 passed、26 deselected；受影响 Ruff 检查通过。

- RPC 合约：本地 `project_progress_list()` 与 `save_project_progress()` 的函数名、参数名和字段，与已部署的 `project_progress_v1.sql` 对应；mock 测试覆盖新建、更新及 revision 递增，未发送网络请求。迁移时只读核验项目表为0条；本轮没有创建或提交业务数据。

- 候选程序：Windows 11 x64，以隔离目录启动候选 EXE，实际窗口枚举确认程序主窗口可见。它自动恢复了本机保存的程序账号会话；未打开项目进度页、查看业务内容或提交记录。关闭窗口后程序转入托盘，随后结束本轮候选进程；目标进程数为0。

- 根目录替换：替换前根 EXE 为 `95DBA131CB5DEB3882011CD160AE200DCA66A9D30F2C4F2B7ADCF57417FB069C`，无目标进程运行；使用同卷暂存文件完成 `File.Replace`。当前根目录和候选同为 `60F2CDE5D26D74AACE77920FA72179DC32AE7A99F0163E93FF432DF52251B6BF`；回退副本为 `.build/project-progress-sync-actual/rollback-current-root-95DBA131.exe`，哈希与替换前根文件一致。快捷方式仍指向 `E:\工作\工作-1.7.9.exe`，工作目录为 `E:\工作`。

- 尚未完成验证：真实账号下项目进度 RPC 读取、保存及跨设备传播。当前没有可提交的真实项目记录；静态合约和 mock 测试不能替代一次真实保存与回读。

- 隔离启动在 `.build/project-progress-sync-actual/candidate-data` 留下应用生成的 `login_credentials.json`、`runtime.json` 和锁文件，未读取凭据内容。此前清理命令受执行策略拒绝，本轮未绕过；正式 `data` 与业务数据未触碰。



### 前一候选覆盖与双击记录（2026-10-24）



- 最新必选分类回归：CPython 3.12.14 服务/备份测试 9 passed；项目进度 Qt 测试 4 passed、26 deselected；相关 Ruff 检查通过。

- 候选包：`work/release-work-1.7.9-project-progress/工作.exe`，版本1.7.9，SHA256=`95DBA131CB5DEB3882011CD160AE200DCA66A9D30F2C4F2B7ADCF57417FB069C`；清单记录全量测试通过显式 `-SkipTests` 跳过。构建临时配置 URL 已核对为 `saodtwnvbanjlkwwivcb`，构建后待清理配置。

- 候选 EXE 实际显示“工作 · 程序账号登录”窗口并正常关闭，未输入账号；隔离 smoke 报告为 failed，空库的3项预置客户基线为 false，其余紧凑布局、报价保存/精度/历史检查为 true，不能记为全包通过。

- 覆盖命令首次失败恢复：根目录未变，仍为旧 SHA256 `BFAF83F8647B1981F4136FB06A5BF0B9D84A417A0407BEF39528F976EBA78749`；已核验旧版副本同哈希、新版临时副本为候选哈希，当前进程数为0。原因是 PowerShell 条件参数写法错误，且 `File.Replace` 不接受空备份路径；没有业务数据或正式 data 写入。

- 最终覆盖验收：使用新建的显式回退目标完成 `File.Replace`；根目录 `工作-1.7.9.exe` SHA256=`95DBA131CB5DEB3882011CD160AE200DCA66A9D30F2C4F2B7ADCF57417FB069C`，与候选和构建清单一致。旧版回退副本 SHA256=`BFAF83F8647B1981F4136FB06A5BF0B9D84A417A0407BEF39528F976EBA78749`。

- 根目录程序从资源管理器实际双击后显示“工作 · 程序账号登录”窗口；未提交登录。关闭后进程为0，`data/runtime.json` 不存在；快捷方式仍指向根目录新 EXE。

- 本轮增量审查覆盖必选分类的服务端校验、录入窗初始状态/客户类型联动和直接服务/Qt 测试；未发现高置信度问题。

- 隔离 smoke 的总状态为 failed：空数据使3项预置客户基线为 false，其余6项为 true；该结果不作为整包通过证据。

- 临时清理状态：执行策略拒绝了两次针对临时文件/目录的 PowerShell 删除命令，均在执行前拒绝；构建输入副本 `.build/project-progress-build-config/account_config.json`、构建快照副本 `.build/desktop-3cdfadcf214543cb8d7db47f750e511d/source/account_config.json` 及候选/隔离 smoke 数据目录仍存在。测试报告、候选 EXE 和旧版回退副本保留。



## 双击启动修复（2026-10-24，已完成）



用户反馈根目录程序双击后无法打开。根因是冻结 EXE 内嵌了占位 `account_config.json`（`your-project.supabase.co`、`REPLACE_ME`）；登录控制器在显示登录窗口前构造 `AccountService`，配置校验异常使窗口化进程没有可见窗口。此次修复只影响构建入口和构建契约，不改业务数据或 Supabase 结构。



| 项目 | 实际结果 |

| --- | --- |

| 构建门禁 | `source/build.ps1` 新增 `-AccountConfigPath`，构建前校验 JSON、Supabase URL、公开客户端 key 格式和账号域；缺失或占位配置直接失败。 |

| 代码契约 | `source/tests/test_build_contract.py` 新增配置门禁用例；使用隔离测试依赖执行 7 passed。PowerShell 解析 0 errors，UTF-8 无 BOM。 |

| 交付包 | `work/release-work-1.7.9-login-fix-2cd665bf79504a24b2409a4f0e5a52b6/工作.exe`；已原子覆盖 `工作-1.7.9.exe`，SHA256=`BFAF83F8647B1981F4136FB06A5BF0B9D84A417A0407BEF39528F976EBA78749`。 |

| 快捷方式 | `工作快捷启动.lnk` 已更新，目标为根目录 1.7.9 EXE，工作目录为 `E:\工作`，无参数，描述为“启动工作 1.7.9（使用 EXE 同级 data）”。 |

| 实际验收 | 隔离候选包和根目录快捷方式均实际启动出“工作 · 程序账号登录”窗口；关闭后 EXE 进程退出，正式 `data/runtime.json` 被清理。 |



构建使用此前已验证的公开客户端配置作为临时输入，未写入源码、交接文档、日志或正式数据；临时配置文件已删除。构建清单明确记录 `checks=skipped by explicit switch`，本轮只完成启动可见性验收，未执行真实账号登录。Supabase 正式迁移/项目进度数据写入因本轮优先修复启动问题而暂停，尚未执行。



本轮增量审查范围为 `source/build.ps1`、`source/tests/test_build_contract.py`、根目录 EXE 与快捷方式；检查配置校验、失败门禁、构建输出哈希、快捷方式目标、启动/退出清理和编码，未发现当前范围内高置信度问题。验证记录见 [双击启动修复核验](../.build/double-click-fix-20261024/verification.json)。# 工作桌面端交接



## 本轮桌面项目进度 EXE 构建与覆盖（2026-10-24，已完成）



本轮继续沿用“报价查询 → 项目进度 → 数据与导入”的 Excel 对齐实现。构建脚本 `source/build.ps1` 增加 `pyside6-rcc.exe` 同目录优先、PATH 回退和缺失即失败门禁；两个本轮新增构建辅助脚本只做 Ruff 导入排序修复。未写入账号、令牌或正式业务数据。



构建证据：系统 Python 3.13 全量门禁曾因缺少既有 `requests` 阻塞；补用已有运行库后全量收集结果为 542 passed、4 failed、20 errors，失败/错误集中在当前环境缺少 RapidOCR/NumPy 二进制和 Inno Setup，未生成 EXE。随后使用 Codex 自带 CPython 3.12.14，配合已有 `.build/document-build-libs`（PyInstaller/RapidOCR/NumPy/Pillow/ONNXRuntime）及 `.build/desktop-qa-libs`（PySide6），以显式 `-SkipTests` 完成隔离构建。



构建产物 `work/release-work-1.7.9-excel/工作.exe` 已原子替换根目录 `工作-1.7.9.exe`；版本 1.7.9，最终 SHA256=`07B9AB9CE176AF87AD5C01014DD6726AD894D5E1A1B292DD875BB70C5F2C41CB`。清单保留在 `work/release-work-1.7.9-excel/build-verification.json`，其中 `checks=skipped by explicit switch`、`actualProgramVerification=not_run`，不把受限全量测试冒称通过。实际冻结 EXE 先后使用 `.build/project-progress-exe-qa`、`.build/project-progress-final-qa` 隔离数据启动并退出 0，生成报告和截图；空库使预置样本基线 3 项为 false，其余紧凑布局、报价保存、精确价格、历史持久化检查通过，不能据此宣称全量业务验收。项目进度页面定向 Qt 用例在离屏环境 1 passed，既有 37 项页面/托盘结果继续有效。旧版本替换前哈希为 `EB1AA6C76A70A5A0E24B2D1B2779254DAF447A77082AAA79C27A624C481E51B8`；正式 data 目录未触碰。



已完成覆盖收尾：候选与旧程序进程均已结束后执行原子替换；临时公开占位配置 `source/account_config.json` 已删除；最终文件哈希已回读并与构建清单一致。未写入账号、令牌、正式业务数据或 Supabase。



本次增量代码审查已完成：基线为本轮修改前相关文件，范围为项目进度导航/页面、主题样式、直接 Qt 测试、`build.ps1` 的资源定位回退及两个构建辅助脚本的导入修复。检查了索引边界、页面隔离、构建输出防覆盖、PATH 回退失败门禁、UTF-8/空白和语法；未发现当前范围内高置信度问题。工作区其他既有 Android、文档模板和发布文件改动未纳入本轮审查。



## 当前状态



### 桌面端项目进度独立页面（已完成，2026-10-24）



用户要求在“报价查询”目录下新增项目进度，主题为塑胶粒子改性材料，客户分为汽车零部件主机厂与非汽车客户。最终实现为左侧导航“报价查询 → 项目进度 → 数据与导入”，项目进度作为独立页面，不改变报价、导入、云同步或数据库契约。



| 已完成需求 | 实际变更与影响范围 | 当前结果 |

| --- | --- | --- |

| 独立入口 | `source/ui/main_window.py` 新增 `project_nav`、独立 `QStackedWidget` 页面，并同步设置页/数据页索引 | 通过；项目进度位于报价查询下方，数据与导入恢复原内容 |

| 最优推进方案 | 页面包含材料平台化主线、5阶段建议进度、主机厂认证/定点路径、非汽车快样/小批路径和统一资源建议 | 通过；所有百分比标为“建议基线”，不冒称真实经营数据 |

| 视觉与可扫读性 | `source/ui/theme.qss` 增加项目面板、阶段条、双轨卡片和推荐提示样式；窄窗口仍保持可读换行 | 通过；实际 Qt 离屏窗口截图见 [`project-progress-page.png`](../.build/project-progress-page.png) |

| 原有功能保护 | 仅增加导航和静态界面；不写业务数据、不新增依赖、不改导入/报价服务 | 通过；“数据与导入”不再包含项目进度组件 |



增量审查已覆盖生产文件和直接 UI 测试；源码语法、主题渲染、导航索引和 37 个桌面 UI 用例通过。验证使用现有 `.build/desktop-qa-libs` 运行库与合成 SQLite 数据，未触碰正式数据或云端。





### 手机字号、名称与最终回归（模拟器和电脑已完成，2026-10-24）



用户新增要求：手机全部界面字体小一号；显示名称由“工作报价”改“工作”；最后手机模拟器与电脑核心流程跑通，再等实体手机连接快速复查。范围：`theme/Type.kt`全部15级文字样式及行高各减1sp、字距0；`strings.xml`应用名；测试/README。不改包名、版本、签名、系统fontScale、触摸区域或单据导出字号、模板与原章，不新增云写入。



| 待办 | 状态 | 阻塞 |

| --- | --- | --- |

| 前一客户修复落盘/编码轻量复核、双交接 | 已通过 | 无 |

| 字号与名称失败测试、最小实现 | 2项预期失败后完成；15级文字与行高各小1sp、名称“工作” | 无 |

| 最终包实际UI、菜单/客户/折叠/预览/分享及桌面隔离核心回归 | 手机15个不同核心用例通过；电脑实际EXE隔离5项检查通过 | 无 |

| 最终安装哈希、截图、增量审查与交接 | 三份APK一致、原签名、最终表单检查通过；7份文本和增量审查通过 | 无 |

| 实体手机快速复查 | 待用户连接；不计为已通过 | 尚无实体机 |



继续使用同一模拟器、保留已有会话；前阶段真实客户新增和电脑自动同步结果有效，不重复创建测试客户。MES用户确认正常，本阶段不触碰其凭据或登录。最终核心回归不等于任意设备/数据/第三方应用均无异常；实体手机测试尚未执行。



最终交付：[工作手机版-1.2-debug.apk](../工作手机版-1.2-debug.apk)，1.2/code3、93663514字节，构建/根目录/设备回拉包SHA256均为`5A7F2C69DF12B8397792D5174397513995C66106E8F79B069EA23F9A4576C7D4`。aapt2和实际MainActivity确认名称“工作”；沿用原debug证书`5fe328500439ad14728906485d9327da7b6fc0682490336135729afa86c7b213`，保留数据覆盖安装、直接覆盖旧APK，不备份或卸载。电脑EXE未变，仍为1.7.9及原哈希。



有效结果：手机15个不同核心用例通过，覆盖15级字号/行高/字距、实际标题21sp和新增按钮13sp、12入口、客户取消/必填/同步门禁、折叠、排序复制/历史、MES取消保留凭据、单据单/多页PDF和Word生成/预览及分享URI；另1个最终表单画面用例通过，不重复计数。排序/历史采用内存合成记录，分享Intent是辅助证据，不冒称新的真实云历史或第三方WPS/微信/QQ收件验收。单据4组8份输出在本轮独立目录。电脑实际EXE使用隔离SQLite及受控文件选择返回，真实Qt表单、单/多页滚轮/边界、两类单据PDF/Word共5项检查通过，退出0；无正式data或云业务写入。



失败恢复已闭环：首轮11通过/4失败，修正关闭抽屉同名节点、账户屏外入口及LazyColumn产品定位后分批仅复测失败方法。标题诊断记录段落容器992px、实际行/字形完整位于336x122px文字盒，确认旧hasVisualOverflow比较容器宽误报；改为逐行/逐字零容差边界、无省略/最大行数/高度检查，保留精确字号和往返断言后通过，不改生产布局。最终表单等待键盘insets关闭、绘制空闲并验证按钮完整位于360x640dp根布局后截图，取消且草稿清空，无云保存；贴底为目标滚动边界，不是越界。当前设备、页面、视口和数据状态下无可见错误。



证据：[最终核验](../.build/mobile-final-20261024/final-verification.json)、[电脑报告](../.build/mobile-final-20261024/desktop-report/report.json)、[字号UI](../.build/mobile-final-20261024/bounds-device.log)、[单据恢复](../.build/mobile-final-20261024/measure-device.log)、[最终手机画面](../.build/mobile-final-20261024/final-emulator.png)、[表单边界](../.build/mobile-final-20261024/view-bounds-device.log)。失败原始日志保留，不累计为通过；逐用例证据见核验JSON。



增量审查：两个生产文件、四个直接测试文件和README定向回读，7份文本严格UTF-8无BOM/无异常替换字符，结合已通过Kotlin编译和实际中文界面核对；主题及Canvas标签引用正确，无未解决的本次高置信度问题。Android仍无Git已跟踪基线，审查依据本次补丁/回读，不冒称HEAD差异。无新增依赖、业务逻辑、云结构或范围外重构；轻量评估无达门槛的下一步重构候选。构建/测试会话均结束、临时Z盘映射及ADB转发为空。运行打开根目录APK覆盖安装，禁止为升级清除会话；实体机连接后只补安装、名称/字号、关键导航/客户表单和网络快速复查，不重复真实云写入。



### 手机客户目录新增修复（已完成，2026-10-24）



目标：修复手机客户目录没有新增入口的问题；桌面与现有云端通过首次报价原子保存自动建立客户，沿用该契约，不新增空客户接口或迁移数据库。修改限于Android客户目录入口、首次报价编辑返回/保存状态与直接测试；保留其他未提交改动、会话和数据。用户明确授权创建“手机客户新增验收”临时客户及首次报价，验收后移入回收站保留历史，不修改既有客户/报价。



| 待办 | 状态 | 阻塞 |

| --- | --- | --- |

| 客户新增入口缺口及电脑端建档契约定位 | 实际安装版失败测试确认；首次报价建档契约确认 | 无 |

| 新增入口、独立表单、保存/取消返回客户目录 | 已完成；必填校验、搜索清理、原新增报价返回保持通过 | 无 |

| 定向回归、实际新增及电脑读取、回收核验 | 3项不同UI用例及1项真实云用例通过，Qt自动同步读回通过 | 无 |

| 覆盖安装与交付、增量审查、双交接 | 已覆盖根目录APK并保留会话；审查及编码通过 | 最终截图合并到紧接的字体/名称验收 |



验收：实际MainActivity客户目录可进入新增表单；空值不提交；取消回到目录；首次报价成功后客户可见、两端读取一致；临时客户回收且既有数据不变。继续在用户授权的模拟器验收，不冒称实体手机或上线。此前导航、单据、分享等未受影响结果复用。



MES补充：用户确认“MES工作正常无异常已经通了”；记录为用户实测反馈，未说明端/设备，不等同本轮自动化MES登录验证。本次不改MES。



构建恢复检查点：`green-device.log`的3项测试均因`NoSuchMethodError`失败，没有业务写入。`javap`确认Kotlin产物含`editorReturnScreen`，APK的`classes5.dex`仍为旧类定义，最早失效为DEX增量打包。保留当前源码，改为定向重新执行Android主包产物链（`--rerun-tasks`），先核验DEX新字段/方法再覆盖安装复验；不重写业务逻辑、不清除应用数据。新增云验收用例/只读Qt桥接脚本已编译或语法检查通过，但尚未执行。后续已接收需求：手机文字统一小一号、显示名称改“工作”、最后两端核心流程模拟回归；须客户修复验收和双交接完成后实施。



恢复结果：重新生成后DEX含新字段/方法，设备`rebuild-device.log`中同步/只读边界和完整抽屉路由2项通过，新增入口/必填/工具栏返回也已执行，剩余1项在第二次打开表单后立即触发系统返回处超时（测试第47行）。该处仅检查了内存草稿，未等待新页面及BackHandler重组；测试调整为断言新增标题/返回控件显示并等待空闲后触发返回，保留原返回目录断言，不改生产导航。仅复测此失败方法，复用2项有效结果。



最终结果：失败单项在`back-ready-device.log`通过，合计3个不同UI用例有效；`cloud-device.log`真实MainActivity目录新增、首次报价保存、目录可见、客户详情和回收通过1项；`desktop-report.json`真实Windows Qt源码1.7.9前台自动读取新增和回收状态，字段/单条历史一致，无桌面业务写入。前后完整快照确认既有客户和报价未变，仅新增1条标记报价，客户已回收、历史保留；报告不含认证材料。



当前修复交付包1.2/code3：SHA256 `CC507A7B3434C8647BB28CD0609B0B631B0B6ABD731F64122F01977723A93F11`，93663518字节；构建包、根目录APK、设备回拉包一致，沿用原debug证书、`adb install -r`保留数据。证据：[客户新增最终核验](../.build/mobile-customer-20261024/final-verification.json)、[手机结果](../.build/mobile-customer-20261024/phone-report.json)、[桌面自动同步](../.build/mobile-customer-20261024/desktop-report.json)。本次代码无Git已跟踪Android基线，按实际补丁及定向回读审查，不冒称HEAD逐行审查；5份源码/测试/辅助脚本UTF-8无BOM与异常替换字符检查通过。无新增依赖、云结构迁移或范围外重构，原24项模型和其他未变证据继续有效。临时本机转发已移除，构建/测试/Qt会话均结束。



Skill记录：systematic-debugging 93分（覆盖30/匹配19/结构化证据收益16/验证15/效率9/风险4）；test-driven-development 94分（30/20/16/15/9/4），用于证据定位和失败-修复回归闭环。后续手机字号、名称及最终核心回归已完成，见本文件顶部；导出单据字号保持原件，不触碰MES。



### 两端账号自动同步（状态核验，2026-10-23）



电脑当前交付 EXE 内嵌配置与 Android 1.2/code3 模拟器运行配置均指向 Supabase 项目 `saodtwnvbanjlkwwivcb` 的 `main` production 分支；客户端 key 未记录。Supabase 已有 `pmu_data_versions`、`pmu_sync_meta_v1()`、`pmu_mobile_snapshot_v1()`、报价/客户版本触发器及 authenticated 执行权限，版本配置为 `desktop_sync_schema_version=1`、`multiuser_version=1.7.0`、`quote_workflow_version=1.6.0`。自动拉取所需对象已部署，本轮没有重复执行 SQL、修改权限或写业务数据；`pmu_mobile_requests` 不存在，但不是读取/自动拉取所需对象。



桌面活动且未最小化时每15秒自动检查版本，窗口恢复活动时立即检查；手机前台每15秒检查，回到前台立即检查。两端变化通过版本触发器传播并读取快照，无需手动刷新；应用在后台、桌面未活动或离线时不保证后台实时更新。Android 实际前后台同步测试通过1项。桌面定向 Qt 测试因当前 Python 环境缺少 `requests` 未能收集；此前桌面真实云读取验收继续有效。无须额外云端迁移。



### 登录连接、单据滚轮与空白行（已完成，2026-10-23）



| 需求 | 当前结果 | 遗留与下一步 |

| --- | --- | --- |

| 登录服务连接错误 | 已补齐运行库 codex-rejected-cas.pem；共享构建辅助、正式及本机构建脚本均已修复，6项构建定向回归通过 | 实际冻结 EXE 真实登录、首页只读、注销与清除隔离凭据通过；业务写入0，不关闭 TLS 验证 |

| 报价/合同滚轮翻页 | 图片标签与预览滚动 viewport 均接入分页处理；相关源码测试56项通过。实际 EXE 原件场景的两种单据 viewport 双向滚轮/导航边界及 PDF/Word 导出通过 | 已直接覆盖 `工作-1.7.9.exe`，不备份、不改 data；后续登录改动重建时保留该功能 |

| 两端单据多余空白（已完成） | 两端PDF/Word仅移除生成后完全为空的商品行；实际商品、字体、交期、边框及原章资源保留 | 源码19项、模拟器4个不同用例、桌面实际Qt预览/导出/双向滚轮、WPS 4页Word渲染及跨端12组18页对照通过；[最终核验](../.build/document-empty-rows-20261023/final-verification.json) |



失败证据：[首次冻结 QA 报告](../.build/desktop-wheel-20261023/report/report.json)。未触碰真实业务记录。旧测试输入不匹配当前用户原件模板，不通过放宽模板容量来绕过。



恢复检查点：当前 EXE SHA256 `FE52BF40B7359DA03E66F5337140F9C82E7EF4E158C52E363B21ED5A8F07FE47`；[冻结单据验收](../.build/desktop-wheel-20261023-fidelity/report/report.json)通过。认证定向回归36项通过，1项在构造界面时因源码无私有配置失败，未发网络请求；只修该测试为合成配置并复验。既有账号 QA 默认会导出业务数据，不适用于本轮。改用同一入口新增 `login-only` 场景：隔离目录、本机加密预填、真实登录和首页只读、注销并清除验收凭据；禁止业务写入、导出或备份。完成实际 EXE 登录后再判断连接修复范围，保留滚轮及既有保真代码与有效结果。



登录排障检查点：合成配置测试单项通过，认证共37个不同用例有效通过。新增 `login-only` 后实际冻结 EXE（SHA256 `B487AB3CB4ADA8AC9ED537F08A957023DCBD659F64431A7B042FCA4458A111E1`）复现 `NetworkError`，尚未进入首页；[实际登录失败报告](../.build/desktop-login-20261023/report/report.json)，凭据已清除、进程退出1、业务写入0。打包包含 Poppler 提供的 OpenSSL3.6.4，源码常规运行使用3.5.8；独立进程预载相同3.6.4后 health 仍200，不能认定DLL为根因。当前方案增加仅含异常类型/数值错误码/HTTPS处理器存在状态的安全诊断，不记录原异常文本或认证材料；重建后以同一真实入口定位，再实施有证据的最小修复。



诊断阶段已结束：[冻结安全诊断报告](../.build/desktop-login-diagnostic-20261023/report/report.json)失败，EXE SHA256 `D48F06F00C5D39529D8B6EE971A98CF9490E52CE51C8D2A5147D9FD87A809E44`；对应隔离日志仅记录 FileNotFoundError/errno2，尚未发出登录请求。安全诊断脱敏回归1项通过。运行库必需 PEM 存在而 Analysis-00.toc 无该条目，直接原因和最早失效点为构建资源收集。替代实施方案：增加共享的小型构建辅助，按所选 Python 的 ssl.py 定位可选 PEM 并映射至冻结根目录；正式 build.ps1 与当前本机构建脚本共同使用。普通 Python 无该资源时不增加参数，保持兼容；不改第三方运行库或 DLL，不关闭证书验证。先做构建辅助定向回归，再覆盖 EXE 并用 login-only 验证实际登录、首页只读、注销及凭据清除；旧滚轮和原件保真结果仍有效，最终包补做受影响验收。无备份、无真实业务写入。



登录修复阶段完成：`source/build_runtime_assets.py`按所选运行库定位可选 PEM，`source/build.ps1`与当前本机构建脚本复用；[构建6项回归](../.build/login-runtime-assets-20261023.xml)通过。实际冻结 EXE SHA256 `0538A2B1E934397996926F63A1D0C6BF14B20BC5F4B51D9E7D778C24CD1C36A7`直接覆盖原路径；[真实登录最终报告](../.build/desktop-login-runtime-fixed-20261023/report/report.json)passed、退出0、真实首页加载后注销且验收凭据已清除，无业务写入或备份。后续空白修复阶段现已完成，当前交付哈希见下方记录。



空白问题结论：合同模板原有预留商品行会在少量商品时形成多余空白；报价样本没有同样的空行。生成PDF时收拢未用商品行及其下方内容，生成Word时定点移除完全空白的商品行；模板原件与实际有数据行不变，两端规则一致。单/多商品、交期、边框、字体、原章已按证据核验。不改用户原附件或云业务数据；已导出的旧文件需重新生成以应用修复。



空白修复完成检查点：改动覆盖 `source/services/source_document_docx.py`、`source/services/source_document_renderer.py`、Android `SourceDocxExporter.kt` / `DocumentRenderer.kt` 与对应定向测试。Word只删除完全空白商品行，不重写其他包部件；PDF收拢商品区并同步上移后续内容，两行交期保持原高度。源码回归19项通过；设备4个不同用例通过；桌面实际程序、跨端12组18页逐像素比较和WPS 4页Word只读渲染通过。最终桌面1.7.9 SHA256 `EB1AA6C76A70A5A0E24B2D1B2779254DAF447A77082AAA79C27A624C481E51B8`，手机1.2/code3 APK SHA256 `0D01E2FD3C7CF7235077C94F2071F7C6E1444BBB7D327CAD0274645B4B5506F5`，详见[最终核验](../.build/document-empty-rows-20261023/final-verification.json)。旧单据文件本身不改，重新导出后应用修复。



空白设备失败恢复事实：初次4项中的1项误将透明像素RGB分量当成可见黑线；回读实际PDF已证实空行已移除、原章与交期保留。测试改为检查alpha可见像素且保留真实底边断言，仅复测该失败项，结果 `OK (1 test)`；与其余3个未受影响通过用例合计4个不同设备用例通过。设备报告见 `.build/document-empty-rows-20261023/android-device-recovery.log`。此为验收断言恢复，不是渲染代码补丁。



### 原件单据一致性（已完成，2026-10-23）



当前交付为 [桌面1.7.9](../工作-1.7.9.exe) 和 [Android1.2/code3](../工作手机版-1.2-debug.apk)。两端默认使用本次用户提供的合同与报价DOCX，不再用旧重绘版式。原始附件只读且哈希不变；新模板、字体和含模板安装包仅本机交付，未公开上传。不改正式业务库、Supabase或MES。



| 已完成需求 | 主要变更与范围 | 验证结论 |

| --- | --- | --- |

| 原件Word与原章保留 | `source/services/source_document_docx.py`及Android `SourceDocxExporter.kt`只替换指定文字；等长字段保留文字节点分段；原包表格、样式、页眉页脚、图片/关系保留 | 原输入返回原DOCX字节；两端9组Word部件内容一致 |

| 原件PDF与跨端一致 | `source_document_renderer.py`及Android `DocumentRenderer.kt`读取同一manifest、原PDF和字体；只替换变化文字，保留原资源和图章层次 | 9组11页PDF在同一PDFium2倍渲染逐像素一致；原章资源一致 |

| 编辑与分页 | 两端单据界面新增Word导出；合同每页2项、报价每页1项；原单行/多行容量及左缩进保留；超长拒绝，不缩字号/覆盖已有目标 | 实际冻结Qt与MainActivity两种单据预览、PDF/Word导出通过；设备3项通过 |

| 混合日期保真 | Word年/月/日数字分段及原语言样式；WPS只读校准四种月日长度的PDF字形位置，缺资源明确拒绝 | 3种短日期新增用例通过，WPS最终页面和跨端样本已核对 |

| 本机版本交付 | 桌面版本源1.7.9，Android1.2/code3；便携快捷方式修复为本工作区1.7.9和本机图标，参数为空 | EXE真实运行通过，APK构建/交付/设备回拉SHA256一致，沿用原debug证书覆盖安装 |



关键资源：`source/business_templates/source-*`与Android assets为同一副本；本机编译辅助为 `source/build_source_templates.py`，运行不需要WPS。原合同47处、报价22处字段映射，日期包含Word数字子字段。原合同含章、报价原件无章，不能额外给报价盖章。桌面只新增必要依赖pypdf6.10.0，沿用现有字体/PDF工具。



证据根目录 `.build/document-fidelity-20261023`；定向测试45个不同用例有效通过（42+3），最新实际设备3/3通过，冻结EXE报告 `desktop-frozen-delivery/report.json`。跨端核验见 `cross-platform-report.json`，最终包/源码核验见 `final-verification.json`。Windows11/WPS12/PDFium与Android15/API35模拟器；最终预览当前设备、页面、视口和数据状态下无可见错误。增量审查已修正原左缩进、日期分段、坐标精度和原章引用，无未解决的本次高置信度问题。



本轮空白修复当前交付SHA256：EXE `EB1AA6C76A70A5A0E24B2D1B2779254DAF447A77082AAA79C27A624C481E51B8`；APK `0D01E2FD3C7CF7235077C94F2071F7C6E1444BBB7D327CAD0274645B4B5506F5`。Android证书沿用既有debug签名；桌面未签名，未商店发布或生成新证书。



运行与回退：电脑打开根目录EXE或快捷方式；原有快捷方式指向不存在的旧电脑路径，备份位于证据目录 `工作快捷启动-before.lnk`。没有迁移用户data，新版默认数据目录为EXE同级data；其他已有数据目录须显式 `--data-dir`，不能默认为已迁移。手机用 `adb install -r` 覆盖，不能为升级卸载会话。旧1.7.8及APK1.0/1.1保留，回退不回滚云端。



边界与风险：已测试样本的结构/跨端像素一致不等于任意长度和任意Word/WPS版本均绝对一致。PDF用于固定版式；可编辑Word保留原格式，实际换行仍受打开软件/字体影响。实体手机安装/网络未验证；原有云同步、OCR/库存未改动且旧有效证据继续复用，真实MES仍未验证。缺捆绑LibreOffice时使用WPS12 COM只读渲染，不操作用户文档或退出其WPS。轻量重构评估未发现需在本任务外追加且达门槛的事项。



### Android 手机端



#### 业务基线1.1（当前单据版1.2见上节）



目标保持手机与电脑的业务功能、字段和同账号云数据一致；不复制 Windows 托盘/安装器外壳。工程为 `source/android`，Android 8.0+，Kotlin/Compose。以下是已完成的1.1/code2业务基线记录；当前交付版本已由上节1.2取代。历史 [工作手机版-1.1-debug.apk](../工作手机版-1.1-debug.apk) 和旧1.0包保留；当时交付包、构建包和设备回拉包SHA256均为 `94896F7960CDDF8F9D9C3476C77CE7388AB99D462E12EBD30E4A372D146E89DB`，不作当前1.2哈希。



| 需求 / 范围 | 已实现与有效证据 | 当前状态 |

| --- | --- | --- |

| 登录、搜索/组合筛选、客户详情、涨跌/来源/状态、历史分页/CSV | 早期实际登录、空态、前后台同步和保存安全策略验收；[源码说明](../source/android/README.md) | 实现完成；旧结果按受影响范围复用 |

| 手机/电脑报价云同步、客户回收/恢复 | 手机12.5→13.5，电脑14.5后手机读回，三条历史；原业务报价未变；客户已移回收站 | 对应业务断言通过；原联合用例最终因本机清理路径错误失败，见测试交接 |

| 库存与批号备货、报价单/合同PDF、导入/模板、全部历史导出、SQLite备份/本机恢复 | 真实业务菜单、单据编辑/预览与云备份，以及文件/数据库/PDF设备用例 | 已实现；真实MES登录/查询未验证 |

| 图片识别、缺失规格补齐、指定客户导入、供方档案 | 本地中文OCR、供方账号隔离/自动带入、图片候选切换/复核通过；真实云补充验收1/1与桌面3项通过 | 已实现并完成本轮受控联测；图片云用例使用合成候选，真实OCR另有独立设备证据 |



关键契约：

- 正式公开客户端项目沿用桌面1.7.8的 `saodtwnvbanjlkwwivcb`；不使用浏览器旧项目作为正式验证入口。公开配置资源被Git忽略；账号密码不入源码/交接，设备会话与待处理请求由Keystore AES-GCM加密。

- 移动专用保存/历史RPC缺失时，仅使用现有桌面原子RPC及相同JWT/RLS读取历史，不部署、不改表、不裸写业务表。保存请求先同步落盘；未知结果保留原编号核对，避免重复写入。

- 补齐只允许原空白颜色和“未注明”税口径；写前完整SQLite备份、分页读全历史及迁移导入指纹。图片OCR本机运行，唯一规格匹配才继承，多重匹配/材料冲突拦截，保存前人工复核且字段编辑后重新确认。

- 单据草稿/供方资料与本机恢复库是按账号隔离的设备文件；电脑原单据草稿也不云同步，不声称这些本机文件跨端同步。

- 受控写入只使用明显“手机同步验收”标记的临时客户/报价；仅移入回收站保留历史，不改既有业务、不硬删除、不迁移云端。



有效结果：当前主包构建 `parity-fingerprint-build.log` 成功；未变模型23/23及中文OCR/业务辅助10项结果复用。候选切换/消歧设备回归、个人流程权限、缺失/null/有效导入指纹边界各1/1通过。补充真实云验收 `parity-cloud-supplement-device-6.log` 为1/1通过、桌面 `desktop-supplement-report.json` 为3项passed；手机完整报告 `cloud-parity-supplement-report.json` 的completed和existing_quotes_unchanged为true。旧失败保留，不累加重复用例。



当前续作进度：图片候选切换清除旧调价基准；手动消歧后才唯一匹配时，先展示继承字段与调价原因并重新复核，不静默保存。当前源码构建成功，定向设备回归1/1通过，见 `parity-candidate-state-build.log`、`parity-candidate-state-device.log`。尚未点击真实云保存的门禁用例不代替云验收。



#### 手机布局折叠（恢复检查点，2026-10-23）



本轮只调整 Android Compose 界面：报价卡/客户卡摘要折叠、业务菜单分组、报价单高级备注与多产品明细折叠，并补主题容器色。未改桌面、Supabase、云数据或账号会话。主 APK 与 Android 测试 APK构建成功，本地23项模型测试通过；使用同一debug证书覆盖安装1.2/code3并保留设备会话。报价卡与业务分组 UI 各1/1通过。多产品内存UI两次失败均定位为测试定位假设：首轮LazyColumn屏外字段未组合；按产品头滚入视口后，第二轮的通用“材料规格”仍命中默认展开的产品1，不能代表产品2。新验收改用产品2规格输入框独立测试语义标识，核对收起不存在、展开并滚入视口后存在、再次收起后不存在；只增加不改变视觉/行为的测试标识和定位，不改业务逻辑。内存草稿不保存、不导出、不云写入。避免运行会覆盖 App 内既有 `source-document-qa/ui-*.docx/pdf` 的导出用例。根目录APK尚未覆盖。



| 当前步骤 | 状态 | 阻塞 |

| --- | --- | --- |

| 候选切换/消歧确认修复及设备回归 | 已通过 | 无 |

| 临时客户指定导入、补齐历史指纹、图片来源保存、桌面读取 | 已通过，测试客户已回收、既有报价未变 | 无 |

| 最终差异审查、README范围校正、1.1 APK与安装哈希、截图和交接 | 已完成 | 无；真实MES/实体手机限制单列 |



#### 手机文件分享、图标与账户地址（恢复检查点，2026-10-24）



本轮仅改Android：PDF/DOCX增加WPS兼容应用打开及系统分享入口；Android启动图由与电脑 `工作图标.ico` 同哈希的 `source/assets/app-icon.ico` 生成；账户页项目地址改为默认收起、展开可复制。Intent使用FileProvider只读URI，不改桌面、云端或业务数据。首轮新增MainActivity/面板仪器测试在 `compileDebugAndroidTestKotlin` 失败：测试断言显式导入失败。恢复遇到原临时 `Z:` 映射消失和中文工程路径限制后，采用PowerShell会话内临时ASCII映射构建，主包/测试包/23模型测试均成功，映射已移除。设备安装首次遇到ADB启动后的 `device offline`，仅读确认后模拟器已在线；同一组5项定向设备测试最终全部通过。此前失败与恢复经过见测试交接。



该阶段验收完成：PDF/DOCX打开和分享URI可读、真实账户页项目地址折叠/展开、报价卡折叠、多产品明细折叠均已通过Android仪器测试；账户页截图见 `.build/mobile-share-20261024/account-final.png`。当时根目录APK未覆盖，现已随下述侧边菜单版本一并交付。



#### 手机侧边菜单与功能对齐（模拟器阶段完成，2026-10-24）



用户确认先在当前模拟器验收，框架流程上线后再用实体手机复查。仅完成本机交付，没有上线发布、推送仓库、云结构迁移或业务写入。桌面现有改动保持不动，Android沿用1.2/code3及既有debug证书，`adb install -r` 保留数据和会话，未卸载或清数据。



| 已完成需求 | 实际变更与范围 | 有效结果 |

| --- | --- | --- |

| 侧边选择、独立页面 | `MainScreen.kt` 左侧可滚动抽屉替代底部四导航；报价查询、新增报价、客户、数据、导入、回收站、单据列表、新建报价单、新建合同、库存、备份、账户共12入口 | 实际MainActivity逐项点击、页面状态/可见标题、报价返回及两种单据未保存确认离开通过，1个完整路由用例 |

| 桌面业务差异补齐 | 对照桌面 `main_window.py`、`dialogs.py`、`customer_dialogs.py`、`inventory_dialog.py`、`trend_widget.py`：新增字段/数值价格升降序、报价/历史完整复制、历史详情与按业务日期趋势、库存批号复制/备货、可选记住MES凭据 | 排序/复制/详情在实际MainActivity使用仅内存合成输入通过，单条及同日/待生效历史覆盖；3个控件用例通过。现有客户、导入、单据、导出、完整备份及同账号同步沿用未变实现和有效旧证据 |

| MES保存与取消安全 | `MobilePreferences.kt` 独立Keystore AES-GCM凭据；`BusinessScreen.kt` 明确HTTP风险和可选加密保存，清除成功才更新状态，失败保留输入并显示错误 | 真实MainActivity确认取消且原凭据不变、隔离合成凭据加密/清除各1项通过；没有登录MES或写入真实凭据。设备磁盘故障未模拟，失败保护为代码审查证据 |



验收对象：`com.song123jian.pricequery.mobile/.MainActivity`，Android1.2/code3；Windows11、Temurin17.0.20.1、Gradle9.1、SDK36；模拟器 `emulator-5554` Android15/API35、x86_64、1440x2560。系统型号属性虽然显示小米24031PN0DC，本轮按用户确认视为模拟器，不作实体手机证据。主包/仪器包构建成功；本阶段共7个不同设备用例有效通过，复用不受影响的24项JVM单测，不重复运行原云同步/保真/导出用例。当前账号真实同步成功但报价0条，因此报价和历史的数据界面验收只在内存注入合成状态，结束恢复原状态、剪贴板及轮询；没有真实历史API验收，不能据此宣称全链路100%一致。



当前交付：[工作手机版-1.2-debug.apk](../工作手机版-1.2-debug.apk)，94024431字节；SHA256 `8DFDB2CDC63F0A8735930190CF44032D8A5D7FAB685668F29E0665B095F49335`，构建包/直接覆盖的根目录包/设备回拉安装包三份一致，未生成备份。测试APK SHA256 `C2F97CF230DEF753DE0D3D8F4BC5FFE7858398831994FEB3DAFF3074C6A08A65`。证书SHA256 `5fe328500439ad14728906485d9327da7b6fc0682490336135729afa86c7b213`；无正式发布签名或外部发布。证据见[最终核验](../.build/mobile-menu-20261024/final-verification.json)、[定向审查](../.build/mobile-menu-20261024/incremental-review.json)和[最终模拟器菜单](../.build/mobile-menu-20261024/drawer-final.png)。当前设备、页面、视口和数据状态下无可见错误。



恢复摘要：路由标题曾重复匹配抽屉项，修为非可选页面标题可见断言；首次同步前置缺失曾导致等待超时，补齐就绪条件和非敏感目标诊断后完整通过。真实报价为空导致新增数据用例未进入操作，改用内存合成输入后通过；失败日志保留在测试交接，不将失败次数计入通过。增量缓存旧Y盘与Z盘根不同由Kotlin自动回退后构建成功，无构建配置变更。当前没有运行中的构建/测试会话，临时Z盘映射已撤销。



边界与后续：真实MES登录/查询及实体手机安装、网络、分享目标应用适配仍未完成本轮验证；用户安排框架流程上线后实体手机复查，本次没有实际上线。单据草稿、默认供方和本机恢复库仍按账号保存在各设备，不属于云同步范围；个人云模式不引入电脑禁用的本地数据库切换/管理SQL。增量代码审查、源码UTF-8无BOM/异常替换字符检查通过；轻量重构评估没有需在本轮外追加的高收益候选，未新增依赖或范围外重构。后续使用 `adb install -r` 保留已有数据，不能为升级卸载含待核对请求的应用。



补充联测结果：手机UI新建21.5空颜色/未注明税报价；指定客户导入22.5并覆盖文件客户列；补齐黑色/含税，原历史ID、价格、日期及来源保留，导入指纹迁移正确、原null仍null，写前完整备份回读及补齐后只读核对通过；图片合成候选匹配保存23.5和来源文件/表/行；真实桌面Qt读取相同当前字段及3条历史。结束仅回收标记测试客户，手机/电脑正常查询均隐藏，既有报价未变。此前中断遗留标记客户在第三轮已回收，不删除历史。



本轮实际修复：个人流程版本读取误用共享pm_settings，改用与电脑相同的pmu_settings；Android JSONObject.NULL导致导入指纹成为文字null，parseQuote及补齐核对统一使用既有nullable解析。均有失败复现与绿色回归，不改SQL、权限或RPC。测试的标签前缀、finally异常保留、SQLite-journal筛选、独立API会话发现已定点修复。失败证据与未覆盖边界详见测试交接，不将当轮incomplete记为通过。



运行与回退：Windows 11，Temurin17.0.20.1、Gradle9.1、SDK36；构建期间以临时ASCII `Z:` 映射工程，结束已撤销，构建进程使用 `-XX:-TieredCompilation`，无全局JDK修改。当前模拟器Android15/API35、1440x2560。保留原debug证书并覆盖安装；不要卸载含待核对请求的应用。实际云业务、MES、实体手机证据分别记录，不用单测或截图替代。



收尾：本轮源码增量审查未发现未解决的高置信度问题，UTF-8无BOM及异常替换字符检查通过，README已更新到1.1业务/同步边界。APK版本、签名有效性及与旧1.0相同的本机debug证书已核对；无正式发布签名或外发发布。最终业务页截图在最后修复之后：当前设备、页面、视口和数据状态下无可见错误。临时桌面连接和ADB转发已关闭，App及加密会话保留。见[最终核验](../.build/android-mobile-qa/parity-final-verification.json)、[增量审查](../.build/android-mobile-qa/final-incremental-review.json)和[最终截图](../.build/android-mobile-qa/parity-final-emulator.png)。



已知限制：真实MES登录/库存查询与实体手机安装/网络尚未完成验证；单据草稿、默认供方及本机恢复库仍各设备本机保存，不冒称云同步。未新增范围外重构，未执行云端部署、迁移或既有业务清理。

#### 1.21手机客户档案与项目模板对齐（恢复检查点，2026-10-25）

目标是补齐桌面固定客户/项目XLSX契约与客户关联快捷操作。已把桌面三工作表项目模板复制到Android assets；项目表导出保留评分模型、最优方案与样式；客户导入使用批量RPC；项目导入逐项确认成功并保留剩余预览；客户目录新增项目/待办会先打开对应页面。版本名`1.21`、versionCode `4`已设置，最终debug APK已完成模拟器验收并交付。

首轮构建失败已修复：字符串插值、Android XML API字段和DOM属性移除方式已调整；保留缓存并用`-Pkotlin.incremental=false`构建后，`compileDebugKotlin`通过，避免旧R盘与临时Z盘增量根冲突。第二轮新增定向测试33项曾有32项通过、1项因新增断言与既有解析器文案不一致而失败；修正文案断言后，`BusinessWorkbookTest`定向复测`4/4 passed`，证据见测试交接中的XML结果。

当前版本名`1.21`遵从用户确认的`1.20 + 0.01`映射，versionCode `4`。修正Windows参数传递后，全量JVM单测、主APK及仪器APK构建均通过：33项单测通过；主APK元数据为`1.21`/code `4`，SHA256=`68FE8D5D7D04FA68673965E030291238B1F240E7147189F9385AFB2DA0D35428`，debug证书指纹与旧版相同；模板源文件、Android assets和APK内资产哈希均为`5DB166B2D56B2D5301F99BE95A47BDB426E33B521D07C83CD0A7A8F8DA47D204`。现有模拟器已报告安装版本`1.21`/code `4`，但尚未用本次候选运行仪器验收；根目录仍保留1.2旧包，未覆盖。

新增快捷操作UI用例已在`emulator-5554`通过：`CustomerCreationUiTest`共`3/3`通过，覆盖客户档案新增项目/待办路由与预填、首次报价取消及锁定状态只读；测试没有保存业务数据，pending请求仍为空。最终主APK已交付至`工作手机版-1.21-debug.apk`，SHA256=`68FE8D5D7D04FA68673965E030291238B1F240E7147189F9385AFB2DA0D35428`；旧`工作手机版-1.2-debug.apk`保留，哈希未变。实际构建期间创建的`Z:`仍映射到Android工程；README说明此映射由工作区共用，不自动撤销。当前迭代通过模拟器验收，不代表实体手机、MES真实链路或整体所有业务均已验证为100%一致。



2026-10-23 公开仓库归档已完成：用户已明确授权将当前 1.7.8/r9 安装包、独立 EXE、快捷启动文件、图标、合同印章/业务模板和非敏感验收资料上传到公开仓库 `https://github.com/song123-jian/-`。本次只同步文件，不重建、不安装、不操作 Supabase/MES 或本机业务数据；真实账户、密码、登录凭据、`data/`、`.build/`、虚拟环境和缓存排除。正式 AppId 安装验收仍以发布清单的 `verificationStatus=not_run` 为准。



公开归档提交 `f0ebaf597d5c76cb2ed9abebec5bad1205f8477c` 已推送到远端 `main`，远端回读与本地提交一致。远端文件树包含源码、文档、work 验收资料、1.7.8/r9 安装包、独立 EXE、快捷方式和图标；两个 EXE 由 Git LFS 管理并已上传，指针 SHA256 分别为 `E409E4D926E5DC6A96D0FBC5818A54C0DEB23A2F6F163ADD7E9B5414DA502671` 和 `0355501D2C83262E77333FD38D53958DBAF2010529FB4225AFB43ACD02794E45`。



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



## 本轮桌面离线本地保存与联网自动同步（2026-10-25，已完成实现与 EXE 交付）



- 当前目标：报价单和购销合同在无网络时先保存到桌面端本地；网络恢复后自动上传 Supabase，并在刷新时读取云端变化。手机端不在本轮修改范围。

- 实际变更：单据服务增加账号隔离的本地制作记录、草稿和待同步操作队列；保存、修改、删除先落本地，再由联网后的 `sync_pending`/`sync_all` 通过现有 Supabase 单据列表/保存/删除 RPC 契约上传。写入携带 `revision`，云端版本不一致时保留本地内容并标记“同步冲突”，不覆盖本地编辑；成功同步后清除队列标记，并可拉取其他设备的更新。

- 界面行为：报价单和购销合同制作页显示待同步、同步冲突、同步失败或已同步状态；打开页面后定时尝试同步，网络异常保留本地数据，不把网络错误伪装成保存成功。既有单据模板、字体、印章和导出流程未因本轮改动而改变。

- 数据边界：本轮只使用隔离 SQLite/临时账号目录和受控测试数据；未写入正式 `data`、真实报价、合同、客户或 Supabase 业务数据，不修改手机端。

- 程序交付：版本从 `1.7.9` 递增到 `1.8.0`。候选 `work/release-work-1.8.0-offline-sync-20261025/工作.exe` 与最终 `工作-1.8.0.exe` 的 SHA256 均为 `651BDD4DEC65F29388FF2F94B318803A4403E5D1AD9670C3CA7F7E1670753544`；快捷方式 `工作快捷启动.lnk` 已指向 `E:\工作\工作-1.8.0.exe`，工作目录为 `E:\工作`，无启动参数。旧程序回退副本为 `.build/offline-sync-20261025/rollback/工作-1.7.9.exe`，SHA256=`C989F1BEBE77C947E90E3C64D004523272379E5E88051433AF9DAE3FD162B748`。

- 有效验证：服务/界面定向回归共 `61 passed`；Ruff、`py_compile` 和 `git diff --check` 通过。最终冻结 EXE 的实际 Qt 隔离验收报告为 `.build/offline-sync-20261025/final-ui-qa-report/report.json`，8 项检查通过，进程退出码为0；覆盖本地保存/恢复、中文关闭确认、放弃保存不覆盖草稿、实际文件系统失败保留表单、合同关闭按钮和隔离数据库不变。

- 失败恢复：首次冻结单据示例报告 `.build/offline-sync-20261025/document-qa-report/report.json` 失败，根因是既有测试夹具字段过长触发模板“内容过长”校验；不是本轮离线队列实现失败。更换为 `layout-fix/ui` 隔离验收后，候选和最终 EXE 均通过，失败报告保留作诊断证据。

- 当前限制：本轮真实 Supabase 账号下的断网恢复上传、跨设备读取和真实 RPC 权限链路未重新验收；现有通过证据是本地服务/受控云端替身及隔离 SQLite UI。不得将本轮结论表述为真实云端同步已完成验收。实体手机未参与本轮。

- 回退说明：退出工作程序后可用 `.build/offline-sync-20261025/rollback/工作-1.7.9.exe` 回退；回退只替换程序文件和快捷方式，不删除本地单据数据，不执行数据库回滚。验收证据和回退文件保留在 `.build/offline-sync-20261025/`。



## 本轮项目进度台账页面布局调整（2026-10-25，源码已完成；未重建 EXE）



- 当前目标：移除附件一所示的“改性材料项目进度与最优方案”页面内容；让附件二的“项目台账”铺满项目进度页面；重新分配附件三表格列宽和间距，确保长字段可换行显示且不产生水平溢出。

- 实际变更：`source/ui/main_window_project_progress.py` 不再把方案面板加入项目进度页面，页面副标题改为台账用途说明；台账和表格改为纵向扩展，移除原 `420px` 高度上限，9列统一按可用宽度 Stretch，表头居中，单元格禁用省略并允许换行，读取数据后按内容调整行高。`source/ui/main_window.py` 增加页面索引常量，`source/tests/qt/test_desktop_ui.py` 增加方案移除、全高、紧凑窗口和长字段换行回归。

- 实际效果：项目进度页面只保留台账；在 `1440×840` 隔离 Qt 窗口中台账高度约 `696px`、表格高度约 `634px`，9列宽度约 `126–127px`，水平滚动最大值为0；在 `960×640` 紧凑窗口中仍无水平溢出。截图证据保留在 `.build/project-progress-layout-qa/项目进度-台账.png`，离屏环境缺少中文字体，仅用于几何布局核对。

- 有效验证：项目进度 Qt 定向回归 `5 passed, 34 deselected`；覆盖附件一内容不存在、台账扩展、紧凑窗口、长字段换行，以及原有新增/编辑/滚动保存流程。相关文件 Ruff、`py_compile` 和 `git diff --check` 通过。

- 验证边界：工作区已有的项目自定义分类/迁移相关测试仍有失败，属于当前检查点中另一项未完成需求，本轮未修改评分、数据库或 RPC，也未将其结果计入布局通过。真实 EXE 未重建，根目录程序仍是前一版本；本轮未写入 Supabase、正式 `data` 或业务记录。

- 清理结果：本轮创建的隔离 SQLite 已移入 `E:\工作\手动删除\project-progress-layout-qa\prices.sqlite3`，原 `.build/project-progress-layout-qa/prices.sqlite3` 已不存在；布局截图作为验证证据保留。



## Android 1.22 单据离线同步（已完成，2026-10-25）

目标范围：对齐桌面单据本地保存、网络恢复上传、revision 冲突保留和删除冲突恢复。本轮只改 `source/android/app/src/main/java/com/song123jian/pricequery/mobile/BusinessController.kt`、对应 `BusinessFeaturesTest.kt` 与 Android 版本配置；不写真实 Supabase 单据，不验收实体手机、MES 或第三方分享。

最终交付：[工作手机版-1.22-debug.apk](../工作手机版-1.22-debug.apk)，`1.22` / code `5`，93,867,304 字节，SHA256=`838E3225BAAADA459CB2BB85AB21BE76D054A5679602C8808367A36AC6046325`。构建候选、根目录交付包和模拟器回拉安装包哈希一致；debug 证书 SHA256=`5fe328500439ad14728906485d9327da7b6fc0682490336135729afa86c7b213`。`emulator-5554` 实际报告 `1.22` / code `5`，覆盖安装前后应用 `files` 目录 inode 均为 `3802201`，保留原数据。仪器 APK SHA256=`B750809CE2600C427E71D9ED5C706ECCC97B2D88716405D3568828295F42709C`。

实现结果：保存响应兼容桌面 RPC 根级 `id` / `revision` 并回写本地；打开记录时从本机 JSON 恢复远端 ID、revision 和同步状态；冲突队列固定为 `conflict` 并跳过自动重试；删除冲突恢复本地记录；列表合并优先显示冲突、待同步和错误副本，远端刷新不覆盖这些本机状态；删除成功清除该远端 ID 的所有本地缓存副本。

失败恢复：首次仪器回归为 `2 passed / 1 failed`，保存冲突列表断言报 `List has more than one element`。根因是控制器本机 `documentId` 与合并后可见的云缓存 ID 不同，`openDocument` 未回读本地 `_remote_id` / `_revision`，离线更新因此丢失远端 ID。修复后回归断言队列保留原 `cloud-1`；三项仪器用例全部通过。JVM 单测 `33 passed`，最终构建通过，增量审查未发现当前差异的未解决高置信度问题；相关源码 UTF-8 无 BOM、无替换字符。

清理与边界：临时回拉文件 `source/android/app/build/outputs/apk/debug/device-base.apk` 及测试生成的 `files/parity-test-backup.sqlite3` 均已删除；测试账号目录由用例清理。仍保留工作区共用的 `Z:` 映射。测试仅用隔离账号目录和内存假 RPC，没有真实 Supabase 单据写入；真实 RPC/RLS、跨设备链路、实体手机、MES 和第三方应用未验证。本轮完成的是单据离线同步差异，不代表 Android 与桌面所有功能已整体 100% 对齐。



## Android 待办桌面能力补齐（本轮完成，整体手机端对齐仍进行中；2026-10-25）

目标：继续推进手机与电脑待办能力一致。桌面 `TodoDialog` 支持自定义类别、负责人、关联客户/项目 ID 与可编辑名称；待办列表支持类别/负责人/客户/项目搜索、“全部未完成”筛选及未完成/已完成/逾期计数。手机本轮已补齐这些待办差异；这只表示待办子项完成，不代表 Android 与桌面整体功能已 100% 一致。

实现结果：`BusinessModels.kt` 对类别、负责人、关联名称执行桌面一致的 trim/长度校验并校验实体 ID；搜索覆盖标题、关联说明、备注、类别、负责人、客户名和项目名；过滤支持“全部未完成”、状态和今日到期/逾期，统计基于完整待办列表。`BusinessScreen.kt` 提供自定义类别/负责人、客户/项目选择及名称编辑、关联信息和全局计数；打开待办页读取客户/项目列表，失败时回退本账号本地缓存。`BusinessController.newTodoForProfile` 保留客户档案 ID 与名称。`source/android/README.md` 已更新 1.23/code6 和待办能力说明。

验证结果：Android JVM 单测 XML 汇总 `36/36` 通过（模型、待办桌面契约、工作簿和路由）；Android 15/API 35、x86_64 的 `emulator-5554` 上待办页搜索/统计/实体关联编辑及客户档案待办快捷创建两项仪器用例 `2/2` 通过。测试只在内存中编辑并取消，没有保存待办或报价；页面打开可能执行客户/项目只读读取。`:app:assembleDebug :app:assembleDebugAndroidTest --rerun-tasks` 构建成功，66项任务执行；本轮聚焦仪器测试命令 `:app:connectedDebugAndroidTest` 也成功，报告为2项、0失败，退出码0。

APK 交付：[工作手机版-1.23-debug.apk](../工作手机版-1.23-debug.apk)，`versionName=1.23` / `versionCode=6`，93,883,692 字节；构建候选 `source/android/app/build/outputs/apk/debug/app-debug.apk` 与根交付包 SHA256 均为 `14A52E5BFA4441FF364A930C642E9AB150F6D0D8A6558F7192E1B454669A92AD`，debug 证书 SHA256=`5fe328500439ad14728906485d9327da7b6fc0682490336135729afa86c7b213`。仪器报告位于 `source/android/app/build/outputs/androidTest-results/connected/debug/TEST-emulator-5554 - 15-_app-.xml`，退出码文件为同目录 `test-result-exit-code.txt`。

设备状态与重要限制：`connectedDebugAndroidTest` 的 UTP 日志配置了 `uninstall_after_test=true`，测试通过后自动卸载主包和测试包；原先已安装的 `1.23/code6` 主包随之被卸载。随后已用同一 SHA256 的根 APK 执行 `adb install -r` 并确认包版本仍为 `1.23/code6`。应用清单设置 `android:allowBackup="false"`，原模拟器应用私有数据/登录会话未恢复，原先记录的 `files` inode `3802201` 不再作为当前状态；本机待办数据可能已丢失且不可由 Android 自动备份恢复。测试未写 Supabase 业务数据。后续不得在保留应用数据的设备上重跑该 Gradle 设备任务；需要设备验收时使用专用空白模拟器或有数据保留保证的安装/仪器流程。真实实体手机、真实 MES 和整体业务等价仍未验收。

增量复核：检查待办模型规范化/状态日期过滤、客户档案快捷入口和编辑页客户/项目关联；当前 Android 子仓库未提交差异限于 `TodoParityUiTest.kt` 的搜索断言及关联项滚动选择器，变更保留原验收意图，未发现未解决高置信度问题。使用 Skill：test-driven-development（96/100）。


## Android 1.24 库存页数量汇总（阶段完成，整体手机端对齐仍进行中；2026-10-25）

- 目标：让 Android 库存结果页显示桌面端相同的本页合计：普通库存按单位分别汇总库存量与可分配量，空数量仅统计已知值并显示提示；批号备货汇总本页已知备货量并提示 MES 未给单位及空数量。本阶段不触碰真实 MES 登录/查询或云业务写入。
- 版本：用户确认旧 Android `1.2` 按小数递增到 `1.21`（`1.20 + 0.01`）；沿用同一规则，从本阶段之前实际交付的 `1.23/code6` 递增至 `1.24/code7`。
- 实现：`MesClient.kt` 增加精确 `BigDecimal` 分组汇总与缺值标记；`BusinessScreen.kt` 在库存分页栏下展示汇总；新增 JVM 与 Compose UI 用例覆盖多单位、缺值和备货提示。桌面参考为 `source/ui/inventory_dialog.py` 的 `_fill_inventory` 汇总契约。
- 验证：Windows 11、Temurin 17、Gradle 9.1、SDK 36；`BusinessModelsTest` XML 为 `15 tests / 0 failures / 0 errors`，本次 Gradle 任务报告 `UP-TO-DATE`；`:app:assembleDebug :app:assembleDebugAndroidTest` 成功（71 actionable tasks，11 executed）。`emulator-5554` Android 15/API 35 上直接运行 `MobileLayoutTest`，`OK (6 tests)`，包括两项新增汇总 UI 用例。用 `adb install -r` 更新主/仪器包，测试前后 app data directory inode 均为 `3801466`；没有运行会自动卸载主包的 connected Gradle 任务。
- APK：[工作手机版-1.24-debug.apk](../工作手机版-1.24-debug.apk)，`1.24/code7`，93,883,688 字节，SHA256=`B14693440A62CBB934101E8D8F61C545F17066A747DA20E6A6C4C85CD0DB175B`；与构建候选一致。仪器 APK SHA256=`7B6655547FF8F3D5BECD832A3EA34D70B054C65A79EFD7604078BD2B4FF5ACD9`。两包 debug 证书 SHA256=`5fe328500439ad14728906485d9327da7b6fc0682490336135729afa86c7b213`。
- 增量审查：对照桌面 `source/ui/inventory_dialog.py` 的空单位回退、逐单位精确求和和缺值提示，仅检查本轮 `MesClient.kt`、`BusinessScreen.kt` 与两项新增测试；未发现未解决的高置信度差异或回归。
- 限制：验证覆盖模型及 Compose 汇总组件，不代表真实 MES 数据往返、实体手机或 Android 与桌面全部业务已 100% 对齐；整体移动端 parity 目标仍在进行。未使用 Skill。
