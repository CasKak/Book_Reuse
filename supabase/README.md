# 数据库迁移与 RLS 测试指南

> 阶段 2 交付物说明 ｜ 对应 [`docs/data-model.md`](../../docs/data-model.md)

---

## ⚠️ 最重要的两条规则

1. **只提交迁移文件，不对生产库直接执行。** 所有结构变更必须通过迁移文件走完
   「本地验证 → 预发布验收 → 生产执行」流程。
2. **严禁在 Supabase 仪表盘直接改生产库结构。** 仪表盘改动不会生成迁移文件，
   会导致生产库与代码库不一致，且无法回滚、无法审计。

---

## 一、文件清单

```
supabase/
├── migrations/
│   ├── 20260101000001_extensions_and_helpers.sql   扩展 + 通用函数 + 权限辅助函数
│   ├── 20260101000002_enums.sql                    16 个枚举类型
│   ├── 20260101000003_tables_users_schools.sql     A 组：users/schools 5 张表
│   ├── 20260101000004_tables_books_orders.sql      B 组：books/orders 8 张表
│   ├── 20260101000005_tables_carbon_coupons.sql    C 组：碳账户与积分 3 张表
│   ├── 20260101000006_tables_lockers.sql           D 组：智能硬件 3 张表
│   ├── 20260101000007_tables_pricing_support.sql   E+F 组：定价与支撑 5 张表
│   ├── 20260101000008_rls_policies.sql             ★ 全部 24 张表的 RLS 策略
│   └── 20260101000009_integrity_constraints.sql    状态机、风控约束、权限授予、下单函数
├── seed.sql                                        种子数据（全部为示例数据）
└── tests/
    └── rls_test.sql                                ★ RLS 安全测试
```

共 **24 张表、16 个枚举、68 条 RLS 策略**。

---

## 二、执行流程

### 步骤 1：本地开发环境

```bash
# 启动本地 Supabase（需要 Docker）
supabase start

# 重建数据库并自动执行 migrations + seed.sql
supabase db reset
```

### 步骤 2：运行 RLS 测试（必须通过才能继续）

```bash
#!/bin/bash
set -euo pipefail

# 从 supabase status 中解析数据库连接串
DB_URL="$(supabase status -o env | grep '^DB_URL=' | cut -d'=' -f2- | tr -d '"')"

psql "$DB_URL" -f supabase/tests/rls_test.sql
```

预期输出结尾为：

```
总计 47 项 ｜ 通过 47 项 ｜ 失败 0 项
ALL TESTS PASSED
```

**若有任何一项失败，不要继续部署。** RLS 漏配意味着数据对全互联网开放。

### 步骤 3：预发布环境

```bash
supabase link --project-ref <staging-project-ref>
supabase db push
```

在预发布环境同样运行一次 RLS 测试，确认迁移在生产等价环境正常。

### 步骤 4：生产环境（需人工确认）

```bash
supabase link --project-ref <prod-project-ref>

# 先查看将要执行的迁移，确认无误
supabase db push --dry-run

# 执行
supabase db push
```

> 🚫 `seed.sql` **禁止**在生产执行。生产数据由真实业务产生。

---

## 三、RLS 策略设计说明

### 3.1 为什么 RLS 是唯一防线

Supabase 的 `anon` key 是**公开的**——它设计上就要打包进前端产物，
任何人都能在浏览器里看到。因此：

```
anon key 的权限 = anon 角色在 RLS 下被允许的一切
```

**任何一张表漏开 RLS，该表就对全互联网开放读写。**

### 3.2 分层可见性

| 身份 | 可见范围 |
|---|---|
| `anon`（未登录） | 学校、专业、课程、图书分类、书目、**在售**商品、活动 |
| `authenticated` 学生 | 上述 + 自己的档案/地址/订单/回收单/碳流水/券/通知 |
| `authenticated` 运营 | 上述 + 全部档案（认证审核）、全部挂牌（质检）、定价规则 |
| `authenticated` 管理员 | 全部 + 审计日志 + 财务预测 + 敏感性分析 |
| `service_role` | 全部（绕过 RLS），仅用于 Edge Functions |

### 3.3 特殊设计

**只增不改的四张表**（不提供任何 INSERT/UPDATE/DELETE 策略）：

| 表 | 原因 |
|---|---|
| `carbon_records` | 碳减排数据必须可核验，不能让用户伪造 |
| `locker_usage_logs` | 设备事件流水，只应由硬件 webhook 写入 |
| `audit_logs` | 等保 2.0 要求：审计记录不可篡改、不可删除 |
| `user_coupons` | 券的发放与核销必须走服务端，防止用户自行造券 |

它们的写入只能由 `service_role`（Edge Functions）完成。

**列级防护**（RLS 无法按列授权，用触发器补足）：

| 触发器 | 作用 |
|---|---|
| `trg_profiles_protect_sensitive` | 阻止用户自行修改 `role`、`verify_status`、`credit_score`、`points_balance`、`carbon_total_kg`、`blacklist_reason` |
| `trg_notifications_protect_columns` | 普通用户只能改通知的已读状态，不能篡改内容 |

**为什么用触发器而不是列级 GRANT**：本项目用 `create table` 建表，
Supabase 默认授予 `authenticated` 所有列权限。用 BEFORE UPDATE 触发器
「保留原值」比撤销列权限更易维护，也不会误伤后台的正常更新。

### 3.4 业务风控已落库

| 约束 | 对应商业计划书 | 实现 |
|---|---|---|
| 未通过 ISBN 校验的书目禁止上架 | 9.1 节第一层风控 | `trg_listings_book_verified` |
| 低置信度 AI 结果转人工复核 | 9.1 节第二层风控 | `listings.need_manual_review` + 部分索引 |
| 黑名单用户禁止发布与交易 | 9.1 节 | `is_blacklisted()` 纳入 listings / orders 策略 |
| 碳减排系数必须带来源 | 10.1 节「数据可核验」 | `trg_carbon_records_consistency` |
| 订单状态不可跳级 | 交易安全 | `trg_orders_status_transition` |
| 同一卖家不可重复上架同一书目 | 防超卖 | `uq_listings_one_active_per_seller_book` |
| 租赁押金 = 售价 80% | 4.2.2 节 | `trg_rentals_deposit_ratio`（告警不阻断） |
| 订单完成后清空取件码 | 最小化凭据留存 | `trg_orders_sync_timestamps` |

---

## 四、测试账号

`seed.sql` 创建了 6 个账号，密码统一为 **`Test@123456`**：

| 邮箱 | 角色 | 用途 |
|---|---|---|
| `student.a@example.com` | 已认证学生 | 卖方，已发布多册图书 |
| `student.b@example.com` | 已认证学生 | 买方，含默认收货地址 |
| `ambassador@example.com` | 校园大使 | 推广角色验证 |
| `operator@example.com` | 运营人员 | 后台数据可见性验证 |
| `admin@example.com` | 管理员 | 定价规则与审计日志验证 |
| `student.pending@example.com` | 待认证学生 | **验证未认证不可发布** |

> 🔑 这些账号仅用于本地与预发布环境，**生产环境不得存在**。

---

## 五、常见问题

### Q1：`supabase db push` 报「relation already exists」

说明数据库中存在迁移记录之外的对象（多因曾在仪表盘手工改过结构）。
处理方式：用 `supabase db diff` 对比实际结构与迁移，人工确认后清理差异，
**不要**直接删除迁移记录表 `supabase_migrations.schema_migrations`。

### Q2：RLS 测试全部通过，但线上仍能越权读到数据

检查三点：
1. 该表是否 `enable row level security` **且** `force row level security`；
2. 是否对该表执行过 `grant select to anon` —— **GRANT 与 RLS 是两道门，缺一不可**；
3. 是否通过 `service_role` 访问（它会绕过 RLS，只应在服务端使用）。

### Q3：想给某张表新增枚举取值

`ALTER TYPE ... ADD VALUE` 在事务块中有限制，因此：
**单独新建一个迁移文件**，只放这一条语句，不要与其他 DDL 混写。

### Q4：如何回滚某个迁移

Supabase CLI 不支持自动回滚。回滚需：
1. 人工编写反向迁移文件（`drop table` / `drop policy` 等）；
2. 先在生产执行反向迁移，再从代码库删除原迁移文件；
3. 生产与代码库必须保持一致，不可只改一边。

---

## 六、上线前检查清单

- [ ] 本地 `supabase db reset` 无错误
- [ ] `rls_test.sql` 全部通过（含「★ 方法自检」项）
- [ ] 所有业务表已 `enable` + `force` RLS
- [ ] `carbon_records` / `user_coupons` / `locker_usage_logs` / `audit_logs`
      未对 `authenticated` 授予 INSERT/UPDATE/DELETE
- [ ] `pricing_rules` 未对 `anon` 授予 SELECT
- [ ] `pricing_rules.source_note` 与 `sensitivity_analysis.basis_note` 无空值
- [ ] 生产环境**未**执行 `seed.sql`
- [ ] 已确认 `service_role` key 只存在于 Edge Function Secrets
