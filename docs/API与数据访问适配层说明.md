# API 与数据访问适配层说明

使用 Skill：api-design、codebase-orientation

## 1. 架构

系统以前端应用直连 Supabase 为主，管理端和移动端各自包含数据访问适配层：

| 端 | 入口 |
| --- | --- |
| 管理端 Supabase client | `frontend-admin/src/api/supabaseClient.ts` |
| 管理端请求适配 | `frontend-admin/src/api/supabaseRequest.ts` |
| 移动端 Supabase client | `frontend-mobile/src/api/supabaseClient.ts` |
| 移动端请求适配 | `frontend-mobile/src/api/supabaseRequest.ts` |

## 2. 环境配置

两个前端只读取 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`VITE_SUPABASE_AUTH_EMAIL_DOMAIN`、`VITE_SUPABASE_STORAGE_BUCKET`。未配置时会抛出明确错误提示。

## 3. 返回结构

适配层保持统一业务返回结构，页面通过 API 模块调用业务函数，避免页面直接拼接复杂 Supabase 查询。

## 4. 关键业务能力

| 业务 | 适配层职责 |
| --- | --- |
| 登录 | Supabase Auth 优先，兼容 `erp_login` RPC |
| 基础资料 | 编码唯一、状态标准化、表单字段转换 |
| 销售订单 | 明细金额计算、状态守卫、回款联动 |
| 库存 | 入库、出库、调拨、盘点和台账联动 |
| 生产 | 工单、报工、领料、成品入库数量联动 |
| 工资 | 计件单价匹配、日工资和月工资汇总 |
| 财务 | 费用、应收、对账金额汇总 |
| 系统 | 配置、日志、消息、集成和云库运维 |

## 5. 错误处理

1. 输入校验错误应返回中文业务提示。
2. Supabase 错误不得暴露敏感连接信息。
3. 跨表写入失败时应尽量恢复已写入数据或记录人工处理事项。
4. 页面层必须展示空态、加载态和错误态。

## 6. 扩展原则

新增业务接口时应：

- 在 `src/api` 建立清晰模块入口。
- 在 `src/utils` 提取可测试的纯函数。
- 为计算、校验、状态流转增加测试。
- 更新验收说明和核心路径回归记录。
