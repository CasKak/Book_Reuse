-- ============================================================================
-- RLS 安全策略测试
-- ============================================================================
-- 目的：验证行级安全策略真的生效，而不是「以为生效」。
--
-- 为什么必须测
-- ---------------------------------------------------------------------------
--   anon key 是公开的，任何人都能用它直接访问 PostgREST 接口。
--   RLS 是唯一的数据防线：任何一张表漏配策略，该表即对全互联网开放。
--
-- ⚠️ 关键实现细节：必须切换数据库角色
-- ---------------------------------------------------------------------------
--   测试脚本以 postgres（超级用户）身份连接。超级用户**始终绕过 RLS**，
--   因此若只设置 request.jwt.claims 而不切换角色，所有查询都会返回全表数据，
--   测试将全部「通过」却毫无意义。
--   因此本脚本统一使用 SET LOCAL ROLE 切到 anon / authenticated 角色，
--   在事务内完成断言后回滚，既保证策略生效，又不残留数据。
--
-- 运行方式
-- ---------------------------------------------------------------------------
--   本地（推荐）：
--       supabase start
--       supabase db reset
--       psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" \
--            -f supabase/tests/rls_test.sql
--
--   预发布环境：
--       psql "postgresql://postgres:<密码>@db.<project-ref>.supabase.co:5432/postgres" \
--            -f supabase/tests/rls_test.sql
--
--   🚫 不要对生产环境运行（脚本会写入测试订单后回滚，但仍不建议）。
--
-- 输出
-- ---------------------------------------------------------------------------
--   逐项 [PASS] / [FAIL]，最后打印汇总；全部通过时输出 ALL TESTS PASSED。
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

-- 结果收集表（普通表，因跨事务写入）
drop table if exists public._rls_test_results;
create table public._rls_test_results (
  seq      serial primary key,
  category text not null,
  name     text not null,
  passed   boolean not null,
  detail   text
);

-- ---------------------------------------------------------------------------
-- 辅助函数
-- ---------------------------------------------------------------------------

-- 记录结果
create or replace function public._rls_ok(
  p_category text, p_name text, p_condition boolean, p_detail text default null
) returns void
language plpgsql
as $$
begin
  insert into public._rls_test_results (category, name, passed, detail)
  values (p_category, p_name, coalesce(p_condition, false), p_detail);

  if coalesce(p_condition, false) then
    raise notice '[PASS] % / %', p_category, p_name;
  else
    raise warning '[FAIL] % / %  %', p_category, p_name, coalesce('— ' || p_detail, '');
  end if;
end;
$$;

-- 以指定身份统计查询行数
--   p_as_anon = true  → 切换 anon 角色（未登录）
--   p_user_id         → 切换 authenticated 角色，并把该用户写入 JWT 声明
create or replace function public._rls_count(
  p_sql text, p_user_id uuid default null, p_as_anon boolean default false
) returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  if p_as_anon then
    set local role anon;
    perform set_config('request.jwt.claims', '', true);
  elsif p_user_id is not null then
    set local role authenticated;
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
      true
    );
  end if;

  execute format('select count(*) from (%s) t', p_sql) into v_count;

  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_count;
end;
$$;

-- 以指定身份尝试执行语句；返回是否**抛错**（true = 被策略拒绝，符合预期）
create or replace function public._rls_blocked(
  p_sql text, p_user_id uuid default null, p_as_anon boolean default false
) returns boolean
language plpgsql
as $$
begin
  if p_as_anon then
    set local role anon;
    perform set_config('request.jwt.claims', '', true);
  elsif p_user_id is not null then
    set local role authenticated;
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
      true
    );
  end if;

  begin
    execute p_sql;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    return false;                        -- 未抛错 = 策略未拦住
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    return true;                         -- 抛错 = 预期行为
  end;
end;
$$;

-- 测试固定 UUID（与 supabase/seed.sql 保持一致）
\set student_a  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
\set student_b  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
\set operator   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'
\set admin      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'
\set pending    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'


-- ============================================================================
-- 0. 基础检查
-- ============================================================================
do $$
declare
  v_missing text;
  v_total   integer;
  v_forced  integer;
  v_probe   integer;
begin
  -- 0.1 是否所有 public 表都启用了 RLS
  select string_agg(c.relname, ', ' order by c.relname)
  into v_missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname not like '\_rls\_%'
    and not c.relrowsecurity;

  perform public._rls_ok('0.基础', '所有 public 表已启用 RLS', v_missing is null,
    coalesce('未启用 RLS 的表：' || v_missing, null));

  -- 0.2 是否启用 FORCE RLS
  select count(*) into v_total
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname not like '\_rls\_%';

  select count(*) into v_forced
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname not like '\_rls\_%'
    and c.relforcerowsecurity;

  perform public._rls_ok('0.基础', '所有 public 表已启用 FORCE RLS', v_total = v_forced,
    format('总数 %s，FORCE %s', v_total, v_forced));

  -- 0.3 依赖角色存在（Supabase 默认提供 anon / authenticated）
  perform public._rls_ok('0.基础', '数据库角色 anon 存在',
    exists (select 1 from pg_roles where rolname = 'anon'));
  perform public._rls_ok('0.基础', '数据库角色 authenticated 存在',
    exists (select 1 from pg_roles where rolname = 'authenticated'));

  -- 0.4 种子数据是否已导入（后续断言依赖它）
  select count(*) into v_probe from public.listings;
  perform public._rls_ok('0.基础', '种子数据已导入（存在挂牌记录）', v_probe > 0,
    format('当前挂牌 %s 条；若为 0 请先执行 supabase/seed.sql', v_probe));

  -- 0.5 ★ 测试方法自检：确认切到 anon 后确实受到限制
  --      若本项失败，说明测试方法本身无效，其余结果不可信。
  perform public._rls_ok('0.基础', '★ 方法自检：anon 角色看不到订单（证明 RLS 生效）',
    public._rls_count('select 1 from public.orders', null, true) = 0,
    '若此项失败，说明角色切换未生效，后续所有结果均不可信');
end $$;


-- ============================================================================
-- 1. 未登录访客（anon）
-- ============================================================================
do $$
begin
  perform public._rls_ok('1.匿名', '可读学校列表',
    public._rls_count('select 1 from public.schools', null, true) > 0);

  perform public._rls_ok('1.匿名', '可读图书书目',
    public._rls_count('select 1 from public.books', null, true) > 0);

  perform public._rls_ok('1.匿名', '可读图书分类',
    public._rls_count('select 1 from public.book_categories', null, true) > 0);

  perform public._rls_ok('1.匿名', '可读在售商品（支持分享链接）',
    public._rls_count($$select 1 from public.listings where status = 'active'$$, null, true) > 0);

  -- 关键：非在售商品不可见
  perform public._rls_ok('1.匿名', '看不到待审核商品',
    public._rls_count($$select 1 from public.listings where status = 'pending_review'$$, null, true) = 0);

  perform public._rls_ok('1.匿名', '看不到用户档案',
    public._rls_count('select 1 from public.profiles', null, true) = 0);

  perform public._rls_ok('1.匿名', '看不到订单',
    public._rls_count('select 1 from public.orders', null, true) = 0);

  perform public._rls_ok('1.匿名', '看不到碳账户流水',
    public._rls_count('select 1 from public.carbon_records', null, true) = 0);

  perform public._rls_ok('1.匿名', '看不到收货地址',
    public._rls_count('select 1 from public.user_addresses', null, true) = 0);

  perform public._rls_ok('1.匿名', '看不到定价规则（商业机密）',
    public._rls_count('select 1 from public.pricing_rules', null, true) = 0);

  perform public._rls_ok('1.匿名', '看不到财务预测',
    public._rls_count('select 1 from public.cashflow_forecast', null, true) = 0);

  perform public._rls_ok('1.匿名', '看不到审计日志',
    public._rls_count('select 1 from public.audit_logs', null, true) = 0);
end $$;


-- ============================================================================
-- 2. 学生 A —— 只能看自己的数据
-- ============================================================================
do $$
declare
  v_uid uuid := :'student_a';
begin
  perform public._rls_ok('2.学生A', '可读自己的档案',
    public._rls_count(format($$select 1 from public.profiles where id = '%s'$$, v_uid), v_uid) = 1);

  perform public._rls_ok('2.学生A', '看不到他人档案（防手机号泄漏）',
    public._rls_count(format($$select 1 from public.profiles where id <> '%s'$$, v_uid), v_uid) = 0);

  perform public._rls_ok('2.学生A', '可读自己的未上架挂牌',
    public._rls_count(
      format($$select 1 from public.listings where seller_id = '%s' and status <> 'active'$$, v_uid),
      v_uid) > 0);

  perform public._rls_ok('2.学生A', '可读公开档案视图（含他人昵称与学校）',
    public._rls_count('select 1 from public.profiles_public', v_uid) > 0);

  perform public._rls_ok('2.学生A', '看不到定价规则（商业机密）',
    public._rls_count('select 1 from public.pricing_rules', v_uid) = 0);

  perform public._rls_ok('2.学生A', '看不到审计日志',
    public._rls_count('select 1 from public.audit_logs', v_uid) = 0);
end $$;


-- ============================================================================
-- 3. 学生 B —— 与 A 的数据隔离
-- ============================================================================
do $$
declare
  v_b uuid := :'student_b';
  v_a uuid := :'student_a';
begin
  perform public._rls_ok('3.学生B', '看不到学生 A 的待审核挂牌',
    public._rls_count(
      format($$select 1 from public.listings where seller_id = '%s' and status = 'pending_review'$$, v_a),
      v_b) = 0);

  perform public._rls_ok('3.学生B', '看不到学生 A 的碳账户流水',
    public._rls_count(
      format($$select 1 from public.carbon_records where user_id = '%s'$$, v_a), v_b) = 0);

  perform public._rls_ok('3.学生B', '看不到学生 A 的收货地址',
    public._rls_count(
      format($$select 1 from public.user_addresses where user_id = '%s'$$, v_a), v_b) = 0);

  perform public._rls_ok('3.学生B', '看不到财务预测',
    public._rls_count('select 1 from public.cashflow_forecast', v_b) = 0);
end $$;


-- ============================================================================
-- 4. 未认证学生 —— 不得发布图书
-- ============================================================================
do $$
declare
  v_uid uuid := :'pending';
begin
  perform public._rls_ok('4.未认证', '未通过学生认证不能发布图书',
    public._rls_blocked(
      format($$insert into public.listings
                 (seller_id, book_id, listing_type, status, condition, price, school_id)
               values ('%s', '55555555-5555-4555-8555-555555555509',
                       'sell', 'draft', 'good', 10.00,
                       '11111111-1111-4111-8111-111111111111')$$, v_uid),
      v_uid),
    '预期被 listings_insert_own 策略拒绝（要求 verify_status = verified）');
end $$;


-- ============================================================================
-- 5. 版权风控 —— 未校验书目不得上架
-- ============================================================================
do $$
declare
  v_uid uuid := :'student_a';
begin
  perform public._rls_ok('5.版权风控', '未通过 ISBN 校验的书目禁止上架',
    public._rls_blocked(
      format($$insert into public.listings
                 (seller_id, book_id, listing_type, status, condition, price, school_id, published_at)
               values ('%s', '55555555-5555-4555-8555-555555555516',
                       'sell', 'active', 'good', 10.00,
                       '11111111-1111-4111-8111-111111111111', now())$$, v_uid),
      v_uid),
    '预期被 trg_listings_book_verified 触发器拒绝（is_verified = false）');
end $$;


-- ============================================================================
-- 6. 权限提升防护 —— 不得自行改角色与积分
-- ============================================================================
do $$
declare
  v_uid            uuid := :'student_a';
  v_pending        uuid := :'pending';
  v_role_after     text;
  v_points_before  integer;
  v_points_after   integer;
  v_verify_after   text;
begin
  select role::text, points_balance into v_role_after, v_points_before
  from public.profiles where id = v_uid;

  -- 6.1 尝试把自己改成管理员
  perform public._rls_count(
    format($$update public.profiles set role = 'admin' where id = '%s' returning 1$$, v_uid),
    v_uid);

  select role::text into v_role_after from public.profiles where id = v_uid;
  perform public._rls_ok('6.提权防护', '普通用户无法把自己改成管理员',
    v_role_after <> 'admin', format('当前角色仍为 %s', v_role_after));

  -- 6.2 尝试给自己加积分
  perform public._rls_count(
    format($$update public.profiles set points_balance = 999999 where id = '%s' returning 1$$, v_uid),
    v_uid);

  select points_balance into v_points_after from public.profiles where id = v_uid;
  perform public._rls_ok('6.提权防护', '普通用户无法自行增加积分',
    v_points_after = v_points_before,
    format('改前 %s，改后 %s', v_points_before, v_points_after));

  -- 6.3 尝试篡改学生认证状态
  perform public._rls_count(
    format($$update public.profiles set verify_status = 'verified' where id = '%s' returning 1$$, v_pending),
    v_pending);

  select verify_status::text into v_verify_after from public.profiles where id = v_pending;
  perform public._rls_ok('6.提权防护', '未认证学生无法自行改为已认证',
    v_verify_after = 'pending', format('当前认证状态：%s', v_verify_after));

  -- 6.4 尝试篡改碳减排总量
  perform public._rls_count(
    format($$update public.profiles set carbon_total_kg = 99999 where id = '%s' returning 1$$, v_uid),
    v_uid);

  perform public._rls_ok('6.提权防护', '普通用户无法篡改碳减排总量',
    (select carbon_total_kg from public.profiles where id = v_uid) < 99999);
end $$;


-- ============================================================================
-- 7. 订单可见性 —— 仅买卖双方 + 运营
-- ============================================================================
do $$
declare
  v_order_id  uuid;
  v_buyer     uuid := :'student_b';
  v_seller    uuid := :'student_a';
  v_admin     uuid := :'admin';
  v_outsider  uuid := :'pending';
  v_listing   uuid := '66666666-6666-4666-8666-666666666605';
begin
  -- 7.1 以学生 B 身份下单（调用 place_order 事务函数）
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);

  select (public.place_order(v_listing, 'campus_delivery'::public.delivery_method,
                             null, null, 'RLS 测试订单')).id
  into v_order_id;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  perform public._rls_ok('7.订单', '下单成功（place_order 事务函数可用）', v_order_id is not null);

  if v_order_id is null then
    return;   -- 下单失败则后续断言无意义
  end if;

  perform public._rls_ok('7.订单', '买方可见自己的订单',
    public._rls_count(format($$select 1 from public.orders where id = '%s'$$, v_order_id), v_buyer) = 1);

  perform public._rls_ok('7.订单', '卖方可见该订单',
    public._rls_count(format($$select 1 from public.orders where id = '%s'$$, v_order_id), v_seller) = 1);

  perform public._rls_ok('7.订单', '无关用户看不到该订单',
    public._rls_count(format($$select 1 from public.orders where id = '%s'$$, v_order_id), v_outsider) = 0);

  perform public._rls_ok('7.订单', '管理员可见该订单（用于客服处理）',
    public._rls_count(format($$select 1 from public.orders where id = '%s'$$, v_order_id), v_admin) = 1);

  perform public._rls_ok('7.订单', '匿名看不到该订单',
    public._rls_count(format($$select 1 from public.orders where id = '%s'$$, v_order_id), null, true) = 0);

  perform public._rls_ok('7.订单', '订单明细随订单可见（买方）',
    public._rls_count(format($$select 1 from public.order_items where order_id = '%s'$$, v_order_id), v_buyer) = 1);

  perform public._rls_ok('7.订单', '无关用户看不到订单明细',
    public._rls_count(format($$select 1 from public.order_items where order_id = '%s'$$, v_order_id), v_outsider) = 0);

  -- 7.8 下单后商品转为已预定，匿名不可见
  perform public._rls_ok('7.订单', '下单后商品转为已预定，匿名不可见',
    public._rls_count(format($$select 1 from public.listings where id = '%s'$$, v_listing), null, true) = 0);

  -- 7.9 订单状态机：不允许从 pending_payment 直接跳到 completed
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);

  begin
    update public.orders set status = 'completed' where id = v_order_id;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    perform public._rls_ok('7.订单', '订单状态机阻止非法跳转（待支付 → 已完成）', false,
      '预期被 trg_orders_status_transition 拒绝');
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    perform public._rls_ok('7.订单', '订单状态机阻止非法跳转（待支付 → 已完成）', true);
  end;
end $$;


-- ============================================================================
-- 8. 只增不改的表 —— 碳流水、审计日志、优惠券
-- ============================================================================
do $$
declare
  v_uid uuid := :'student_a';
begin
  perform public._rls_ok('8.只增不改', '碳流水：本人可读',
    public._rls_count(
      format($$select 1 from public.carbon_records where user_id = '%s'$$, v_uid), v_uid) > 0);

  perform public._rls_ok('8.只增不改', '碳流水：前端无法直接插入（须走服务端）',
    public._rls_blocked(
      format($$insert into public.carbon_records
                 (user_id, action, book_count, carbon_kg, factor_used, factor_source)
               values ('%s', 'recycle', 1, 0.85, 0.85, '伪造数据')$$, v_uid),
      v_uid),
    '预期无 INSERT 策略而被拒绝');

  perform public._rls_ok('8.只增不改', '审计日志：普通用户不可读',
    public._rls_count('select 1 from public.audit_logs', v_uid) = 0);

  perform public._rls_ok('8.只增不改', '审计日志：普通用户不可伪造写入',
    public._rls_blocked(
      format($$insert into public.audit_logs (actor_id, action, table_name)
               values ('%s', 'insert', 'orders')$$, v_uid),
      v_uid));

  perform public._rls_ok('8.只增不改', '优惠券：前端无法自行发券',
    public._rls_blocked(
      format($$insert into public.user_coupons (user_id, code, title, discount_amount)
               values ('%s', 'FAKE-CODE-001', '伪造券', 100)$$, v_uid),
      v_uid));

  perform public._rls_ok('8.只增不改', '柜体日志：前端无法伪造写入',
    public._rls_blocked(
      $$insert into public.locker_usage_logs (locker_id, event)
        values ('88888888-8888-4888-8888-888888888801', 'deposit')$$,
      v_uid));
end $$;


-- ============================================================================
-- 9. 运营人员 —— 可读业务数据，但不可读审计日志
-- ============================================================================
do $$
declare
  v_op uuid := :'operator';
begin
  perform public._rls_ok('9.运营', '运营可读全部档案（用于认证审核）',
    public._rls_count('select 1 from public.profiles', v_op) > 1);

  perform public._rls_ok('9.运营', '运营可读待审核挂牌（用于质检）',
    public._rls_count($$select 1 from public.listings where status = 'pending_review'$$, v_op) > 0);

  perform public._rls_ok('9.运营', '运营可读定价规则（is_staff 允许）',
    public._rls_count('select 1 from public.pricing_rules', v_op) > 0);

  perform public._rls_ok('9.运营', '运营不可读审计日志（仅管理员）',
    public._rls_count('select 1 from public.audit_logs', v_op) = 0);
end $$;


-- ============================================================================
-- 10. 管理员 —— 完整可见性
-- ============================================================================
do $$
declare
  v_admin uuid := :'admin';
begin
  perform public._rls_ok('10.管理员', '可读审计日志',
    public._rls_count('select 1 from public.audit_logs', v_admin) >= 0);

  perform public._rls_ok('10.管理员', '可读财务预测',
    public._rls_count('select 1 from public.cashflow_forecast', v_admin) > 0);

  perform public._rls_ok('10.管理员', '可读敏感性分析',
    public._rls_count('select 1 from public.sensitivity_analysis', v_admin) > 0);

  perform public._rls_ok('10.管理员', '可读全部订单',
    public._rls_count('select 1 from public.orders', v_admin) >= 0);
end $$;


-- ============================================================================
-- 11. 结构级检查 —— 敏感字段与权限授予
-- ============================================================================
do $$
declare
  v_cols text;
begin
  -- 11.1 公开档案视图不得含敏感列
  select string_agg(column_name, ', ')
  into v_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles_public'
    and column_name in ('phone', 'blacklist_reason');

  perform public._rls_ok('11.结构', '公开档案视图不含 phone / blacklist_reason',
    v_cols is null, coalesce('意外暴露的列：' || v_cols, null));

  -- 11.2 只增不改的四张表不得对 authenticated 授予写权限
  select string_agg(table_name || ':' || privilege_type, ', ' order by table_name)
  into v_cols
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee = 'authenticated'
    and table_name in ('carbon_records', 'user_coupons', 'locker_usage_logs', 'audit_logs')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE');

  perform public._rls_ok('11.结构', '碳流水/券/柜体日志/审计日志未对前端授予写权限',
    v_cols is null, coalesce('意外授予：' || v_cols, null));

  -- 11.3 定价规则不得对 anon 授予 SELECT
  perform public._rls_ok('11.结构', '定价规则未对匿名角色授予查询权限',
    not exists (
      select 1 from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'pricing_rules'
        and grantee = 'anon'
    ));
end $$;


-- ============================================================================
-- 结果汇总
-- ============================================================================
do $$
declare
  v_total  integer;
  v_passed integer;
  v_failed integer;
  v_rec    record;
begin
  select count(*), count(*) filter (where passed), count(*) filter (where not passed)
  into v_total, v_passed, v_failed
  from public._rls_test_results;

  raise notice '';
  raise notice '============================================================';
  raise notice '  RLS 安全策略测试结果';
  raise notice '============================================================';

  if v_failed > 0 then
    raise notice '失败项明细：';
    for v_rec in
      select category, name, detail from public._rls_test_results
      where not passed order by seq
    loop
      raise notice '  [FAIL] % / %  %', v_rec.category, v_rec.name, coalesce(v_rec.detail, '');
    end loop;
    raise notice '';
  end if;

  raise notice '总计 % 项 ｜ 通过 % 项 ｜ 失败 % 项', v_total, v_passed, v_failed;

  if v_failed = 0 then
    raise notice 'ALL TESTS PASSED';
  else
    raise warning 'RLS 测试未通过，禁止上线，请先修复策略';
  end if;
end $$;


-- ============================================================================
-- 清理
-- ============================================================================
-- 删除测试产生的订单与明细，并把被预定的商品恢复为在售，便于重复运行。
delete from public.order_items
where order_id in (select id from public.orders where remark = 'RLS 测试订单');

delete from public.orders where remark = 'RLS 测试订单';

update public.listings
set status = 'active', published_at = now()
where id = '66666666-6666-4666-8666-666666666605';

drop table if exists public._rls_test_results;
drop function if exists public._rls_ok(text, text, boolean, text);
drop function if exists public._rls_count(text, uuid, boolean);
drop function if exists public._rls_blocked(text, uuid, boolean);
