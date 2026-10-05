# 更新日志（CHANGELOG）

本文件记录「青阅循环」项目的所有重要变更。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

**变更类型**：`新增` ｜ `修复` ｜ `变更` ｜ `移除` ｜ `安全`

---

## [未发布]

### 计划中
- 阶段 4：图书市场与详情页（同时把 Element Plus 改为按需引入）
- 阶段 5：发布/回收流程（含 AI 品相识别占位）

---

## [v0.4.0] - 2026-10-06

**主题：阶段 3 —— 认证与用户档案模块**

### 新增：shared 层基础能力
- `src/shared/api/database.types.ts` 由占位替换为**完整 24 张表的类型定义**
  - 含 16 个枚举、profiles_public 视图、place_order 等函数签名
  - ⚠️ 关键点：数据库结构必须用 `type` 而非 `interface`。
    Supabase 的 GenericTable 约束要求 Row/Insert/Update 可赋值给
    `Record<string, unknown>`，interface 没有隐式索引签名，
    会导致所有查询入参类型退化为 `never`（表现为「参数不能赋给 never」编译错误）
- `src/shared/api/client.ts` 统一 API 客户端
  - `ApiError` 类：把 PostgreSQL SQLSTATE 与 PostgREST 错误码映射为
    6 类可读错误（unauthenticated / forbidden / conflict / not_found /
    invalid / rate_limited / network / unknown）
  - **优先透出中文信息**：数据库触发器与约束用中文 raise exception
    （如「书目未通过 ISBN 权威库校验，禁止上架」），这类信息对用户最有价值
  - `run()` / `runOrNull()`：统一错误处理，区分「可选数据」与「必须成功」

### 新增：entities/user 切片
- `model/types.ts` 展示辅助（纯函数，已单元测试覆盖）
  - `maskPhone` 手机号脱敏（PIPL 合规：界面与日志一律脱敏）
  - `gradeLabel` 年级中文转换、`roleLabel` 角色中文映射
  - `toUserProfileViewModel` 档案 → 视图模型，`canPublish` 综合
    「已认证 + 未拉黑」两个条件
  - `toPublicProfileViewModel` 公开档案视图模型（不含任何敏感字段）
- `model/schema.ts` Zod 校验（前后端可复用同一份规则）
  - 密码规则与 supabase/config.toml 的 minimum_password_length = 8 对齐，
    并要求字母 + 数字组合
  - `registerSchema` 强制 `agreed: z.literal(true)`：用户协议与隐私政策
    **必须手动勾选**，不得默认勾选（PIPL 要求）
  - `addressSchema` 楼栋必填、补充说明限 60 字（减少敏感信息泄漏面）
- `model/store.ts` 会话状态
  - 会话来源始终以 Supabase Auth 为准，不重复存储 token，
    避免「前端认为已登录但 token 已失效」
  - `subscribeAuthChanges` 同步多标签页登出与 token 续期
- `api/auth.ts` 数据访问（14 个语义化方法）
  - 登录失败统一提示，不区分账号不存在与密码错误（防账号枚举）
  - `updateProfile` 使用 `TableUpdate<'profiles'>` 而非索引签名类型，
    因为 Supabase 的 update() 会拒绝索引签名（RejectExcessProperties）

### 新增：features 层 5 个切片
| 切片 | 内容 |
|---|---|
| `auth-login` | 登录表单，支持 `?redirect=` 跳回原页面 |
| `auth-register` | 注册表单，学校→专业联动，协议强制勾选 |
| `auth-logout` | 退出按钮（二次确认，请求失败也清空本地状态） |
| `profile-edit` | 资料表单，只提交用户可改字段 |
| `address-book` | 地址增删改查 + 默认地址切换 |

### 新增：页面与路由（7 个新页面）
- `/auth/login`、`/auth/register`、`/auth/forgot-password`、`/auth/reset-password`
- `/my/profile`（个人中心：认证状态、数据概览、权限说明、资料表单）
- `/my/addresses`（地址管理）
- 全局路由守卫：`meta.requiresAuth` / `meta.requiresStaff` +
  路由 meta 类型声明（扩展 `RouteMeta`，使 `to.meta.title` 有类型）
- 顶栏登录态：未登录显示登录/注册，已登录显示头像与下拉菜单

### 安全与合规落地
- **防账号枚举**：登录失败与找回密码均不区分账号是否存在
- **敏感字段保护**：个人中心手机号脱敏展示；公开档案视图不含 phone 与 blacklist_reason
- **权限说明透明**：个人中心明确列出「当前可以做什么、不可以做什么」
- **黑名单可见**：因版权违规被限制的用户能看到原因（对应商业计划书 9.1 节）
- **碳数据标注**：碳减排量旁标注「系数取自示例参数，尚未经 LCA 实测校准」
- **地址最小化**：只采集到楼栋层级，表单内提示勿填写门牌号等信息

### 单元测试
- 新增 54 个用例（`user-types` 22 个、`user-schema` 32 个）
- 累计 **72 个用例全部通过**
- 覆盖要点：手机号脱敏不泄漏明文、黑名单用户不可发布、
  密码强度校验、协议必须勾选、地址必填校验

### 修复
- `database.types.ts` 由 interface 改为 type（见上文关键点）
- `ApiError` 的 `name` 与 `cause` 补 `override` 修饰符
  （`cause` 是 ES2022 Error 的既有属性）
- Zod v4 的 `z.literal` 第二参数由 `errorMap` 改为 `error`
- 注册页移除未使用的 `RouterLink` 导入（`noUnusedLocals` 报错）

### 验证结果

| 检查项 | 结果 |
|---|---|
| `pnpm typecheck` | 通过，0 错误 |
| `pnpm lint` | 通过，0 error / 0 warning |
| `pnpm format:check` | 通过 |
| `pnpm test` | 72 个用例全部通过（新增 54 个） |
| `pnpm build` | 构建成功，路由级代码分割生效（每页 2-25 KB） |
| 浏览器实测 | 登录页、注册页正常渲染；未登录访问 `/my/profile` 正确重定向到登录页 |

### 已知限制
- **数据库尚未创建**：迁移文件已就绪但未执行，因此注册/登录/资料保存
  **无法端到端验证**。需先在 Supabase 侧执行迁移与种子数据，
  再用 `student.a@example.com` / `Test@123456` 实测完整流程。
- **学生证上传未实现**：认证按钮当前只把状态置为 pending；
  真实上传需接 Storage 私有桶 + PIPIA 评估
- **Element Plus 仍为全量引入**：该 chunk 985 KB（gzip 317 KB），
  阶段 4 改为按需引入

---

## [v0.3.0] - 2026-10-06

**主题：阶段 2 —— Supabase 数据库迁移、RLS 安全策略与种子数据**

> ⚠️ 本版本**只生成迁移文件，未对任何数据库执行**。执行步骤见 `supabase/README.md`。

### 新增：数据库迁移（9 个文件）

| 迁移文件 | 内容 |
|---|---|
| `0001_extensions_and_helpers.sql` | pgcrypto / pg_trgm 扩展；`set_updated_at`；7 个权限辅助函数 |
| `0002_enums.sql` | **16 个枚举类型** |
| `0003_tables_users_schools.sql` | A 组 5 表：schools、majors、courses、profiles、user_addresses |
| `0004_tables_books_orders.sql` | B 组 8 表：book_categories、books、listings、orders、order_items、recycle_requests、rentals、donations |
| `0005_tables_carbon_coupons.sql` | C 组 3 表：campaigns、carbon_records、user_coupons |
| `0006_tables_lockers.sql` | D 组 3 表：smart_lockers、locker_usage_logs、condition_images |
| `0007_tables_pricing_support.sql` | E+F 组 5 表：pricing_rules、sensitivity_analysis、cashflow_forecast、notifications、audit_logs |
| `0008_rls_policies.sql` | **68 条 RLS 策略**，覆盖全部 24 张表 |
| `0009_integrity_constraints.sql` | 状态机、风控触发器、表级权限授予、`place_order` 下单事务函数 |

- **24 张表**全部启用 `ROW LEVEL SECURITY` **并加 `FORCE`**
- 每表含主键、外键、索引、默认值、约束与时间戳；金额统一 `numeric(12,2)`
- 中文书名检索采用 `pg_trgm` 三元组 GIN 索引（tsvector 不适用于中文分词）

### 新增：RLS 策略设计要点

- **只增不改的四张表**不提供任何写策略，仅 `service_role` 可写：
  `carbon_records`（防伪造碳数据）、`user_coupons`（防自行造券）、
  `locker_usage_logs`（仅硬件 webhook）、`audit_logs`（等保要求不可篡改）
- **列级防护触发器**（RLS 无法按列授权，用 BEFORE UPDATE 补足）：
  - `trg_profiles_protect_sensitive` —— 阻止用户自行修改 role、verify_status、
    credit_score、points_balance、carbon_total_kg、blacklist_reason
  - `trg_notifications_protect_columns` —— 普通用户只能改通知的已读状态
- **商业机密隔离**：`pricing_rules`、`sensitivity_analysis`、`cashflow_forecast`
  仅运营/管理员可见，且未对 `anon` 授予任何权限（定价系数是核心竞争力）

### 新增：业务风控落库

| 约束 | 对应商业计划书 |
|---|---|
| 未通过 ISBN 校验的书目禁止上架 | 9.1 节版权风控第一层 |
| AI 低置信度转人工复核队列 | 9.1 节版权风控第二层 |
| 黑名单用户禁止发布与交易 | 9.1 节 |
| 碳减排系数必须带来源且数值自洽 | 10.1 节「数据可核验」 |
| 订单状态机阻止跳级 | 交易安全 |
| 同一卖家不可重复上架同一书目 | 防超卖 |
| 租赁押金 = 售价 80% 校验 | 4.2.2 节 |
| 订单完成后清空取件码 | 最小化凭据留存 |

### 新增：`place_order` 下单事务函数

- 金额全部由服务端计算，前端传参一律忽略
- `SELECT ... FOR UPDATE` 锁定商品行，防并发超卖
- 原子完成「校验状态 → 写订单 → 写明细 → 商品置为已预定」

### 新增：种子数据 `supabase/seed.sql`

- 3 所示例学校、7 个专业、12 门课程、15 个图书分类
- 17 条书目（其中 2 条 `is_verified = false`，用于验证版权风控拦截）
- 11 条挂牌（覆盖 5 种品相 × 4 种交易类型）
- 14 条定价规则、8 条敏感性分析、6 期现金流预测（均标注为示例值并附来源说明）
- 6 个测试账号（涵盖学生 / 校园大使 / 运营 / 管理员 / 待认证学生）
- ⚠️ 全部为示例数据，正式使用前必须替换；**禁止在生产执行**

### 新增：RLS 安全测试 `supabase/tests/rls_test.sql`

- **47 项断言**，覆盖 11 类场景：基础检查、匿名、学生隔离、未认证限制、
  版权风控、提权防护、订单可见性、只增不改、运营权限、管理员权限、结构级检查
- **关键实现**：用 `SET LOCAL ROLE` 切换到 `anon` / `authenticated` 角色。
  若只设置 JWT 声明而不切角色，测试以超级用户身份运行会**绕过 RLS**，
  导致所有断言假性通过——脚本内置「★ 方法自检」项专门验证这一点

### 新增：工具与文档

- `tools/check_migrations.py` —— 迁移 SQL 静态审查（9 类检查：表/枚举数量、
  RLS 启用与覆盖、只增不改表的写权限、机密表匿名可见性、外键顺序、
  块注释完整性、扩展函数引用、危险语句扫描）
- `supabase/config.toml` —— Supabase CLI 本地开发配置
- `supabase/README.md` —— 迁移执行流程、RLS 设计说明、测试账号、常见问题、上线检查清单

### 修复
- 修正 `place_order` 中把 `listing_id` 误写入 `locker_id` 的错误，改为独立的柜体参数
- 移除扩展的显式 `with schema extensions`：该写法会使 `gen_random_uuid()`
  的解析依赖 search_path，而函数内固定了 `search_path = public` 导致建表失败
- 修正文档中枚举数量的笔误（15 → 16）

### 验证结果

| 检查项 | 结果 |
|---|---|
| 静态审查（`tools/check_migrations.py`） | 通过：24 表 / 16 枚举 / 68 策略 / 24 表全部 enable+force |
| 只增不改表写权限 | 通过：4 张表均未对 authenticated 授予写权限 |
| 商业机密表匿名可见性 | 通过：3 张表均未对 anon 授予权限 |
| 外键引用顺序 | 通过 |
| 危险语句扫描 | 通过（无 drop/truncate/disable RLS/无 where 的删改） |
| **真实执行** | **未执行** —— 本机无 Postgres/Docker，需在 Supabase 侧执行 |

### 已知限制
- 迁移与 RLS 测试**均未在真实数据库运行过**，仅通过静态审查。
  首次执行请务必在本地或预发布环境跑通 `rls_test.sql` 后再考虑生产。

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
