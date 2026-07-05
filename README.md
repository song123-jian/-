# 注塑厂 ERP/MES 管理系统

使用 Skill：requirements-doc、code-generation

本仓库是面向注塑厂的 ERP/MES 一体化系统，覆盖管理端、移动端、Supabase PostgreSQL 数据库脚本、业务规则测试和交付验收文档。当前交付目标以 [ERP系统交付验收标准.md](ERP系统交付验收标准.md) 为准。

## 系统组成

| 模块 | 路径 | 说明 |
| --- | --- | --- |
| 管理端 | `frontend-admin` | Vue 3 + Element Plus，覆盖基础资料、销售、生产、质量、库存、工资、财务、报表、系统管理 |
| 移动端 | `frontend-mobile` | Vue 3 + Vant，覆盖登录、首页、扫码报工、产量、工资、质检、库存、盘点、调拨、消息 |
| 数据库 | `database/init.sql`、`database/supabase-cloud.sql` | Supabase PostgreSQL 初始化、云端增强、登录 RPC、Storage bucket 策略 |
| 测试 | `tests` | 业务规则、数据转换、核心计算和页面支撑逻辑测试 |
| 交付文档 | `docs` | 部署、数据库、备份、权限、用户手册、验收报告、回滚方案和证据索引 |

## 本地运行

```bash
npm install
npm --prefix frontend-admin install
npm --prefix frontend-mobile install
npm run dev:admin
npm run dev:mobile
```

管理端默认地址：`http://127.0.0.1:3000`

移动端默认地址：`http://127.0.0.1:3001`

## 环境变量

根目录、管理端和移动端均提供 `.env.example`。本地运行时分别复制为对应目录的 `.env.local`，并填写 Supabase 项目 URL 和 publishable anon key。生产环境禁止在前端配置 service role key、数据库密码或其他管理密钥。

## 必跑验证

```bash
npm run verify:delivery
```

`verify:delivery` 会依次执行编码检查、自动化测试和管理端/移动端构建。分步排查时可单独运行：

```bash
npm run check-encoding
npm test
npm run build
```

通过标准见 [docs/验收测试报告.md](docs/验收测试报告.md) 和 [docs/核心路径回归记录.md](docs/核心路径回归记录.md)。

## 交付入口

- 验收标准：[ERP系统交付验收标准.md](ERP系统交付验收标准.md)
- 项目汇总：[docs/项目汇总.md](docs/项目汇总.md)
- 智能体高效工作模式：[docs/智能体高效工作模式.md](docs/智能体高效工作模式.md)
- 验收测试报告：[docs/验收测试报告.md](docs/验收测试报告.md)
- 已知问题清单：[docs/已知问题清单.md](docs/已知问题清单.md)
- 部署说明：[docs/部署说明.md](docs/部署说明.md)
- 数据库初始化与迁移说明：[docs/数据库初始化与迁移说明.md](docs/数据库初始化与迁移说明.md)
- 生产环境变量清单：[docs/生产环境变量清单.md](docs/生产环境变量清单.md)
- 备份与恢复说明：[docs/备份与恢复说明.md](docs/备份与恢复说明.md)
- 上线回滚方案：[docs/上线回滚方案.md](docs/上线回滚方案.md)
