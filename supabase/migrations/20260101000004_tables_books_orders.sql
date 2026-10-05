-- ============================================================================
-- 迁移 0004：B 组表 · 图书与交易
-- ============================================================================
-- 表：book_categories、books、listings、orders、order_items、
--     recycle_requests、rentals、donations
--
-- 设计要点：
--   1. books 是「书目」，listings 是「具体某一册」，一本多册。
--   2. 商业计划书 9.1 节版权风控第一层：ISBN 未经权威库校验的书目不得上架。
--   3. 金额一律 numeric(12,2)；冗余 school_id 用于同校筛选与 RLS 加速。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- book_categories 图书分类
-- ---------------------------------------------------------------------------
create table public.book_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  parent_id   uuid references public.book_categories (id) on delete set null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.book_categories is '图书分类，支持二级（parent_id 为空表示一级分类）。';

create index idx_book_categories_parent on public.book_categories (parent_id);
create index idx_book_categories_sort on public.book_categories (sort_order);

create trigger trg_book_categories_updated_at
  before update on public.book_categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- books 图书元数据（书目）
-- ---------------------------------------------------------------------------
create table public.books (
  id            uuid primary key default gen_random_uuid(),
  isbn          text unique,                          -- 版权风控关键字段
  title         text not null,
  subtitle      text,
  author        text,
  publisher     text,
  publish_date  date,
  list_price    numeric(12, 2) check (list_price >= 0), -- 图书定价：定价公式第一个输入
  category_id   uuid references public.book_categories (id) on delete set null,
  cover_url     text,                                 -- Storage 路径
  language      text not null default 'zh',
  is_verified   boolean not null default false,        -- 是否通过 ISBN 权威库校验
  source_note   text,                                 -- 元数据来源说明（可核验要求）
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.books is '图书书目元数据。一本多册（一个 book 对应多个 listings）。';
comment on column public.books.is_verified is
  '⚠️ 版权风控第一层：false 表示未通过 ISBN 权威库校验，禁止上架销售。';
comment on column public.books.source_note is
  '元数据来源说明（如「国家版本图书馆比对」「人工录入」），对应数据可核验要求。';
comment on column public.books.list_price is
  '图书定价（元）。是动态定价公式的基准输入：二手定价 = 定价 × 基础折扣 × 品相 × 供需 × 时效。';

create index idx_books_isbn on public.books (isbn);
create index idx_books_category on public.books (category_id);
create index idx_books_verified on public.books (is_verified);
-- 模糊搜索：支持按书名 / 作者模糊匹配。
-- 说明：中文不适用 tsvector 分词，故选用 pg_trgm 三元组索引。
--       gin_trgm_ops 属于 pg_trgm 扩展，Supabase 默认安装在 extensions schema，
--       因此这里显式限定为 extensions.gin_trgm_ops，避免依赖 search_path。
create index idx_books_title_trgm on public.books using gin (title extensions.gin_trgm_ops);
create index idx_books_author_trgm on public.books using gin (author extensions.gin_trgm_ops);

create trigger trg_books_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- listings 图书挂牌（具体某一册）
-- ---------------------------------------------------------------------------
create table public.listings (
  id                   uuid primary key default gen_random_uuid(),
  seller_id            uuid not null references public.profiles (id) on delete cascade,
  book_id              uuid not null references public.books (id) on delete restrict,
  listing_type         public.listing_type not null default 'sell',
  status               public.listing_status not null default 'draft',
  -- 品相三轨记录：用户自评 / AI 判定 / 人工终值
  condition            public.book_condition not null,
  condition_ai         public.book_condition,
  condition_final      public.book_condition,
  ai_confidence        numeric(4, 3) check (ai_confidence between 0 and 1),
  need_manual_review   boolean not null default false,
  -- 价格
  price                numeric(12, 2) check (price >= 0),
  original_price       numeric(12, 2) check (original_price >= 0),
  deposit              numeric(12, 2) check (deposit >= 0),          -- 租赁押金 = 售价 × 80%
  rental_price_month   numeric(12, 2) check (rental_price_month >= 0),
  -- 描述与关联
  description          text,
  school_id            uuid references public.schools (id) on delete set null,
  course_id            uuid references public.courses (id) on delete set null,
  delivery_method      public.delivery_method,
  -- 统计与时间
  view_count           integer not null default 0 check (view_count >= 0),
  published_at         timestamptz,
  sold_at              timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  -- 业务约束
  constraint chk_listings_rent_requires_price check (
    listing_type <> 'rent'
    or (rental_price_month is not null and deposit is not null)
  ),
  constraint chk_listings_active_requires_publish_time check (
    status not in ('active', 'reserved') or published_at is not null
  ),
  constraint chk_listings_manual_review_confidence check (
    not need_manual_review or ai_confidence is null or ai_confidence < 0.7
  )
);

comment on table public.listings is '图书挂牌（具体某一册）。一本书目可对应多个在售册。';
comment on column public.listings.condition is '卖家自评品相。';
comment on column public.listings.condition_ai is
  'AI 视觉识别判定品相。占位字段：当前无可用模型，由模拟接口写入。';
comment on column public.listings.condition_final is
  '人工质检终值。定价与售后以该字段为准。';
comment on column public.listings.need_manual_review is
  'AI 置信度低于阈值或疑似资料类物品时置为 true，进入人工待审队列（版权风控第二层）。';

-- 首页主查询：同校 + 在售
create index idx_listings_school_status on public.listings (school_id, status);
create index idx_listings_course on public.listings (course_id);
create index idx_listings_seller on public.listings (seller_id);
create index idx_listings_book on public.listings (book_id);
create index idx_listings_price on public.listings (price);
create index idx_listings_published on public.listings (published_at desc);
create index idx_listings_manual_review on public.listings (need_manual_review) where need_manual_review;
-- 软删除过滤
create index idx_listings_not_deleted on public.listings (status) where deleted_at is null;

create trigger trg_listings_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 业务单号生成
-- ---------------------------------------------------------------------------
create sequence public.order_no_seq start 1;

create or replace function public.generate_biz_no(prefix text)
returns text
language plpgsql
as $$
declare
  seq_value bigint;
begin
  seq_value := nextval('public.order_no_seq');
  -- 形如 QY20260106000123
  return prefix
    || to_char(now() at time zone 'Asia/Shanghai', 'YYYYMMDD')
    || lpad(seq_value::text, 6, '0');
end;
$$;

comment on function public.generate_biz_no(text) is
  '生成业务单号：前缀 + 东八区日期 + 6 位序列，如 QY20260106000123。';

-- ---------------------------------------------------------------------------
-- orders 订单
-- ---------------------------------------------------------------------------
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  order_no          text not null unique default public.generate_biz_no('QY'),
  order_type        public.order_type not null,
  status            public.order_status not null default 'pending_payment',
  buyer_id          uuid references public.profiles (id) on delete set null,
  seller_id         uuid references public.profiles (id) on delete set null,
  school_id         uuid references public.schools (id) on delete set null,
  -- 金额
  total_amount      numeric(12, 2) not null default 0 check (total_amount >= 0),
  deposit_amount    numeric(12, 2) not null default 0 check (deposit_amount >= 0),
  discount_amount   numeric(12, 2) not null default 0 check (discount_amount >= 0),
  payable_amount    numeric(12, 2) not null default 0 check (payable_amount >= 0),
  -- 支付（本期仅 mock）
  payment_method    public.payment_method not null default 'mock',
  paid_at           timestamptz,
  -- 交付
  delivery_method   public.delivery_method,
  address_id        uuid references public.user_addresses (id) on delete set null,
  locker_id         uuid,                              -- 外键在 0006 迁移补加（表尚未创建）
  pickup_code       text,
  -- 完成 / 取消
  completed_at      timestamptz,
  cancelled_at      timestamptz,
  cancel_reason     text,
  remark            text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint chk_orders_payable check (payable_amount <= total_amount + deposit_amount)
);

comment on table public.orders is
  '订单主表。覆盖购买、回收、换书、租赁、捐赠五种类型。';
comment on column public.orders.payment_method is
  '⚠️ 本期仅 mock 可用。真实支付需接入持牌支付机构并完成法务确认，见安全合规文档。';
comment on column public.orders.pickup_code is
  '智能柜取件码。属于短期凭据，不应长期留存，订单完成后建议清空。';

create index idx_orders_buyer on public.orders (buyer_id, created_at desc);
create index idx_orders_seller on public.orders (seller_id, created_at desc);
create index idx_orders_status on public.orders (status);
create index idx_orders_school on public.orders (school_id);
create index idx_orders_type on public.orders (order_type);
create index idx_orders_created on public.orders (created_at desc);

create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- order_items 订单明细
-- ---------------------------------------------------------------------------
create table public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  listing_id  uuid not null references public.listings (id) on delete restrict,
  book_id     uuid not null references public.books (id) on delete restrict,  -- 冗余，便于报表
  quantity    integer not null default 1 check (quantity > 0),
  unit_price  numeric(12, 2) not null check (unit_price >= 0),
  subtotal    numeric(12, 2) not null check (subtotal >= 0),
  created_at  timestamptz not null default now(),
  constraint uq_order_items_listing unique (order_id, listing_id),
  constraint chk_order_items_subtotal check (subtotal = unit_price * quantity)
);

comment on table public.order_items is
  '订单明细。约束 uq_order_items_listing 保证同一订单不会重复购买同一册。';

create index idx_order_items_order on public.order_items (order_id);
create index idx_order_items_listing on public.order_items (listing_id);
create index idx_order_items_book on public.order_items (book_id);

-- ---------------------------------------------------------------------------
-- recycle_requests 回收请求
-- ---------------------------------------------------------------------------
create table public.recycle_requests (
  id                uuid primary key default gen_random_uuid(),
  request_no        text not null unique default public.generate_biz_no('RC'),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  school_id         uuid references public.schools (id) on delete set null,
  status            public.recycle_status not null default 'submitted',
  delivery_method   public.delivery_method not null,
  locker_id         uuid,                              -- 外键在 0006 迁移补加
  address_id        uuid references public.user_addresses (id) on delete set null,
  expected_time     timestamptz,
  book_count        integer not null default 0 check (book_count >= 0),
  estimated_amount  numeric(12, 2) check (estimated_amount >= 0),
  final_amount      numeric(12, 2) check (final_amount >= 0),
  inspector_id      uuid references public.profiles (id) on delete set null,
  inspected_at      timestamptz,
  settle_note       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.recycle_requests is
  '回收请求。支持预约上门、回收点、智能柜三种投递方式。';
comment on column public.recycle_requests.final_amount is
  '质检后结算金额。与 estimated_amount 的差异需在 settle_note 中说明。';

create index idx_recycle_user on public.recycle_requests (user_id, created_at desc);
create index idx_recycle_status on public.recycle_requests (status);
create index idx_recycle_school on public.recycle_requests (school_id);
create index idx_recycle_inspector on public.recycle_requests (inspector_id);

create trigger trg_recycle_requests_updated_at
  before update on public.recycle_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- rentals 租赁记录
-- ---------------------------------------------------------------------------
create table public.rentals (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders (id) on delete cascade,
  listing_id          uuid not null references public.listings (id) on delete restrict,
  renter_id           uuid not null references public.profiles (id) on delete restrict,
  start_date          date not null,
  due_date            date not null,
  returned_at         timestamptz,
  rent_amount         numeric(12, 2) not null check (rent_amount >= 0),
  deposit_amount      numeric(12, 2) not null check (deposit_amount >= 0),
  overdue_days        integer not null default 0 check (overdue_days >= 0),
  overdue_fee         numeric(12, 2) not null default 0 check (overdue_fee >= 0),
  condition_before    public.book_condition,
  condition_after     public.book_condition,
  deduction_amount    numeric(12, 2) not null default 0 check (deduction_amount >= 0),
  deduction_reason    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint chk_rentals_date_order check (due_date >= start_date),
  constraint chk_rentals_deduction_within_deposit check (deduction_amount <= deposit_amount)
);

comment on table public.rentals is
  '租赁记录。条款来自商业计划书 4.2.2：押金 = 售价 80%，逾期 0.5 元/日，'
  '归还时按 AI 复核定级，降一级按差价从押金扣除，丢失按押金全额扣除。';
comment on column public.rentals.overdue_fee is '逾期费，按 0.5 元/日计（费率须可在后台配置）。';
comment on column public.rentals.deduction_amount is '归还时因品相降级扣除的差价，不得超过押金。';

create index idx_rentals_order on public.rentals (order_id);
create index idx_rentals_listing on public.rentals (listing_id);
create index idx_rentals_renter on public.rentals (renter_id);
create index idx_rentals_due on public.rentals (due_date) where returned_at is null;

create trigger trg_rentals_updated_at
  before update on public.rentals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- donations 公益捐赠
-- ---------------------------------------------------------------------------
create table public.donations (
  id            uuid primary key default gen_random_uuid(),
  donor_id      uuid references public.profiles (id) on delete set null,   -- 可匿名
  listing_id    uuid references public.listings (id) on delete set null,
  school_id     uuid references public.schools (id) on delete set null,
  partner_org   text,
  book_count    integer not null default 1 check (book_count > 0),
  carbon_kg     numeric(10, 3) not null default 0 check (carbon_kg >= 0),
  status        text not null default 'pending',
  delivered_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.donations is '公益捐赠记录，用于计算社会价值与碳减排。';
comment on column public.donations.donor_id is '捐赠人。为 null 表示匿名捐赠。';

create index idx_donations_donor on public.donations (donor_id);
create index idx_donations_school on public.donations (school_id);
create index idx_donations_status on public.donations (status);

create trigger trg_donations_updated_at
  before update on public.donations
  for each row execute function public.set_updated_at();
