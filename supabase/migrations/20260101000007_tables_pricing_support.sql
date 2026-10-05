-- ============================================================================
-- 迁移 0007：E 组（算法与定价）+ F 组（支撑）表
-- ============================================================================
-- 表：pricing_rules、sensitivity_analysis、cashflow_forecast、
--     notifications、audit_logs
--
-- 设计要点：
--   1. 定价系数是商业机密（商业计划书 3.2 节核心竞争力），
--      因此 E 组三张表仅运营/管理员可见，普通用户不可读。
--   2. 所有来自商业计划书的测算数字必须用 is_example 标记为示例数据。
--   3. audit_logs 只增不改：不提供 UPDATE / DELETE 策略。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 供 RLS 使用的辅助函数：当前用户是否为学生或校园大使
-- ---------------------------------------------------------------------------
-- 用途：限制普通用户只能查看已上架商品，避免待审核 / 已下架商品被提前看到。
-- ---------------------------------------------------------------------------
create or replace function public.auth_is_student_side()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('student', 'ambassador')
      and deleted_at is null
  );
$$;

comment on function public.auth_is_student_side() is
  '当前用户是否属于学生侧角色（student / ambassador）。RLS 中用于限制可见范围。';

-- ---------------------------------------------------------------------------
-- pricing_rules 定价规则（系数配置）
-- ---------------------------------------------------------------------------
create table public.pricing_rules (
  id              uuid primary key default gen_random_uuid(),
  rule_type       text not null,                      -- base_discount / condition / supply_demand / time_decay
  rule_key        text not null,                      -- 如 like_new、good、tier_1
  rule_value      numeric(10, 4) not null,            -- 系数值
  min_value       numeric(10, 4),                     -- 适用区间下限（时效系数按周转天数分档）
  max_value       numeric(10, 4),                     -- 适用区间上限
  school_id       uuid references public.schools (id) on delete cascade,  -- null = 平台默认
  source_note     text not null,                      -- ⚠️ 来源说明，不可为空
  is_active       boolean not null default true,
  effective_from  timestamptz not null default now(),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint chk_pricing_rules_type check (
    rule_type in ('base_discount', 'condition', 'supply_demand', 'time_decay')
  ),
  constraint chk_pricing_rules_range check (
    min_value is null or max_value is null or min_value <= max_value
  ),
  constraint chk_pricing_rules_value_nonneg check (rule_value >= 0)
);

comment on table public.pricing_rules is
  '定价系数配置表。对应公式：二手定价 = 图书定价 × 基础折扣 × 品相 × 供需 × 时效。'
  '所有系数必须可在后台调整，不得硬编码在前端或 Edge Function 中。';
comment on column public.pricing_rules.source_note is
  '⚠️ 系数来源说明，必填。示例值须明确标注「示例值，待试点校准」，'
  '对应商业计划书「不虚构数据」要求。';

-- 同一规则键在同一学校下唯一（school_id 为 null 表示平台默认规则）
create unique index uq_pricing_rules_scope
  on public.pricing_rules (rule_type, rule_key, coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index idx_pricing_rules_active on public.pricing_rules (rule_type, is_active);
create index idx_pricing_rules_school on public.pricing_rules (school_id);

create trigger trg_pricing_rules_updated_at
  before update on public.pricing_rules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sensitivity_analysis 敏感性分析（商业计划书 8.6 节）
-- ---------------------------------------------------------------------------
create table public.sensitivity_analysis (
  id                     uuid primary key default gen_random_uuid(),
  scenario_name          text not null,               -- 保守 / 基准 / 乐观
  variable               text not null,               -- 回收成本 / 平均售价 / 综合售出率 / 月固定成本
  change_pct             numeric(6, 2) not null,      -- 变动幅度，如 +10、-15
  impact_gross_margin    numeric(6, 2),               -- 对毛利率影响（百分点）
  impact_monthly_profit  numeric(12, 2),              -- 对月毛利影响（元）
  basis_note             text not null,               -- ⚠️ 测算依据，必填
  is_example             boolean not null default true,  -- ⚠️ 示例数据标记
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint uq_sensitivity_scope unique (scenario_name, variable, change_pct)
);

comment on table public.sensitivity_analysis is
  '敏感性分析结果。数据来源为商业计划书 8.6 节，均为示例测算，须以试点实测校准。';
comment on column public.sensitivity_analysis.is_example is
  'true 表示该行是示例数据，界面展示时必须同步标注。';

create index idx_sensitivity_scenario on public.sensitivity_analysis (scenario_name);

create trigger trg_sensitivity_analysis_updated_at
  before update on public.sensitivity_analysis
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- cashflow_forecast 现金流预测（商业计划书 8.4 节）
-- ---------------------------------------------------------------------------
create table public.cashflow_forecast (
  id              uuid primary key default gen_random_uuid(),
  scenario_name   text not null,                      -- 保守 / 基准 / 乐观
  period_label    text not null,                      -- 如 Q1、2026-01
  period_start    date not null,
  period_end      date not null,
  revenue         numeric(12, 2) not null default 0,
  variable_cost   numeric(12, 2) not null default 0,
  fixed_cost      numeric(12, 2) not null default 0,
  hardware_capex  numeric(12, 2) not null default 0,
  net_cashflow    numeric(12, 2) not null default 0,
  ending_cash     numeric(12, 2) not null default 0,
  is_example      boolean not null default true,      -- ⚠️ 示例数据标记
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint uq_cashflow_scope unique (scenario_name, period_label),
  constraint chk_cashflow_period check (period_end >= period_start)
);

comment on table public.cashflow_forecast is
  '现金流预测。数据来源为商业计划书 8.4 节 Q1-Q6 目标情景，均为示例数据。';
comment on column public.cashflow_forecast.ending_cash is
  '期末现金余额。等于上期期末现金 + 本期净现金流，导入时须自校验连续性。';

create index idx_cashflow_scenario on public.cashflow_forecast (scenario_name, period_start);

create trigger trg_cashflow_forecast_updated_at
  before update on public.cashflow_forecast
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- notifications 通知
-- ---------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        public.notification_type not null,
  title       text not null,
  content     text,
  link        text,                                   -- 前端跳转路径
  is_read     boolean not null default false,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint chk_notifications_read check (
    not is_read or read_at is not null
  )
);

comment on table public.notifications is '站内通知。仅本人可读，服务端写入。';

create index idx_notifications_user on public.notifications (user_id, created_at desc);
create index idx_notifications_unread on public.notifications (user_id, is_read)
  where not is_read;

-- ---------------------------------------------------------------------------
-- audit_logs 审计日志
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles (id) on delete set null,
  actor_role   public.user_role,                      -- 操作时的角色快照
  action       public.audit_action not null,
  table_name   text not null,
  record_id    uuid,
  before_data  jsonb,                                 -- 变更前（须脱敏）
  after_data   jsonb,                                 -- 变更后（须脱敏）
  ip_address   inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);

comment on table public.audit_logs is
  '审计日志。只增不改：不提供 UPDATE / DELETE 策略。等保 2.0 要求留存 ≥6 个月。';
comment on column public.audit_logs.actor_role is
  '操作发生时的角色快照。用户角色后续变更不影响历史记录的准确性。';
comment on column public.audit_logs.before_data is
  '变更前数据。⚠️ 写入前必须脱敏，禁止记录手机号、地址等敏感个人信息原文。';
comment on column public.audit_logs.created_at is
  '记录时间。审计日志不允许更新，因此无需 updated_at。';

create index idx_audit_actor_time on public.audit_logs (actor_id, created_at desc);
create index idx_audit_table_record on public.audit_logs (table_name, record_id);
create index idx_audit_action_time on public.audit_logs (action, created_at desc);
create index idx_audit_created on public.audit_logs (created_at desc);
