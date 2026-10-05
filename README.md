# 青阅循环 · 校园二手图书智能循环与生态服务平台

> 让闲置的书，再一次被需要

校园二手教材与图书的智能循环平台。通过「数字平台 + 线下回收 + 标准化质检 + 智能匹配 + 循环交易」的模式，让闲置图书在校园内部高效流转。

**当前状态：开发中（阶段 1 / 10 已完成）** —— Web 平台工程骨架已就绪，业务功能尚未实现。

---

## 目录

- [项目简介](#项目简介)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [开发规范](#开发规范)
- [设计文档](#设计文档)
- [安全与合规](#安全与合规)
- [开发进度](#开发进度)

---

## 项目简介

| 项目 | 内容 |
|---|---|
| 产品名称 | 青阅循环 |
| 定位 | 校园二手图书智能循环与生态服务平台 |
| 核心业务 | 旧书回收、品相评估、二手交易、以书换书、租赁、公益捐赠、碳账户积分 |
| 目标用户 | 高校学生、学校后勤/团委、校园社团、合作企业 |
| 载体 | Web 平台（移动端优先，适配微信内置浏览器） |

**解决什么问题**：毕业季旧书处理麻烦、废纸回收价值低、二手教材信息分散、学生购书成本高。

**商业依据**：见 [`青阅循环_优化版.docx`](./青阅循环_优化版.docx)（商业计划书 V4.0），全文提取见 [`docs/_bp_extract.md`](./docs/_bp_extract.md)。

> ⚠️ 商业计划书中的运营数据（回收量、成交率、毛利率等）多为**示例数据**或**目标情景值**，不得作为既成事实对外展示。

## 技术栈

### 前端

| 类别 | 选型 | 版本 |
|---|---|---|
| 框架 | Vue | 3.5.42 |
| 语言 | TypeScript | 6.0.2（严格模式，**禁止 `any`**） |
| 构建 | Vite | 8.3.0 |
| UI 组件 | Element Plus | 2.14.7 |
| 状态管理 | Pinia | 4.0.3 |
| 路由 | Vue Router | 5.3.1 |
| 原子化样式 | Tailwind CSS | 3.4.19 |
| 运行时校验 | Zod | 4.6.5 |
| 测试 | Vitest | 5.0.3 |

### 后端

| 能力 | 方案 |
|---|---|
| 数据库 | Supabase PostgreSQL |
| 认证 | Supabase Auth |
| 文件存储 | Supabase Storage（私有桶 + 签名 URL） |
| 服务端逻辑 | Supabase Edge Functions |
| 访问控制 | PostgreSQL Row Level Security（**核心防线**） |

### 部署（规划中）

- 前端：国内云服务器 + Nginx + CDN
- 后端：Docker 自托管 Supabase + 国内镜像加速
- 详见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

## 快速开始

### 环境要求

- **Node.js** ≥ 20.19.0（推荐 22 LTS 或更高）
- **pnpm** ≥ 9（本项目使用 pnpm，未使用 npm/yarn）
- **Python** ≥ 3.9（可选，用于提交前敏感信息扫描）

### 1. 安装依赖

```bash
pnpm install
```

国内网络较慢时可切换镜像（可选）：

```bash
pnpm config set registry https://registry.npmmirror.com
```

### 2. 配置环境变量

```bash
cp .env.example .env.local
```

然后编辑 `.env.local`，填入 Supabase 项目信息（Supabase 后台 → Project Settings → API）：

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-publishable-key>
VITE_APP_ENV=local
VITE_APP_TITLE=青阅循环
```

> ⚠️ **`.env.local` 已被 `.gitignore` 忽略，绝不会入库。**
> `service_role` key 绝不能放进这里，也绝不能用 `VITE_` 前缀——它拥有绕过 RLS 的完全权限。

### 3. 启用提交前检查（推荐，只需一次）

```bash
git config core.hooksPath .githooks
```

启用后每次提交会自动扫描敏感信息，命中即阻断。

### 4. 启动开发服务器

```bash
pnpm dev
```

默认地址 <http://localhost:5173>。服务监听 `0.0.0.0`，可用手机在同一局域网访问以验证移动端适配。

### 5. 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 类型检查 + 生产构建 |
| `pnpm preview` | 预览构建产物 |
| `pnpm typecheck` | 仅类型检查 |
| `pnpm lint` | ESLint 检查（0 warning 容忍） |
| `pnpm lint:fix` | ESLint 自动修复 |
| `pnpm format` | Prettier 格式化 |
| `pnpm test` | 运行单元测试 |
| `pnpm test:watch` | 测试监听模式 |
| `pnpm scan:secrets` | 手动扫描敏感信息 |

## 项目结构

采用 **Feature-Sliced Design (FSD)**，按业务功能纵切模块，而非按技术类型横切。

```
Book_Reuse/
├── docs/                       设计与交接文档
│   ├── PRD.md                    产品需求（8 模块 / 48 项功能）
│   ├── ARCHITECTURE.md           技术方案与 ADR
│   ├── security-compliance.md    安全合规方案
│   ├── data-model.md             数据库设计（24 表 + RLS）
│   ├── page-list.md              页面清单（38 页）
│   └── phase-0-summary.md        阶段 0 交付总览
│
├── src/
│   ├── app/                    【app 层】应用装配
│   │   ├── router/               路由表与全局守卫
│   │   ├── stores/               全局应用状态（Pinia）
│   │   └── styles/               Tailwind 入口 + Element Plus 主题覆盖
│   ├── pages/                  【pages 层】一个路由一个目录
│   ├── widgets/                【widgets 层】跨页面复合区块
│   ├── features/               【features 层】用户交互切片
│   ├── entities/               【entities 层】业务实体（model/api/ui）
│   └── shared/                 【shared 层】与业务无关的基础设施
│       ├── api/                  Supabase 客户端与数据库类型
│       ├── config/               环境变量读取与校验
│       └── lib/                  纯函数工具
│
├── tests/unit/                 单元测试
├── supabase/                   数据库（阶段 2 已交付）
│   ├── config.toml               Supabase CLI 配置
│   ├── migrations/              9 个版本化迁移：24 表 + 16 枚举 + 68 条 RLS 策略
│   ├── seed.sql                 种子数据（全部为示例数据，禁止在生产执行）
│   └── tests/rls_test.sql       RLS 安全测试（上线前必须全部通过）
├── tools/                      项目工具脚本
│   ├── check_migrations.py      迁移 SQL 静态审查
│   └── git_commit.py            以 UTF-8 无 BOM 写入提交信息
├── docker/                     自托管 Supabase 配置（阶段 9 创建）
│
├── .githooks/pre-commit        提交前敏感信息扫描
├── scan_secrets.py             敏感信息扫描器
└── optimize_bp.py              商业计划书排版优化脚本
```

### FSD 依赖规则（ESLint 强制）

```
app → pages → widgets → features → entities → shared
```

- **只能自上而下依赖**，禁止反向依赖
- 跨切片导入必须走切片根目录的 `index.ts`，禁止深链内部文件
- `shared` 层必须与业务无关，不得依赖任何上层模块

违反规则会在 `pnpm lint` 时报错。

## 开发规范

### 提交规范

```
类型(范围): 中文描述
```

类型：`feat` `fix` `docs` `style` `refactor` `test` `chore`

示例：

```
feat(market): 实现按专业与课程筛选图书
fix(auth): 修复登录后跳转丢失原路径的问题
docs(readme): 补充环境变量配置说明
```

### 分支策略

- `main` —— 主分支，保持可运行
- `feature/阶段名` —— 开发分支，完成后合并回 `main`

### 版本与标签

每个阶段完成打一个标签：`v0.1.0`、`v0.2.0`……变更记录见 [`CHANGELOG.md`](./CHANGELOG.md)。

### 代码风格

- **类型安全**：禁止 `any`；外部数据入口一律 `unknown` + Zod 校验
- **格式**：Prettier 统一（ESLint 不负责排版）
- **注释**：中文注释，关键逻辑需说明「为什么」而非「是什么」
- **提交前**：`pnpm typecheck && pnpm lint && pnpm test` 必须全绿

## 设计文档

所有设计决策都在开始编码前完成并归档，避免口头约定流失：

| 文档 | 内容 | 适合谁读 |
|---|---|---|
| [PRD](docs/PRD.md) | 功能清单、优先级、定价模型、排除范围 | 产品、运营 |
| [技术方案](docs/ARCHITECTURE.md) | 技术选型、目录结构、ADR、测试策略 | 开发 |
| [安全合规](docs/security-compliance.md) | 数据分级、加固清单、等保适配、技术债 | 全员、法务 |
| [数据模型](docs/data-model.md) | 24 张表、RLS 策略、ER 图 | 开发、DBA |
| [页面清单](docs/page-list.md) | 38 个页面、路由、优先级 | 产品、设计、开发 |

## 安全与合规

### 密钥管理红线

| 规则 | 说明 |
|---|---|
| `VITE_*` 变量会打包进前端 | 只能放可公开的值（URL + anon key） |
| anon key 的安全性完全取决于 RLS | 任何一张表漏开 RLS，该表即对全网开放 |
| `service_role` key 绝不进前端 | 只放 Edge Function Secrets |
| 数据库密码绝不写入文档 | 使用密码管理器保管 |

### 数据合规

- 遵循《个人信息保护法》《数据安全法》
- 学生证照片等**敏感个人信息**需单独同意 + 加密存储 + 限定留存期
- 智能柜摄像头**只拍书不拍人**，从设计上规避人脸信息风险
- 版权三层风控：ISBN 权威库比对 / 人工二次审核 / 授权对接

详见 [`docs/security-compliance.md`](./docs/security-compliance.md)。

## 开发进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| 0 | PRD、技术方案、安全合规、数据模型、页面清单 | ✅ 已完成 |
| 1 | 工程初始化、Supabase 客户端、环境变量、ESLint 规范 | ✅ 已完成 |
| 2 | Supabase 迁移 SQL（24 表 + 16 枚举 + 68 条 RLS 策略 + 种子数据 + 测试脚本） | ✅ 已完成 |
| 3 | 认证与用户档案（注册/登录/找回密码/个人中心/地址管理） | ✅ 已完成 |
| 4 | 图书市场与详情页 | ⏳ 下一步 |
| 5 | 发布/回收流程（含 AI 品相识别占位） | ⏸ 待开始 |
| 6 | 订单、租赁、碳账户与积分 | ⏸ 待开始 |
| 7 | 运营后台与财务模型看板 | ⏸ 待开始 |
| 8 | 智能柜模拟交互 | ⏸ 待开始 |
| 9 | 部署方案（前端 + Docker 自托管 Supabase） | ⏸ 待开始 |
| 10 | 交接 README 与文档完善 | ⏸ 待开始 |

### 已知限制

- **迁移尚未在真实环境执行**：迁移文件已生成并通过静态审查，但本机无 Postgres/Docker，
  **未实际执行过**。请在 Supabase 侧按 [`supabase/README.md`](./supabase/README.md) 执行并运行 RLS 测试。
- **注册/登录无法端到端验证**：依赖上面的迁移执行。执行后可用种子账号
  `student.a@example.com` / `Test@123456` 实测完整流程。
- **学生证上传未实现**：认证按钮当前只把状态置为 `pending`；
  真实上传需接 Storage 私有桶并完成个人信息保护影响评估（PIPIA）。
- **Element Plus 全量引入**：构建产物中该 chunk 约 985 KB（gzip 317 KB），阶段 4 改为按需引入优化
- **无微信小程序端**：当前为纯 Web；如需小程序需评估 uni-app/Taro 适配成本

## 许可证

[MIT](./LICENSE)

---

## 交接说明

**接手前请先读**：[`docs/phase-0-summary.md`](./docs/phase-0-summary.md) 了解全局，再读 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) 第 2 节掌握目录约定。

**环境搭建三步**：`pnpm install` → `cp .env.example .env.local` 填值 → `git config core.hooksPath .githooks`

**遇到类型报错**：本项目禁止 `any`，请用 `unknown` + Zod 校验解决，不要用 `as` 断言绕过。
