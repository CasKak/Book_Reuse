-- ============================================================================
-- 迁移 0009：数据完整性与业务约束
-- ============================================================================
-- 内容：
--   1. 订单状态机（防止任意跳转）
--   2. 版权风控：未校验书目禁止上架
--   3. 状态变更时间戳自动维护
--   4. 防止同校同书重复挂牌
--   5. 利润 / 碳减排一致性校验
--   6. 表级权限授予
--   7. 下单事务函数（原子写订单 + 明细，金额服务端计算）
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 订单状态机
-- ---------------------------------------------------------------------------
-- 允许的状态迁移（其余一律拒绝）：
--   pending_payment → paid / cancelled
--   paid            → awaiting_delivery / refunding
--   awaiting_delivery → delivering / completed / refunding
--   delivering      → completed / disputed
--   completed       → disputed
--   refunding       → refunded
-- ---------------------------------------------------------------------------
create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
as $$
declare
  allowed boolean;
begin
  if new.status = old.status then
    return new;
  end if;

  allowed := case old.status
    when 'pending_payment'   then new.status in ('paid', 'cancelled')
    when 'paid'              then new.status in ('awaiting_delivery', 'refunding')
    when 'awaiting_delivery' then new.status in ('delivering', 'completed', 'refunding')
    when 'delivering'        then new.status in ('completed', 'disputed')
    when 'completed'         then new.status in ('disputed')
    when 'refunding'         then new.status in ('refunded')
    else false
  end;

  if not allowed then
    raise exception '非法订单状态迁移：% → %（订单 %）', old.status, new.status, old.order_no
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.enforce_order_status_transition() is
  '订单状态机。禁止跳过中间状态（如 pending_payment 直接到 completed）。';

create trigger trg_orders_status_transition
  before update of status on public.orders
  for each row execute function public.enforce_order_status_transition();

-- ---------------------------------------------------------------------------
-- 2. 版权风控：未通过 ISBN 校验的书目禁止上架
-- ---------------------------------------------------------------------------
-- 对应商业计划书 9.1 节第一层风控：
--   「无 ISBN、书号信息不符或具备盗版特征的图书系统自动拒绝收录」
-- ---------------------------------------------------------------------------
create or replace function public.enforce_listing_book_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verified boolean;
  v_isbn     text;
begin
  -- 仅在进入可售状态时校验
  if new.status not in ('active', 'reserved') then
    return new;
  end if;

  select is_verified, isbn into v_verified, v_isbn
  from public.books
  where id = new.book_id;

  if v_verified is not true then
    raise exception
      '书目未通过 ISBN 权威库校验，禁止上架（book_id=%，isbn=%）。'
      '请先完成书目校验后重试。', new.book_id, coalesce(v_isbn, '无')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.enforce_listing_book_verified() is
  '版权风控第一层：未通过 ISBN 校验的书目不允许上架销售。';

create trigger trg_listings_book_verified
  before insert or update of status, book_id on public.listings
  for each row execute function public.enforce_listing_book_verified();

-- ---------------------------------------------------------------------------
-- 3. 状态变更时间戳自动维护
-- ---------------------------------------------------------------------------
create or replace function public.sync_listing_timestamps()
returns trigger
language plpgsql
as $$
begin
  -- 首次进入可售状态时记录上架时间
  if new.status in ('active', 'reserved') and new.published_at is null then
    new.published_at := now();
  end if;

  -- 进入已售出时记录成交时间
  if new.status = 'sold' and new.sold_at is null then
    new.sold_at := now();
  end if;

  return new;
end;
$$;

comment on function public.sync_listing_timestamps() is
  '自动维护 listings 的上架时间与成交时间，避免前端漏传。';

create trigger trg_listings_sync_timestamps
  before insert or update of status on public.listings
  for each row execute function public.sync_listing_timestamps();

create or replace function public.sync_order_timestamps()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'paid' and new.paid_at is null then
    new.paid_at := now();
  end if;

  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
    -- 取件码属于短期凭据，订单完成后清空，减少泄漏面
    new.pickup_code := null;
  end if;

  if new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at := now();
  end if;

  return new;
end;
$$;

comment on function public.sync_order_timestamps() is
  '自动维护订单的支付/完成/取消时间；订单完成后清空取件码。';

create trigger trg_orders_sync_timestamps
  before update of status on public.orders
  for each row execute function public.sync_order_timestamps();

-- ---------------------------------------------------------------------------
-- 4. 防止同一卖家重复上架同一书目
-- ---------------------------------------------------------------------------
-- 业务背景：一名学生手上通常只有一册某教材，重复挂牌多为误操作。
-- 若确实有多册，应先售出再重新上架，或在描述中说明数量另行议价。
-- ---------------------------------------------------------------------------
create unique index uq_listings_one_active_per_seller_book
  on public.listings (seller_id, book_id)
  where status in ('active', 'reserved') and deleted_at is null;

comment on index public.uq_listings_one_active_per_seller_book is
  '同一卖家对同一书目同时只能有一个在售/预定挂牌，避免重复上架造成超卖。';

-- ---------------------------------------------------------------------------
-- 5. 碳减排记录一致性校验
-- ---------------------------------------------------------------------------
create or replace function public.enforce_carbon_consistency()
returns trigger
language plpgsql
as $$
declare
  expected numeric(10, 3);
begin
  expected := round(new.factor_used * new.book_count, 3);

  -- 允许 0.001 的舍入误差
  if abs(new.carbon_kg - expected) > 0.001 then
    raise exception
      '碳减排记录不一致：carbon_kg=% 与 factor_used(%) × book_count(%) = % 不符',
      new.carbon_kg, new.factor_used, new.book_count, expected
      using errcode = 'check_violation';
  end if;

  -- 系数来源不得为空或纯空白（对应「不虚构数据」原则）
  if new.factor_source is null or btrim(new.factor_source) = '' then
    raise exception '碳减排系数必须填写来源说明（factor_source）'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.enforce_carbon_consistency() is
  '校验碳减排流水的数值一致性与来源完整性，防止出现无法核验的数据。';

create trigger trg_carbon_records_consistency
  before insert or update on public.carbon_records
  for each row execute function public.enforce_carbon_consistency();

-- ---------------------------------------------------------------------------
-- 6. 租赁押金比例校验（押金 = 售价 × 80%，对应商业计划书 4.2.2）
-- ---------------------------------------------------------------------------
create or replace function public.enforce_rental_deposit_ratio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price numeric(12, 2);
begin
  select price into v_price from public.listings where id = new.listing_id;

  if v_price is null or v_price = 0 then
    return new;   -- 价格未定（草稿阶段）不校验
  end if;

  -- 押金应为售价的 80%，允许 ±1 元浮动以吸收取整差异
  if abs(new.deposit_amount - v_price * 0.8) > 1 then
    raise warning
      '租赁押金 % 与售价 % 的 80%%（%）偏差较大，请确认是否符合条款',
      new.deposit_amount, v_price, round(v_price * 0.8, 2);
  end if;

  return new;
end;
$$;

comment on function public.enforce_rental_deposit_ratio() is
  '租赁押金比例提醒（售价 80%）。仅告警不阻断，因实际业务可能存在特殊约定。';

create trigger trg_rentals_deposit_ratio
  before insert or update of deposit_amount on public.rentals
  for each row execute function public.enforce_rental_deposit_ratio();

-- ---------------------------------------------------------------------------
-- 7. 表级权限授予
-- ---------------------------------------------------------------------------
-- 说明：RLS 决定「能看到哪些行」，GRANT 决定「能否对该表执行该操作」。
--       两者缺一不可：仅开 RLS 而不 GRANT，前端会收到「permission denied」。
-- ---------------------------------------------------------------------------

-- 公开数据：未登录也可读
grant select on public.schools, public.majors, public.courses to anon, authenticated;
grant select on public.book_categories, public.books to anon, authenticated;
grant select on public.listings to anon, authenticated;
grant select on public.campaigns to anon, authenticated;

-- 登录用户可读的表
grant select on public.smart_lockers to authenticated;

-- 用户自有数据
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.user_addresses to authenticated;
grant select, insert, update on public.listings to authenticated;
grant delete on public.listings to authenticated;
grant select, insert, update on public.orders to authenticated;
grant select, insert on public.order_items to authenticated;
grant select, insert, update on public.recycle_requests to authenticated;
grant select on public.rentals to authenticated;
grant select, insert on public.donations to authenticated;
grant select on public.carbon_records to authenticated;
grant select on public.user_coupons to authenticated;
grant select, insert on public.condition_images to authenticated;
grant update on public.condition_images to authenticated;
grant select on public.notifications to authenticated;
grant update, delete on public.notifications to authenticated;

-- 运营 / 管理员表（RLS 已限制为 is_staff / is_admin）
grant select on public.pricing_rules to authenticated;
grant insert, update, delete on public.pricing_rules to authenticated;
grant select on public.sensitivity_analysis to authenticated;
grant insert, update, delete on public.sensitivity_analysis to authenticated;
grant select on public.cashflow_forecast to authenticated;
grant insert, update, delete on public.cashflow_forecast to authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.locker_usage_logs to authenticated;
grant insert, update, delete on public.schools to authenticated;
grant insert, update, delete on public.majors to authenticated;
grant insert, update, delete on public.courses to authenticated;
grant insert, update, delete on public.book_categories to authenticated;
grant insert, update, delete on public.books to authenticated;
grant insert, update, delete on public.orders to authenticated;
grant insert, update, delete on public.recycle_requests to authenticated;
grant insert, update on public.rentals to authenticated;
grant insert, update, delete on public.donations to authenticated;
grant insert, update, delete on public.campaigns to authenticated;
grant insert, update, delete on public.smart_lockers to authenticated;
grant insert, update, delete on public.condition_images to authenticated;

-- 说明：carbon_records、user_coupons、locker_usage_logs、audit_logs
--       不授予 insert/update/delete —— 这些表只能由服务端（service_role）写入。

-- ---------------------------------------------------------------------------
-- 8. 下单事务函数
-- ---------------------------------------------------------------------------
-- 为什么用函数而不是前端直接插表：
--   · 金额必须服务端计算，前端传价格可被篡改
--   · 下单需同时锁定商品状态，避免并发超卖
--   · 库存扣减与订单写入必须原子
-- ---------------------------------------------------------------------------
create or replace function public.place_order(
  p_listing_id      uuid,
  p_delivery_method public.delivery_method default 'self_pickup',
  p_address_id      uuid default null,
  p_locker_id       uuid default null,
  p_remark          text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing  public.listings;
  v_order    public.orders;
  v_uid      uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '请先登录' using errcode = 'insufficient_privilege';
  end if;

  if public.is_blacklisted() then
    raise exception '账号已被限制交易，请联系平台' using errcode = 'insufficient_privilege';
  end if;

  -- 锁定该商品行，防止并发下单造成超卖
  select * into v_listing
  from public.listings
  where id = p_listing_id
  for update;

  if not found then
    raise exception '商品不存在' using errcode = 'no_data_found';
  end if;

  if v_listing.status <> 'active' or v_listing.deleted_at is not null then
    raise exception '商品当前不可购买（状态：%）', v_listing.status
      using errcode = 'check_violation';
  end if;

  if v_listing.seller_id = v_uid then
    raise exception '不能购买自己发布的图书' using errcode = 'check_violation';
  end if;

  if v_listing.price is null or v_listing.price <= 0 then
    raise exception '商品价格异常，无法下单' using errcode = 'check_violation';
  end if;

  -- 选择智能柜交付时必须指定柜体
  if p_delivery_method = 'locker' and p_locker_id is null then
    raise exception '选择智能柜交付时必须指定柜体' using errcode = 'check_violation';
  end if;

  insert into public.orders (
    order_type, status, buyer_id, seller_id, school_id,
    total_amount, deposit_amount, discount_amount, payable_amount,
    payment_method, delivery_method, address_id, locker_id, remark
  ) values (
    case v_listing.listing_type
      when 'rent'     then 'rental'::public.order_type
      when 'exchange' then 'exchange'::public.order_type
      when 'donate'   then 'donation'::public.order_type
      else 'purchase'::public.order_type
    end,
    'pending_payment',
    v_uid,
    v_listing.seller_id,
    v_listing.school_id,
    v_listing.price,
    coalesce(v_listing.deposit, 0),
    0,
    v_listing.price + coalesce(v_listing.deposit, 0),
    'mock'::public.payment_method,
    p_delivery_method,
    p_address_id,
    p_locker_id,
    p_remark
  )
  returning * into v_order;

  insert into public.order_items (order_id, listing_id, book_id, quantity, unit_price, subtotal)
  values (v_order.id, v_listing.id, v_listing.book_id, 1, v_listing.price, v_listing.price);

  -- 商品置为已预定，防止他人重复下单
  update public.listings
  set status = 'reserved'
  where id = v_listing.id;

  return v_order;
end;
$$;

comment on function public.place_order(uuid, public.delivery_method, uuid, uuid, text) is
  '下单事务：校验状态、锁定商品、写入订单与明细、把商品置为已预定。'
  '金额全部由服务端计算，前端传入的价格一律忽略。';

grant execute on function public.place_order(uuid, public.delivery_method, uuid, uuid, text) to authenticated;
