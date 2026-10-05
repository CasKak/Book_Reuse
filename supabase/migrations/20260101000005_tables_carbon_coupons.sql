-- ============================================================================
-- 迁移 0005：C 组表 · 碳账户与积分
-- ============================================================================
-- 表：carbon_records、campaigns、user_coupons
--
-- 设计要点（对应商业计划书 10.1 节「数据可核验」原则）：
--   碳减排系数必须入库，且每条流水必须记录：
--     · factor_used    实际使用的系数
--     · factor_source  系数来源说明（不可为空）
--     · is_estimated   是否测算值（当前全部为 true，因为没有实测数据）
--   前端展示碳减排量时必须同时展示「测算参数，非实测值」提示。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- campaigns 营销活动
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  campaign_type  text not null,                       -- graduation / semester_start / daily / donation
  description    text,
  school_id      uuid references public.schools (id) on delete cascade,  -- null = 全平台
  points_reward  integer not null default 0 check (points_reward >= 0),
  cover_url      text,
  start_at       timestamptz not null,
  end_at         timestamptz not null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint chk_campaigns_time_range check (end_at > start_at),
  constraint chk_campaigns_type check (
    campaign_type in ('graduation', 'semester_start', 'daily', 'donation')
  )
);

comment on table public.campaigns is
  '营销活动。对应商业计划书 5.2 节毕业季、开学季、日常运营三阶段。';

create index idx_campaigns_active on public.campaigns (is_active, start_at, end_at);
create index idx_campaigns_school on public.campaigns (school_id);
create index idx_campaigns_type on public.campaigns (campaign_type);

create trigger trg_campaigns_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- carbon_records 碳账户流水
-- ---------------------------------------------------------------------------
create table public.carbon_records (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  action         public.carbon_action not null,
  ref_table      text,                                -- 关联表名：orders / listings / donations
  ref_id         uuid,                                -- 关联记录 id（弱引用，不设外键）
  book_count     integer not null default 1 check (book_count > 0),
  carbon_kg      numeric(10, 3) not null,             -- 单册减排量 × 册数
  factor_used    numeric(10, 4) not null,             -- 实际使用的单册减排系数
  factor_source  text not null,                       -- ⚠️ 系数来源，不可为空
  is_estimated   boolean not null default true,       -- true = 测算值，非实测
  created_at     timestamptz not null default now()
);

comment on table public.carbon_records is
  '碳账户流水。只增不改：不提供 UPDATE / DELETE 策略，仅服务端可写入。';
comment on column public.carbon_records.factor_source is
  '⚠️ 系数来源说明，必填。如「ISO 14040/14044 参照值，示例参数，待实测校准」。'
  '留空即视为不可对外展示的数据。';
comment on column public.carbon_records.is_estimated is
  'true 表示按测算参数换算，非实测值。前端展示时必须同步提示。';

create index idx_carbon_user on public.carbon_records (user_id, created_at desc);
create index idx_carbon_action on public.carbon_records (action);
create index idx_carbon_ref on public.carbon_records (ref_table, ref_id);

-- ---------------------------------------------------------------------------
-- user_coupons 用户优惠券 / 积分兑换券
-- ---------------------------------------------------------------------------
create table public.user_coupons (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  campaign_id      uuid references public.campaigns (id) on delete set null,
  code             text not null unique,
  title            text not null,
  discount_amount  numeric(12, 2) check (discount_amount >= 0),
  discount_rate    numeric(4, 3) check (discount_rate between 0 and 1),
  min_amount       numeric(12, 2) not null default 0 check (min_amount >= 0),
  points_cost      integer not null default 0 check (points_cost >= 0),
  status           public.coupon_status not null default 'unused',
  expired_at       timestamptz,
  used_at          timestamptz,
  used_order_id    uuid references public.orders (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- 抵扣方式二选一
  constraint chk_user_coupons_discount check (
    (discount_amount is not null and discount_rate is null)
    or (discount_amount is null and discount_rate is not null)
  ),
  -- 已使用必须有使用时间与订单
  constraint chk_user_coupons_used check (
    status <> 'used' or (used_at is not null and used_order_id is not null)
  )
);

comment on table public.user_coupons is '用户持有的优惠券 / 积分兑换券。核销须走服务端。';

create index idx_user_coupons_user on public.user_coupons (user_id, status);
create index idx_user_coupons_campaign on public.user_coupons (campaign_id);
create index idx_user_coupons_expire on public.user_coupons (expired_at) where status = 'unused';

create trigger trg_user_coupons_updated_at
  before update on public.user_coupons
  for each row execute function public.set_updated_at();
