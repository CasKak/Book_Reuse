# 青阅循环 · 技术方案（Technical Blueprint）

> 文档版本：v0.1.0 ｜ 阶段：0（设计）
> 目标：把商业计划书的业务闭环，落成一套可上线、可维护、可交接的全栈架构。

---

## 1. 技术栈清单

### 1.1 前端

| 类别 | 选型 | 版本基线 | 选型理由 |
|---|---|---|---|
| 框架 | **Vue 3** | ^3.5 | Composition API + `<script setup>`，类型推导友好 |
| 语言 | **TypeScript** | ^5.6 | 严格模式，**全仓库禁止 `any`** |
| 构建 | **Vite** | ^6 | 冷启动快，产物体积可控 |
| UI 组件 | **Element Plus** | ^2.8 | 后台表单/表格生态成熟，中文化开箱可用 |
| 状态管理 | **Pinia** | ^2.2 | Vue 3 官方推荐，TS 推导好 |
| 路由 | **Vue Router** | ^4.4 | 官方路由，支持懒加载与守卫 |
| 原子化样式 | **Tailwind CSS** | ^3.4 | 与 Element Plus 共存，负责布局与间距 |
| HTTP | **ofetch** 或 `fetch` 封装 | — | 轻量、原生 Promise、便于统一拦截 |
| 表单校验 | Element Plus Form + Zod（可选） | — | Zod 用于**运行时**校验后端返回值 |
| 代码质量 | ESLint + Prettier + vue-tsc | — | 提交前强制类型检查 |

### 1.2 后端 / 数据库（Supabase）

| 能力 | 用途 |
|---|---|
| PostgreSQL | 主数据库，复杂查询与统计报表 |
| Auth | 邮箱/密码登录、JWT 签发、会话管理 |
| Row Level Security | **数据隔离的核心防线**（见安全方案） |
| Storage | 图书封面、品相照片、学生证照片 |
| Edge Functions | 定价计算、碳账户结算、智能柜回调等**不可信前端执行**的逻辑 |
| Realtime | 订单状态变更推送（可选） |

### 1.3 部署

| 组件 | 方案 |
|---|---|
| 前端 | 国内云服务器 + Nginx + CDN（Vercel/Netlify 作为备选，但境内访问不稳定） |
| 后端 | Docker 自托管 Supabase（`supabase/docker` 官方 compose） |
| 镜像加速 | 阿里云/腾讯云容器镜像加速器，见 `deployment` 文档 |
| 数据库迁移 | Supabase CLI，**所有结构变更走迁移文件**，禁止仪表盘直改生产库 |

## 2. 架构模式：Feature-Sliced Design (FSD)

### 2.1 为什么选 FSD

商业计划书把业务拆成 8 个模块（认证、市场、发布回收、智能柜、订单、碳账户、后台、营销）。
朴素按「views/components/api」分层会让一个业务改动横跨四五个目录，交接成本高。
FSD 按**业务切片**纵切，一个模块的改动收敛在一个目录内。

### 2.2 层级定义

依赖方向**只能自上而下**（上层可依赖下层，下层禁止反向依赖）：

```
app      →  应用装配：入口、路由注册、全局 Provider、全局样式
pages    →  路由页面：一个路由一个页面，负责编排
widgets  →  复合区块：跨页面复用的较大 UI 块（如 <BookGrid />、<OrderTimeline />）
features →  用户交互：一个动作一个切片（如「加入购物车」「提交回收预约」）
entities →  业务实体：数据模型 + 展示（如 book、order、user）
shared   →  与业务无关：UI 原子件、工具函数、API 客户端、类型常量
```

### 2.3 切片（slice）划分

每个业务层内按**业务域**划分切片：

| 切片 | 覆盖模块 |
|---|---|
| `user` | M1 认证与档案 |
| `book` | M2 图书市场 |
| `listing` | M3 发布与回收 |
| `locker` | M4 智能柜 |
| `order` | M5 订单与支付 |
| `carbon` | M6 碳账户与积分 |
| `admin` | M7 运营后台 |
| `campaign` | M8 营销与活动 |

### 2.4 目录结构（完整）

```
Book_Reuse/
├── docs/                          # 设计与交接文档（阶段 0 产物）
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── security-compliance.md
│   ├── page-list.md
│   └── data-model.md
│
├── src/
│   ├── app/                       # 【app 层】应用装配
│   │   ├── App.vue
│   │   ├── main.ts                # 入口：挂载 Pinia / Router / Element Plus
│   │   ├── router/
│   │   │   ├── index.ts           # 路由实例与全局守卫
│   │   │   └── routes.ts          # 路由表（按切片懒加载）
│   │   ├── providers/             # 全局 Provider（主题、i18n、错误边界）
│   │   └── styles/
│   │       ├── index.css          # Tailwind 入口
│   │       └── element-theme.css  # Element Plus 主题变量覆盖
│   │
│   ├── pages/                     # 【pages 层】一个路由一个目录
│   │   ├── home/
│   │   ├── market/
│   │   ├── book-detail/
│   │   ├── publish/
│   │   ├── order/
│   │   ├── carbon/
│   │   ├── profile/
│   │   ├── auth/
│   │   └── admin/
│   │
│   ├── widgets/                   # 【widgets 层】复合区块
│   │   ├── app-header/
│   │   ├── app-footer/
│   │   ├── book-grid/
│   │   ├── order-timeline/
│   │   └── admin-stat-cards/
│   │
│   ├── features/                  # 【features 层】用户交互切片
│   │   ├── auth-login/
│   │   ├── auth-register/
│   │   ├── book-search/
│   │   ├── book-filter/
│   │   ├── book-publish/
│   │   ├── isbn-scan/
│   │   ├── condition-assess/      # 品相自评 + AI 占位
│   │   ├── recycle-appointment/
│   │   ├── locker-interact/
│   │   ├── order-create/
│   │   ├── order-pay-mock/
│   │   ├── rental-checkout/
│   │   ├── carbon-ledger/
│   │   └── admin-quality-check/
│   │
│   ├── entities/                  # 【entities 层】业务实体
│   │   ├── user/     { model/ api/ ui/ index.ts }
│   │   ├── book/
│   │   ├── listing/
│   │   ├── order/
│   │   ├── school/
│   │   ├── locker/
│   │   └── carbon/
│   │
│   └── shared/                    # 【shared 层】与业务无关
│       ├── api/                   # Supabase 客户端、请求封装
│       │   ├── supabase.ts
│       │   └── types.ts           # 数据库生成类型（Database）
│       ├── ui/                    # 原子组件（Button/Empty/Loading）
│       ├── lib/                   # 纯函数工具（格式化、校验、计算）
│       ├── config/                # 环境变量读取与校验
│       └── assets/
│
├── supabase/                      # 后端：迁移、种子、函数
│   ├── migrations/                # 版本化 SQL 迁移（唯一结构来源）
│   ├── seed.sql                   # 种子数据（示例数据，需替换）
│   └── functions/                 # Edge Functions
│       ├── calculate-price/
│       ├── settle-carbon/
│       └── locker-webhook/
│
├── docker/                        # 自托管 Supabase 部署配置
│   ├── docker-compose.yml
│   └── .env.example
│
├── tests/                         # 测试
│   ├── unit/
│   └── e2e/
│
├── .env.example                   # 环境变量模板（入库）
├── .env.local                     # 本地真实值（**不入库**）
├── .gitignore
├── CHANGELOG.md
├── README.md
└── package.json
```

### 2.5 切片内部约定

每个切片统一结构，便于团队按图索骥：

```
entities/book/
├── model/
│   ├── types.ts        # Book, BookCondition 等类型定义
│   └── store.ts        # Pinia store（如需）
├── api/
│   └── queries.ts      # 数据读取（Supabase 查询）
├── ui/
│   └── BookCard.vue    # 该实体的展示组件
└── index.ts            # 对外唯一出口（Public API）
```

> **强制规则**：跨切片只能从 `index.ts` 导入，禁止深链到 `model/` 或 `api/`。
> 用 ESLint `no-restricted-imports` 强制，阶段 1 落地。

## 3. 类型安全策略（禁止 any）

| 措施 | 说明 |
|---|---|
| `tsconfig.json` 开启 `strict: true` | 含 `strictNullChecks`、`noImplicitAny` |
| 追加 `noUncheckedIndexedAccess` | 数组越界返回 `T \| undefined`，避免隐藏 bug |
| 追加 `exactOptionalPropertyTypes` | 区分「未传」与「传 undefined」 |
| 禁止 `any` | ESLint `@typescript-eslint/no-explicit-any: error` |
| 禁止 `@ts-ignore` | 改用 `@ts-expect-error` 并必须写明原因 |
| 未知类型用 `unknown` | 外部数据入口一律 `unknown` + Zod 运行时校验 |
| Supabase 生成类型 | `supabase gen types typescript` 产出 `Database` 类型，表结构改动后重新生成 |
| 泛型约束代替断言 | 禁止滥用 `as`，确需断言必须注释原因 |

**外部数据边界处理范式**（阶段 1 起统一使用）：

```ts
// 外部输入一律先当 unknown，再用 schema 校验后才进入业务层
import { z } from 'zod'

const BookSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  price: z.number().nonnegative(),
})

export type Book = z.infer<typeof BookSchema>

export function parseBook(input: unknown): Book {
  return BookSchema.parse(input)
}
```

## 4. 环境与配置管理

### 4.1 三套环境

| 环境 | 前端 | 数据库 | 用途 |
|---|---|---|---|
| 本地 local | `http://localhost:5173` | Supabase 云项目 或 本地 Docker | 日常开发 |
| 预发布 staging | 独立域名 | 独立 Supabase 项目实例 | 联调、验收 |
| 生产 production | 正式域名 | 生产 Supabase 实例 | 对外服务 |

### 4.2 环境变量

```bash
# .env.local（本地真实值，绝不入库）
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-anon-key>
VITE_APP_ENV=local

# 仅服务端/Edge Functions 使用，绝不进前端
# SUPABASE_SERVICE_ROLE_KEY  ← 只放 Edge Function 的 Secrets 或部署平台环境变量
```

> **红线**：`VITE_` 前缀的变量会被**打包进前端产物**，任何人可在浏览器查看。
> 因此 `VITE_*` 只能放**可公开**的值（URL + anon key）。
> `service_role` key 拥有绕过 RLS 的完全权限，**一旦泄漏等同于数据库被完全接管**。

## 5. 数据流与分层职责

```
[Vue 组件]
    │  只调用 entities / features 暴露的方法
    ▼
[Pinia Store]  ← 客户端状态（会话、筛选条件、草稿）
    │
    ▼
[entities/*/api]  ← 数据访问层，封装 Supabase 查询
    │
    ▼
[Supabase Client]  ← 携带用户 JWT
    │
    ▼
[PostgreSQL + RLS]  ← ★ 最终防线：无论前端怎么被篡改，RLS 决定能看到什么
    │
    └──► [Edge Functions]  ← 定价、碳结算、设备回调等敏感逻辑
```

**核心原则**：前端不做任何安全假设。所有权限判断必须在 RLS 或 Edge Function 中**再实现一次**。
前端隐藏按钮只是体验优化，不是安全措施。

## 6. 关键技术决策记录（ADR）

| 编号 | 决策 | 理由 | 代价 |
|---|---|---|---|
| ADR-01 | 用 Supabase 而非自建后端 | 计划书团队规模小，Auth/Storage/RLS 开箱可用，省 2-3 个月 | 供应商绑定；国内访问需自托管 |
| ADR-02 | 用 FSD 而非传统三层 | 8 个业务模块纵切，改动收敛 | 学习成本，需 ESLint 强制边界 |
| ADR-03 | 定价逻辑放 Edge Function | 定价系数是商业机密，不能在前端计算 | 需要网络往返 |
| ADR-04 | 图片走 Storage + 签名 URL | 避免公开桶导致图书照片被爬 | 需要管理签名过期 |
| ADR-05 | 本期模拟支付 | 真实支付需牌照，法务未确认 | 上线前必须补 |
| ADR-06 | 碳系数入库且带来源字段 | 计划书要求「不虚构数据」 | 后台需维护系数 |

## 7. 性能目标与实现路径

| 目标 | 手段 |
|---|---|
| 接口延迟 50-100ms | 应用与数据库部署在**同一地域**（如都在东京 ap-northeast-2）；国内用户建议后续迁移至国内云厂商托管 PG |
| 首屏 < 2s | 路由懒加载、组件按需引入、Supabase 查询只取必要列 |
| 列表流畅 | 服务端分页 + 虚拟滚动（长列表） |
| 图片快 | Storage 图片压缩 + CDN + 懒加载 |
| 查询快 | 为高频过滤字段建索引（见 data-model.md） |

> ⚠️ **地域延迟提示**：当前 Supabase 项目区域为 `ap-northeast-2`（东京）。
> 国内用户直连东京的往返延迟通常 **30-80ms**（视运营商），可满足「50-100ms」目标的下限；
> 若要求稳定低于 50ms，需迁移至国内云（阿里云/腾讯云）自托管 PostgreSQL。

## 8. 测试策略

| 层级 | 工具 | 覆盖目标 |
|---|---|---|
| 类型检查 | `vue-tsc --noEmit` | 100% 通过，CI 阻断 |
| 单元测试 | Vitest | `shared/lib` 纯函数覆盖率 ≥80%；**定价与碳计算必须 100%** |
| 组件测试 | Vitest + @vue/test-utils | 关键交互组件 |
| 端到端 | Playwright | 核心链路：注册→发布→下单→碳账户 |
| RLS 测试 | SQL 脚本 | 每个表用不同角色验证可见性（见 data-model.md） |

> **定价与碳计算必须单元测试覆盖**：这两处直接对应计划书要求的「数据可核验」，
> 算错会导致对外公示数据失真。

## 9. 阶段 0 验收标准

- [x] 技术栈与版本基线明确
- [x] 架构模式（FSD）与完整目录结构落地到文件级
- [x] 类型安全策略可被 ESLint/tsconfig 强制执行
- [x] 环境变量边界清晰，标注 `VITE_` 前缀的暴露风险
- [x] 关键决策有 ADR 记录（含代价）
- [x] 性能目标有对应实现路径与地域延迟说明
- [x] 测试策略明确标注「定价/碳计算必须单测」
