-- ============================================================================
-- 迁移 0008：行级安全（RLS）策略 —— 全部 24 张表
-- ============================================================================
-- 本文件是整个项目数据安全的基础，修改前必须评审。
--
-- 总原则
-- ---------------------------------------------------------------------------
--   1. 所有业务表启用 ROW LEVEL SECURITY，并加 FORCE 使其对表所有者也生效。
--      ⚠️ FORCE 会同时作用于 SECURITY DEFINER 函数吗？
--        不会。SECURITY DEFINER 函数以定义者（postgres，超级用户）身份执行，
--        超级用户始终绕过 RLS；FORCE 只约束普通表所有者角色。
--        因此 is_admin() 等函数不会因 FORCE 而失效，也不会造成策略递归。
--   2. 显式写出每条策略。PostgreSQL 的默认「无策略即拒绝」虽然安全，
--      但不写策略会让后来者误以为该表已受保护。
--   3. 权限判断一律基于 auth.uid() 与辅助函数，绝不信任前端传参。
--   4. 冗余的 school_id 列让同校可见性判断无需 JOIN，提升策略性能。
--
-- 身份说明
-- ---------------------------------------------------------------------------
--   anon          未登录访客
--   authenticated 已登录用户（可能被拉黑，均由策略内部再判断）
--   service_role  服务端密钥（Edge Functions），天然绕过 RLS
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 辅助函数
-- ---------------------------------------------------------------------------

-- 判断某订单是否对当前用户可见
create or replace function public.can_view_order(p_order_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and (o.buyer_id = auth.uid() or o.seller_id = auth.uid() or public.is_staff())
  );
$$;

comment on function public.can_view_order(uuid) is
  '当前用户是否为该订单的买方、卖方或运营人员。用于 order_items 等子表的可见性判断。';

-- 判断某挂牌是否对当前用户可见（用于 condition_images）
create or replace function public.can_view_listing(p_listing_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.listings l
    where l.id = p_listing_id
      and (
        public.is_staff()
        or l.seller_id = auth.uid()
        or (l.status = 'active' and l.deleted_at is null)
      )
  );
$$;

comment on function public.can_view_listing(uuid) is
  '当前用户是否可查看该挂牌。在售商品公开可见，其余仅卖家与运营可见。';

-- 判断某回收单是否对当前用户可见（用于 condition_images）
create or replace function public.can_view_recycle_request(p_request_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.recycle_requests r
    where r.id = p_request_id
      and (r.user_id = auth.uid() or public.is_staff())
  );
$$;

comment on function public.can_view_recycle_request(uuid) is
  '当前用户是否为该回收单的发起人或运营人员。';

-- ---------------------------------------------------------------------------
-- 保护 profiles 的敏感字段
-- ---------------------------------------------------------------------------
-- 问题：RLS 只能按行授权，无法阻止用户把自己的 role 改成 admin。
-- 方案：BEFORE UPDATE 触发器，非管理员不得修改提权相关字段。
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_sensitive_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 管理员与服务端（auth.uid() 为空时视为服务端）不受限制
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;

  -- 普通用户不得修改以下字段，尝试修改则保留原值并告警
  if new.role is distinct from old.role then
    raise warning 'blocked attempt to change role for user %', old.id;
    new.role := old.role;
  end if;

  if new.verify_status is distinct from old.verify_status then
    raise warning 'blocked attempt to change verify_status for user %', old.id;
    new.verify_status := old.verify_status;
  end if;

  if new.verified_at is distinct from old.verified_at then
    new.verified_at := old.verified_at;
  end if;

  if new.blacklist_reason is distinct from old.blacklist_reason then
    raise warning 'blocked attempt to change blacklist_reason for user %', old.id;
    new.blacklist_reason := old.blacklist_reason;
  end if;

  if new.credit_score is distinct from old.credit_score then
    new.credit_score := old.credit_score;
  end if;

  -- 积分与碳减排总量只能由服务端（Edge Function）写入
  if new.points_balance is distinct from old.points_balance then
    raise warning 'blocked attempt to change points_balance for user %', old.id;
    new.points_balance := old.points_balance;
  end if;

  if new.carbon_total_kg is distinct from old.carbon_total_kg then
    raise warning 'blocked attempt to change carbon_total_kg for user %', old.id;
    new.carbon_total_kg := old.carbon_total_kg;
  end if;

  return new;
end;
$$;

comment on function public.protect_profile_sensitive_columns() is
  '阻止普通用户通过 UPDATE 自行提升权限或篡改积分。RLS 无法按列授权，故用触发器补足。';

create trigger trg_profiles_protect_sensitive
  before update on public.profiles
  for each row execute function public.protect_profile_sensitive_columns();

-- ============================================================================
-- A 组：用户与学校
-- ============================================================================

-- ---------- schools：公开可读，仅管理员可写 ----------
alter table public.schools enable row level security;
alter table public.schools force row level security;

create policy schools_select_all on public.schools
  for select using (true);

create policy schools_insert_admin on public.schools
  for insert with check (public.is_admin());

create policy schools_update_admin on public.schools
  for update using (public.is_admin()) with check (public.is_admin());

create policy schools_delete_admin on public.schools
  for delete using (public.is_admin());

-- ---------- majors：公开可读，仅管理员可写 ----------
alter table public.majors enable row level security;
alter table public.majors force row level security;

create policy majors_select_all on public.majors
  for select using (true);

create policy majors_write_admin on public.majors
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- courses：公开可读，仅管理员可写 ----------
alter table public.courses enable row level security;
alter table public.courses force row level security;

create policy courses_select_all on public.courses
  for select using (true);

create policy courses_write_admin on public.courses
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- profiles ----------
-- 可见性：本人 + 运营人员 + 同校在售卖家的公开信息（通过 profiles_public 视图）
-- 注意：直接查 profiles 表时，只有本人与运营人员可见，避免手机号等字段泄漏。
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy profiles_select_self_or_staff on public.profiles
  for select using (
    id = auth.uid() or public.is_staff()
  );

create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- 软删除：仅本人可标记，回收站数据仍受 select 策略约束
create policy profiles_delete_self on public.profiles
  for delete using (id = auth.uid());

-- 公开档案视图：任何人可读（列已由视图限定，不含敏感字段）
grant select on public.profiles_public to anon, authenticated;

-- ---------- user_addresses：仅本人 ----------
alter table public.user_addresses enable row level security;
alter table public.user_addresses force row level security;

create policy user_addresses_select_own on public.user_addresses
  for select using (user_id = auth.uid() or public.is_admin());

create policy user_addresses_insert_own on public.user_addresses
  for insert with check (user_id = auth.uid());

create policy user_addresses_update_own on public.user_addresses
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy user_addresses_delete_own on public.user_addresses
  for delete using (user_id = auth.uid() or public.is_admin());

-- ============================================================================
-- B 组：图书与交易
-- ============================================================================

-- ---------- book_categories：公开可读，仅管理员可写 ----------
alter table public.book_categories enable row level security;
alter table public.book_categories force row level security;

create policy book_categories_select_all on public.book_categories
  for select using (true);

create policy book_categories_write_admin on public.book_categories
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- books：公开可读（书目非敏感），认证用户可新增，运营可改 ----------
alter table public.books enable row level security;
alter table public.books force row level security;

create policy books_select_all on public.books
  for select using (true);

-- 认证券商可录入书目；是否可上架由 listings 的 is_verified 校验决定
create policy books_insert_authenticated on public.books
  for insert to authenticated
  with check (
    not public.is_blacklisted()
    and exists (select 1 from public.profiles where id = auth.uid() and deleted_at is null)
  );

-- 仅运营人员可修改（例如写入 is_verified 校验结果）
create policy books_update_staff on public.books
  for update using (public.is_staff()) with check (public.is_staff());

create policy books_delete_admin on public.books
  for delete using (public.is_admin());

-- ---------- listings ----------
-- 核心策略：
--   · 在售商品对所有人可见（含未登录访客，用于分享链接）
--   · 其余状态仅卖家本人与运营可见
--   · 发布需：已通过学生认证 + 未被拉黑
alter table public.listings enable row level security;
alter table public.listings force row level security;

create policy listings_select_active on public.listings
  for select using (status = 'active' and deleted_at is null);

create policy listings_select_own_or_staff on public.listings
  for select using (seller_id = auth.uid() or public.is_staff());

create policy listings_insert_own on public.listings
  for insert to authenticated
  with check (
    seller_id = auth.uid()
    and public.is_verified_student()
    and not public.is_blacklisted()
  );

create policy listings_update_own on public.listings
  for update using (seller_id = auth.uid())
  with check (seller_id = auth.uid() and not public.is_blacklisted());

-- 运营可修改任意挂牌（质检评级、下架违规商品）
create policy listings_update_staff on public.listings
  for update using (public.is_staff()) with check (public.is_staff());

create policy listings_delete_own_or_admin on public.listings
  for delete using (seller_id = auth.uid() or public.is_admin());

-- ---------- orders ----------
-- 可见性：仅买卖双方 + 运营。未登录与第三方一律不可见。
alter table public.orders enable row level security;
alter table public.orders force row level security;

create policy orders_select_participant on public.orders
  for select using (
    buyer_id = auth.uid() or seller_id = auth.uid() or public.is_staff()
  );

create policy orders_insert_buyer on public.orders
  for insert to authenticated
  with check (
    buyer_id = auth.uid()
    and not public.is_blacklisted()
  );

-- 买卖双方可有限更新（如取消订单、确认收货）；状态机校验由触发器负责
create policy orders_update_participant on public.orders
  for update using (buyer_id = auth.uid() or seller_id = auth.uid())
  with check (buyer_id = auth.uid() or seller_id = auth.uid());

create policy orders_update_staff on public.orders
  for update using (public.is_staff()) with check (public.is_staff());

create policy orders_delete_admin on public.orders
  for delete using (public.is_admin());

-- ---------- order_items：随订单可见性 ----------
alter table public.order_items enable row level security;
alter table public.order_items force row level security;

create policy order_items_select_via_order on public.order_items
  for select using (public.can_view_order(order_id));

create policy order_items_insert_via_order on public.order_items
  for insert to authenticated
  with check (public.can_view_order(order_id));

-- 明细不允许修改或删除：金额一旦下单即冻结
-- （无 update / delete 策略 = 任何人（除 service_role）都无法修改）

-- ---------- recycle_requests ----------
alter table public.recycle_requests enable row level security;
alter table public.recycle_requests force row level security;

create policy recycle_select_own_or_staff on public.recycle_requests
  for select using (user_id = auth.uid() or public.is_staff());

create policy recycle_insert_own on public.recycle_requests
  for insert to authenticated
  with check (user_id = auth.uid());

-- 用户仅可在早期状态自行修改（提交后、确认前）；进入质检后由运营接管
create policy recycle_update_own_early on public.recycle_requests
  for update using (
    user_id = auth.uid() and status in ('submitted', 'confirmed')
  )
  with check (user_id = auth.uid());

create policy recycle_update_staff on public.recycle_requests
  for update using (public.is_staff()) with check (public.is_staff());

create policy recycle_delete_admin on public.recycle_requests
  for delete using (public.is_admin());

-- ---------- rentals ----------
alter table public.rentals enable row level security;
alter table public.rentals force row level security;

create policy rentals_select_participant on public.rentals
  for select using (
    renter_id = auth.uid()
    or public.is_staff()
    or exists (
      select 1 from public.orders o
      where o.id = rentals.order_id and o.seller_id = auth.uid()
    )
  );

-- 租赁记录由服务端在创建订单时写入；归还核验由运营执行
create policy rentals_insert_staff on public.rentals
  for insert with check (public.is_staff());

create policy rentals_update_staff on public.rentals
  for update using (public.is_staff()) with check (public.is_staff());

-- ---------- donations ----------
alter table public.donations enable row level security;
alter table public.donations force row level security;

-- 捐赠人可见自己的捐赠；同校汇总数据通过统计接口提供（不含个人标识）
create policy donations_select_own_or_staff on public.donations
  for select using (donor_id = auth.uid() or public.is_staff());

create policy donations_insert_own_or_staff on public.donations
  for insert to authenticated
  with check (donor_id = auth.uid() or public.is_staff());

create policy donations_update_staff on public.donations
  for update using (public.is_staff()) with check (public.is_staff());

create policy donations_delete_admin on public.donations
  for delete using (public.is_admin());

-- ============================================================================
-- C 组：碳账户与积分
-- ============================================================================

-- ---------- campaigns：公开可读（进行中的活动），管理员可写 ----------
alter table public.campaigns enable row level security;
alter table public.campaigns force row level security;

create policy campaigns_select_all on public.campaigns
  for select using (true);

create policy campaigns_write_admin on public.campaigns
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- carbon_records ----------
-- 只读本人；写入仅服务端（service_role 绕过 RLS）。
-- 不提供 INSERT / UPDATE / DELETE 策略 —— 前端无法伪造碳减排数据。
alter table public.carbon_records enable row level security;
alter table public.carbon_records force row level security;

create policy carbon_select_own_or_staff on public.carbon_records
  for select using (user_id = auth.uid() or public.is_staff());

-- ---------- user_coupons ----------
-- 只读本人；发放与核销由服务端执行，避免用户自行造券。
alter table public.user_coupons enable row level security;
alter table public.user_coupons force row level security;

create policy user_coupons_select_own_or_staff on public.user_coupons
  for select using (user_id = auth.uid() or public.is_staff());

-- 不提供 INSERT / UPDATE / DELETE 策略

-- ============================================================================
-- D 组：智能硬件
-- ============================================================================

-- ---------- smart_lockers：登录用户可读基本信息，管理员可写 ----------
alter table public.smart_lockers enable row level security;
alter table public.smart_lockers force row level security;

create policy lockers_select_authenticated on public.smart_lockers
  for select to authenticated using (true);

create policy lockers_write_admin on public.smart_lockers
  for all using (public.is_admin()) with check (public.is_admin());

-- 设备心跳与状态更新由服务端执行（service_role）

-- ---------- locker_usage_logs：仅本人相关记录 + 运营；写入仅服务端 ----------
alter table public.locker_usage_logs enable row level security;
alter table public.locker_usage_logs force row level security;

create policy locker_logs_select_own_or_staff on public.locker_usage_logs
  for select using (user_id = auth.uid() or public.is_staff());

-- 不提供 INSERT / UPDATE / DELETE 策略（仅 Edge Function 写入）

-- ---------- condition_images ----------
-- 可见性随所属挂牌或回收单；上传限本人（防伪造他人商品图片）
alter table public.condition_images enable row level security;
alter table public.condition_images force row level security;

create policy condition_images_select_via_owner on public.condition_images
  for select using (
    public.is_staff()
    or (listing_id is not null and public.can_view_listing(listing_id))
    or (recycle_request_id is not null and public.can_view_recycle_request(recycle_request_id))
  );

create policy condition_images_insert_own on public.condition_images
  for insert to authenticated
  with check (
    (
      listing_id is not null
      and exists (
        select 1 from public.listings l
        where l.id = condition_images.listing_id and l.seller_id = auth.uid()
      )
    )
    or (
      recycle_request_id is not null
      and exists (
        select 1 from public.recycle_requests r
        where r.id = condition_images.recycle_request_id and r.user_id = auth.uid()
      )
    )
  );

-- 人工复核字段由运营写入
create policy condition_images_update_staff on public.condition_images
  for update using (public.is_staff()) with check (public.is_staff());

create policy condition_images_delete_admin on public.condition_images
  for delete using (public.is_admin());

-- ============================================================================
-- E 组：算法与定价 —— 仅运营/管理员可见（系数属商业机密）
-- ============================================================================

alter table public.pricing_rules enable row level security;
alter table public.pricing_rules force row level security;

create policy pricing_rules_select_staff on public.pricing_rules
  for select using (public.is_staff());

create policy pricing_rules_write_admin on public.pricing_rules
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.sensitivity_analysis enable row level security;
alter table public.sensitivity_analysis force row level security;

create policy sensitivity_select_staff on public.sensitivity_analysis
  for select using (public.is_staff());

create policy sensitivity_write_admin on public.sensitivity_analysis
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.cashflow_forecast enable row level security;
alter table public.cashflow_forecast force row level security;

create policy cashflow_select_staff on public.cashflow_forecast
  for select using (public.is_staff());

create policy cashflow_write_admin on public.cashflow_forecast
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- F 组：支撑
-- ============================================================================

-- ---------- notifications：仅本人可读与标记已读；写入由服务端 ----------
alter table public.notifications enable row level security;
alter table public.notifications force row level security;

create policy notifications_select_own on public.notifications
  for select using (user_id = auth.uid());

-- 允许本人标记已读（仅 is_read / read_at 变更，由触发器限制）
create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notifications_delete_own on public.notifications
  for delete using (user_id = auth.uid());

-- ---------- audit_logs：仅管理员可读；写入仅服务端；禁止改删 ----------
alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;

create policy audit_logs_select_admin on public.audit_logs
  for select using (public.is_admin());

-- 不提供 INSERT / UPDATE / DELETE 策略：
--   · 写入由服务端（service_role）负责
--   · 禁止任何角色修改或删除审计记录（等保 2.0 要求）

-- ---------------------------------------------------------------------------
-- 保护 notifications：普通用户只能改 is_read
-- ---------------------------------------------------------------------------
create or replace function public.protect_notification_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_staff() then
    return new;
  end if;

  -- 非运营人员只能修改已读状态，其余字段保持原值
  new.user_id := old.user_id;
  new.type := old.type;
  new.title := old.title;
  new.content := old.content;
  new.link := old.link;
  new.created_at := old.created_at;

  return new;
end;
$$;

comment on function public.protect_notification_columns() is
  '限制普通用户仅能修改通知的已读状态，防止篡改通知内容。';

create trigger trg_notifications_protect_columns
  before update on public.notifications
  for each row execute function public.protect_notification_columns();
