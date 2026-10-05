# 更新日志（CHANGELOG）

本文件记录「青阅循环」项目的所有重要变更。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

**变更类型**：`新增` ｜ `修复` ｜ `变更` ｜ `移除` ｜ `安全`

---

## [未发布]

### 计划中
- 阶段 2：Supabase 迁移 SQL（24 表）+ RLS 策略 + 种子数据（预计 `v0.3.0`）
- 阶段 3：认证与用户档案模块

---

## [v0.2.0] - 2026-10-06

**主题：阶段 1 —— Vue 3 + TypeScript + Vite 工程初始化**

### 新增
- **前端工程骨架**（Vue 3.5.42 + TypeScript 6.0.2 + Vite 8.3.0）
  - Element Plus 2.14.7（含中文语言包）
  - Pinia 4.0.3 状态管理
  - Vue Router 5.3.1（懒加载路由 + 全局守卫）
  - Tailwind CSS 3.4.19（关闭 preflight 以兼容 Element Plus）
  - Zod 4.6.5 运行时校验
- **Feature-Sliced Design 目录结构**
  - `src/app` 应用装配（路由、全局 store、样式）
  - `src/pages` 页面层（首页、404）
  - `src/widgets` / `src/features` / `src/entities` 占位待填充
  - `src/shared` 基础设施（api / config / lib）
- **Supabase 客户端接入**（`src/shared/api/supabase.ts`）
  - 懒加载单例，避免无环境变量时导入即抛错
  - 配置会话持久化与自动续期
  - 提供 `checkDatabaseHealth()` 连通性探测
  - `database.types.ts` 占位类型，阶段 2 用 `supabase gen types` 替换
- **环境变量校验**（`src/shared/config/env.ts`）
  - Zod 运行时校验，缺失或格式错误给出中文排错指引
  - 校验 URL 必须为 https 且结尾不带斜杠
  - 类型声明 `src/vite-env.d.ts` 限定只有可公开变量
- **严格类型安全配置**
  - `tsconfig` 开启 `noUncheckedIndexedAccess`、`noImplicitOverride`、`noImplicitReturns`
  - ESLint 禁止 `any`、禁止 `@ts-ignore`、强制 `import type`
  - ESLint 强制 FSD 依赖方向与切片公共出口
- **Element Plus 品牌主题**（`src/app/styles/element-theme.css`）
  - 主色改为品牌深绿 `#1f7a5c`，与 LOGO 一致
  - 覆盖各亮度派生色，保证 hover/disabled 状态一致
- **工程自检首页**（`src/pages/home/index.vue`）
  - 验证 Vue + 路由、Tailwind、Element Plus、Pinia、Supabase 五条链路
  - 品牌首屏、核心业务闭环、四大价值主张
  - 非生产环境显示环境角标
- **单元测试**（Vitest 5.0.3）
  - `tests/unit/shared/cn.test.ts` —— 类名合并工具（7 个用例）
  - `tests/unit/shared/money.test.ts` —— 金额格式化与分/元转换（11 个用例）
- **工具与规范**
  - `.githooks/pre-commit` —— 提交前自动扫描敏感信息，命中即阻断
  - `.prettierrc.json` + `.prettierignore` —— 统一代码格式
  - `vitest.config.ts` —— 独立测试配置（Vite 8 的 defineConfig 类型不含 test 字段）
  - `README.md` —— 完整交接文档（快速开始、目录结构、规范、进度）
  - `.env.example` 补充详细的密钥安全说明

### 变更
- **许可证由 GPL-3.0 更换为 MIT**
  - 原因：GPL-3.0 具传染性，会强制平台代码开源，与商业化目标冲突
  - 影响：允许闭源使用与商业分发，仅需保留版权声明
- `package.json` 更名 `qingyue-cycle`，版本 `0.2.0`，补齐 lint/format/test/typecheck 脚本
- `.gitignore` 补充 `dist/`、`coverage/`、`.vite/`、`*.tsbuildinfo` 等前端产物

### 修复
- 修正 `src/app/stores/app.ts` 注释中 `entities/*/model` 提前闭合块注释导致的语法错误
- `vite.config.ts` 的 `manualChunks` 由对象改为函数形式（Vite 8 / rolldown 不支持对象形式）
- `tsconfig.app.json` 移除已废弃的 `baseUrl`（TypeScript 6.0 起报错）
- 路由组件导入改为显式 `index.vue` 路径，避免 TS 无法解析目录导入
- 关闭 `eslint-plugin-vue` 的排版类规则，交由 Prettier 统一负责

### 安全
- 确认 `.env.local` 被 `.gitignore` 忽略，`git check-ignore` 验证通过
- 提交前敏感信息扫描通过（0 处真实密钥）
- Git 配置全局代理 `http://127.0.0.1:7897`，解决 GitHub 间歇不可达

### 验证结果
| 检查项 | 结果 |
|---|---|
| `pnpm typecheck` | 通过（0 错误） |
| `pnpm lint` | 通过（0 error / 0 warning） |
| `pnpm format:check` | 通过 |
| `pnpm test` | 18 个用例全部通过 |
| `pnpm build` | 构建成功，首屏 gzip 约 40 KB |
| 浏览器实测 | 首页正常渲染，Supabase 显示「已连接」 |

### 已知问题
- Element Plus 全量引入导致该 chunk 约 985 KB（gzip 317 KB），后续改为按需引入优化
- 数据库尚未创建任何表，业务功能需等阶段 2 迁移完成

---

## [v0.1.0] - 2026-10-06

**主题：阶段 0 —— 需求与技术方案设计**

本版本不包含业务代码，仅产出设计与规划文档，作为后续 9 个阶段的施工依据。

### 新增
- `docs/PRD.md` —— 产品需求文档
  - 产品定位、7 类用户角色及诉求
  - 核心业务闭环流程图（供给端 → 平台中枢 → 需求端 → 沉淀反哺）
  - 8 个功能模块（M1 认证档案 / M2 图书市场 / M3 发布回收 / M4 智能柜 / M5 订单支付 / M6 碳账户积分 / M7 运营后台 / M8 营销活动）共 48 项功能，全部标注 P0/P1/P2 优先级
  - 动态定价公式与四类系数说明
  - 碳减排测算公式与「示例参数」标注要求
  - 关键指标（北极星指标：月成交册数）
  - 非功能需求与**明确排除范围**（真实支付、真实 AI、真实硬件、小程序、教务对接、短信）
- `docs/ARCHITECTURE.md` —— 技术方案
  - 技术栈版本基线（Vue 3 / TS 5.6 / Vite 6 / Element Plus / Pinia / Vue Router / Tailwind / Supabase）
  - Feature-Sliced Design 六层架构与**完整到文件级的目录树**
  - 类型安全策略（strict、noUncheckedIndexedAccess、禁止 any、Zod 边界校验范式）
  - 三套环境（本地/预发布/生产）与环境变量边界说明
  - 6 条技术决策记录（ADR），每条含代价
  - 东京区域延迟说明与国内部署建议
  - 测试策略（定价与碳计算强制 100% 单测覆盖）
- `docs/security-compliance.md` —— 安全与合规方案
  - **立即处置事项**：anon key 性质判定、禁止入库清单
  - 数据分级 L1-L4，敏感个人信息（PIPIA）场景识别
  - 加密与传输措施、密钥硬编码反例
  - 隐私政策与用户协议必含条款（PIPL 第 17 条）
  - **Supabase 生产加固清单**（RLS、MFA、网络限制、密钥管理、审计）
  - 多环境隔离与数据库迁移流程（**禁止仪表盘直改生产库**）
  - 版权三层技术风控（对接商业计划书 9.1 节）
  - 可观测性（RED 指标、告警分级、PITR、恢复演练）
  - 等保 2.0 九大域适配与现阶段最低落地清单
  - 技术债清单（TD-01 ~ TD-07）与管理机制
- `docs/data-model.md` —— 数据模型设计
  - **24 张表**分 6 组，每表含主键、外键、索引、默认值、时间戳
  - **15 个枚举类型**覆盖全部状态字段
  - 每张表的 SELECT/INSERT/UPDATE/DELETE **四类 RLS 策略**
  - 关键表可直接使用的 RLS 策略 SQL 示例
  - RLS 测试方法（学生 A / 学生 B / 匿名三种身份）
  - ER 图（Mermaid + 文字版 + 基数说明）
  - 种子数据清单，示例值强制标注来源
- `docs/page-list.md` —— 页面清单
  - **38 个页面**（公共 6 / 认证 3 / 学生中心 9 / 智能柜 2 / 后台 13 / 错误页 5）
  - 每页面含路由、优先级、核心内容、依赖实体、对应模块
  - 页面与开发阶段一一映射
  - 学生端与后台导航结构
  - 移动端断点与微信内置浏览器适配要求
- `docs/phase-0-summary.md` —— 阶段 0 交付总览
  - 交付文件清单、核心结论、关键决策
  - 风险清单（按严重度排序）
  - **9 项待确认问题**（3 项阻塞阶段 1）
- `docs/_bp_extract.md` —— 商业计划书全文提取（17,201 字 / 39 表），作为设计依据留档
- `extract_bp_text.py` —— 商业计划书 DOCX 全文提取工具（python-docx）
- `scan_secrets.py` —— **敏感信息扫描器**
  - 6 条检测规则（Supabase key、JWT、含密码连接串、私钥、硬编码 service_role）
  - 自动跳过 git 忽略的文件与占位符，避免误报
  - 已自测：能命中真实密钥并返回退出码 1，可用作 pre-commit 钩子
- `.env.example` —— 环境变量模板（入库，含安全规则说明）
- `.env.local` —— 本地真实配置（**已被 .gitignore 忽略，不入库**）

### 变更
- 仓库从「文档仓库」正式定位为「青阅循环 Web 平台全栈项目仓库」
- `.gitignore` 补充 `_*.py`、`_*.txt`、`run*.txt` 等临时文件规则

### 安全
- 确认 `.env.local` 被 `.gitignore` 第 24 行 `.env.*` 正确忽略（`git check-ignore` 已验证）
- 确认 `.env.example` 通过第 25 行 `!.env.example` 例外规则正常入库
- `docs/security-compliance.md` 中**不复制完整 anon key**，避免密钥随文档扩散
- 全仓敏感信息扫描通过（0 处真实密钥）

### 已知问题
- 商业计划书载体为「微信小程序」，本项目按需求实现为 **Web 平台**，二者代码不通用（待确认处理方式）
- 仓库 LICENSE 为 GPL-3.0，具传染性；若平台需闭源商业化须尽早更换（待确认）

---

## 更早版本（文档仓库阶段）

## [v0.0.2] - 2026-10-06

### 修复
- 修复封面排版被正文样式覆盖的问题：封面被强制套用宋体小四黑色，导致项目名 36pt 深绿、副标题 16pt 等层级全部丢失
- `optimize_bp.py` 重建封面后记录元素 id，正文样式统一阶段跳过封面
- 新增 `SKIP_HEADINGS` 配置项，可声明需连同目录条目一起移除的标题
- `compare_docx.py` 因 PowerShell 重定向导致编码损坏（被转成 UTF-16），重写为 `docx_diff.py` 并统一 UTF-8

### 新增
- `docx_diff.py` —— 文档结构差异对比工具

## [v0.0.1] - 2026-10-06

### 新增
- 初始化 Git 仓库并绑定远程 `origin`
- 商业计划书 V4.0 排版优化版（`青阅循环_优化版.docx`）
- `optimize_bp.py` —— 可重跑的商业计划书排版优化脚本
- `verify_docx.py` —— 文档交付前自检脚本
- 品牌资产（LOGIO、模板参考图）与历史版本留档
