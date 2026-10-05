-- ============================================================================
-- 迁移 0003：A 组表 · 用户与学校
-- ============================================================================
-- 表：schools、majors、courses、profiles、user_addresses
--
-- 设计要点：
--   1. profiles.id 直接引用 auth.users(id)，一对一。
--   2. 金额一律 numeric(12,2)，禁止 float。
--   3. 敏感字段（phone、地址明细）不通过公开视图暴露。
--   4. 新用户注册时自动创建 profiles 记录（触发器）。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- schools 学校
-- ---------------------------------------------------------------------------
create table public.schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  province    text,
  city        text,
  level       text,                                  -- 本科 / 专科 / 职业院校
  is_active   boolean not null default true,         -- 是否开放服务
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.schools is '学校。种子数据中的学校为示例，正式使用前须替换为真实合作院校。';
comment on column public.schools.is_active is 'false 时该学校不开放新用户注册与交易。';

create index idx_schools_province on public.schools (province);
create index idx_schools_active on public.schools (is_active) where is_active;

create trigger trg_schools_updated_at
  before update on public.schools
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- majors 专业
-- ---------------------------------------------------------------------------
create table public.majors (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  name        text not null,
  college     text,                                  -- 所属学院
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint uq_majors_school_name unique (school_id, name)
);

comment on table public.majors is '专业。用于图书供需匹配与筛选维度。';

create index idx_majors_school on public.majors (school_id);

create trigger trg_majors_updated_at
  before update on public.majors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- courses 课程
-- ---------------------------------------------------------------------------
create table public.courses (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete cascade,
  major_id      uuid references public.majors (id) on delete set null,  -- null = 公共课
  name          text not null,
  semester      text,                                -- 形如 2026-spring
  enroll_count  integer not null default 0 check (enroll_count >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.courses is '课程。关联教材形成「课程—教材」映射，支撑开学季教材组合包。';
comment on column public.courses.enroll_count is
  '选课人数。是动态定价中「供需系数」的输入（选课人数 ÷ 当前库存量）。示例值，须以教务数据校准。';

create index idx_courses_school_major on public.courses (school_id, major_id);
create index idx_courses_semester on public.courses (semester);

create trigger trg_courses_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- profiles 用户档案（与 auth.users 一对一）
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  nickname          text,
  avatar_url        text,                            -- Storage 私有桶路径，非公开 URL
  phone             text,                            -- ⚠️ 敏感：建议应用层加密，展示时脱敏
  role              public.user_role not null default 'student',
  school_id         uuid references public.schools (id) on delete set null,
  major_id          uuid references public.majors (id) on delete set null,
  grade             smallint check (grade between 1 and 8),
  enroll_year       smallint check (enroll_year between 2000 and 2100),
  verify_status     public.verify_status not null default 'unverified',
  verified_at       timestamptz,
  credit_score      integer not null default 100 check (credit_score >= 0),
  blacklist_reason  text,                            -- 版权违规黑名单原因（计划书 9.1 节）
  points_balance    integer not null default 0 check (points_balance >= 0),
  carbon_total_kg   numeric(10, 3) not null default 0 check (carbon_total_kg >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

comment on table public.profiles is
  '用户档案。与 auth.users 一对一。含个人信息与敏感字段，公开可见性由 RLS 与视图控制。';
comment on column public.profiles.phone is
  '⚠️ 敏感个人信息。建议应用层加密存储，接口返回时脱敏为 138****8888。';
comment on column public.profiles.points_balance is
  '积分余额（冗余字段，便于读取）。权威数据以积分流水为准，写入须走服务端。';
comment on column public.profiles.carbon_total_kg is
  '累计碳减排量 kg CO₂e（冗余字段）。权威数据以 carbon_records 为准，写入须走服务端。';
comment on column public.profiles.blacklist_reason is
  '非空表示该用户因版权违规被列入黑名单，禁止发布与交易。';

create index idx_profiles_school on public.profiles (school_id);
create index idx_profiles_major on public.profiles (major_id);
create index idx_profiles_role on public.profiles (role);
create index idx_profiles_verify on public.profiles (verify_status);
create index idx_profiles_blacklist on public.profiles (id) where blacklist_reason is not null;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 新用户注册时自动建档
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nickname', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'auth.users 插入后自动创建对应 profiles 记录，避免前端注册流程遗漏建档。';

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 公开档案视图
-- ---------------------------------------------------------------------------
-- 目的：图书详情页需要展示卖家昵称与学校，但 phone 等敏感字段绝不能暴露。
--       通过视图固定可公开列，避免策略层遗漏导致字段泄漏。
-- 注意：视图默认使用创建者的权限（security_invoker 关闭），
--       因此这里显式只选公开列，不依赖 RLS 过滤列。
-- ---------------------------------------------------------------------------
create view public.profiles_public
with (security_invoker = on) as
select
  id,
  nickname,
  avatar_url,
  school_id,
  major_id,
  grade,
  role,
  verify_status,
  credit_score,
  created_at
from public.profiles
where deleted_at is null;

comment on view public.profiles_public is
  '用户公开档案视图。只暴露昵称、头像、学校、专业、年级等非敏感字段，不含手机号与地址。';

-- ---------------------------------------------------------------------------
-- user_addresses 收货 / 收书地址
-- ---------------------------------------------------------------------------
create table public.user_addresses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  label        text,                                 -- 如「3 号宿舍楼」
  campus_area  text,                                 -- 校区
  building     text,                                 -- 楼栋（精度到楼栋，不要求门牌）
  detail       text,                                 -- ⚠️ 敏感：补充说明，建议加密
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.user_addresses is
  '校内收货/收书地址。按最小必要原则，精度限制到楼栋，不要求精确门牌。';
comment on column public.user_addresses.detail is
  '⚠️ 敏感个人信息。建议应用层加密存储。';

create index idx_user_addresses_user on public.user_addresses (user_id);
-- 每个用户最多一个默认地址
create unique index uq_user_addresses_default
  on public.user_addresses (user_id)
  where is_default;

create trigger trg_user_addresses_updated_at
  before update on public.user_addresses
  for each row execute function public.set_updated_at();
