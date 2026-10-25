## 仓库上传验收（2026-10-25）

对象：Windows11/PowerShell/Git LFS，工作区`E:/工作`，远端[仓库main](https://github.com/song123-jian/-/tree/main)。业务文件验收快照`452367abc7f9e0102e36696104cda693031eff37`；后续交接提交及纯文本备份增量不改变已验证的LFS载荷。程序入口/版本沿用原阶段记录；本次只执行仓库上传验收，不重建或重新验收程序功能。

| 检查范围与步骤 | 预期与实际结果 | 状态/证据 |
| --- | --- | --- |
| 文件清单、忽略边界和并发内容 | 580个入库文件，含桌面/Android源码、模板及发布物；5个根APK显式纳入。凭据、真实数据与构建缓存保持排除；并发保存的源码分批补齐 | 通过；upload-inventory.json、Git提交树 |
| 本地LFS哈希 | `git lfs fsck --objects HEAD`核验快照55f7908所有载荷；随后未改LFS二进制 | `Git LFS fsck OK`，exit0，结果仍有效 |
| LFS上传完成 | 主批次会话93622为27/27、exit0；1.24 APK直连PUT 93,883,688字节/17.286784秒，HTTP200，verify完成；最终push复用全部对象 | 通过；transfer-summary.json |
| 远端真实可读 | LFS batch列出29唯一对象；每个签名下载地址实际GET `Range: bytes=0-0`，检查HTTP206及Content-Range总长度 | 29/29通过；remote-verification.json；31路径/29对象/5,218,765,998字节 |
| Git提交一致性 | `git ls-remote origin refs/heads/main`对比HEAD；验收快照均452367a，工作区无待提交项 | 通过；remote-verification.json；最终交接提交后仅复核SHA与工作区，不重复大对象读取 |
| 新文件安全检查 | 原上传前扫描无真实私钥/令牌；后续文本增量未匹配私钥/私有token模式。5个根APK配置JSON仅publishable key，无凭据文件/私钥条目 | 在上述模式及文件范围内通过，不是全项目安全审计 |
| 清理 | 两份一次性脚本和两份进度日志按精确路径删除，核对四项均不存在；报告/检查点保留 | 通过；cleanup.json，无残留阻塞 |

- 失败记录：首次commit缺身份未执行，改用最近提交相同的单次命令身份成功，未改全局配置。首次推送77768和慢速续传27270仅停止本任务已核实进程后exit1；远端当时仍旧SHA，未记为成功。代理APK传输curl exit28/120秒/11,550,115字节；改为存储域直连后HTTP200，主批次约7.3MB/s完成。连接数和网卡流量未作为最终证据。
- 格式与审查：本次实际新改动为`*.apk`的LFS属性和双交接，未发现本次属性差异问题。对上传既有源码不宣称完成全仓库审查。初始`diff --check`的三处Markdown硬换行空格及测试EOF空行沿用；交接本次写入执行基线哈希、回读、UTF-8无BOM、链接和表格格式核验。
- 清理记录检查曾因`Where-Object`比较参数缺空格报错；四文件已删除且cleanup.json已保存，修正为脚本谓词后仅回读实际状态，不重复删除，最终核对通过。
- 未覆盖：应用功能重测、EXE重建、生产数据库迁移、真实业务同步、实体手机及其他任务进行中的Android1.25交付均不属于本次上传验收；原各阶段有效结果保持原有适用范围。真实数据、凭据和本机配置未上传，恢复大文件需Git LFS。使用Skill：无。
## 当前验收：1.8.6快捷查询、目录折叠与覆盖（2026-10-25，已完成）

- 对象：Windows11 x64/Qt Widgets，CPython3.12.14；正式E:/工作/工作-1.8.6.exe、候选work/release-work-1.8.6-20261025/工作.exe、原生C:/Users/Administrator/AppData/Local/Programs/PriceQueryDesktop/工作.exe。三处EXE SHA256 1353B7A33DB8EE35C02308E72BFE9922AB3FECA87D71CB202C91AD8DCB6757E9，安装包SHA256 02944B4D7EED787476788170229E66D73F3152D6FD8C44C3EB33D627AD47D21A。
- 测试前已读取本交接相关节；1.8.5未改的云迁移/真实Auth云读结果复用，未重新写Supabase。全套构建测试SkipTests，本轮只定向回归及实际程序验收。

| 范围/环境 | 场景和实际操作 | 结果/可定位证据 |
| --- | --- | --- |
| RED/offscreen | Qt键盘向材料筛选发Return，期望查询次数+1，原版不增加 | search-red.xml，1 failed/4 passed，正确暴露缺口 |
| 定向Qt/受控数据 | pytest -p pytestqt.plugin source/tests/qt/test_search_directory_ui.py source/tests/qt/test_inventory_ui.py -q；PYTEST_DISABLE_PLUGIN_AUTOLOAD=1，QT_QPA_PLATFORM=offscreen | [queries-regression.xml](E:/工作/.build/release-1.8.6-20261025/queries-regression.xml)：48 passed，0失败错误；两种Enter/本页筛选/不重复/弹出选择/多行不保存/折叠刷新恢复/全部客户查询/库存分页与状态 |
| 实际Windows程序 | 源码、冻结候选、安装后、正式根EXE分别--data-dir隔离 --smoke-test；真实Qt创建受控报价，22种Enter按键、20种目录鼠标/键盘操作，目录折叠后结果数不变、刷新仍收起、空格展开，客户/待办/项目/模板/历史/托盘直接路径 | source/candidate/installed/root-shell-qa各19项passed/exit0，后三者frozen=true/1.8.6；[根报告](E:/工作/.build/release-1.8.6-20261025/root-shell-qa/report/report.json)；非模拟页面、未访问正式业务 |
| 库存替代范围 | 现有FakeInventory，真实Qt库存/备货界面Enter发一次当前步骤调用，登录/错误/分页等受影响链路 | 6个新增Enter及既有库存用例包含在48项内；服务受控替代，不证明真实MES登录/网络/库存正确 |
| 安装升级 | 最终包静默升级原生1.8.5→1.8.6，核验登记版本/路径/载荷哈希及受控数据sentinel保留并删；安装后再次实际桌面 | installer-verification.json passed/exit0，旧payload回退已备份 |
| 旧根覆盖/启动 | 旧准确路径无进程，备份后根及包替换，快捷方式/菜单参数更新；11正式data哈希；最终根程序验收；根快捷方式真实启动 | replacement.json replaced_and_verified，11文件不变，中文账号登录窗可见/账号预填/密码掩码，未提交登录；runtime1.8.6 pid24608/父29496留运行 |
| 增量审查/编码 | before/baseline、10文件语义差异、直接引用和异常边界；Ruff/py_compile/AST/UTF8无BOM/替换字符/diff-check及源码快照一致 | REVIEW.md/review-hashes.json通过，无本轮未解决高置信度问题，不审查整个工作区既有改动 |

- 失败恢复：首次pytest因自动/手动重复加载pytest-qt未执行用例，关闭自动加载后正确RED；首轮折叠重启测试共用AppContext，第二窗口关闭把共享context.closing置true，改独立AppContext后23项通过；随后加入表单/库存边界总48项通过。初始增量diff把CRLF与LF放大为全文件差异，规范化比较后只10文件语义差异，未更改业务来掩盖失败。
- 最终截图：[客户目录收起](E:/工作/.build/release-1.8.6-20261025/root-shell-qa/report/customer-directory-collapsed-960.png)，当前设备/960×640/受控报价状态无本次可见错误；既有报价表横滚保留。新实例状态恢复在真实Qt单元场景通过；冻结程序刷新/鼠标/空格已实际验收。
- 清理和回退：4个本轮QA data已清理，报告/截图/回退保留，cleanup.json。旧1.8.5与原生载荷在rollback，退出新版恢复旧版不删除data。无有限操作待结束。
- 未覆盖/限制：真实MES服务、生产非空主档跨设备、单据外发/手机端不在本轮；1.8.6正式云登录未重复，未改云代码复用1.8.5真实结果；包未签名限制沿用。未来安装可能重置开始菜单data参数。

以下为历史阶段记录；本节为当前验收结论。

## 当前验收：1.8.5导航修复与旧版替换（2026-10-25，已完成）

- 对象版本1.8.4→1.8.5，实际目标Windows x64/Qt Widgets、CPython3.12.14锁定构建；入口E:/工作/工作-1.8.5.exe、work/release-work-1.8.5-20261025/工作.exe、C:/Users/Administrator/AppData/Local/Programs/PriceQueryDesktop/工作.exe。EXE SHA256为8C84083736B0CE69FAB9EAF831738ED6586BA0CC1BE815FA7083857E2CC8C10C；根安装包SHA256为3DDDA9EB5D1F5C312FF5B5D16B3E2CA19AE804ADB2080D54B70D644261235E31。
- 证据根E:/工作/.build/release-1.8.5-20261025；实际源码/候选/安装后/根路径均在明确隔离data使用真实Qt，无云业务写入；真实Auth/云读取单独执行。构建全套测试SkipTests，非全项目测试通过。

| 范围/前置 | 实际步骤与预期 | 实际状态/证据 |
| --- | --- | --- |
| RED | 新目录点击测试，原代码应错误跳0而非报价2 | 正确失败1项maxfail，navigation-red.xml；非环境或数据失败 |
| 定向回归 | pytest -p pytestqt.plugin source/tests/qt/test_desktop_ui.py -k 客户目录/五导航/联动/导入/旧异步结果/历史按ID/快捷键/排序相关选择；offscreen临时数据 | navigation-green-final.xml 20 passed/33 deselected，0失败错误；Qt字体目录警告不是业务异常 |
| 同类入口静态 | AST提取35处主界面、页签和选项切换，定向引用核查；独立页签不混判主页面编号 | navigation-inventory.json；只一处navigate数字硬编码已消除，修复后0；未发现其他同类高置信度问题 |
| 实际桌面功能 | source-r2、candidate-rerun、installed、root各--data-dir隔离 --smoke-test；真实创建受控报价并刷新；五页面×鼠标/键盘×单客户/全部客户20种；结果可见、客户/选中一致、总记录不变；编辑/历史对应ID；客户备注新旧模板、客户项目/待办关联、状态持久化、设置/托盘 | 各16项passed/exit0；冻结三目标frozen=true/1.8.5；[根程序报告](E:/工作/.build/release-1.8.5-20261025/root-shell-qa/report/report.json)，其他为对应label-shell-qa/report/report.json。文件对话框仅预选受控路径，实际确认/解析/写入回读 |
| 真实Auth/云读 | 最终候选相同哈希；已保存账号隔离data登录、首页/客户/项目/设置/同步元数据、登出清QA凭据 | 8项passed/exit0，0业务写入，[报告](E:/工作/.build/release-1.8.5-20261025/candidate-account-qa/report/report.json)；配置fvnac，无RPC模拟或本地回退 |
| 安装升级 | 最终1.8.5包覆盖已安装1.8.4，原生登记/版本/载荷哈希；受控data sentinel保留后删；安装后16项实际桌面 | installer-verification.json passed/exit0，登记路径及版本正确，数据保留；旧安装payload已备份 |
| 根覆盖/入口 | 用户授权结束准确旧路径25292/11528，备份旧版/包/快捷方式，根替换；10个业务及界面文件哈希未变，当前凭据可读取且保留；最终根16项和真实根快捷启动 | replacement.json replaced_and_verified，候选/根/安装EXE哈希一致，旧根归档；快捷启动验收时登录窗中文/已存账号预填，未由验收提交登录；当前窗口可见性不作为持续保证；runtime pid30948父31700/1.8.5留运行，停止用关闭登录窗或程序退出 |
| 增量审查/编码 | before/baseline及4文件increment.diff，直接引用与测试覆盖/异步等待/数据边界；Ruff、py_compile、AST、UTF8无BOM/替换字符、diff-check | 通过，REVIEW.md/review-hashes.json，最终源码哈希未变；不将工作区其他已有改动归本轮 |

- 失败与恢复：侧栏新测试初次错误引用todo_page属性，改实际控件后20项通过。源码QA首轮保存报价后未刷新目录，next找不到新客户而失败，补window.refresh、新隔离目录source-r2通过；不重写业务。冻结首轮客户字段实存d而非受控名称，截图/SQLite确认，提示避免并发键盘输入后同一构建candidate-rerun通过；未重复构建掩盖。同轮文档验证曾因CRLF比较失败，只规范化比较后双交接回读通过，无重复追加。
- 最终截图：[目录选择后的报价](E:/工作/.build/release-1.8.5-20261025/root-shell-qa/report/customer-directory-quotes-960.png)。当前设备/页面/960×640/受控数据下报价行、工具栏及报价导航可见，无本次错页错误；既有报价表可横滚，不宣称所有列无需滚动或全系统无错误。
- 仍有效：1.8.4备注/RPC/历史迁移及权限验收未受本轮影响，复用不重复迁移；新客户/项目/待办联动已被16项再覆盖。未覆盖库存MES实际服务、单据外发、生产非空主档跨设备写入及移动端；无关全库测试未执行，安装包未签名限制沿用。
- 回退/清理：E:/工作/.build/release-1.8.5-20261025/rollback保留旧1.8.4程序/安装包/快捷方式/原生payload；退出新版恢复旧版保留data。本轮7个QA data清理，报告/截图/回退保留，cleanup.json；无有限工具任务仍运行。开始菜单共享data参数已恢复，未来安装可能重置，需复核。

以下为历史阶段记录；本节为当前验收结论。

## 当前验收：1.8.4最终EXE、安装包与正式历史迁移（2026-10-25，已完成）



- 实际目标：E:/工作/工作-1.8.4.exe、最终r2候选及C:/Users/Administrator/AppData/Local/Programs/PriceQueryDesktop/工作.exe；Windows x64/Qt Widgets frozen=true。版本1.8.3→1.8.4补丁+1，r1/r2同目标版本。

- EXE SHA256：5C2845633A3623A0AE48FF19736E920842263B96C99B4FDB316F68C8E0FC5249（三处一致）；E:/工作/工作-1.8.4-安装包.exe SHA256：6458B008A2CCC32E742C30851A6C26E3DA6BE94DECD3E6D560722041451499F1。

- 证据根E:/工作/.build/release-1.8.4-20261025。CPython3.12.14锁定环境、source/build.ps1 -SkipTests -AccountConfigPath ...及原生Inno构建；全套测试显式跳过，不称全项目通过。



| 范围/前置 | 实际操作与预期 | 结果/状态/证据 |

| --- | --- | --- |

| 定向回归 | 临时数据，备注保存/新旧模板/旧7列不抹备注/可空/前导零/缺RPC与权限区别/首次单请求及刷新/登录UI/Qt编辑 | 18 passed，0失败错误；final-r2-regression.xml。初始备注RED3失败、重复请求及旧模板RED已复现、最小修复通过 |

| 隔离迁移及回退 | PGlite PG17.5（生产17.6），实际目标快照/必要约束/RLS/角色/触发器；历史新增/重复拒绝/原内容保留/实际回退；备注多行/旧客户端/冲突/长度/清空/账号隔离/回退 | rehearsal.json 17项passed。初始化权限/SQL分隔及LF换行问题仅本地，修正后真实回退通过，不把审阅当演练 |

| 正式业务合并 | 已授权saodt→fvnac，锁内比较完整快照，一次事务；之后逐条只读核对 | HTTP201；新增16报价/8报价客户/10审计，总120/26/11，原104/18/1和成员/规则/项目/单据/主档不变；production-execution.json、production-verification.json、history-content-verification.json |

| Identity序列 | 发现max159/sequence143，隔离验证下一号160及高水位不倒退，再正式一次前移后只读 | sequence-rehearsal.json passed；sequence-final.json max159/sequence159/120报价，未再插入或迁移 |

| 最终真实桌面 | r2、安装后、根程序各独立--data-dir和--smoke-test；空值新增、多行备注编辑保存、模板导出导入确认及回读、项目待办联动、状态筛选持久化、960布局、托盘退出 | 三目标各13项passed/exit0；[根UI报告](E:/工作/.build/release-1.8.4-20261025/root-shell-qa/report/report.json)，candidate-r2-shell-qa与installed-shell-qa同路径report/report.json；仅文件选择器预选受控路径，真实确认/解析/存储执行，无云业务写入 |

| 最终真实账号云读取 | 同三目标各隔离data使用已保存账号，正常登录、首页/客户/项目/设置、Auth/RPC/同步元数据、登出清QA凭据 | 三目标各8项passed/exit0；[根云报告](E:/工作/.build/release-1.8.4-20261025/root-account-qa/report/report.json)，candidate-r2-account-qa与installed-account-qa报告同路径；无替代服务，0业务写入，主档0无本机回退 |

| 安装升级 | 最终setup首次安装及同包覆盖升级，登记/载荷哈希/受控data sentinel保留后删除，安装后实际UI与云链路 | 两次exit0，登记1.8.4和路径正确，installer-verification.json全通过，无业务data更改 |

| 替换入口及数据 | 备份旧EXE/安装包/快捷方式，核对三处哈希/根快捷方式/正式data/原生窗口runtime | replacement.json replaced_and_verified；旧根1.8.3归档，10个非凭据文件不变，凭据封装正常登录后变化。根UI已见1.8.4登录首页、云同步正常，pid22456/父13096留运行；开始菜单共享data参数只读核对，未另点菜单登录 |

| 静态和增量审查 | 修改前12文件基线、本轮11文件差异/新增SQL及直接调用，Ruff/py_compile/diff-check，最终输入哈希不变 | 通过，increment.diff、review-hashes.json、REVIEW.md；account_service/login_dialog本轮未变，不混入用户既有改动。旧模板及序列漏项已修复定向验证 |



- 单次登录至首页：候选8.25秒、安装后7.968秒、根9.281秒，网络和服务波动未控制，不以r1的12.093秒宣称稳定性能比例；优化证据是首次客户列表单请求回归。

- 最终图：[客户管理960×640](E:/工作/.build/release-1.8.4-20261025/root-shell-qa/report/customer-management-960.png)。六列可见，横滚最大值0；当前设备/页面/视口/受控数据下无可见错误。r1曾横滚，修复重建r2后重新验收，旧图不作依据。首次runner缺选择标记误走通用预置基线失败，补marker新隔离目录通过，未改业务掩盖失败。

- 未覆盖：生产非空客户主档云写入/跨设备编辑，主档0未造数；隔离RPC通过不代替该链路。移动端/无关全项目测试未执行。应用/安装包未签名，不能验证其他电脑无SmartScreen；本机安装升级通过。

- 回退：旧1.8.3、快捷方式及旧安装包在[备份](E:/工作/.build/release-1.8.4-20261025/rollback)。退出新版恢复旧EXE/快捷方式，data保留；云历史回退须新增记录无后续更改/关联，非空备注阻止删列，序列不倒退，不在生产演练，正式回退另核授权。

- 清理：9个本轮QA data均删除并回读不存在，cleanup.json；报告/截图/测试源码/私有备份/SQL保留，历史手动删除不扩大处理。有限操作已结束；正式根交付进程可用“退出程序”停止，关闭可能入托盘。

- 仍有效结果复用：最终13项覆盖客户/待办/项目联动；未变前序云权限结果保留，不重跑无关全套。代码、配置、依赖或生产数据改变才定向复测；以后重新安装需复核开始菜单--data-dir E:/工作/data，可能被重置。



以下为历史阶段记录，仅表示当时状态；本节为最新验收结论。



## 当前验收：1.8.3正式EXE与fvnac云端（2026-10-25）



- 最终程序：[工作-1.8.3.exe](E:/工作/.build/release-1.8.4-20261025/rollback/工作-1.8.3.exe)，SHA256 `5CA774000A3CB8C0128C138C209398E78A38AE1B11498E17C216C8F852D6DDCA`。快捷方式目标为此文件、工作目录E:/工作；旧根1.8.2已归档。版本映射沿用SemVer补丁+1，1.8.2→1.8.3，失败重建r2不重复递增。

- 构建：CPython3.12.14锁定环境，source/build.ps1 -AccountConfigPath（目标公开配置）-SkipTests；候选work/release-work-1.8.3-fvnac-20261025-r2/工作.exe。全套构建测试显式跳过，不称全套通过；源文件与构建快照及部署SQL一致。首次路径转义在构建前失败已改正，r1通过后补回退SQL资源、r2正式交付。

- 云端目标为https://fvnacayonhyretsqcqqc.supabase.co。一次事务正式部署桥接、客户资料、项目v1/v2、单据RPC，HTTP201；最终只读核验104报价、18报价客户、3成员内容摘要及旧同步函数不变，三张新表0记录；RLS强制、匿名拒绝、authenticated权限正常，无残留CREATE或自授SET。

- 回退：程序和快捷方式在.build/cloud-target-fvnac-20261025/rollback；旧哈希50757F542FC4469E1379DF89BDF8B9BF6438972D2BDFF1C6B3568AFA673CA5C5。退出新版后恢复旧EXE/快捷方式即可，不删除data。新旧项目的账号目录均保留；已核实同一保存账号并仅复制5个缺失待办/草稿/UI文件，哈希一致，不自动提交草稿。

- 数据库回退只移除本次新增模块，新增模块有业务记录时明确拒绝；不得在生产演练。隔离PostgreSQL17.5 WASM与目标17.6匹配必要约束/RLS/角色契约，完整及单独桥接回退均实际通过；非完全相同PG二进制。正式回滚另行核对授权和业务记录。

- 限制：旧项目saodt的历史业务未全量跨库合并；客户主档当前0条，与原报价客户目录分开。待办仍按本机账号目录保存。客户云保存逻辑已在隔离实际RPC演练，生产仅登录/读取和空批保存，没有虚构业务客户或跨设备编辑冲突验收。

- 清理：五个QA数据目录已移至E:/工作/手动删除/cloud-target-fvnac-1.8.3-对应QA名称-data，凭据副本已清除；详情cleanup.json。报告、回退、演练依赖和必要证据保留。



| 范围/入口 | 前置与实际操作 | 预期/实际/状态及证据 |

| --- | --- | --- |

| 云端迁移与回退 | PGlite17.5复制必要表/约束/RLS/角色，虚构用户；执行保存/修改/冲突/账号隔离和回退 | 客户可空/前导零/同步版本、项目v2自定义计零、单据保存、非空拒绝回退通过；rehearsal-diagnostic.json |

| 桥接单独回退 | owner角色SET修复后，隔离创建桥接再回退 | 新对象移除、旧同步/原授权保留、CREATE=false通过；bridge-rollback-rehearsal.json |

| 生产正式执行 | 已授权目标，一次外层事务，执行后只读核验 | HTTP201；原业务摘要未变；production-execution.json和production-verification.json |

| 实际程序云端UI | Windows原生Qt，候选r2及E:/工作/工作-1.8.3.exe --data-dir隔离 --account-qa报告；保存账号正常登录，点击客户/项目/设置、退出登录、清QA凭据 | 8项通过exit0/frozen1.8.3；真实Auth/RPC，客户读取非本机回退、同步正常，0业务写入；[根路径云验收](E:/工作/.build/cloud-target-fvnac-20261025/root-account-qa/report/report.json) |

| 实际程序桌面UI | 正式根EXE --data-dir隔离 --smoke-test报告；实际客户新增空值/编辑、模板导入确认和回读、关联、待办状态筛选持久化、项目自定义、托盘退出 | 12项通过exit0；仅文件选择器预选受控路径，无云访问；[根路径桌面验收](E:/工作/.build/cloud-target-fvnac-20261025/root-shell-qa/report/report.json) |

| 快捷方式/路径 | COM读取目标，Invoke-Item打开快捷方式；原生窗口读取及runtime | 目标1.8.3、中文登录窗可见；版本/哈希一致；正式窗口未登录、保留 |

| 静态与增量审查 | account_qa/domain定向Ruff、py_compile、git diff --check；新增/修改SQL和九文件差异阅读；源码/快照/正式部署脚本核对 | 通过；increment.diff、review-hashes.json、REVIEW.md |



- 仍有效结果：1.8.2的66项/后补8项定向回归；1.8.3 r1桌面12项与r2业务代码一致，r2仅修回退SQL，根路径12项再次覆盖最终程序；不重跑无关全套。

- 当前1200×780真实云空主档页面及960×640隔离有数据客户页无可见错误；不是全系统所有分辨率保证。截图在上述report目录。

- 未覆盖：生产非空客户写入及跨设备编辑，旧云全部业务迁移；不把隔离写入当作生产业务验收。

- 以下为历史阶段记录，仅表示当时状态；本节为最新验收结论。



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



## 1.8.2桌面客户管理与待办增强（2026-10-25，桌面交付验收通过）



- 对象：source/desktop_main.py、work/release-work-1.8.2-customers-20261025-r2/工作.exe、正式根程序；Windows原生Qt、CPython3.12.14、隔离SQLite。



| 范围 | 操作/预期 | 实际与证据 |

| --- | --- | --- |

| 源码 | 客户、待办、UI、构建、同步恢复、账号隔离及后补RPC回退 | 66项通过regression.xml；8项通过rpc-routing.xml |

| 冻结候选 | --data-dir隔离与--smoke-test；客户全空新增/编辑、模板确认导入/导出/回读、关联入口、待办状态和持久化、项目自定义计零、960px布局与托盘 | 12项通过，frozen=true、1.8.2、exit0；candidate-qa/report/report.json |

| 正式根路径 | 替换后的同一受影响路径最小验收 | 12项通过exit0；root-qa/report/report.json |

| 快捷方式 | 正式入口启动及中文窗口 | 登录窗可见，未提交登录，保留 |

| 辅助与审查 | 定向Ruff/py_compile/diff-check、快照哈希 | 通过，REVIEW.md |



- 证据根目录为.build/customer-desktop-1.8.2-20261025；文件选择器仅预选受控XLSX路径，实际按钮/导入确认/解析/持久化/回读执行。960×640客户页当前测试数据无可见遮挡。无真实云写入。

- 构建全套检查显式跳过；首轮资源编码失败已由r2 JSON协议修复；不以本机smoke代替真实账号/云端验收。

- 版本：1.8.1→1.8.2（补丁+1映射），正式程序 `工作-1.8.2.exe`，SHA256=`50757F542FC4469E1379DF89BDF8B9BF6438972D2BDFF1C6B3568AFA673CA5C5`，与r2候选及清单一致；快捷方式已指向新版且实际显示中文登录窗，未登录，保留窗口。旧根1.8.1已归档，data和配置未覆盖。

- 回退：`.build/customer-desktop-1.8.2-20261025/rollback/工作-1.8.1.exe`与旧快捷方式；旧哈希`1A6973D829EF8975C34625C990B19AE1E4BADEEE3E279372427FC6D0A8639E9A`。退出新版后恢复旧程序和快捷方式，不删除data。替换前旧进程已退出，没有实际结束用户进程。

- 清理：本轮source-qa/candidate-qa/root-qa隔离data已移至根目录手动删除/customer-desktop-1.8.2-对应名称-data；report和回滚保留。

- 云端边界：本包仍使用原saodtwnvbanjlkwwivcb账号配置，客户RPC缺失时明确仅本机保存，待办按账号本机保存。真实云写入/跨设备尚未验收。用户新增目标fvnacayonhyretsqcqqc，要求本阶段结束再执行；仅确认控制台可用，未运行SQL或切换配置。



## 1.8.1候选旧库升级测试失败诊断（2026-10-25，恢复中）



| 范围 | 环境与操作 | 实际结果 | 状态 / 恢复方案 |

| --- | --- | --- | --- |

| 项目进度与待办服务 | CPython 3.12.14 锁定环境，`PYTEST_DISABLE_PLUGIN_AUTOLOAD=1`，运行 `pytest source/tests/test_project_progress.py source/tests/test_todo_service.py -q --tb=short` | 首轮16 passed、1 failed；修正后17 passed、1个pytest配置警告 | 最终通过；具体根因和前后结果见下方 |

| 根因核对 | 阅读 `SQLiteStore.project_progress_list()` 与 `save_project_progress()` | 列表按 `updated_at DESC, project_id` 排序；两个样例的更新时间可能同秒，顺序不代表插入顺序；保存逻辑按 UUID 创建新行 | 根因确认：测试选行假设无效，不是迁移或保存缺陷 |

| 恢复方案与复测 | 修改测试按 `save_project_progress()` 返回的 `project_id` 定位目标行，旧记录继续按原ID独立核对；重新运行同一命令 | 17 passed、1个既有 `qt_api` 未识别配置警告；Ruff、相关Python语法和 `git diff --check` 通过 | 通过；测试不访问真实数据 |



失败命令结果没有写入真实 SQLite 或 Supabase；所有测试数据位于 pytest 临时目录。冻结候选 smoke 初次结果为 `passed`，覆盖待办和自定义项目交互，但随后迁移SQL又增加设置表存在性检查，故须重建后重新检查当前候选。



### 账号云项目状态回归（2026-10-25，RED确认）



| 范围 | 环境与命令 | 实际结果 | 状态 / 下一步 |

| --- | --- | --- | --- |

| 托管账号数据库状态 | CPython 3.12.14 锁定环境、pytest 临时目录；`PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python -m pytest source/tests/test_account_isolation.py::test_managed_account_status_reports_its_authenticated_project -q --tb=short` | 1 failed。隔离会话配置/`AccountStore.url` 为 `https://saodtwnvbanjlkwwivcb.supabase.co`，状态返回 `https://fvnacayonhyretsqcqqc.supabase.co` | RED确认。无网络请求/写入；根因为账号状态分支使用共享库默认常量 |

| 首轮修复计划 | `get_backend_status()` 账号分支读取 `context.store.url` | 保留非账号模式地址逻辑；该实现及复测失败见下一节 | 历史方案；已由兼容实现替代 |



上述失败仅使用伪造会话与临时目录，没有 Supabase 请求或数据写入。



### 账号状态兼容复测（2026-10-25，首个修复路径失败）



| 范围 | 环境与操作 | 实际结果 | 状态 / 下一步 |

| --- | --- | --- | --- |

| 账号/项目/待办回归 | 锁定 CPython 3.12.14 环境，`pytest source/tests/test_account_isolation.py source/tests/test_project_progress.py source/tests/test_todo_service.py -q --tb=short` | 20 passed、1 failed。新增真实结构 `AccountStore` 的目标URL断言通过；既有 `test_managed_account_status_never_offers_admin_key_or_project_switch` 使用仅带 `account` 标记的 SQLiteStore，账号状态读取 `store.url` 抛 `AttributeError` | 首个实现路径未通过，不能交付 |

| 根因与替代实现 | 生产托管账号由 `account_context()` 创建带 `url` 的 `AccountStore`；该旧用例是无 `url` 的兼容夹具 | 实际账号项目路径正确；需保留旧夹具及缺省上下文兼容 | 改为 `getattr(context.store, 'url', DEFAULT_URL)`，保持真实账号取实际URL，缺省回退原默认值；后续复测全组及候选 smoke |

| 替代实现后的复测 | 同命令，账号状态改为优先读 `store.url`、缺省回退原URL | 21 passed，1个既有pytest `qt_api` 配置警告；Ruff、`py_compile`、定向 `git diff --check` 通过 | 通过；不产生网络访问 |



该轮全部为临时 SQLite/伪造会话，没有 Supabase 网络访问或业务写入。



### 1.8.1候选最终构建与冻结程序验收（2026-10-25）



| 范围 | 对象与操作 | 实际结果 | 状态 / 证据 |

| --- | --- | --- | --- |

| 候选构建 | 锁定CPython 3.12.14、`source/build.ps1 -SkipTests`，私有账号配置仅核对项目ID，不输出公钥 | 构建成功，版本1.8.1；候选SHA256=`1A6973D829EF8975C34625C990B19AE1E4BADEEE3E279372427FC6D0A8639E9A`，与`build-verification.json`一致；项目ID=`saodtwnvbanjlkwwivcb`。清单说明构建全套测试跳过 | 构建成功；不是全套测试通过。候选 `work/release-work-1.8.1-todo-custom-20261025-r3/工作.exe` |

| 冻结程序功能 | Windows 11原生Qt，候选通过显式隔离 `--data-dir` 和 `--smoke-test` 启动；SQLite，无真实账号/网络访问 | 通过：10项检查，包括待办新建/筛选/完成/编辑持久化、自定义文字保存且四项评分为0、960px侧栏、托盘恢复与显式退出；版本字段1.8.1，进程退出码0 | 通过；报告 `.build/project-progress-1.8.1-shell-qa-r3/report/report.json`，截图在同目录 |

| 正式根路径验收 | 通过 `E:\工作\工作-1.8.1.exe --data-dir ...\data --smoke-test ...\report` 启动冻结程序；隔离SQLite | 10项检查全部通过：待办新增/筛选/完成/编辑持久化、自定义文字保存且四项计零分、桌面布局、托盘恢复与显式退出；版本1.8.1，退出码0；未访问云端/业务数据 | 报告 `.build/project-progress-1.8.1-root-qa-20261025/report/report.json`，截图 `settings-tray-1280.png` |

| 旧程序替换与快捷方式 | 回读根程序、回退副本、快捷方式、版本和进程 | `工作-1.8.1.exe` SHA256=`1A6973D829EF8975C34625C990B19AE1E4BADEEE3E279372427FC6D0A8639E9A`，与候选一致；快捷方式指向1.8.1；旧版根路径不存在、进程0。旧版1.8.0已归档，SHA256=`5FCE7F377D722A725C11C5AF14F8E603E6D22BC1B851C44672F1F9F6E62CDDDB` | 已替换；回退程序及旧快捷方式副本位于 `.build/project-progress-1.8.1-replacement-20261025/rollback/` |

| 隔离环境与Supabase正式目标 | 本机能力沿用既有核验；Supabase控制台只读核对生产项目及分支页面 | 既有程序配置指向`saodtwnvbanjlkwwivcb`的`main PRODUCTION`，分支页无隔离分支；用户给出的`fvnacayonhyretsqcqqc`是另一组织项目`baoxiao`的`main PRODUCTION`，创建分支按钮不可用。两者均非隔离副本；未运行SQL，生产结构与业务数据未更改 | 阻塞：目标项目与既有生产配置/授权不一致；须先确认迁移目标，并提供隔离库，或明确授权从指定生产项目创建分支、复制生产数据及承担资源成本 |

| Supabase迁移与合同草稿 | 静态核对迁移和回滚脚本；只读核对控制台项目/分支状态 | `project_progress_v2_custom_values.sql`、`business_documents_v1.sql`及回滚脚本均未执行；因目标项目待确认，未执行数据库结构诊断；合同草稿未查重或提交 | 尚未完成验证；未做隔离回滚演练或生产写入，不以生产数据库代替演练 |



四个smoke隔离数据目录已移入 `手动删除/project-progress-1.8.1-shell-qa-data`、`手动删除/project-progress-1.8.1-shell-qa-r2-data`、`手动删除/project-progress-1.8.1-shell-qa-r3-data`、`手动删除/project-progress-1.8.1-root-qa-data` 待手动处理；报告和截图保留在对应 `.build/project-progress-1.8.1-*/report/` 路径。



### RPC路由契约定向复核（2026-10-25）



对象为 `source/storage/supabase_store.py`、`source/storage/account_store.py`、项目进度/单据RPC路由断言与对应迁移函数名。CPython 3.13.14、pytest 9.1.1，未访问网络或数据库。



| 范围 | 操作 | 实际结果 / 状态 | 可定位证据 |

| --- | --- | --- | --- |

| 客户端请求契约 | 运行项目进度RPC参数用例及账号适配器`pm_`到`pmu_`路由别名用例 | 2 passed；客户端路径映射至迁移定义的`pmu_*`函数名，未发现路由错配 | `source/tests/test_project_progress.py::test_supabase_project_progress_create_and_update_use_rpc_contract`、`source/tests/test_account_credentials.py::test_business_document_aliases_target_deployed_pmu_rpc_routes` |

| 生产链路 | 对比源码路由、`AccountStore.request()`映射和迁移函数声明 | 静态契约一致；真实生产RPC尚未调用，受隔离迁移演练阻塞 | `source/storage/account_store.py`、`source/migrations/project_progress_v2_custom_values.sql` |



## 本轮桌面单据制作记录定向验证（2026-10-25，已完成）



实际测试对象：`source/services/business_document_service.py`、`source/ui/business_document_dialog.py`、`source/tests/test_business_documents.py`；CPython 3.13.14、PySide6 6.8.3、pytest 9.1.1、pytest-qt 4.5.0，Qt offscreen，测试使用临时本地账号目录，入口为定向 pytest，无Supabase网络写入。



| 范围 | 场景与操作 | 实际结果 / 状态 | 可定位证据 |

| --- | --- | --- | --- |

| 制作记录服务 | 报价单和合同分别创建、更新、删除；记录标题/内容回读；不同账号和单据类型隔离 | 通过：4项参数化服务用例覆盖，记录ID和内容回读正确，删除及不存在记录行为正确 | `source/tests/test_business_documents.py`；定向 pytest退出码0 |

| 双击载入与手动修改 | 两种单据各创建两条记录，按真实Qt信号单参数双击载入第一条，修改客户名称后保存并回读 | 通过：报价单、购销合同均能载入、修改并保留两条记录 | 同文件 `test_document_dialog_records_double_click_load_and_manual_edit` |

| 空白区域双击新建 | 两种单据先保存一条记录，再向`QTableWidget`视口空白区域发送双击事件 | 通过：事件被视口过滤器接收，进入新记录状态且不覆盖原记录 | 同文件 `test_document_records_blank_double_click_starts_new_record` |

| 静态/编码检查 | 对本轮两个生产文件和一个测试文件运行Ruff、`python -m py_compile`、`git diff --check` | 通过：Ruff无问题、语法通过、差异无空白错误 | `.build/document-test-libs/bin/ruff.exe`；命令退出码0 |



最终命令：`$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'; python -m pytest -p pytestqt.plugin source/tests/test_business_documents.py -q --tb=short`；结果`36 passed`，无新增警告。



失败恢复记录：首轮为32通过/2失败，原因是测试误按两参数触发PySide6单参数信号；修正处理函数和测试触发后34通过。随后增量审查发现视口过滤器判断对象错误，修正后补充空白双击用例，最终36项通过。未执行EXE、手机、真实账号、Supabase写入或跨设备同步验收。



## 本轮桌面 UI 重构融合方案文档验收（2026-10-25；程序测试未运行）



对象：`docs/UI体系重构融合实施方案-20261025.md`，桌面端 PySide6 / Qt Widgets 重构规划文档。方案依据为附件主稿、当前定向源码事实及本轮评审记录；未启动应用、未运行 UI/服务测试、未构建 EXE、未采集截图。



| 范围 | 操作 | 实际结果 / 状态 | 可定位证据 |

| --- | --- | --- | --- |

| 文档内容 | 回读融合方案首尾与关键章节，核对桌面范围、阶段步骤、验收门禁、已证实事实与未验证事项 | 通过：标明方案待实施；未将计划写成已完成；移动端不在范围内 | `docs/UI体系重构融合实施方案-20261025.md` |

| 项目事实 | 定向核对主窗口尺寸、表格类型、Qt 测试文件数及 smoke 入口 | 通过：主窗最小尺寸 960×640；QTableView/QTableWidget 混用；12 个 Qt 测试文件；17 种 runner 由 acceptance 标记单选 | `source/ui/main_window.py`、`source/ui/dialogs.py`、`source/desktop_main.py`；上一轮只读命令结果 |

| 文档格式 | 回读落盘文件并核对 UTF-8 无 BOM、关键章节、路径和差异空白 | 通过：三份文档 UTF-8 严格解码、无 BOM/替换字符或多余结尾空行；`git diff --check` 检查两份已跟踪交接文档无错误；关键章节与文档路径回读一致 | 融合方案及两份交接文档回读；定向差异检查 |



状态边界：本条验证只覆盖方案与交接文档，不代表任何 UI 功能或性能验收。后续 UI 实施前须重新确认源码基线，并复用本文件仍有效的测试记录。



## 本轮桌面 UI 重构静态检查调整（2026-10-25，进行中）



最新状态（2026-10-25）：侧栏间距调整为8px。Windows原生Qt回归 `test_storage_and_settings_controls_are_vertically_centered` 由客户目录34px的失败转为 `1 passed in 0.64s`，覆盖设置按钮高度≥38px、客户目录高度≥50px和中心差≤1px；offscreen主窗测试及构建契约合计 `42 passed in 9.66s`，定向Ruff、`py_compile`、`git diff --check`通过。r4及最终根路径冻结程序shell smoke均通过，替换状态和证据见本节最终交付补充。



r3候选 `work/release-work-1.8.0-ui-refactor-20261025-r3/工作.exe`，版本1.8.0、SHA256=`E3BC10605C6FD45FEB9165160982493F396E2816597316181B2F008D1834CF04`。实际入口为该冻结EXE，显式参数指定 `.build/ui-refactor-1.8.0-20261025/isolated-shell/data` 和 `report`；Windows 11原生Qt、空隔离SQLite，不访问正式data或Supabase。报告 `.build/ui-refactor-1.8.0-20261025/isolated-shell/report/report.json` 中托盘可见、设置页导航/几何、关闭隐藏三项为true，随后托盘恢复断言失败，`error`为空；`app.log`记录正常启动/停止，候选进程已退出。根因为 `desktop_shell_qa.py` 先切换到数据页索引2，恢复断言却错误要求索引1。该报告状态为failed，不作为通过或替换依据。当前根程序 `工作-1.8.0.exe` SHA256=`651BDD4DEC65F29388FF2F94B318803A4403E5D1AD9670C3CA7F7E1670753544`，快捷方式仍指向该文件，尚未替换。



最终交付：r3因runner切换到数据页索引2后仍断言恢复索引1而失败；已修正为检查托盘恢复保留索引2并写入独立通过标记。r4候选 `work/release-work-1.8.0-ui-refactor-20261025-r4/工作.exe` SHA256=`5FCE7F377D722A725C11C5AF14F8E603E6D22BC1B851C44672F1F9F6E62CDDDB`。最终根路径 `E:\工作\工作-1.8.0.exe` 使用独立隔离SQLite实际启动，报告 `.build/ui-refactor-1.8.0-20261025/final-root-shell/report/report.json` 为 `passed`：托盘可见、960px设置页导航/几何、关闭隐藏、托盘恢复页面、菜单与双击恢复、显式退出六项均为true；日志显示正常启动/停止，进程退出。最终截图 `.build/ui-refactor-1.8.0-20261025/final-root-shell/report/settings-tray-1280.png` 在1280×800下当前页无可见重叠或错位。旧根程序 SHA256=`651BDD4DEC65F29388FF2F94B318803A4403E5D1AD9670C3CA7F7E1670753544` 保留于 `.build/ui-refactor-1.8.0-20261025/rollback/current-工作-1.8.0.exe`；快捷方式目标与工作目录均正确。构建显式使用 `-SkipTests`，未将它记为全套测试通过；构建前主窗/构建契约42项、原生几何回归和定向Ruff/语法/差异检查通过，先前142项桌面与单据回归继续有效。



清理记录：删除隔离运行文件的PowerShell命令被执行策略拒绝，未尝试其他删除方式。三个 smoke 数据目录原路径 `.build/ui-refactor-1.8.0-20261025/isolated-shell/data`、`.build/ui-refactor-1.8.0-20261025/isolated-shell-r4/data`、`.build/ui-refactor-1.8.0-20261025/final-root-shell/data` 已确认仅含本轮生成的空SQLite、app.log、instance.lock、ui.ini和acceptance标记，并移至 `E:\工作\手动删除\ui-refactor-1.8.0-20261025/isolated-shell-data`、`E:\工作\手动删除\ui-refactor-1.8.0-20261025/isolated-shell-r4-data`、`E:\工作\手动删除\ui-refactor-1.8.0-20261025/final-root-shell-data`。验收报告、截图及回滚EXE保留；以上数据目录待手动删除。



对象：`source/ui/` 本轮拆分模块、`theme_tokens.py`、`theme.qss`、`inventory_dialog.py`、`main_window.py` 及直接 Qt 测试；CPython 3.12.14、锁文件 `source/desktop-requirements.lock.txt`、PySide6 6.8.3、pytest 9.1.1、pytest-qt 4.5.0、Ruff 0.16.10。使用 `.build/desktop-ui-refactor-20261025-venv`、Qt offscreen 与隔离 SQLite 夹具，不访问 Supabase。



| 范围 | 命令/操作 | 预期与实际结果 | 状态 |

| --- | --- | --- | --- |

| 定向静态/语法/差异检查 | 本轮 UI 模块及直接 Qt 文件的 Ruff、`py_compile`、`git diff --check` | 修复后通过：Ruff 无诊断、语法编译和跟踪文件差异检查退出码0；既有 `test_business_documents.py:252` `F841` 属于本轮外文件，本轮 UI Ruff 使用定向文件清单 | 通过 |

| 桌面 Qt 与单据回归 | `source/tests/qt` + `source/tests/test_business_documents.py`，标准 pytest-qt 清理方式，Qt offscreen、隔离 SQLite | 通过：`142 passed in 37.30s`；包含模块拆分后的主窗/对话框兼容导入、库存、登录、客户目录、图片报价、项目进度、报价连续补填及单据记录 | 通过 |

| 报价连续补填根因修复 | `test_quote_workflow_ui.py::test_saved_window_can_fill_missing_fields_and_continue` | 初次写入使上下文代次递增后，对话框只推进自身成功写入对应的一代；无关并发变化仍被拒绝。修复后标准 Qt 用例通过，三次保存与历史回读成功 | 通过 |

| 测试环境恢复 | `.build/desktop-ui-refactor-20261025-venv`，CPython 3.12.14，按锁文件安装 | 现有 QA 目录缺 `rapidocr`；隔离环境提供锁定版 OCR、Qt、pytest 和 PyInstaller。未修改项目依赖清单 | 通过 |

| 构建契约 | `source/tests/test_build_contract.py`，锁定环境 pytest | 通过：`7 passed in 0.04s`，覆盖版本驱动输出目录、候选证据清单、隔离源码、私有配置门禁及安装器版本匹配 | 通过 |

| 侧栏几何回归（offscreen） | `test_storage_and_settings_controls_are_vertically_centered`，Qt offscreen | `1 passed`；offscreen没有复现原生 Windows 2px 中心差，不能作为该平台布局缺陷已修复的证据 | 诊断结果，不计原生验收通过 |

| 侧栏几何回归（Windows原生 RED） | 同一用例，`QT_QPA_PLATFORM=windows` | 预期失败并确认缺陷：实际中心488/490、差值2，断言≤1失败；`1 failed in 0.74s`。当前进入GREEN修复阶段 | RED确认 |

| 布局实现尝试1 | 子项设置`AlignVCenter`后复测同一Windows原生用例 | 仍失败：`1 failed in 0.74s`，中心488/490未变。运行时布局诊断显示父行`(16,472,208,34)`、标签`(16,481,146,15)`、按钮`(168,472,56,38)`；两个布局项alignment均为128，但按钮最小高38px大于父行34px，导致溢出4px | 失败，已定位约束缺口 |

| 行最小高API探测 | 对内存中的`QHBoxLayout`调用`setMinimumSize(QSize(...))` | 当前PySide6绑定未暴露该方法，`AttributeError`；只读/内存诊断，无文件改动。侧栏layout最小高度645px，实际高598px | 方法不可用，未继续 |

| 侧栏间距内存诊断 | 原生Qt窗口临时将sidebar layout spacing从12px调至8px | 最小高度645→597px（实测减少48px）；598px侧栏内设置行恢复38px、客户列表51px、标签和按钮中心同为491。仅内存诊断，尚未写源码 | 方案可行，待正式回归 |

| 候选程序与替换 | 版本 `1.7.9` → `1.8.0` | 最终候选 `work/release-work-1.8.0-ui-refactor-20261025-r4/工作.exe` 与最终根程序 `工作-1.8.0.exe` SHA256均=`5FCE7F377D722A725C11C5AF14F8E603E6D22BC1B851C44672F1F9F6E62CDDDB`；最终根路径隔离 smoke 六项全通过。旧根 `651BDD4DEC65F29388FF2F94B318803A4403E5D1AD9670C3CA7F7E1670753544` 保留于 `.build/ui-refactor-1.8.0-20261025/rollback/current-工作-1.8.0.exe`，快捷方式目标/工作目录正确、进程0 | 通过 |



验证记录：首次测试环境缺少依赖；随后按项目锁建立隔离环境。诊断发现报价对话框重复保存后仍持有旧数据代次，已在 UI 成功回调中按本次写入结果推进预期值，并保留 stale-form 校验。图片报价测试已适配空剪贴板及迁移后的 mock 模块。最终标准 Qt 定向回归142项和构建契约7项通过；版本源现为1.8.0。首轮候选启动、SQLite和托盘检查通过后，因 `desktop_shell_qa.py` 索引断言仍为旧布局失败；索引改为设置3/数据2后重建 `r2`。按桌面入口完整加载资源/theme 的源码诊断确认：`loaded=true`、sqlite、托盘可见；路由、水平间距、文字宽度、无障碍名称、数据页路由、关闭隐藏、菜单恢复、托盘双击恢复及显式退出均通过。唯一失败为垂直中心断言：存储标签框`(16,472,146,34)`、设置按钮框`(168,472,56,38)`，中心分别488/490，差2px，预期≤1px；`r2` smoke报告因此只记录托盘检查并失败。新加的Qt回归在 `QT_QPA_PLATFORM=offscreen` 下 `1 passed`；Windows原生平台运行同一用例后RED为`1 failed in 0.74s`。首个实现仅对两个子项设置`AlignVCenter`，原生复测仍失败；诊断显示侧栏layout最小高度645px、可用598px。当前绑定不支持`QHBoxLayout.setMinimumSize`；内存诊断将sidebar layout spacing从12调至8后，最小高度降至597px（实测减少48px），598px窗口内设置行38px、客户列表51px、中心491对齐。方案据此正式设置共用间距8px，同时保留子项居中；原生回归需验证行高、列表高度和中心差后，再跑全文件回归、构建契约和静态检查；重建 `r3` 并通过实际shell smoke后替换。`r1`、`r2`候选及其失败报告保留；正式数据未访问。



## 本轮桌面客户目录结构重构定向验证（2026-10-25，已完成；项目进度用例跳过）



实际测试对象：源码 `source/services/app_context.py`、`source/services/customer_service.py`、`source/services/price_service.py`、`source/ui/main_window.py` 及直接测试；CPython 3.12.14、PySide6 6.8.3、pytest-qt 4.5.0，`QT_QPA_PLATFORM=offscreen`，合成 SQLite 数据，入口为定向 pytest，无 Supabase 网络写入。



| 范围 | 场景与操作 | 实际结果 / 状态 | 可定位证据 |

| --- | --- | --- | --- |

| 目录摘要与缓存 | 运行 `source/tests/test_read_optimization.py`，核对目录不加载全量报价历史、同一代次复用缓存、报价新增和 CSV 批量导入后重新读取 | 通过；读优化文件 `9 passed`，缓存调用次数与新增客户结果符合预期 | `source/tests/test_read_optimization.py`；退出码0 |

| 服务与生命周期回归 | 运行客户生命周期、客户导入、报价工作流、服务和最终复核定向文件 | 通过：合计 `84 passed`；覆盖删除/恢复、版本冲突、导入预览判重、报价写入、缓存代次失效和 Supabase 摘要 RPC 契约 | 对应 `source/tests/test_customer_lifecycle.py`、`test_customer_import.py`、`test_quote_workflow.py`、`test_services.py`、`test_final_review.py`、`source/tests/test_read_optimization.py` |

| 独立目录 UI | 在真实 Qt `MainWindow` 上验证报价刷新失败时目录仍可加载、旧目录结果被新结果丢弃、读取恢复和相关导入流程 | 通过：`9 passed, 37 deselected`；未运行项目进度用例 | `source/tests/qt/test_desktop_ui.py`；offscreen 退出码0 |

| 客户管理与托盘回归 | 运行 `source/tests/qt/test_customer_lifecycle_ui.py source/tests/qt/test_system_tray_ui.py` | 通过：`13 passed`；删除/恢复、完整历史预览、托盘目录模型和材料下拉兼容均通过 | 两个 Qt 测试文件；offscreen 退出码0 |

| 静态与编码检查 | 对本轮相关 Python 文件运行 `ruff check`、`py_compile`、`git diff --check` | 通过；无 Ruff、语法或差异空白错误，目标文档 UTF-8 无 BOM | `.build/document-test-libs/bin/ruff.exe`；命令退出码0 |



结果边界：本轮未运行项目进度 UI 失败用例，按用户要求不定位、不修复、不回归；未执行手机端测试、EXE 重建、真实 Supabase 写入或实体设备验收。首次回归中的 `2` 项导入预览失败已通过实质修复后复测，最终结果以本节通过记录为准；pytest 的既有 `qt_api` 未识别配置警告不影响这些用例。



## 本轮项目进度 UI 增量回归与覆盖（2026-10-25，源码回归通过；真实账号页面未验收）



对象：源码 `source/ui/main_window.py`、`source/tests/qt/test_desktop_ui.py`；CPython 3.12.14、PySide6 6.8.3、pytest-qt 4.5.0，`QT_QPA_PLATFORM=offscreen`，合成 SQLite 数据，不连接 Supabase。



| 范围 | 命令/操作 | 实际结果 / 状态 | 可定位证据 |

| --- | --- | --- | --- |

| 折叠、列移除、保存和滚动定位 | 同上；先后运行了外层滚动定位和表格滚动版本 | 第一轮定位 `4 passed, 1 failed`；调整表格限高后 `5 passed, 26 deselected`，30行下新增项目后表内纵向滚动位置保持，SQLite revision 更新 | 外层滚动断言 `page_scroll.maximum() > 0` 实际0；修正后 Qt 退出码0 |

| 真实单元格编辑器 | 再次运行同一 `-k project_progress` 命令；使用 `editItem()` 后立即检查焦点 | `4 passed, 1 failed`；测试焦点仍为外层 `QScrollArea`，尚未证明用户双击编辑路径，不能记为手动编辑验收通过 | `test_project_progress_ledger_creates_and_scores_a_user_entered_project` 中编辑器焦点断言；pytest 输出显示焦点控件为 `QScrollArea` 且不可见 |

| 双击实际表格单元格（动作列） | 再次运行同一 `-k project_progress` 命令，双击“下一步动作”并等待最多3秒 | `4 passed, 1 failed`；未找到可见 `QLineEdit` 编辑器 | 等待子编辑器超时；后续客户列实验已继续缩小原因 |

| 双击实际表格单元格（客户列） | 同一 `-k project_progress` 命令；先断言表格 enabled、单元格 editable、坐标位于 viewport，再双击并等待3秒 | `4 passed, 1 failed`；三个前置断言均通过，但离屏鼠标模拟未启动编辑器，不能据此判断真实程序双击结果 | `test_project_progress_ledger_creates_and_scores_a_user_entered_project` 等待子编辑器超时；最小 PySide 实验确认此模拟现象可独立复现 |

| 最小 Qt 编辑器对照 | CPython 3.12.14 + PySide6 6.8.3 + offscreen：标准 QTableWidget，editable item，`DoubleClicked|EditKeyPressed`；分别发 `mouseDClick`、聚焦后 F2 | `mouseDClick` 后 `State.NoState` 且无编辑器；选中/聚焦后 F2 得到 `EditingState` 和可见 `QLineEdit`。说明本环境该鼠标模拟不能证明应用双击失效 | 两条单行 Python 最小实验输出；未访问业务库 |

| 项目进度服务 | `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1`，运行 `source/tests/test_project_progress.py -q --tb=short` | `12 passed`，1条既有 `qt_api` 未识别配置警告 | 退出码0；服务测试文件 |

| 最终项目进度 UI | `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1`、显式 `pytestqt.plugin`，运行 `test_desktop_ui.py -k project_progress -q --tb=short`；通过客户单元格按F2编辑并保存 | `5 passed, 26 deselected`；方案初始收起并可展开、台账无评分列、30行下新增后表格滚动值保持，手工修改客户名回读成功，revision 从1升至2 | CPython 3.12.14、PySide6 6.8.3、pytest-qt 4.5.0；合成 SQLite；退出码0 |

| 冻结候选与根 EXE 覆盖 | CPython 3.12.14 候选 `work/release-work-1.7.9-project-progress-ui-20261025/工作.exe`；检查 `build-verification.json`、候选/根/回退副本 SHA256 和目标进程 | 文件验收通过：候选与根程序均为 `C989F1BEBE77C947E90E3C64D004523272379E5E88051433AF9DAE3FD162B748`；旧根备份为 `60F2CDE5D26D74AACE77920FA72179DC32AE7A99F0163E93FF432DF52251B6BF`，进程0。清单注明自动检查跳过且 `actualProgramVerification=not_run`；隔离启动只到登录窗口，项目页交互未验收 | `work/release-work-1.7.9-project-progress-ui-20261025/build-verification.json`；根文件及 `.build/project-progress-ui-20261025/rollback-current-root-60F2CDE5.exe` 哈希 |



鼠标双击配置保留；本轮离屏 Qt 的 `mouseDClick` 不作为双击路径验收证据。冻结包只确认候选启动至登录窗口，未登录后实际操作项目进度页；真实云端读写和跨设备同步也未验收。代码未变化时复用上述源码测试结果，不重复运行。



## 项目进度同步修复最终验收（2026-10-24，EXE已替换；真实项目写入待验收）



测试对象：`work/release-work-1.7.9-project-progress-sync/工作.exe`，版本1.7.9，SHA256=`60F2CDE5D26D74AACE77920FA72179DC32AE7A99F0163E93FF432DF52251B6BF`；CPython 3.12.14 构建，构建清单的 `checks` 为 `skipped by explicit switch`。根目录 `E:\工作\工作-1.7.9.exe` 已回读为相同哈希。



| 范围 | 场景与操作 | 实际结果 / 状态 | 可定位证据 |

| --- | --- | --- | --- |

| 项目进度服务与 RPC 请求契约 | CPython 3.12.14，`pytest source/tests/test_project_progress.py -q --tb=short`；RPC `request` 替身截获列表、新建、更新调用 | 12 passed；断言 RPC 名称、参数、项目字段和更新 revision；未访问网络或写入 Supabase | 退出码0；`source/tests/test_project_progress.py` |

| 项目进度 UI 与导入导出 | 复用本轮前已通过的定向 Qt 测试及模板 round-trip 结果 | UI 4 passed、26 deselected；模板含 `项目进度表`、`评分模型`、`最优方案`，空表和导入导出测试通过 | 本文下方历史记录及当前服务测试 |

| 云端接口静态契约 | 对照 `source/storage/supabase_store.py` 与已部署 `source/migrations/project_progress_v1.sql` | 列表/保存函数名、3个参数名及项目字段一致；真实程序账号的 RPC 保存和回读未执行 | 定向源码审查；上述 mock 请求测试 |

| 候选 EXE 实际启动 | Windows 11 x64，以 `--data-dir .build/project-progress-sync-actual/candidate-data` 启动候选；通过 Windows 顶层窗口枚举确认窗口 | 主窗口可见；自动恢复本机保存的程序账号会话；未打开项目进度页、查看业务内容或提交项目记录。关闭窗口转入托盘，随后结束候选进程 | 进程及窗口枚举；关闭后目标程序进程数0 |

| 隔离 smoke | 候选指定 `.build/project-progress-sync-rebuild-qa/data` 与 `report` | FAILED：`baseline_customers`、`original_41`、`customer_partial_16` 为 false，其余6项为 true；不作整包通过证据 | `.build/project-progress-sync-rebuild-qa/report/report.json` |

| 根 EXE 原子替换 | 替换前核对根文件/候选哈希、目标进程及新回退目标；使用同卷暂存副本执行 `File.Replace` | 通过：当前根 EXE 与候选均为 `60F2CDE5D26D74AACE77920FA72179DC32AE7A99F0163E93FF432DF52251B6BF`；回退副本 `.build/project-progress-sync-actual/rollback-current-root-95DBA131.exe` 保留旧根哈希 `95DBA131CB5DEB3882011CD160AE200DCA66A9D30F2C4F2B7ADCF57417FB069C` | 根文件、候选与回退副本 SHA256；快捷方式仍指向根 EXE；目标进程0 |



本轮没有可提交的真实项目记录，也没有进行生产项目写入；迁移时只读核验项目表为0条。现有 migration 已部署，mock 合约和源码一致性不能代替真实账号下的一次保存、回读及跨设备传播，因此该链路仍为“尚未完成验证”。



候选隔离目录留下应用生成的 `login_credentials.json`、`runtime.json` 和锁文件；未读取凭据内容。先前清理操作曾被 PowerShell 执行策略拒绝，本轮未尝试绕过；正式 `data` 未触碰。



## 前一候选 EXE 覆盖与恢复记录（2026-10-24）



测试对象：源码服务/UI 和 Windows 11 冻结候选 `work/release-work-1.7.9-project-progress/工作.exe`，版本1.7.9，SHA256=`95DBA131CB5DEB3882011CD160AE200DCA66A9D30F2C4F2B7ADCF57417FB069C`。构建入口 `source/build.ps1`，CPython 3.12.14；隔离候选正常启动未输入账号。正式项目 EXE 路径为 `E:\工作\工作-1.7.9.exe`。



| 范围 | 场景与操作 | 实际结果 / 状态 | 可定位证据 |

| --- | --- | --- | --- |

| 必选评分分类服务与备份 | `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1`，CPython 3.12.14，`pytest source/tests/test_project_progress.py -q --tb=short` | 9 passed；1项既有 `qt_api` 未识别警告 | 终端退出码0 |

| 项目进度 Qt 页面与录入窗 | 显式加载 `pytestqt.plugin`，`pytest source/tests/qt/test_desktop_ui.py -k project_progress -q --tb=short` | 4 passed，26 deselected | 终端退出码0 |

| 相关代码静态检查 | Ruff 检查项目进度服务、SQLite/Supabase 存储、录入窗、主窗口和直接测试 | 通过 | `.build/document-test-libs/bin/ruff.exe` 输出 All checks passed |

| 冻结候选构建 | `source/build.ps1` 使用 CPython 3.12.14、已有 PyInstaller/PySide6 运行库和经核对的私有配置，显式 `-SkipTests` | 构建通过；全量测试未在构建门禁内运行 | 候选 SHA256 与 `build-verification.json` 一致；清单 `checks=skipped by explicit switch` |

| 候选窗口可见启动 | Windows 11 x64，启动候选 EXE 并查看程序窗口，随后关闭 | 登录窗口可见；关闭后进程为0、候选 runtime 已清理；未输入账号 | Computer Use 实际窗口树/画面；关闭后的只读状态 |

| 隔离 smoke | 候选 EXE 指定 `.build/project-progress-rebuild-qa/data` 与 `report` | FAILED：空库使 `baseline_customers`、`original_41`、`customer_partial_16` 三项为 false；其余6项为 true。此结果不证明项目进度页或真实云链路 | `.build/project-progress-rebuild-qa/report/report.json` |

| 根目录覆盖命令恢复 | 旧版、新版临时副本及程序进程只读核对；首次 `File.Replace` 尝试 | 首次命令失败，根 EXE 未变；旧副本 SHA256 仍为 `BFAF83F8647B1981F4136FB06A5BF0B9D84A417A0407BEF39528F976EBA78749`，临时新包为候选 SHA256，运行进程0。原因：`Test-Path` 参数位置错误和空备份路径 | 当前文件哈希/进程查询；待用显式新备份路径恢复 |

| 原子覆盖后哈希核验 | 根 EXE、候选 manifest 与显式回退副本逐一计算 SHA256 | 通过：根 EXE 与候选/manifest 同为 `95DBA131CB5DEB3882011CD160AE200DCA66A9D30F2C4F2B7ADCF57417FB069C`；回退副本为旧版 `BFAF83F8647B1981F4136FB06A5BF0B9D84A417A0407BEF39528F976EBA78749` | `工作-1.7.9.exe`、构建清单及 `.build/project-progress-rebuild-qa/工作-1.7.9-explicit-backup.exe` |

| 根目录 EXE 实际双击 | Windows 11 x64，资源管理器双击 `E:\工作\工作-1.7.9.exe`，查看窗口后关闭 | 通过启动验收：出现“工作 · 程序账号登录”窗口；未提交登录；关闭后进程0、`data/runtime.json` 不存在 | Computer Use 窗口观察；关闭后的进程/runtime 只读核验；快捷方式目标仍为根 EXE |

| 临时输入与隔离数据清理 | 对本轮构建配置及隔离数据目录执行精确清理 | 阻塞：本机执行策略在命令执行前拒绝 PowerShell 删除操作；配置与隔离数据仍存在，未尝试其他删除路径 | `.build/project-progress-build-config/account_config.json`、构建快照 `source/account_config.json`、候选和 smoke 数据目录 |



尚未完成验证：真实程序账号 RPC 读取、保存和跨设备同步；本轮未执行账号登录。没有隔离数据库副本，未做回滚演练；正式迁移已在先前授权阶段执行一次，本轮不重复。



## 项目进度台账首轮定向测试（2026-10-24，失败，修复中）



对象：源码 `source/tests/test_project_progress.py`、CPython 3.12.14。环境使用现有 `.build/desktop-qa-libs` 与 `.build/document-test-libs`，`PYTEST_DISABLE_PLUGIN_AUTOLOAD=1`；命令为 `python -m pytest source/tests/test_project_progress.py -q --tb=short`。预期 3 项通过。



| 用例 | 预期 | 实际结果 | 状态 |

| --- | --- | --- | --- |

| Excel 四维评分与档位 | 标准项目 69 分/B 档 | 输入阶段 2 得 51 分/C 档；测试预期配置错误 | 失败，待修 fixture |

| 必填、客户类型与日期校验 | 拒绝客户类型不匹配和错误日期 | 通过 | 通过 |

| SQLite 保存、乐观版本与备份 | 新库可初始化并完整回读 | 初始化时报 `cannot start a transaction within a transaction` | 失败，待修初始化顺序 |



根因与下一轮修复：规则默认行在 schema 初始化显式事务前触发隐式事务；将该写入移到 schema 初始化之后。测试 fixture 将阶段改为 5，以匹配 69 分/B 档。项目编辑窗对可选空字段统一按空文本回读，补充 `milestone_date=NULL` UI 回归。该轮尚未验证 Qt UI、Supabase 云 RPC 或正式迁移，失败不得计为通过。



正式数据库只读诊断确认 `pmu_executor` 的既有成员授权由 `supabase_admin` 授予；本轮迁移须保留该授权，并增加防止撤销既存 `postgres` 授权的 guard。隔离数据库副本当前不可用，正式生产迁移前无法做独立回滚演练；这是未覆盖限制，不将生产事务用作演练。



## 项目进度修复后复测（2026-10-24，进行中）



| 范围 | 操作 | 实际结果 | 状态 |

| --- | --- | --- | --- |

| 项目规则、校验、SQLite 初始化/保存/版本冲突/备份及快照回填 | CPython 3.12.14，`python -m pytest source/tests/test_project_progress.py -q --tb=short`，`PYTEST_DISABLE_PLUGIN_AUTOLOAD=1` | 4 passed；仅有 `qt_api` 未识别配置警告 | 通过 |

| 项目页面/编辑窗/空云端日期 UI | `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1`，显式加载 `pytestqt.plugin`，运行 `test_desktop_ui.py -k project_progress` | 3 passed，26 个非目标用例未运行 | 通过 |

| 云端快照进入本机备份 | `test_supabase_backup_includes_project_progress_and_normalizes_empty_date`；模拟远端响应，检查备份 SQLite 中项目行、空日期及评分规则 | 通过：台账记录、空日期和评分规则完整进入备份 | 通过；模拟不覆盖真实网络或账号链路 |



运行器根因已通过设置 `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1`、显式加载一次 `pytestqt.plugin` 修正。Ruff 首轮发现 4 个相关导入块排序问题及 1 个未使用 `Conflict` 导入；定向修复后针对全部相关生产和测试文件复查通过。受影响的 4 项服务/备份用例与3项 Qt 用例全部通过。模拟范围不代表真实云端写入已验证。



## Supabase 生产迁移验收（2026-10-24，数据库事务通过）



对象：Supabase 项目 `saodtwnvbanjlkwwivcb`、`main` production、PostgreSQL 17.6，SQL Editor 当前角色 `postgres`。独立隔离数据库副本不可用，因此未进行回滚演练；在生产执行前已完成只读契约核验，不以生产试写模拟演练。



| 范围 | 操作与预期 | 实际结果 | 状态 |

| --- | --- | --- | --- |

| 迁移前置 | 核对版本1.7.0/1.6.0/同步schema1，目标表与函数不存在，2个账号启用，执行角色授权/数据版本表权限匹配 | 所有 guard 条件匹配；既有 `postgres` 成员授权的 grantor 是 `supabase_admin`，非 `postgres` | 通过；只读 |

| 正式迁移 | 仅执行 `source/migrations/project_progress_v1.sql` 事务一次 | SQL Editor 返回 `Success. No rows returned`；事务完成 | 通过；结构写入 |

| 只读验收 | 核对表、RPC、规则、行数、RLS、ACL、所有权、触发器和临时授权 | 表所有权正确、强制RLS与 owner 策略启用；2个账号均有规则；项目记录0；authenticated 仅可执行列表/保存 RPC；anon、service_role、PUBLIC 无相关访问；桌面版本触发器启用；原 grantor 保留且本次 postgres 自授撤销 | 通过；结果见 SQL Editor `migration_verification` 查询 |

| 真实客户端同步 | 以程序账号登录并从客户端读取/保存及检查传播 | 尚未运行；当前未取得程序账号登录会话 | 尚未完成验证；SQL Editor 管理角色核验不替代客户端账号链路 |



## 新项目录入评分默认值审查（2026-10-24，待修）



增量代码审查发现新建对话框的多个评分分类下拉框默认选中第一项，其中含高分选项（吉利战略客户、特种材料、已定点）。客户类型也默认 OEM。用户只填必填文本而漏选分类时会获得偏高但表面合理的分数；当前无失败测试证据，这是从实际界面代码路径确认的数据质量缺陷。



修复路径：客户类型、客户战略价值、材料价值、项目阶段、竞争态势均增加“请选择”空项，不默认给分；`validate_project` 将空/NULL 选项映射成空字符串并拒绝提交；新增服务验证覆盖各分类缺失，Qt 验收确认新建窗五项均为空、完整选择后保存通过、已有记录编辑时仍准确回显原值。只改表单/验证与直接测试，不改数据库或生产迁移。



## 双击启动修复验收（2026-10-24，已完成）



| 检查对象 | 环境与操作 | 预期 | 实际结果 | 状态 / 证据 |

| --- | --- | --- | --- | --- |

| 配置门禁 | Windows PowerShell，`source/build.ps1` 使用占位 `account_config.example.json` | 构建在冻结前拒绝占位配置 | 输出 `account_config.json contains an incomplete or placeholder public client configuration.`，退出码 1 | 通过门禁；未生成交付 EXE |

| 构建契约 | CPython 3.12.14，`PYTEST_DISABLE_PLUGIN_AUTOLOAD=1`，`pytest source/tests/test_build_contract.py -q --tb=short` | 直接构建契约全部通过 | 7 passed；1 个 qt_api 配置警告，不影响本范围用例 | 通过；辅助证据 |

| 候选 EXE 启动 | Windows 11 x64，候选 `work/release-work-1.7.9-login-fix-2cd665bf79504a24b2409a4f0e5a52b6/工作.exe --data-dir <隔离目录>`，等待 8 秒 | 出现可见登录窗口 | 出现窗口标题“工作 · 程序账号登录”，窗口句柄有效；隔离 `runtime.json` 存在 | 通过；实际程序证据 |

| 根目录快捷方式启动 | Windows 11 x64，双击等价启动 `工作快捷启动.lnk`，等待 8 秒 | 根目录程序可见并可退出 | 出现同一登录窗口；关闭窗口后进程数为 0，正式 `data/runtime.json` 不存在 | 通过；实际程序证据 |

| 交付物回读 | 根目录 `工作-1.7.9.exe` 与候选包哈希、快捷方式字段 | 覆盖完整且目标正确 | EXE SHA256=`BFAF83F8647B1981F4136FB06A5BF0B9D84A417A0407BEF39528F976EBA78749`；快捷方式目标/工作目录/参数正确 | 通过 |



未覆盖范围：真实账号登录、Supabase 迁移/业务写入、项目进度云端读写；这些不属于本轮双击启动验收，且 Supabase 正式写入当前暂停。结构化核验记录见 [双击启动修复核验](../.build/double-click-fix-20261024/verification.json)。# 桌面源码公开快照测试交接



## 本轮桌面项目进度 EXE 验证（2026-10-24，已完成）



对象：`work/release-work-1.7.9-excel/工作.exe`，版本 1.7.9，CPython 3.12.14 构建，隔离入口为 `工作.exe --data-dir .build/project-progress-exe-qa/data --smoke-test .build/project-progress-exe-qa/report`。构建清单记录 `checks=skipped by explicit switch`，不把全量测试写为通过。



| 范围 | 场景与结果 | 状态/证据 |

| --- | --- | --- |

| 构建 | `source/build.ps1 -Python <3.12> -OutputDirectory work/release-work-1.7.9-excel -SkipTests` | 通过；EXE SHA256=`07B9AB9CE176AF87AD5C01014DD6726AD894D5E1A1B292DD875BB70C5F2C41CB`，清单同目录 |

| 冻结程序启动 | 新 EXE 使用全新隔离 SQLite 启动内置 smoke，进程退出码 0；覆盖根目录后再次启动同一 smoke | 部分通过；两次均启动/停止正常，紧凑布局、报价新增/精度/历史持久化通过；空库预置样本基线 3 项为 false，最终报告 `.build/project-progress-final-qa/report/report.json` |

| 项目进度定向 UI | `QT_QPA_PLATFORM=offscreen`、`.build/desktop-qa-libs`，运行 `test_project_progress_sits_under_quote_query_and_covers_two_customer_tracks` | 通过：1 passed；页面截图/37 项既有结果继续有效 |

| 全量构建门禁 | 系统 Python 全量收集及已有运行库复跑 | 未通过/环境受限：542 passed、4 failed、20 errors；RapidOCR/NumPy 二进制与 Inno Setup 缺失，未用该结果冒称通过 |

| 覆盖与回读 | 结束旧/新 EXE 进程，原子替换 `工作-1.7.9.exe`，再计算最终 SHA256 | 通过；最终文件 `工作-1.7.9.exe` 为 `07B9AB9CE176AF87AD5C01014DD6726AD894D5E1A1B292DD875BB70C5F2C41CB`，与候选一致；未触碰正式 data |



收尾：临时 `source/account_config.json` 已删除；构建输出清单保留 `checks=skipped by explicit switch`，全量测试和预置样本业务验收限制如上，未将其写为通过。



增量代码审查：已定向复核本轮项目进度导航/页面、主题、直接 Qt 测试、`build.ps1` 的 `pyside6-rcc.exe` 同目录/PATH 回退和失败门禁，以及两个构建辅助脚本的导入修复；`test_build_contract.py` 6 passed、PowerShell 解析、Ruff、Python 语法和差异空白均通过。其他工作区既有改动未纳入审查。



## 桌面端项目进度独立页面（2026-10-24，已通过）



实际对象为 Windows 11 本机 PySide6 `MainWindow`，入口 `source/ui/main_window.py`；使用现有 `.build/desktop-qa-libs`（PySide6 6.8.3、pytest-qt 4.5.0 及项目锁定依赖），`QT_QPA_PLATFORM=offscreen`，合成 SQLite 数据，不连接云端、不写正式业务库。



| 范围 | 场景与操作 | 实际结果 / 状态 | 可定位证据 |

| --- | --- | --- | --- |

| 导航入口 | 启动真实 Qt `MainWindow`，依次核对“报价查询 → 项目进度 → 数据与导入”顺序、选中态和页面索引 | 通过；项目进度为独立第 2 页，设置页同步为第 4 页 | `source/ui/main_window.py`；`test_project_progress_sits_under_quote_query_and_covers_two_customer_tracks` |

| 项目进度内容 | 进入项目进度页，核对塑胶粒子改性材料标题、主机厂/非汽车客户文本、5 个阶段建议进度 `[100, 70, 50, 25, 0]`、双轨卡片和最优方案提示 | 通过；所有进度明确为建议基线 | 同上；`.build/project-progress-page.png` |

| 数据页隔离 | 进入数据与导入页，核对项目进度组件不在该页 | 通过；原数据管理、文件导入、导出、备份卡片仍由原页面承载 | 同上 |

| 既有导航回归 | 托盘恢复、设置页、数据页和紧凑窗口用例 | 通过；设置页/数据页索引修正后不影响既有入口 | `source/tests/qt/test_system_tray_ui.py`、`source/tests/qt/test_desktop_ui.py` |

| 定向桌面 UI 测试 | `python -m pytest -q source/tests/qt/test_desktop_ui.py source/tests/qt/test_system_tray_ui.py --maxfail=1` | 通过：37 passed，10.97 秒 | 终端退出码 0 |

| 语法与差异检查 | `python -m py_compile source/ui/main_window.py`、`git diff --check`、定向 UTF-8/BOM 检查 | 通过；无语法错误、无差异空白错误、目标文件 UTF-8 无 BOM | 终端退出码 0 |



首次使用系统 Python 收集测试时因缺少既有依赖 `requests` 阻塞于导入阶段，未进入用例；切换到项目已有 `.build/desktop-qa-libs` 后完成上述通过结果。未运行全项目测试、正式 EXE 发布或真实云端写入；实体设备不适用于本桌面页面。





## 手机字号、名称与最终核心回归（2026-10-24，模拟器和电脑通过）



对象为最终Android 1.2/code3 MainActivity及现有桌面1.7.9；最终APK SHA256=`5A7F2C69DF12B8397792D5174397513995C66106E8F79B069EA23F9A4576C7D4`、93663514字节。入口`com.song123jian.pricequery.mobile/.MainActivity`；沿用Windows11/JDK17/SDK36、`emulator-5554` Android15/API35、x86_64、1440x2560，保留现有加密会话。桌面显式独立目录运行实际EXE，不触碰正式data或云业务；MES沿用用户确认正常的事实，本轮不登录。逐用例记录、7份文本哈希和边界见[最终核验](../.build/mobile-final-20261024/final-verification.json)。



| 范围 | 操作及预期 | 当前结果 |

| --- | --- | --- |

| 写入前轻量复核 | 前阶段5份改动源码/辅助UTF-8无BOM、无异常替换字符，真实编译/设备证据及3份APK核对 | 已通过，沿用客户阶段记录 |

| 字体/名称RED | 现有安装包执行`CompactTypographyUiTest`，15级字号预期基线-1sp、应用名预期“工作” | 2项预期失败；[RED日志](../.build/mobile-final-20261024/type-red-device.log)，旧字号57而期望56、旧名含“报价” |

| 字体/名称GREEN | 最终包检查15级字号/行高及字距；实际TextLayoutResult核对标题21sp、客户新增按钮13sp及不溢出；启动器实际名称 | 通过；全部15级字号/行高各减1sp、字距0；实际名称“工作”、精确字号、无省略/高度/行数及逐行逐字零容差边界通过；证据`final-device.log`、`bounds-device.log` |

| 手机最终核心回归 | 实际MainActivity 12入口、客户新增取消/必填、排序复制/历史详情（合成内存）、账户折叠、两种单据PDF/Word生成预览分页、分享只读URI及必要折叠控件 | 15个不同核心用例通过，不累加重复或失败次数。云新增/回收与Qt自动同步沿用紧前有效结果，不再写真实云数据；单据4组8份文件已回拉至`.build/mobile-final-20261024/mobile-documents` |

| 电脑最终核心回归 | 根目录实际EXE，独立目录及受控输入，报价/合同预览/PDF/Word和滚轮；此前同账号Qt真实云读取有效 | 通过；5项检查true、4组PDF/Word，退出0；实际Qt/独立SQLite，文件选择返回值受控，不替代真实表单、生成或写文件；见下方电脑报告 |

| 交付 | 根目录APK直接覆盖；构建/交付/安装三份哈希、签名、名称；最终截图及增量审查 | 通过；三份APK均为上述哈希，aapt2名称“工作”，原debug证书SHA256=`5fe328500439ad14728906485d9327da7b6fc0682490336135729afa86c7b213`，保留数据覆盖升级。无活动构建/测试会话、临时Z盘或ADB转发；最终表单与审查见下方 |

| 首轮最终手机回归 | 最终主包/测试包覆盖安装，8个定向类共15项，不写真实业务 | 11通过、4失败；[首轮日志](../.build/mobile-final-20261024/final-device.log)。失败为CompactTypography未合并树命中关闭抽屉文字、SourceDocument两项新建按钮同名匹配、Account底部入口未滚入视口；计划只修测试定位/前置并复测4项，11项不重跑 |

| 实际冻结电脑端 | `工作-1.7.9.exe --data-dir .build/mobile-final-20261024/desktop-profile --smoke-test .../desktop-report`；独立SQLite、受控文件选择返回 | 通过，退出0，5项检查true；单/多页两种单据共4组PDF/Word、预览和滚轮边界；[报告](../.build/mobile-final-20261024/desktop-report/report.json)。无正式data/云业务写入，EXE哈希保持EB1AA6C76A70A5A0E24B2D1B2779254DAF447A77082AAA79C27A624C481E51B8 |

| 定位修订后4项复测 | 仅重建/安装测试包；原4失败方法，主包不变 | 2通过、2失败，累计13个不同用例有效；[复测日志](../.build/mobile-final-20261024/selector-device.log)。标题字号正确但hasVisualOverflow为true，待尺寸诊断；单据生成用例第71行同名标签计数0，需按产品头/字段tag滚入LazyColumn后检查。下一轮保留溢出断言并增加测量，单据以第二产品独立tag/值及收起不存在验证，其他断言不变 |

| 剩余2项测量复测 | 最新测试APK覆盖安装；仅字体UI与单据生成方法，独立输出目录 | 单据通过，累计14项不同用例有效；标题仍失败，21sp、336x122px、maxWidth992px、intrinsic336px、widthOverflow=true、heightOverflow=false；[测量日志](../.build/mobile-final-20261024/measure-device.log)。只补段落宽/行与字形边界诊断，保留原断言；下一轮仅运行字体UI方法，主包及其余有效结果不变 |

| 标题字形诊断与恢复方案 | 原失败方法补充MultiParagraph/行/逐字边界，不改主包 | [字形日志](../.build/mobile-final-20261024/glyph-device.log)：段落992px、文字盒336x122px、行0..336px、4个字形均在盒内，无高度溢出。旧helper因容器宽误报。只改测试为无省略/最大行数/高度及逐行逐字零容差边界检查，保留字号/名称/客户往返，仍要求实际文字不溢出；下行最终复测通过 |

| 字体UI最终复测 | 逐行/逐字零容差边界、标题21sp/新增13sp、应用名及客户往返 | 通过，[最终UI日志](../.build/mobile-final-20261024/bounds-device.log)为OK (1 test)，累计15个不同核心用例通过 |

| 最终表单画面及可视边界 | 实际客户新增表单填写合成值，等键盘insets关闭、滚动及绘制空闲，检查按钮完整边界后截图并取消，不保存 | 通过，[最终表单日志](../.build/mobile-final-20261024/view-bounds-device.log)为OK (1 test)；[边界测量](../.build/mobile-final-20261024/view-bounds-measurement.log)为根360x640dp、按钮left16/top600/right344/bottom640dp，未越界；取消后draft为空。另计1个画面用例，不重复计入15核心。首轮贴底截图仅作阶段证据；最终[手机图](../.build/mobile-final-20261024/final-emulator.png)当前设备、页面、视口和数据状态下无可见错误 |

| 增量审查与文本 | 本次两个生产文件、四份UI测试和README定向回读，核对主题/Manifest/Canvas标签引用，严格UTF-8/BOM/异常替换字符与中文界面 | 通过；7份文本编码及内容核对，Kotlin编译通过，无未解决的本次高置信度问题。Android未跟踪，依据补丁及定向回读，不冒称HEAD差异。无依赖/业务逻辑/导出资源更改；无范围外重构 |



第三方WPS/微信/QQ完整收件操作、实体手机安装/网络和真实硬件尚未覆盖；不使用Intent测试代替第三方实际验收。字体修改仅影响UI，不影响单据资源，未改的保真像素、模型、真实客户新增/Qt自动同步/回收结果继续有效。实体机连接后只补覆盖安装、名称/字号、菜单/客户表单和网络快速复查；当前模拟器阶段已完成，不宣称全系统或任意设备/数据绝对无异常。



## 手机客户目录新增修复（2026-10-24，已通过）



对象：Android工作1.2/code3，入口`com.song123jian.pricequery.mobile/.MainActivity`；修复前交付APK SHA256 `8DFDB2CDC63F0A8735930190CF44032D8A5D7FAB685668F29E0665B095F49335`。沿用已授权模拟器`emulator-5554`，执行前只读核对当前连接及包。用户授权创建标记临时客户/首次报价并于验收后回收；禁止更改已有业务、清除应用数据或登录MES。



| 范围 | 场景与预期 | 状态与证据 |

| --- | --- | --- |

| 根因 | `MainScreen.kt`客户目录只有搜索/查看，缺少新增入口；云端`pmu_require_customer`在首次报价事务内建档 | 失败测试确认customer-add未显示；`.build/mobile-customer-20261024/red-device.log`，1项预期失败 |

| UI回归 | 目录新增可见；独立表单；必填校验；工具栏/系统取消返回目录并保留搜索；原新增报价返回；未同步/锁定存储保护 | 通过2项；边界见`rebuild-device.log`、返回/必填见`back-ready-device.log`；同轮完整抽屉1项通过，合计3个不同UI用例。未决请求沿用原保存门禁，本轮不注入真实未决请求 |

| 真实业务 | 实际MainActivity界面新建标记客户及首次报价；目录自动可见；真实Qt前台自动读取同一当前字段/单条历史；详情界面回收客户 | 通过1项；`cloud-device.log`为OK (1 test)，`phone-report.json`completed/既有客户及报价不变为true；`desktop-report.json`3个阶段passed，automatic_sync_observed=true，无桌面业务写入。测试客户已回收，1条报价历史保留 |

| 构建及交付 | 定向重建及保留数据覆盖安装；3份APK哈希比较；补丁审查和5份文本编码核对 | 通过；1.2/code3 APK `CC507A7B3434C8647BB28CD0609B0B631B0B6ABD731F64122F01977723A93F11`，93663518字节。构建/根目录/设备回拉一致；原debug证书；见[最终核验](../.build/mobile-customer-20261024/final-verification.json)。最终截图留到字体/名称阶段最后一次修改后 |

| 首轮修复包设备测试失败 | 入口/边界2项及原抽屉1项；主包和测试包覆盖安装成功 | 3项均失败于NoSuchMethodError，不计通过；`green-device.log`。Kotlin编译类含新字段，但APK classes5.dex为旧定义；恢复方案定向重新执行主包产物链并核验DEX，不改业务实现 |

| DEX重建后的设备结果 | 重建36项产物任务成功；DEX核对新字段/方法后覆盖安装并执行原3项 | 2项通过，1项在测试第47行系统返回超时；`rebuild-device.log`。修订测试前置：第二次打开表单后先等标题、返回控件显示及UI空闲，再触发系统返回；未改生产逻辑，待单项复测 |



本阶段环境Windows11/Temurin17/Gradle9.1/SDK36，模拟器Android15/API35、x86_64、1440x2560；入口及版本同上，最新哈希见交付行。实际命令`adb install -r`、`am instrument -w -r -e class ...CustomerCreationUiTest/...DrawerNavigationUiTest`及显式controlled_writes的`CustomerCreationCloudUiTest`；桌面`desktop_customer_qa.py`使用同一账号的仅内存会话，nonce保护本机临时桥接，未落盘认证材料。读回快照验证回收与既有记录；本机转发已移除，所有会话结束。



此前24项模型和未变单据/同步证据继续有效，不重跑无关项目；本轮真实客户新增端到端已通过，失败记录如实保留，不累加重复次数。MES用户反馈已连通正常；本轮不执行独立MES登录，不将用户反馈记为自动化通过。实体手机仍按用户安排后续复查。新增的字体小一号、应用名称“工作”与最终两端核心回归尚未实施，不在本节冒称通过。



## 当前增量验证（2026-10-24，模拟器阶段已完成）



实际对象：`com.song123jian.pricequery.mobile/.MainActivity`，1.2/code3，主APK SHA256 `8DFDB2CDC63F0A8735930190CF44032D8A5D7FAB685668F29E0665B095F49335`；测试APK SHA256 `C2F97CF230DEF753DE0D3D8F4BC5FFE7858398831994FEB3DAFF3074C6A08A65`。Windows11/Temurin17.0.20.1/Gradle9.1/SDK36；模拟器 `emulator-5554` Android15/API35、x86_64、1440x2560。按用户授权先模拟器、框架流程上线后实体手机复查；本次没有上线或真实MES登录。



| 范围 | 对象 / 操作 | 实际结果与状态 | 证据 |

| --- | --- | --- | --- |

| 导航源码检查 | Android 1.2/code3，定向检查 `MainScreen.kt` 抽屉入口及 `BusinessScreen.kt` 页面映射 | 源码不再使用底部 `NavigationBar`；左侧抽屉12入口对应独立目标。此项仅静态证据，实际点击与返回由下方独立设备用例证明 | `source/android/app/src/main/java/com/song123jian/pricequery/mobile/ui/main/MainScreen.kt`、`BusinessScreen.kt` |

| 前阶段构建与单元测试 | Windows 11；Temurin 17.0.20.1、Gradle 9.1、SDK 36；先前主包/24项单测及首轮测试APK构建 | 前阶段主APK构建成功，24 passed、0 failed；首轮修正后的路由仪器测试定向构建成功，13秒，测试APK SHA256=`AA4F2571485DAF6117D993F0268B484179A33B356FC7DAFF152D6031AD9345F9`。后续MES界面改动不影响模型单测，结果继续有效；最新主包构建和设备结果见下方，不以旧测试包哈希标识最终交付 | [主包/单测构建日志](../.build/mobile-menu-20261024/build-y-final.log)、单测XML：`source/android/app/build/test-results/testDebugUnitTest/TEST-com.song123jian.pricequery.mobile.data.BusinessModelsTest.xml`、`ModelsTest.xml` |

| 抽屉目标页首次失败（已恢复） | `DrawerNavigationUiTest` 覆盖12个抽屉项及编辑返回 | 首次失败于“报价查询”标题重复匹配可见页面及关闭抽屉后的同名选中菜单项；未进入其他目标。其后修为非可选页面标题可见断言，保留全部覆盖，最终结果见下方 | [失败摘录](../.build/mobile-menu-20261024/drawer-instrument-red.log)、`DrawerNavigationUiTest.kt` |

| 设备身份与授权 | `adb devices -l`、包元数据及系统属性只读核验；用户明确回复“先模拟器，框架流程上线后实体手机复查” | 当前唯一目标为 `emulator-5554`，在线；包 ABI `x86_64`，系统型号属性 `24031PN0DC`。用户授权在当前模拟器验收，实体手机复查留待框架流程上线后。没有清除数据；随后用例仅通过已有会话执行云端只读查询 | ADB设备列表、`dumpsys package com.song123jian.pricequery.mobile`及`getprop`结果 |

| 首次覆盖安装与签名 | Android 1.2/code3主包及仪器测试包均执行 `adb install -r`；比较包签名 | 两包安装均成功；保留已有会话和数据。签名 SHA256=`5fe328500439ad14728906485d9327da7b6fc0682490336135729afa86c7b213`，与已有安装证书一致。当时主APK SHA256=`873CD94AADD437DFDA570EAA421CAC4D329A0A5E9FC529C942BC669C6425A4F8`、测试APK SHA256=`AA4F2571485DAF6117D993F0268B484179A33B356FC7DAFF152D6031AD9345F9`，不是最终交付哈希 | [覆盖安装记录](../.build/mobile-menu-20261024/install-r.log)；`apksigner verify --print-certs` |

| 路由测试定位修订构建与复测 | 测试标题匹配排除抽屉可选项，检查页面标题实际显示；定向重建并覆盖安装测试包后运行同一仪器类 | 定向编译/打包通过（18秒）；模拟器复测失败于目标状态等待第47行，30.796秒。没有再出现标题重复匹配错误；日志无目标标识，不能断言具体失败入口。源码确认原测试只等账号名恢复，未保证首次同步完成，而新增报价受同步就绪门禁保护 | [构建](../.build/mobile-menu-20261024/drawer-selector-build.log)、[超时原始输出](../.build/mobile-menu-20261024/drawer-instrument-timeout.log) |

| 抽屉完整路由及返回最终复测 | 实际MainActivity，等待首次云同步完成；12项分别点击并断言屏幕/页面/标题可见；报价返回和两种单据未保存离开确认 | 通过：`OK (1 test)`，11.923秒；测试APK定向构建通过（17秒）。无业务写入、MES登录或文件导出，保留会话数据。两次失败已保留，不累加为通过 | [构建](../.build/mobile-menu-20261024/drawer-ready-build.log)、[模拟器通过结果](../.build/mobile-menu-20261024/drawer-instrument-ready.log) |

| 新增操作构建 | 当前Android 1.2/code3；`assembleDebug assembleDebugAndroidTest --no-daemon` | 通过，34秒；增量缓存旧Y盘与Z盘根路径冲突后工具自动回退，最终编译打包成功。新版主包和测试包均覆盖安装成功，保留会话 | [构建](../.build/mobile-menu-20261024/parity-readonly-build.log)、[主包安装](../.build/mobile-menu-20261024/final-main-install.log)、[测试包安装](../.build/mobile-menu-20261024/final-test-install.log) |

| MES选项及边界组件 | 实际MainActivity更改合成输入、HTTP确认框取消并核对原MES凭据不变；`MobileLayoutTest` 报价卡、历史/详情、批号操作三项；`MobilePreferencesTest`隔离合成MES加密/清除一项 | 5项通过：未登录MES、未改既有凭据或写业务数据。3个组件用例用合成数据只作控件辅助，不覆盖真实MES/历史API；清除存储失败保护为代码审查结论，未模拟设备磁盘故障 | [设备输出](../.build/mobile-menu-20261024/parity-readonly-device.log)；总计6项中仅下行前置检查失败 |

| 当前数据报价/历史前置失败（已改用内存输入） | 当时的 `ReadOnlyParityUiTest#priceSortingQuoteCopyAndHistoryDetailsUseRealReadOnlyData`，先等云同步完成再取报价 | 失败/前置不满足：账号已同步但报价0条，未开始排序、复制或打开历史。不创建云报价填充测试数据，改用下一行内存输入；本轮真实云历史数据链路仍未验证 | [设备原始输出](../.build/mobile-menu-20261024/parity-readonly-device.log)，当时测试第30行 |

| 实际MainActivity合成输入复测 | `ReadOnlyParityUiTest#priceSortingQuoteCopyAndHistoryDetailsUseInMemoryRecords`；核对真实空态后暂停用例内轮询，仅内存注入9.90/100.25/10.25三报价、三历史/同日/待生效记录及单条历史；实际点击排序/复制/详情/关闭/系统返回；最终恢复原状态、剪贴板及前台轮询 | 通过：`OK (1 test)`，6.804秒；定向测试APK构建通过，12秒。升/降序首条价格按数值正确、报价和历史复制字段逐项匹配、详情可打开关闭、单/多条趋势存在、返回报价页正确。历史读取被内存状态替代，不调用真实历史API，不云保存、不导出 | [构建](../.build/mobile-menu-20261024/parity-memory-build.log)、[通过日志](../.build/mobile-menu-20261024/parity-memory-device.log)、`ReadOnlyParityUiTest.kt` |

| 最终包、安装与画面 | 直接覆盖根目录1.2APK、不备份；`pm path`后拉回base.apk；SHA256三方比较；`apksigner verify --print-certs`、`aapt2 dump badging`；启动实际App、开抽屉后一次截图 | 通过：构建/根目录/安装包均为 `8DFDB2CDC63F0A8735930190CF44032D8A5D7FAB685668F29E0665B095F49335`、94024431字节；1.2/code3/target36；沿用原debug证书。截图1440x2560，当前设备、页面、视口和数据状态下无可见错误。辅助uiautomator退出1但目标XML已生成且结构化读回有效，未重复截图；画面以实际PNG核对 | [最终核验](../.build/mobile-menu-20261024/final-verification.json)、[菜单截图](../.build/mobile-menu-20261024/drawer-final.png)、根目录APK及`.build/mobile-menu-20261024/installed-base.apk` |

| 增量审查与文本 | 定向回读导航/返回、数值排序、图表、复制、MES凭据和本轮测试；严格UTF-8解码/BOM/异常替换字符检查，结合实际中文文本及Kotlin编译 | 通过：修正MES文案与清除失败保护后，无未解决的本轮高置信度问题；10份受影响源码/测试编码检查通过。没有全项目lint或无关测试；没有真实磁盘故障注入 | [增量审查](../.build/mobile-menu-20261024/incremental-review.json)；构建与本节设备证据 |

| 当前验收状态 | 模拟器阶段7个不同用例通过，24项不受影响JVM单测继续有效 | 根目录APK已覆盖，设备同包且数据/会话保留；无运行中的构建/测试会话、临时Z盘映射已撤销。实体手机按用户安排后续复查；真实MES、当前真实云历史、设备间本地草稿同步不冒称通过或已实现 | [最终核验](../.build/mobile-menu-20261024/final-verification.json) |



恢复完成：仅复跑原先因空数据未进入的一个方法，断言保持，输入改为实际MainActivity内存状态；5项已通过的MES取消、组件及隔离加密结果继续复用。合计7个不同设备用例，不累加失败或重复次数。当前真实云历史因无数据尚未完成验证；MES独立登录/查询及实体手机验证未执行；未模拟本机存储失败。原云同步/单据保真/文件导出不受本轮更改影响，旧证据继续有效。后续仅当相关实现/依赖/环境或验收数据发生影响时复测对应范围。



### 菜单路由测试方案调整



初始方案复用已有页面用例并在模拟器抽查；审查发现缺完整路由覆盖后新增独立只读仪器测试。中文路径构建失败经临时ASCII映射恢复；单据未保存确认、标题语义重复、首次同步前置均只调整测试定位/前置，未改生产导航。当前12入口及编辑返回完整通过，失败证据在上表保留。用户授权先模拟器，框架流程上线后再实体手机复查。测试页面允许已有会话的只读云查询，不产生业务写入、不登录MES或导出文件。



## 当前增量验证（已完成，2026-10-23）



| 范围 | 对象 / 操作 | 实际结果与状态 | 证据 |

| --- | --- | --- | --- |

| 两端 Supabase 项目配置 | 实际 `工作-1.7.9.exe` PyInstaller 内嵌配置；Android 模拟器已安装1.2/code3的运行时覆盖值与包内默认配置；只输出项目 ID，不输出 key | 两端均指向 `saodtwnvbanjlkwwivcb`，均使用 `main` production；配置一致 | 本轮本机脱敏解析；Android 包版本由 `adb shell dumpsys package` 确认 |

| Supabase 自动读取对象 | 在共同项目 SQL Editor 执行只读目录/设置查询，检查 RPC、表、触发器和 authenticated 执行权 | `pmu_sync_meta_v1()`、`pmu_mobile_snapshot_v1()` 存在且 authenticated 可执行；`pmu_data_versions` 存在；报价和客户版本触发器启用；版本为 multiuser 1.7.0、quote workflow 1.6.0、desktop sync schema 1。`pmu_mobile_requests` 不存在，不影响读取自动同步。无数据库或业务写入 | Supabase SQL Editor（项目 `saodtwnvbanjlkwwivcb`）；实现见 `source/migrations/desktop_sync_v176.sql` |

| Android 实际前后台自动读取 | `emulator-5554` Android15/API35，已安装 `com.song123jian.pricequery.mobile` 1.2/code3；运行 `adb shell am instrument -w -e class com.song123jian.pricequery.mobile.LifecycleSyncTest com.song123jian.pricequery.mobile.test/androidx.test.runner.AndroidJUnitRunner`。先读取真实云快照，后台等待16秒，再返回前台等待真实读取 | `OK (1 test)`，22.844秒；后台未继续轮询，回到前台自动刷新成功；只读，无报价写入 | `source/android/app/src/androidTest/java/com/song123jian/pricequery/mobile/LifecycleSyncTest.kt`；运行时设备 `emulator-5554` |

| 桌面自动轮询定向测试 | `pytest -q tests/qt/test_sync_recovery_ui.py tests/test_sync_state.py`，覆盖桌面15秒轮询/失败恢复状态 | 尚未完成验证：本机 Python 3.13 环境在收集 `test_sync_recovery_ui.py` 时缺少 `requests`，由 `services/inventory_service.py` 导入失败；未进入测试断言，不是代码失败。未安装依赖。桌面轮询实现及先前真实桌面云读取证据仍有效 | 实现 `source/ui/main_window.py`；先前真实云读取见 [`desktop-supplement-report.json`](../.build/android-mobile-qa/desktop-supplement-report.json) |

| 登录连通性 | 当前客户端配置解析、项目 DNS/HTTPS health；真实 Qt LoginDialog 登录、成员状态读取并注销，关闭记住密码 | 通过；业务写入0，未保存登录凭据。原 `app.log` 只留通用传输错误，无法确定当时是 DNS/TLS/超时 | 真实登录已在本轮执行；不保留账号标识或认证材料 |

| 网络异常日志分类 | NetworkError 专项 Qt worker 回归 | 通过，日志记录 `network_error`，不再归为 `validation_error` | [定向测试报告](../.build/login-scroll-20261023-final.xml) |

| 源码滚轮及关联 UI | 报价/合同两页 PDF：viewport 下滑、上滑及首尾边界；worker 异常分类 | 56 passed | [定向测试报告](../.build/login-scroll-20261023-final.xml) |

| 冻结版首次验收 | 工作1.7.9 EXE，Windows Qt Widgets，隔离 SQLite；原默认单据 QA 输入并尝试 PDF 导出 | 失败发生于预览前：模板正确拒绝过长内容；滚轮本轮尚未覆盖。生产/云写入0 | [实际 EXE 报告](../.build/desktop-wheel-20261023/report/report.json) |

| 冻结版原件单据验收 | 同 EXE SHA256 `FE52BF40B7359DA03E66F5337140F9C82E7EF4E158C52E363B21ED5A8F07FE47`；`source-fidelity`，报价/合同各追加短明细成为2页 | 通过；viewport 下滑到第2页、上滑返回第1页、导航边界以及 PDF/Word 导出。冻结场景未另测图片区，源码测试已覆盖 | [最终单据报告](../.build/desktop-wheel-20261023-fidelity/report/report.json) |

| 认证辅助回归 | 账号配置/凭据/注册/Qt 登录四个测试文件 | 36 passed，1 failed；失败测试在默认 AccountService 构造时读取不存在的源码私有配置，未发网络请求。待注入合成配置，仅复验失败项 | [认证测试报告](../.build/login-auth-20261023.xml) |

| 认证失败项恢复 | 注册切换测试注入合成 AccountService 配置 | 单项通过，与仍有效36项合计37个不同用例通过，不依赖私有配置 | [单项最终报告](../.build/login-auth-final-20261023.xml) |

| 实际冻结登录首次定位 | EXE SHA256 `B487AB3CB4ADA8AC9ED537F08A957023DCBD659F64431A7B042FCA4458A111E1`，Windows Qt Widgets，`--data-dir .build/desktop-login-20261023/profile --account-qa .build/desktop-login-20261023/report` | 失败；同类 NetworkError 在 token 请求复现，未到首页；正常退出1、验收凭据清除、业务写入0。尚未修复 | [实际登录报告](../.build/desktop-login-20261023/report/report.json)，同目录 profile/app.log |

| 安全诊断脱敏 | 构造含认证材料的网络异常并捕获日志，预期只输出异常类别和数值字段 | 1项通过，无异常正文、密码、公开key或令牌泄露 | [诊断绿色回归](../.build/login-network-diagnostic-green.xml) |

| 冻结 HTTPS 初始化定位 | EXE SHA256 `D48F06F00C5D39529D8B6EE971A98CF9490E52CE51C8D2A5147D9FD87A809E44`，真实 login-only 入口、隔离 DPAPI 凭据 | 失败，FileNotFoundError/errno2；运行库必须读取的 codex-rejected-cas.pem 未打包，未到首页。进程退出1、凭据清除、业务写入0 | [安全诊断报告](../.build/desktop-login-diagnostic-20261023/report/report.json)，同目录 profile/app.log；运行库 ssl.py 与 Analysis-00.toc 定向核对 |

| 两端单据空白源码回归 | 原模板实际服务；单条/3条合同末页、短/空交期、完整合同和报价；Word部件与表格行、PDF文字与边框 | 初始2项复现失败；修复后19 passed，Python3.13/offscreen；不等于新EXE/APK实际验收 | [初始红色](../.build/document-empty-rows-red.xml)、[最终绿色](../.build/document-empty-rows-green.xml) |

| 单商品合同实际渲染 | QA-SINGLE本机输入；服务导出PDF/DOCX，WPS12 COM只读导出Word PDF，PDFium渲染并目视 | 通过此样本：主表均5行，两行交期、合计和原章正常；原图片资源保留。不声称任意软件逐像素一致 | [PDF](../.build/document-empty-rows-20261023/contract-single.pdf)、[Word渲染](../.build/document-empty-rows-20261023/contract-single-word.pdf)、同目录PNG |

| 空白修复实际程序 | Windows 11 x64实际入口 `工作-1.7.9.exe --data-dir .build/document-empty-rows-20261023/desktop-profile --smoke-test .build/document-empty-rows-20261023/desktop-report`，Qt实际表单/预览/PDF/Word/双向滚轮；Android15/API35 `emulator-5554` 覆盖安装1.2/code3并运行 `com.song123jian.pricequery.mobile/.MainActivity` 生成与预览 | 通过；桌面报告passed，设备4个不同用例通过；根目录APK、构建APK、设备回拉APK哈希一致 | [桌面报告](../.build/document-empty-rows-20261023/desktop-report/report.json)、[手机最终预览](../.build/document-empty-rows-20261023/android-final-preview.png)、[最终核验](../.build/document-empty-rows-20261023/final-verification.json) |

| 运行库打包辅助 | test_build_contract.py，资源存在及缺失两种输入、空格路径/冻结根目录映射、既有构建契约 | 6 passed；Analysis-00.toc 已收集必需 PEM | [构建定向回归](../.build/login-runtime-assets-20261023.xml) |

| 实际冻结登录修复验收 | EXE SHA256 `0538A2B1E934397996926F63A1D0C6BF14B20BC5F4B51D9E7D778C24CD1C36A7`，实际 Windows Qt，login-only 隔离目录 | passed、进程退出0；真实登录→首页loaded→注销→清除验收凭据，无替代服务、无业务写入/导出/备份 | [真实登录最终报告](../.build/desktop-login-runtime-fixed-20261023/report/report.json) |



当前恢复范围：登录、滚轮及原件保真之前阶段的37项认证、56项单据/UI、脱敏1项、构建辅助6项结果未受本次空白修复影响，予以复用。空白修复已完成：源码19项通过；Android构建成功，模拟器4个不同设备用例通过；桌面实际EXE表单、预览、PDF/Word导出及两种单据双向滚轮通过；12组18页跨端PDF逐像素一致且Word部件一致；WPS只读核对4页。新包哈希、编码/Ruff和审查记录见[最终核验JSON](../.build/document-empty-rows-20261023/final-verification.json)。原附件及正式业务数据未写；Android使用覆盖安装保留会话。历史ARGB断言失败和恢复详见下方，不累计失败轮次为通过。



### 空白设备验收恢复



Android实际1.2/code3主包和测试包构建成功并覆盖安装，保留会话。初始设备轮4项中3项通过；第4项 `emptyProductRowsAreRemovedWithoutLosingDeliveryOrSeal` 将透明背景RGB误计为黑线。回拉PDF与可见像素已证实空行不存在，主表5行、交期和原章保留。仅修正测试的alpha可见性判定，并保留真实底边断言；单项复测 `OK (1 test)`，合计4个不同设备用例通过。日志：`android-device.log`、`android-device-recovery.log`；不把初始失败轮记作通过。



## 原件单据一致性（已完成，2026-10-23）



原件保真阶段对象（历史基线哈希）：桌面 [工作1.7.9 EXE](../工作-1.7.9.exe)，当时SHA256 `B3650BD95EE7C50B5234B537364335C83FFFD14B8432C203703DAB09973DE6D2`；Android [1.2/code3 APK](../工作手机版-1.2-debug.apk)，当时SHA256 `21C65AABC51475A2F6C37F48D56BFDD171FBD25DD35C7DAD05DDD9BC3F68C572`。当前空白修复交付包的新SHA256与实际程序结果见上方“空白修复实际程序”记录及[最终核验](../.build/document-empty-rows-20261023/final-verification.json)。当时测试入口为实际EXE `--data-dir <隔离desktop-profile> --smoke-test <desktop-frozen-delivery>`；模拟器实际MainActivity与手动 `adb install -r` / `am instrument -w -e class ...SourceDocumentFidelityTest,...SourceDocumentUiTest`，未使用会卸载App的connected仪器任务。



环境与前置：Windows11 x64、Python3.13/PySide6、WPS12 COM只读导出、PDFium2倍渲染；emulator-5554 Android15/API35、1440x2560、保留原会话。正式data、Supabase和MES不写入。证据根目录 [document-fidelity-20261023](../.build/document-fidelity-20261023/)，只本机保留，未公开上传。



| 验证范围 | 真实操作与预期 | 实际结果 / 状态 | 可定位证据（相对证据根目录） |

| --- | --- | --- | --- |

| 原件与结构 | OOXML解析、原件WPS只读导出全部页；回读SHA256、图片与样式 | 通过；原件各1页、合同原章保留、报价无章；原件未改 | `contract-inventory.json`、`quotation-inventory.json`、`*-reference.pdf/png` |

| 应用服务与界面辅助 | 两个定向pytest文件：原数据、变更字段、页脚、容量、分页、超长保护、实际Qt表单/预览相关路径；再限定日期复验 | 45个不同用例有效通过：42项正常，3项新短日期最终复验通过；不累计重复轮次 | `desktop-date-recovery-tests.xml`（42通过/3测试选择器失败）、`desktop-short-date-final.xml`（3通过） |

| 实际Android程序 | 当前主APK/测试APK覆盖安装；原始、修改、续页、3种短日期的PDF与Word读回/Android PdfRenderer；超长拒绝、未确认税口径/空合同号拒绝；MainActivity编辑及两种格式生成/预览 | 通过，3/3，无跳过；单据仅本机草稿，未作云写入 | `android-date-final-build.log`、`android-device-date-final.log`、`device-exports/device-result.json` |

| 实际冻结桌面程序 | 隔离SQLite，在真实表单输入Desktop-QA，预览后PDF/Word导出并回读内容；原生文件选择器仅返回路径受控 | 通过，实际EXE退出0；两种格式和两种单据均产生真实文件；不把路径桩当成云验收 | `desktop-freeze.log`、`desktop-frozen-delivery/report.json` |

| 跨端结果 | 回拉App实际输出，与应用服务桌面输出同渲染器比较；9组包含原输入/编辑/多页/短日期 | 通过，11页PDF2倍逐像素相同、全部Word部件内容相同、图像资源相同；原数据直接为原件bytes | `cross-platform-report.json`、`mobile-*-page*.png`、`device-exports/` |

| Word实际渲染 | WPS只读打开最终编辑/多页DOCX导出PDF，再PDFium逐页检查；日期长度按原数字节点校准 | 通过；编辑版各1页，多页各2页，全部6页及3种短日期全部页已查看；不声称Word/PDF任意输入像素全同 | `*-word-final.pdf`、`*-word-page*.png`、`*-multipage-final-review.png`、`quotation-date-*-word.png` |

| 交付与升级 | aapt2版本、apksigner验签/旧1.1证书比对；回拉已安装base.apk比较构建/交付哈希；快捷方式回读 | 通过，1.2/code3，APK93713092字节、三份SHA256相同；同一Android Debug证书，保留会话 | `final-verification.json`、`installed-base.apk`、`工作快捷启动-before.lnk` |

| 最后页面与增量审查 | 最后代码后每设备一次预览截图并查看；读回当前差异、原件映射、两端渲染/Word/UI与验证边界；定向Ruff、语法与UTF8/BOM | 当前设备、页面、视口和数据状态下无可见错误；本次增量无未解决高置信度问题，文本检查通过 | `desktop-frozen-delivery/source-contract-final-desktop.png`、`android-final-preview.png/xml`、`final-verification.json` |



原件哈希：合同 `09417107629a83326b3420ac40226f94f5c5b9fddfd0b993787106e8f55a69f9`，报价 `acf82a914003bf5710626a5adcf024cfabc9bc8b668dc372a041c2e5426742c5`。共享资源一致、字体保持原件字号；合同每页2项，报价每页1项，超长提示而不缩字号，原目标文件不覆写。



### 本轮失败与恢复摘要



| 失败事实 | 已证实根因与范围内修复 | 最终状态 |

| --- | --- | --- |

| Skill渲染入口无soffice；字体辅助缺fontTools | 未调用用户LibreOffice，替为WPS12只读导出；TTC提取改标准库，不加字体工具依赖 | 原件/Word全部页已渲染核对 |

| 动态字意外加粗、日期间距偏差；短日期“日”x512.602而WPS524.519 | ReportLabTr状态泄漏、字体逐字累加忽略原自动间距；save/restore状态、原坐标及4种日期长度映射；Word保留语言/数字节点 | 3种短日期和两端实际导出通过；旧`quotation-short-date*`留作失败证据 |

| pypdf写后合同0页、两端少量字形边缘不一致 | 内容流须replace_contents写间接对象；Android浮点累加改Double，两端坐标3位小数，图章使用原资源名 | 当前11页跨端全部一致 |

| 原字段误居中、Word混合日期集中首节点 | 原pPr确认为缩进左对齐；校正映射/后续行缩进；Word数字子字段及等长按节点切分 | 位置/保留项和最终页面通过 |

| 设备页脚断言过宽、Qt预览定时未就绪、坐标预期误130.08、新日期匹配到“日期”标签 | 定点修测试编辑部件规则、等真实pixmap、按原件130.32、日期选择器限定x>448；无降业务断言 | 对应复验通过；`desktop-short-date-final.xml`3绿；42个其他用例仍有效 |



### 验证边界与复用



- 本轮无云、MES或既有业务写入；旧1.1同步/OCR/备份等未改代码结果继续有效，不重新运行不相关全量回归。旧1.0/1.1APK及1.7.8保留。

- 9组11页证明已测样本在两端同渲染器一致，不代表任意长度或任意Word/WPS版本绝对100%；可编辑Word换行仍由文档软件和字体决定。固定版式发送用PDF，超长须缩短或拆单，不暗中缩字号。

- 尚未完成验证：实体手机安装/网络、真实MES；并非本次原件单据模块的失败或已验证项。两端单据草稿/供方资料仍本机，不冒称云同步。

- 下次仅在对应代码/模板/字体/输入或验收条件变化时复验受影响路径。每轮先读本节，保留设备会话，不卸载有待核对请求的App。双交接已语义融合，文档自身核验不触发业务重测。



实际对象：2026-10-18 Windows 桌面源码上传副本，入口 source/desktop_main.py；依赖 source/desktop-requirements.lock.txt。



本轮验证：复制文件与原文件 SHA256 一致；空白 seed 和配置示例可解析；Python 源文件仅做 AST 语法检查；ZIP 条目和 SHA256 与清单一致；敏感配置、真实报价、私有模板、安卓、业务库和缓存排除。上传提交结果以仓库实际提交为准。



复用结果：原项目审查记录 447 tests passed、compileall 退出 0；Ruff 3 个 I001 未修复。本轮不重跑测试，不把静态语法/归档校验当作真实功能验收。



尚未完成验证：公开副本的真实 Supabase、单据模板、全量构建和界面功能；需要用户自己的配置及资源。原始项目验证记录保留于本机。



## Android移动端



### 当前对象与环境



`com.song123jian.pricequery.mobile/.MainActivity`，当前单据交付1.2/code3（通用业务回归基线1.1/code2）、minSdk26/targetSdk36；源工程 `source/android`。Windows11、Temurin17.0.20.1、Gradle9.1、SDK36/BuildTools36.0.0；模拟器 `emulator-5554` Android15/API35、1440x2560。构建使用现有Z盘映射和进程级 `-XX:-TieredCompilation`。正式项目沿用电脑公开配置；账号密码/令牌不写源码或交接，登录会话由设备加密存储。



### 有效验证记录



| 范围 | 操作 / 预期 | 实际结果与状态 | 证据 |

| --- | --- | --- | --- |

| 最新下载与旧版基线 | 当时HEAD/远端main与LFS文件核对，登录/空快照、刷新、前后台轮询、退出重登、加密待处理恢复 | 对应旧版本通过，未变化路径按范围复用；不对应1.1交付哈希 | `verification.json`、`instrumentation-green.log`、`lifecycle-green.log` 位于 `.build/android-mobile-qa` |

| 当前构建 / 模型 | `:app:assembleDebug :app:testDebugUnitTest :app:assembleDebugAndroidTest` | 成功；BusinessModelsTest13、ModelsTest10，23通过/0失败/错误/跳过 | [最新构建](../.build/android-mobile-qa/parity-final-build.log)；[业务模型JUnit](../source/android/app/build/test-results/testDebugUnitTest/TEST-com.song123jian.pricequery.mobile.data.BusinessModelsTest.xml) |

| 本机业务设备用例 | CSV/XLSX/PDF导入、指定客户覆盖、材料规格/颜色、中文OCR、供方账号隔离/自动带入、SQLite三表回读、合同/报价PDF分页、加密业务请求 | 最后业务辅助10项通过；同轮2项UI因无已有会话跳过，不能计通过 | [设备测试](../.build/android-mobile-qa/parity-image-import-final-tests.log) |

| 真实MainActivity图片复核 | 已授权登录后UI采用合成候选；未确认不能保存，确认启用、编辑复禁用；内存合成已有规格匹配调价，原因/复核框可见并满足相同门禁 | 1/1通过，未点击云保存；合成报价仅注入内存，不代表真实云匹配保存验收 | [最新UI设备结果](../.build/android-mobile-qa/parity-final-ui-device.log) |

| 图片候选切换/手动消歧回归 | 覆盖安装当前源码；真实MainActivity切换已匹配/新候选、歧义后补颜色再保存；预期清空旧基准、继承字段后重新确认且不提交 | 构建成功；设备1/1通过，无跳过；候选/匹配报价为内存合成数据，未点击真实云保存 | [本轮构建](../.build/android-mobile-qa/parity-candidate-state-build.log)、[本轮设备结果](../.build/android-mobile-qa/parity-candidate-state-device.log) |

| 个人流程读取 / null指纹边界 | 已登录实际App检查个人流程表；设备真实JSONObject验证缺失/null/有效指纹 | 各1/1通过，无跳过；错误路由及文字null的失败复现分别保留 | [流程绿色](../.build/android-mobile-qa/workflow-route-green.log)、[指纹绿色](../.build/android-mobile-qa/fingerprint-null-green.log) |

| 补充真实云/桌面一致性 | 主包由parity-fingerprint-build.log构建、测试包由parity-supplement-session-build.log构建；手机UI新建21.5→指定客户CSV22.5→黑色/含税补齐→图片候选23.5；核对历史ID/价格/日期/指纹、完整备份及补齐后只读核对；真实Qt逐字段/历史读取；回收测试客户 | 手机1/1通过，桌面2次inspect及1次absent共3项passed；手机报告completed及existing_quotes_unchanged=true，测试历史保留于回收站 | [最终设备日志](../.build/android-mobile-qa/parity-cloud-supplement-device-6.log)、[手机报告](../.build/android-mobile-qa/cloud-parity-supplement-report.json)、[桌面报告](../.build/android-mobile-qa/desktop-supplement-report.json) |

| 单据/业务实际界面 | 新报价单录入、生成/预览PDF、云端完整备份、读取回收站、MES登录入口 | 对应用例通过；不证明MES真实登录/查询成功 | `parity-retest-2.log` 与 `parity-image-import-device.log` |

| 已有云端双向传播 | 手机UI保存12.5、调价13.5，桌面Qt读取/调价14.5，手机回读三条历史、备份恢复及客户回收/恢复 | 这些业务断言通过，原业务报价全量内容相同；整条用例最终因本机恢复清理路径少backups层级而失败，最后桌面隐藏未执行 | [云联测](../.build/android-mobile-qa/cloud-parity-2.log)、[桌面报告](../.build/android-mobile-qa/desktop-joint-report.json) |

| 最终安装包 / 模拟器入口 | 主包复制至根目录；aapt2核版本、apksigner验签并对比旧1.0证书；pm path拉回实际base.apk并比较三份哈希；启动实际App及业务页 | 版本1.1/code2、68595109字节，三份SHA256均为94896F7960CDDF8F9D9C3476C77CE7388AB99D462E12EBD30E4A372D146E89DB；沿用本机Android Debug证书；已同步，测试客户均不出现在正常查询 | [交付APK](../工作手机版-1.1-debug.apk)、[最终核验](../.build/android-mobile-qa/parity-final-verification.json) |

| 最终界面 / 审查与编码 | 最后修复后仅截图业务页一次并目视核对状态栏/导航/内容；定向回读候选状态、个人表路由、null解析与核对分支及测试调用链；源码与文档UTF-8/BOM/异常替换字符检查 | 当前设备、页面、视口和数据状态下无可见错误。增量审查无未解决高置信度问题；文字检查通过，无无关全项目重跑 | [最终截图](../.build/android-mobile-qa/parity-final-emulator.png)、[页面XML](../.build/android-mobile-qa/parity-final-menu.xml)、[增量审查](../.build/android-mobile-qa/final-incremental-review.json) |

| 本轮手机布局构建与设备 UI | Temurin 17.0.20.1/Gradle9.1/SDK36；`assembleDebug`、`testDebugUnitTest`、`assembleDebugAndroidTest`；`emulator-5554` Android15/API35，先核证书再 `adb install -r`，手动 `am instrument -w -e class ...` | 构建成功，模型23项通过/0失败；设备端报价卡折叠1/1、真实业务菜单分组1/1通过。设备已安装1.2/code3，旧版与新包Debug证书SHA-256均为`5fe328500439ad14728906485d9327da7b6fc0682490336135729afa86c7b213`；覆盖安装未卸载/清数据。云端仅读取备份，无业务写入 | [构建2](../.build/mobile-layout-20261023/layout-build-final-2.log)、[测试 APK构建](../.build/mobile-layout-20261023/layout-build-androidTest-final.log)、[报价卡 UI](../.build/mobile-layout-20261023/device-layout-ui.log)、[菜单 UI](../.build/mobile-layout-20261023/device-business-menu-ui.log) |

| 多产品明细折叠 | 原计划复用会导出DOCX/PDF的现有单据UI用例；该用例覆盖 App 内已存在的 `source-document-qa/ui-*.docx/pdf`，故改用 MainActivity 内存两项草稿检查第2项字段默认隐藏、展开/收起 | 尚未完成验证；独立内存用例待实施，不产生导出文件或云端写入 | 计划调整记录见项目交接“手机布局折叠” |

| 本轮多产品明细UI首次设备测试 | `emulator-5554` 实际 MainActivity，创建两项内存报价单草稿，预期屏外字段未进入Compose语义树前不可直接断言 | FAILED：在第38行未滚动到产品区时查询“材料规格”，语义节点数0；测试停在折叠动作之前，无草稿保存/导出/云写入 | [设备日志](../.build/mobile-layout-20261023/device-product-fold-ui.log)；根因确认LazyColumn尚未组合屏外字段。恢复：测试先滚动至产品2展开头，展开后滚至字段断言，再滚回折叠；仅改测试定位，不改生产UI |

| 本轮多产品明细UI第二次设备测试 | 首轮修订后滚动至产品2头部，预期通用字段“材料规格”只代表产品2 | FAILED：断言却匹配产品1默认展开的同名字段，仍无法证明产品2状态；无草稿保存/导出/云写入 | [设备日志](../.build/mobile-layout-20261023/device-product-fold-ui-final.log)；恢复方案：为产品行输入框增加独立测试语义标识，专门定位产品2牌号字段，分别验证折叠缺失、展开可见、收起缺失。标识不改变视觉/业务行为 |



### 失败与恢复摘要



| 失败证据 | 根因 / 最小修复 | 结果 |

| --- | --- | --- |

| `parity-build.log`、`parity-device-1.log`、`parity-ui-1.log` | 英文映射外资源重叠、PDF兼容字形别名、LazyColumn未滚动 | 定点修复后 `parity-build-5.log` / `parity-retest-2.log` 通过，其他旧结果复用 |

| `cloud-parity-1.log`、`desktop-joint-2.log` | 移动专用保存RPC缺失，桥接finish假阳性；后者0业务用例不计通过 | 只读能力探针确认桌面RPC存在，兼容保存和RLS历史路径后业务联测通过；未部署SQL |

| `parity-image-import-build.log` | 供方扩展函数缺导入、实例方法当静态方法、文件名可空类型 | 共享纯表头函数、补导入与显式可空处理后编译/单测通过 |

| `parity-image-import-device.log`、`parity-image-ocr-diagnostic.log` | 本地OCR成功但“含税单价”读为“含稅单价”而缺别名 | 只增图片标签对应别名，原OCR用例通过，不归因于Play服务/网络 |

| `parity-image-ui-fix-device.log`及后续手动设备输出 | UI匹配后复核框被隐藏，修复后测试仍有繁简选择器、旧AndroidTest包和屏外点击问题 | UI移动复核框；修正选择器、重新构建测试包、滚入视口后状态断言，最终1/1通过 |

| `parity-cloud-supplement-device.log`、`desktop-supplement-first-report.json` | 新建成功；导入客户按钮是带标签前缀的单个Text，测试按无前缀精确查找；finish的incomplete覆盖原异常 | 本轮失败，不计导入/补齐/图片保存通过；测试客户已回收且原报价未变。仅修完整按钮选择器与finish失败传播后重测此范围 |

| `parity-cloud-supplement-device-2.log`、`desktop-supplement-second-report.json` | 当轮finally会话丢失遮蔽原异常；后由只读复现定位共享表误用 | 当轮失败，不能记通过；第三轮已回收严格标记/限定牌号和价格的遗留客户；修路由后第6轮完整通过 |

| `workflow-route-red.log` | 实际已登录App只读调用requireQuoteWorkflow，旧路径读取共享pm_settings | 按预期复现失败：HTTP403/member_disabled；明确为错误表路由，不是账号真的停用。无业务写入，修为个人pmu_settings后只复验受影响链路 |

| `workflow-route-green.log`、`parity-personal-workflow-build.log` | 同一已登录设备检查使用个人pmu_settings | 构建成功，检查1/1通过；不再因共享表权限退出登录 |

| `parity-cloud-supplement-device-3.log`、`desktop-supplement-third-report.json` | 真实新建和指定客户导入通过；补齐遭历史一致性拒绝 | 整条仍失败；清理及既有报价未变断言通过。先用设备解析回归验证null指纹假设，再定点修nullable读取并复验补齐/图片/桌面链路 |

| `fingerprint-null-red.log` | 设备真实JSONObject.NULL经parseQuote解析，应保持无导入指纹 | 按预期复现失败：空字符串被读为文字null，证据明确；只修nullable解析，并覆盖缺失/null/有效指纹及实际补齐后的只读核对 |

| `fingerprint-null-green.log`、`parity-cloud-supplement-device-4.log`、`desktop-supplement-fourth-report.json` | 缺失/null/有效指纹设备边界通过；实际云补齐及完整历史字段/指纹断言通过；备份主文件选择出现多个匹配 | 整条仍失败；实查同前缀包含主库和-journal，仅修测试为`.sqlite3`主文件。当前测试客户已回收、原报价未变、桌面隐藏通过；后续备份/图片/桌面字段尚未验证 |

| `parity-cloud-supplement-device-5.log`、`desktop-supplement-fifth-report.json` | 补齐和备份回读通过；新增核对用例的独立PmuApi漏掉restore/传输发现 | 整条仍失败；只修测试初始化顺序以匹配App，不改业务路由或降低断言。清理及原报价未变通过；后续核对/图片/桌面字段待验证 |

| 本轮手机布局首次 Gradle 构建（2026-10-23） | Temurin 17.0.20.1、Gradle 9.1、SDK 36；`:app:assembleDebug :app:testDebugUnitTest :app:assembleDebugAndroidTest` | FAILED：`BusinessScreen.kt` 缺少 `rotate` 导入；两个 `MenuButton` 备份调用未传 `action`；编译未通过，测试任务未执行，未安装 APK/未触碰设备数据 | 恢复方案：补 import 与两个命名回调后重跑此定向构建；结果尚未完成验证 |

| 本轮手机布局第二次 Gradle 构建（2026-10-23） | 同上；主源码编译通过，构建继续到 Android 测试源码编译 | FAILED：`MobileLayoutTest.kt` 对 `assertExists`/`assertDoesNotExist` 的显式导入不可解析；测试调用尚未执行，APK未安装 | [完整构建日志](../.build/mobile-layout-20261023/layout-build-final.log)；恢复方案：沿用现有测试的包通配导入，再跑同一组定向任务 |

| 手机分享/地址交互新增仪器测试首轮构建（2026-10-24） | Temurin17、Gradle9.1、SDK36；`assembleDebug`、`testDebugUnitTest`、`assembleDebugAndroidTest`，模拟器 `emulator-5554` Android15/API35；新增PDF/DOCX URI与按钮、真实账户页地址折叠测试 | FAILED：`compileDebugAndroidTestKotlin` 中 `AccountScreenUiTest.kt`、`ArtifactIntentTest.kt` 显式导入 `assertExists`/`assertDoesNotExist` 不可解析；生产Kotlin已编译，但新仪器测试未运行，最新改动未安装。无业务数据写入 | [构建日志](../.build/mobile-share-20261024/build-final.log)；根因是Compose测试断言按项目惯例使用包通配导入。恢复仅改两文件导入为 `androidx.compose.ui.test.*` 后重编译/复测 |

| Android测试编译恢复入口确认 | 修正两份测试导入后，按原临时 `Z:` 映射运行Gradle wrapper | BLOCKED：新PowerShell会话不存在 `Z:` 映射，Gradle未启动、代码未编译、设备未触碰；无测试结果变化 | 恢复改由 `E:\工作\source\android\gradlew.bat` 执行同一构建任务，见本轮恢复日志 |

| Android构建中文工程路径恢复确认 | 修正导入后，从真实目录 `E:\工作\source\android` 调用同一Gradle wrapper | FAILED：Android Gradle插件在初始化阶段拒绝Windows非ASCII工程路径；未进入Kotlin编译、测试和设备操作 | [路径失败日志](../.build/mobile-share-20261024/build-recovery.log)；恢复为仅在当前PowerShell会话临时映射ASCII `Z:` 到Android工程，构建后移除映射，不改Gradle项目配置 |

| Android定向构建与模型测试恢复 | `emulator-5554` API35对应1.2/code3源码；PowerShell会话临时 `subst Z: E:\工作\source\android` 后运行 `assembleDebug testDebugUnitTest assembleDebugAndroidTest`，最后移除映射 | 通过：Gradle BUILD SUCCESSFUL；主包与测试包构建成功，模型23项通过；临时映射已移除。尚非设备功能验收 | [ASCII路径构建日志](../.build/mobile-share-20261024/build-ascii-path.log) |

| 新包设备安装首轮 | 新主包及仪器包 `adb install -r` 后运行5项定向测试 | BLOCKED：ADB服务刚重启，安装首命令返回 `device offline`，测试未启动、未清除应用数据 | 随后的只读 `adb devices -l` 显示 `emulator-5554 device`；根据状态变化重试一次，最终结果见下行 |

| PDF/Word分享、账户地址及布局设备回归 | `emulator-5554` Android 15/API35，实际 `com.song123jian.pricequery.mobile` MainActivity；覆盖安装保留会话，运行 `ArtifactIntentTest`、`MobileLayoutTest`、`SourceDocumentUiTest`、`AccountScreenUiTest` 共5项 | 通过：5 tests；PDF/DOCX打开与分享Intent的只读FileProvider URI可读；真实账户页项目地址折叠/展开/复制、报价卡折叠、多产品明细折叠及原件单据UI回归通过。无业务数据写入 | [仪器测试日志](../.build/mobile-share-20261024/instrumentation-final.log)、[构建日志](../.build/mobile-share-20261024/build-ascii-path.log)、[最终账户页截图](../.build/mobile-share-20261024/account-final.png) |



### 侧边菜单恢复检查点（2026-10-24，模拟器阶段已完成）



已完成桌面/手机差异审计、12个独立抽屉入口及审计缺项补齐；路由和本轮新增操作的7个不同模拟器用例通过，根目录APK已覆盖且与实际安装包一致，见本文件顶部当前结果。当前账号云报价为空，排序与历史界面用例只使用内存合成输入，不代表真实云历史验收，不宣称全链路100%一致。实体手机与真实MES查询仍未验证；本次无上线、云业务写入或外部发布。



差异审计确认的定向验收范围：菜单各叶子项直达独立页面；报价筛选继续有效，新增桌面字段排序、价格数值排序、升降序及当前报价记录复制；历史趋势、详情和复制；库存批号复制/带入备货、记住 MES 账号开关及加密存储/清除。趋势图覆盖单条、同日多条和待生效数据并显示真实价格/日期；其余导入/预览/确认、客户历史与回收恢复、单据字段与输出、同步和完整备份沿用未变结果，只验证新导航入口。不得触发真实云写入或MES登录；凭据仅使用合成测试值。桌面个人云账号模式禁用的本地存储配置不纳入手机个人云模式。



### 当前验证边界与后续范围



- 图片候选切换与消歧重新确认的实现和设备回归已通过；未受影响的原OCR、文件、模型结果继续复用。

- 个人流程表及null指纹已定点修复，补充真实链路最终第6轮通过；前5轮失败/incomplete仅作恢复证据，不累加为通过。第二轮遗留标记客户已在第三轮按限定牌号/价格检查后回收，最终既有报价未变。

- 图片云保存用例输入为合成候选，未把OCR桩当成真实OCR；真实本机中文OCR独立设备用例已通过。补齐结果核对使用受控原请求清单的真实只读接口，不模拟断网或声称覆盖所有未知保存情形。未执行云结构部署或既有业务清理。

- 旧联合测试产生的本机临时恢复/草稿文件可能已随Gradle仪器清理消失；未查实前不称已精确清理，不因此访问其他用户文件。

- 尚未完成验证：真实MES登录/库存查询、实体手机网络/安装。1.1根目录包、实际安装哈希和最终截图已完成；单据草稿/供方资料仅本机，不冒称云同步。

- 每轮定向验证前回读本节；同代码/配置/环境且结果有效的不重复测试。优先手动 `adb install -r`、`am instrument -w -e class ...` 保留已有会话，不卸载含未决请求的应用。

- 最终增量审查和源码文字检查已完成，证据见上表；本轮临时桌面连接与ADB转发已关闭，保留App/加密会话。两份交接按落盘回读、新增/修改链接、UTF-8无BOM验收，不以文档存在代替真实功能验证。



### 本轮桌面离线本地保存与联网自动同步（2026-10-25）



- 测试对象：候选/最终冻结程序 `E:\工作\工作-1.8.0.exe`，版本 `1.8.0`，SHA256=`651BDD4DEC65F29388FF2F94B318803A4403E5D1AD9670C3CA7F7E1670753544`；Windows 原生 Qt Widgets，隔离 SQLite 数据目录，未使用正式 `data`。

- 源码定向验证：服务、单据界面、同步恢复及直接依赖定向回归 `61 passed`；Ruff、`py_compile`、`git diff --check` 均通过。覆盖离线保存进入 pending 队列、网络恢复上传并清队列、revision 冲突保留本地副本和待处理状态、离线删除后同步删除、云端拉取刷新另一份本地记录，以及制作页同步状态提示。

- 实际程序验收：`.build/offline-sync-20261025/final-ui-qa-report/report.json`，状态 `passed`，`actual_qt_ui=true`，隔离后端为 SQLite，8 项检查全部为 `true`。验收包含报价录入、草稿恢复/放弃/保存关闭、中文确认按钮、文件系统写失败保留表单和隔离数据库未被污染；最终运行使用受控文件返回路径，未执行真实云写入。

- 关键操作与预期：断网或云端不可用时制作记录仍能在本地读取，状态显示待同步且不丢编辑；恢复网络后同步任务可上传并清除对应待同步标记；远端 revision 不匹配时不覆盖本地内容，显示冲突供人工处理；拉取云端变化后刷新其他本地设备的记录。上述行为的服务测试使用临时目录和受控云端替身，不能替代真实 Supabase 账号链路。

- 首次失败及恢复：`.build/offline-sync-20261025/document-qa-report/report.json` 曾失败，异常为 `单据字段内容过长，原件字号及位置放不下`；定位为旧测试样例字段组合过长。改用 `layout-fix/ui` 样例后重新验收，最终报告通过；不把首次失败计为离线同步实现失败，也不把最终隔离结果扩大为云端通过。

- 交付核对：候选包与根目录 EXE 哈希一致；旧 `1.7.9` 程序保存在 `.build/offline-sync-20261025/rollback/工作-1.7.9.exe`，SHA256=`C989F1BEBE77C947E90E3C64D004523272379E5E88051433AF9DAE3FD162B748`；快捷方式已指向 `E:\工作\工作-1.8.0.exe`。本轮目标进程已退出，正式业务目录和 Supabase 未写入。

- 验证边界：真实 Supabase 在线恢复上传、真实 RPC/RLS 权限、跨设备读取和实体手机尚未重新验收，状态为“尚未完成验证”，不是通过项。需要后续真实账号验收时，只创建明确标记的临时单据并在核对后清理，不修改既有业务记录。



### 本轮项目进度台账页面布局调整（2026-10-25，源码定向验证通过；EXE未重建）



- 测试对象：源码 `source/ui/main_window_project_progress.py`、`source/ui/main_window.py`、`source/tests/qt/test_desktop_ui.py`；CPython 3.12 环境，PySide6/pytest-qt，`QT_QPA_PLATFORM=offscreen`，隔离 SQLite，无 Supabase 写入。

- 测试命令：`PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 QT_QPA_PLATFORM=offscreen .build/desktop-ui-refactor-20261025-venv/Scripts/python.exe -m pytest -p pytestqt.plugin source/tests/qt/test_desktop_ui.py -k "project_progress and not custom_categories and not starts_with_unselected" -q --tb=short`。

- 实际结果：`5 passed, 34 deselected`。通过范围包括：方案面板/附件一文字不再进入页面；台账垂直扩展且表格无高度上限；所有表格列 Stretch 且水平滚动最大值为0；`960×640` 紧凑窗口无横向溢出；长“下一步动作”字段换行并提高行高；原有项目新增、编辑、revision 保存和滚动保持用例继续通过。

- 实际几何核对：一次实际 Qt 渲染截图 `.build/project-progress-layout-qa/项目进度-台账.png`；窗口 `1440×840`，台账 `1161×696`，表格 `1139×634`，9列宽度 `[127,127,127,126,126,126,126,126,126]`，水平滚动最大值 `0`。离屏运行环境缺少中文字体，截图仅作为布局几何证据，不作为字体/文案可读性证据。

- 静态验证：相关生产与测试文件 Ruff 通过，`py_compile` 通过，`git diff --check` 无差异空白错误。

- 未计入通过的既有失败：项目自定义分类/迁移相关测试仍与当前工作区实现不一致，包括服务层4项和 Qt 对话框2项；本轮未修改这些业务规则、数据库列或 RPC，故不扩大修复范围。全量项目进度服务测试未标记为通过。

- 交付边界：本轮只改源码和定向测试，未重建或覆盖 EXE，未写入正式 `data`、Supabase 或业务记录；实体设备不适用本桌面页面验收。



## Android客户/项目XLSX对齐首轮构建失败（2026-10-25，恢复中）

对象：`source/android`，版本配置1.21/code4；Windows11、Temurin17、Gradle9.1、SDK36。首轮尝试 `:app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest`，在`compileDebugKotlin`失败，没有运行测试，没有新APK交付、安装或业务数据写入。

失败证据：Kotlin指出`BusinessWorkbook.kt`两处`label须为正整数`插值解析错误、Android SDK未定义`XMLConstants.ACCESS_EXTERNAL_DTD/SCHEMA/STYLESHEET`、`removeAttributeNode`收到Node而非Attr。增量编译另报告缓存基线为`R:\app\...\MainScreen.kt`而当前构建根为`Z:\`。工程路径的临时Z盘映射已移除。

根因和恢复：首四项属于本轮源码兼容/类型错误；路径错误来自旧增量缓存中的R盘根记录。仅修相应字符串、XML安全设置和DOM属性移除写法，保留已有缓存；下一轮增加`-Pkotlin.incremental=false`后重跑相同三项构建任务。结果仍待验证。



### Android客户/项目XLSX构建恢复与首轮定向测试（2026-10-25）

第二轮在`-Pkotlin.incremental=false`下，`:app:compileDebugKotlin`通过；新增`BusinessWorkbookTest`及既有定向单测共33项执行，32 passed、1 failed。桌面项目模板空模板输出保留`项目进度表`、`评分模型`、`最优方案`三工作表且解析为空；项目导出/解析往返保留ID、revision、客户字段和固定评分标签；客户旧7列表头兼容及重复UUID拒绝均通过。

唯一失败：`BusinessWorkbookTest.kt:116`期望错误文本包含“项目编号与数据版本”，实际解析器按已有契约返回“数据版本有值时必须填写项目编号”。证据为`source/android/app/build/test-results/testDebugUnitTest/TEST-com.song123jian.pricequery.mobile.data.BusinessWorkbookTest.xml`。这是新增测试断言与现有实现文案不一致，没有证据表明解析逻辑错误。恢复仅调整断言文本，先重跑`BusinessWorkbookTest`；通过后重跑定向单测及三个APK构建任务。首轮全构建因单测失败结束，APK输出尚未判定为本轮产物，未安装或操作云端。

### Android客户/项目XLSX断言修正后的定向复测（2026-10-25）

对象：`source/android` Android JVM 单测；Windows 11、Temurin 17、Gradle 9.1、SDK 36。定向运行 `BusinessWorkbookTest`，实际结果 `4 passed, 0 failed`；XML 为 `source/android/app/build/test-results/testDebugUnitTest/TEST-com.song123jian.pricequery.mobile.data.BusinessWorkbookTest.xml`，覆盖桌面三工作表模板空导入、项目导出往返、重复标题/版本校验、旧七列表头兼容及重复客户 ID 拒绝。

本次修复仅把失败断言改为匹配解析器已有错误契约。全量 `testDebugUnitTest`、`:app:assembleDebug`、`:app:assembleDebugAndroidTest`、APK 版本/签名核验和设备验收仍待执行；旧 APK 尚未判定为本轮产物或覆盖安装，未触碰云端和业务数据。

全量构建首次调用：命令为 `:app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest --no-daemon -Pkotlin.incremental=false --console=plain`；Gradle 在任务图阶段报 `Task '.incremental=false' not found`，退出码1，三个任务均未执行。失败由Windows调用层拆分带点号的`-P`属性参数导致；下一次把属性作为一个带引号参数传入，仍使用`-Pkotlin.incremental=false`并重跑同一任务集。没有测试失败、新APK、安装或云端写入。

### Android 1.21全量单测和APK构建（2026-10-25）

对象：`source/android`，Windows 11、Temurin 17.0.20.1、Gradle 9.1、Android SDK 36 / Build Tools 36.0.0；从`Z:\`运行。命令：`.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest --no-daemon '-Pkotlin.incremental=false' --console=plain`。结果 `BUILD SUCCESSFUL`，10秒，71 actionable tasks（6 executed、65 up-to-date）；JVM 单测5套报告共`33 tests, 0 failures, 0 errors, 0 skipped`。SDK XML v4兼容提示未阻止构建。

主APK：`source/android/app/build/outputs/apk/debug/app-debug.apk`，`com.song123jian.pricequery.mobile`，versionName `1.21`、versionCode `4`，94,226,550字节，SHA256=`68FE8D5D7D04FA68673965E030291238B1F240E7147189F9385AFB2DA0D35428`。`apksigner verify`通过，证书SHA256=`5fe328500439ad14728906485d9327da7b6fc0682490336135729afa86c7b213`。仪器APK SHA256=`74CDCA9405F0EB1ADD4A6483A7C40D4FA1059551C1067CD4D24E5FE1F9C826A4`，签名指纹相同。桌面模板与Android assets及APK内`assets/business_templates/project-progress-template.xlsx`哈希相同，为`5DB166B2D56B2D5301F99BE95A47BDB426E33B521D07C83CD0A7A8F8DA47D204`。

设备：`emulator-5554`，Android 15/API 35、x86_64；本轮设备验收前安装包报告1.21/code4。待验收：安装本次候选主包与仪器包后，运行客户目录首次报价取消、档案新增项目/待办路由与预填；不得保存草稿或执行云端业务写入。代码审查发现两个客户快捷操作没有直接UI回归，新增一条只用内存假档案并在提交前取消的仪器测试。全抽屉测试会进入库存页，本轮不运行该测试以避免触发未授权的MES操作。当前尚未取得本轮仪器执行结果，未覆盖真实实体手机和MES链路。

### Android客户档案快捷操作UI回归（待设备验证）

测试源码：`CustomerCreationUiTest.customerProfileActionsOpenPrefilledDraftsAndCancelWithoutSaving`。仅在`BusinessController`内存状态注入唯一测试档案；实际通过抽屉和档案卡片进入项目/待办页面，断言页面路由及客户名称/行业预填，再点“取消”并核对draft清空、`pendingSave`与`pendingBusiness`仍为空。没有调用保存方法，不创建真实客户、项目、待办或报价。

运行前置：Windows 11、Temurin 17、SDK 36；`emulator-5554` Android 15/API 35，已安装版本报告1.21/code4；本次主APK候选及签名已核验。下一轮先构建仪器APK，再使用`adb install -r`更新主包和测试包，运行`CustomerCreationUiTest`全类（首次报价取消、客户档案两个快捷操作、锁定状态）。单测/构建通过不替代设备执行；当前状态“尚未完成验证”。

仪器APK增量重建：命令 `.\gradlew.bat :app:assembleDebugAndroidTest --no-daemon '-Pkotlin.incremental=false' --console=plain`，`BUILD SUCCESSFUL`，22秒，49 actionable tasks（5 executed、44 up-to-date）。更新后的仪器APK SHA256=`0DA80B46E924906687C7B536E4315FEA9BB1C87061677C224E44AE8AE85D7355`；`apksigner verify`通过，证书SHA256=`5fe328500439ad14728906485d9327da7b6fc0682490336135729afa86c7b213`。主APK仍为已核验的1.21/code4候选，SHA256=`68FE8D5D7D04FA68673965E030291238B1F240E7147189F9385AFB2DA0D35428`。本轮仪器测试尚未运行。

候选安装：`adb install -r` 对主APK和仪器APK均返回`Success`；主包实际报告`versionName=1.21`、`versionCode=4`，仪器包`com.song123jian.pricequery.mobile.test`已安装。主包安装前后用户数据inode相同：CE `3802180`、DE `8257725`，确认覆盖安装保留应用数据。安装后尚未运行仪器测试。

### Android 1.21客户档案快捷操作实际UI验收（2026-10-25）

对象：`com.song123jian.pricequery.mobile/.MainActivity`，versionName `1.21` / versionCode `4`，主APK SHA256=`68FE8D5D7D04FA68673965E030291238B1F240E7147189F9385AFB2DA0D35428`；Windows 11、Temurin 17.0.20.1、SDK 36；`emulator-5554` Android 15/API 35、x86_64。仪器APK SHA256=`0DA80B46E924906687C7B536E4315FEA9BB1C87061677C224E44AE8AE85D7355`，与主包同一debug证书。

命令：`adb shell am instrument -w -r -e class com.song123jian.pricequery.mobile.ui.main.CustomerCreationUiTest com.song123jian.pricequery.mobile.test/androidx.test.runner.AndroidJUnitRunner`。实测 `OK (3 tests)`，18.485秒；通过项为`directoryRequiresSyncAndKeepsLockedStorageReadOnly`、`customerProfileActionsOpenPrefilledDraftsAndCancelWithoutSaving`、`directoryCreatesFirstQuoteAndCancelReturnsToDirectoryWithoutWriting`。

新增快捷操作用例先完成只读客户同步，再仅把测试档案注入内存；实际点击档案卡片“新增项目”和“新增待办”，确认进入对应页面且分别预填客户名称/行业，点击取消后draft为空，`pendingSave`和`pendingBusiness`仍为空。首次报价用例只验证空字段错误和取消路径，不保存报价。没有写云端业务数据；客户/项目列表加载仅触发只读读取。模拟器覆盖安装保留原数据inode（CE `3802180`、DE `8257725`）；真实实体手机、MES登录/查询未验证。

最终交付：`E:\工作\工作手机版-1.21-debug.apk`，94,226,550字节；文件哈希与已验收候选一致，SHA256=`68FE8D5D7D04FA68673965E030291238B1F240E7147189F9385AFB2DA0D35428`，APK元数据`1.21`/code `4`，debug签名验证通过。旧根包`工作手机版-1.2-debug.apk`继续保留，SHA256=`5A7F2C69DF12B8397792D5174397513995C66106E8F79B069EA23F9A4576C7D4`未变。此为本机debug签名侧载包，不是商店发布签名；未覆盖实体手机、MES或真实云业务写入。



## Android 1.22 单据离线同步（已完成，2026-10-25）

对象：`com.song123jian.pricequery.mobile/.MainActivity`，Windows 11、Temurin 17.0.20.1、Gradle 9.1、SDK 36；`emulator-5554` Android 15/API 35、x86_64。根目录交付 [工作手机版-1.22-debug.apk](../工作手机版-1.22-debug.apk)，`versionName=1.22` / `versionCode=5`，93,867,304 字节，SHA256=`838E3225BAAADA459CB2BB85AB21BE76D054A5679602C8808367A36AC6046325`。构建候选、根目录文件和从设备回拉的安装 APK 哈希一致。仪器 APK SHA256=`B750809CE2600C427E71D9ED5C706ECCC97B2D88716405D3568828295F42709C`。主/仪器 APK debug 证书 SHA256=`5fe328500439ad14728906485d9327da7b6fc0682490336135729afa86c7b213`。

构建：Windows 中文路径触发一次 Android Gradle Plugin 路径检查失败，任务未执行；通过已存在的 ASCII `Z:\` 映射运行。最终源码后执行 `.\gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest --no-daemon '-Pkotlin.incremental=false' --rerun-tasks --console=plain`，`BUILD SUCCESSFUL`，66 个任务执行；随后执行 `:app:testDebugUnitTest`，报告 `33 tests, 0 failures, 0 errors, 0 skipped`。仍有 SDK XML v4 兼容提示及其他原有 Kotlin/deprecation 警告。

实际设备安装：主包和仪器包均 `adb install -r` 成功；`dumpsys package` 报告 `versionName=1.22` / `versionCode=5`。安装前后 `run-as ... stat -c %i files` 均为 `3802201`，保留原应用数据。模拟器回拉 `base.apk` 与最终构建 APK SHA256 均为 `838E3225BAAADA459CB2BB85AB21BE76D054A5679602C8808367A36AC6046325`；根目录 APK `apksigner verify` 通过，仪器 APK也以同一证书验证通过。

仪器命令：`adb shell am instrument -w -r -e class 'com.song123jian.pricequery.mobile.data.BusinessFeaturesTest#offlineDocumentSaveReconcilesRemoteIdRevisionAndStatus,com.song123jian.pricequery.mobile.data.BusinessFeaturesTest#recoveredDocumentConflictIsMarkedAndNotRetriedAutomatically,com.song123jian.pricequery.mobile.data.BusinessFeaturesTest#offlineDeleteConflictRestoresLocalCopyAndStopsRetrying' com.song123jian.pricequery.mobile.test/androidx.test.runner.AndroidJUnitRunner`。最终 `OK (3 tests)`：离线保存恢复后只有一条记录，回写云端 ID、revision 和 `synced` 状态并清空队列；保存版本冲突保留本机内容和远端 ID、显示 `conflict` 且后续刷新不重试；删除冲突恢复本地副本并固定为 `conflict`，后续刷新不重试。

失败恢复：首轮仪器结果 `2 passed / 1 failed`，保存冲突列表断言报 `List has more than one element`。根因为控制器 `documentId` 使用本机 ID，但远端刷新后可见行使用云缓存 ID；`openDocument` 未从本机 JSON 回读 `_remote_id` / `_revision`，离线更新因此排成新记录。修复后从本机 JSON 恢复元数据，并断言冲突队列保留原 `cloud-1`；三项最终回归通过。RPC 使用内存假服务及每用例随机账号目录，没有真实 Supabase 写入。

清理与边界：临时回拉副本 `source/android/app/build/outputs/apk/debug/device-base.apk` 和应用内 `files/parity-test-backup.sqlite3` 已按精确路径删除；用例随机账号目录在 `finally` 中清除。真实 Supabase/RPC权限、跨设备同步、实体手机、MES、第三方分享未验证。本轮只覆盖单据离线同步，不代表移动端全部功能与桌面端已完成100%等价验收。



## Android 待办桌面能力补齐（本轮验证完成，2026-10-25）

对象与环境：`com.song123jian.pricequery.mobile/.MainActivity`，Windows 11、Temurin 17、Gradle 9.1、Android SDK 36；`emulator-5554` Android 15/API 35、x86_64。设备上的目标程序为 `1.23/code6`。Android 代码路径为 `source/android/app/src/main/java/com/song123jian/pricequery/mobile/`。

阶段目标：按桌面 `TodoDialog` 与 `main_window_todo.py` 的字段、过滤和统计契约补齐 Android 待办，包括类别/负责人、客户/项目 ID 与名称、搜索字段、“全部未完成”、日期状态和全局计数，并让客户档案快捷创建保留客户 ID。此阶段不覆盖实体手机、MES、真实待办写入或整体手机端 100% 对齐。

红测与修复：首轮 `BusinessParityModelsTest` 为 `6` 项、`4 passed / 2 failed`，两项预期失败分别暴露类别搜索缺失、负责人未 trim；其余状态/类别用例通过。完成模型/UI/controller 后，JVM 最终 XML 共 `36` 项、`36 passed / 0 failed / 0 errors / 0 skipped`：`BusinessModelsTest` 13、`BusinessParityModelsTest` 7、`BusinessWorkbookTest` 4、`ModelsTest` 11、`MobileParityRoutesTest` 1。报告目录 `source/android/app/build/test-results/testDebugUnitTest/`。

模拟器实际 UI 验收：在 `Z:\` 工程映射运行 `:app:connectedDebugAndroidTest`，仪器筛选为 `com.song123jian.pricequery.mobile.ui.main.TodoParityUiTest#todoPageSearchesDesktopFieldsShowsGlobalCountsAndEditsEntityLinksInMemory,com.song123jian.pricequery.mobile.ui.main.CustomerCreationUiTest#customerProfileActionsOpenPrefilledDraftsAndCancelWithoutSaving`。在 `emulator-5554` 使用当前构建 APK 对两项逐项完成真实 Compose 界面交互：待办用例搜索类别/负责人/事项、检查计数并在内存中编辑客户/项目关联；客户档案用例打开待办并核对名称和 ID，随后取消。两项共 `2 passed / 0 failed / 0 skipped`，Gradle 退出码 `0`。最新报告 `source/android/app/build/outputs/androidTest-results/connected/debug/TEST-emulator-5554 - 15-_app-.xml`；`test-result-exit-code.txt` 为 `0`。用例未保存待办或报价；打开页面可能进行客户/项目只读加载。10月23日遗留的 `BusinessParityUiTest` 图片报价失败报告是旧报告，不属于本轮待办用例；已由本轮最新报告替代，不能用作本轮失败或通过证据。

构建与程序：`:app:assembleDebug :app:assembleDebugAndroidTest --rerun-tasks` 成功，66项任务执行。根 APK `工作手机版-1.23-debug.apk` 和候选 `source/android/app/build/outputs/apk/debug/app-debug.apk` 均为 `93,883,692` 字节、SHA256=`14A52E5BFA4441FF364A930C642E9AB150F6D0D8A6558F7192E1B454669A92AD`，`versionName=1.23` / `versionCode=6`，debug 证书 SHA256=`5fe328500439ad14728906485d9327da7b6fc0682490336135729afa86c7b213`。仪器构建和安装包均使用本轮同一 debug 证书。聚焦任务运行后主包已再次用 `adb install -r 工作手机版-1.23-debug.apk` 安装，设备 `dumpsys package` 确认版本 `1.23/code6`。

测试清理副作用：`source/android/app/build/outputs/androidTest-results/connected/debug/emulator-5554 - 15/utp.0.log` 记录 UTP `uninstall_after_test=true` 并在两项通过后卸载主包与测试包；随后 `run-as` 确认主包一度不存在。主清单 `source/android/app/src/main/AndroidManifest.xml` 的 `android:allowBackup="false"`，重装不能依赖 Android 自动备份恢复原私有数据；旧 `files` inode `3802201` 不再作为当前有效状态，原本机登录/待办数据视为未恢复。云端未执行业务写入。今后不要在有需保留数据的安装上运行该 connected 任务；改用专用空白模拟器，或人工控制 `adb install -r` 与 `am instrument` 并逐项确认没有 uninstall 清理。

测试边界：本轮未做实体手机截图/安装、真实 MES 请求、待办云同步或真实待办保存；Android 待办按账号本机目录保存。JVM 与模拟器用例结果不代表整体 Android 与桌面功能已 100% 一致。


## Android 1.24 库存页数量汇总（2026-10-25）

- 测试对象：`com.song123jian.pricequery.mobile/.MainActivity`，`versionName=1.24` / `versionCode=7`；交付 APK `../工作手机版-1.24-debug.apk` 与候选 `source/android/app/build/outputs/apk/debug/app-debug.apk` SHA256 均为 `B14693440A62CBB934101E8D8F61C545F17066A747DA20E6A6C4C85CD0DB175B`，93,883,688 字节。仪器 APK SHA256=`7B6655547FF8F3D5BECD832A3EA34D70B054C65A79EFD7604078BD2B4FF5ACD9`；两包 debug 证书 SHA256=`5fe328500439ad14728906485d9327da7b6fc0682490336135729afa86c7b213`。
- 环境：Windows 11、Temurin 17、Gradle 9.1、Android SDK 36；`emulator-5554`，Android 15/API 35、x86_64。入口为已覆盖安装的 `com.song123jian.pricequery.mobile/.MainActivity` 包；仪器测试用 `AndroidJUnitRunner`。
- JVM 检查：`BusinessModelsTest` 报告 `15 tests / 0 failures / 0 errors`，包含 `inventoryPageTotalsGroupByUnitAndWarnWhenAnyQuantityIsMissing` 与 `reservePageTotalsKnownQuantitiesAndReportsMissingValues`。本轮 Gradle `:app:testDebugUnitTest` 为 `UP-TO-DATE`，报告对应当前未再变化的测试源码。构建命令 `:app:testDebugUnitTest --tests com.song123jian.pricequery.mobile.data.BusinessModelsTest :app:assembleDebug :app:assembleDebugAndroidTest --no-daemon '-Pkotlin.incremental=false' --console=plain` 最终 `BUILD SUCCESSFUL`，71 actionable tasks（11 executed、60 up-to-date）。`apksigner verify --print-certs` 对主包和仪器包均通过。
- UI 验收：主包与仪器包均通过 `adb install -r` 安装，设备版本报告 `1.24/code7`。直接执行 `adb shell am instrument -w -r -e class com.song123jian.pricequery.mobile.ui.main.MobileLayoutTest com.song123jian.pricequery.mobile.test/androidx.test.runner.AndroidJUnitRunner`，结果 `OK (6 tests)`；两项新增用例验证普通库存按单位汇总及空数量提示、备货汇总无单位及缺值提示。测试前后 app data directory inode 均为 `3801466`，主/仪器包仍已安装。该流程未调用会自动卸载 app 的 `:app:connectedDebugAndroidTest`。
- 预期/实际：库存只合并相同单位，已知数量以 `BigDecimal` 精确求和；缺字段不伪装为已知数据并在 UI 提示；备货单位沿用桌面“MES 未提供单位”。实际 Compose 断言全部通过，未登录 MES、未请求真实 MES 服务、未保存或改动业务数据。
- 未覆盖：真实 MES 接口与账号、实体手机渲染、完整 Android/桌面业务 parity。当前仅完成库存合计子项，不代表全局 100% 一致。无临时测试文件需要清理。
