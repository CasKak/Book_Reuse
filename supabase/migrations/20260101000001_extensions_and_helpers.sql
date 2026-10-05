-- ============================================================================
-- 迁移 0001：扩展与通用辅助函数
-- ============================================================================
-- 说明：
--   本迁移只创建扩展与不依赖具体业务表的辅助函数，必须最先执行。
--
-- ⚠️ 执行范围：仅生成迁移文件。执行需由人工在预发布环境确认后进行：
--      supabase db push           （预发布）
--      supabase db push --linked  （生产，须先完成预发布验收）
--    严禁在 Supabase 仪表盘直接修改生产库结构。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 扩展
-- ---------------------------------------------------------------------------
-- 说明：这里**不显式指定 schema**，交由 Supabase 的默认策略处理。
--   原因：若把 pgcrypto 装到 extensions schema，则 gen_random_uuid() 的解析
--   将依赖 search_path，而本文件中的函数都显式固定了 search_path = public，
--   会导致建表默认值调用失败。
--   Supabase 的既有配置已保证：pgcrypto 函数（gen_random_uuid / crypt /
--   gen_salt）在 public 与 extensions 均可解析，trigram 运算符类可在
--   extensions schema 下引用（见 0004 的 gin_trgm_ops 用法）。
-- ---------------------------------------------------------------------------

-- UUID 主键生成（gen_random_uuid）与密码哈希（crypt / gen_salt）
create extension if not exists "pgcrypto";

-- 模糊搜索（图书书名 / 作者检索），支撑 idx_books_title_trgm
create extension if not exists "pg_trgm";

-- 跨表查询性能诊断（可选，便于排查慢查询）
create extension if not exists "pg_stat_statements";

-- ---------------------------------------------------------------------------
-- 2. 通用辅助函数
-- ---------------------------------------------------------------------------

-- 自动维护 updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  '通用触发器函数：写入前把 updated_at 更新为当前时间。';

-- ---------------------------------------------------------------------------
-- 3. 权限辅助函数（SECURITY DEFINER）
-- ---------------------------------------------------------------------------
-- 设计说明：
--   RLS 策略中若直接子查询 profiles 表，会触发 profiles 自身的 RLS，
--   造成递归与性能问题。因此用 security definer 函数绕过 RLS 读取角色，
--   并固定 search_path 防止 search_path 注入。
-- ---------------------------------------------------------------------------

-- 从 JWT 声明中读取角色，避免查库（性能最优）
create or replace function public.jwt_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'user_role',
    'anon'
  );
$$;

comment on function public.jwt_role() is
  '读取当前请求 JWT 中的 user_role 声明。未登录返回 anon。';

-- 是否管理员
create or replace function public.is_admin()
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
      and role = 'admin'
      and deleted_at is null
  );
$$;

comment on function public.is_admin() is
  '当前登录用户是否为管理员。security definer 以避免 RLS 递归。';

-- 是否运营人员或管理员
create or replace function public.is_staff()
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
      and role in ('operator', 'admin')
      and deleted_at is null
  );
$$;

comment on function public.is_staff() is
  '当前登录用户是否为运营人员或管理员。用于后台数据可见性判断。';

-- 当前用户的学校
create or replace function public.current_school_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select school_id from public.profiles where id = auth.uid();
$$;

comment on function public.current_school_id() is
  '当前登录用户所属学校，用于同校数据可见性判断。';

-- 当前用户是否已通过学生认证
create or replace function public.is_verified_student()
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
      and verify_status = 'verified'
      and deleted_at is null
  );
$$;

comment on function public.is_verified_student() is
  '当前用户是否已通过学生认证。发布图书要求认证通过。';

-- 当前用户是否在黑名单中（版权风控，对应商业计划书 9.1 节）
create or replace function public.is_blacklisted()
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
      and blacklist_reason is not null
  );
$$;

comment on function public.is_blacklisted() is
  '当前用户是否因版权违规被列入黑名单。黑名单用户禁止发布与交易。';
