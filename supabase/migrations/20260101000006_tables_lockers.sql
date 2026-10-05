-- ============================================================================
-- 迁移 0006：D 组表 · 智能硬件
-- ============================================================================
-- 表：smart_lockers、locker_usage_logs、condition_images
-- 并补加 orders.locker_id 与 recycle_requests.locker_id 的外键
-- （这两张表在 0004 中先建列，待本迁移建表后再补约束，避免循环依赖）
--
-- ⚠️ 范围说明：商业计划书 3.1.2 节明确「智能回收柜是线下增强模块而非启动
--    前置条件」。本期仅实现接口与模拟数据，不接入真实硬件。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- smart_lockers 智能回收柜
-- ---------------------------------------------------------------------------
create table public.smart_lockers (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,           -- 设备编号
  name                text not null,                  -- 如「3 号宿舍楼 A 柜」
  school_id           uuid not null references public.schools (id) on delete restrict,
  campus_area         text,
  location_desc       text,
  latitude            numeric(10, 7) check (latitude between -90 and 90),
  longitude           numeric(10, 7) check (longitude between -180 and 180),
  total_slots         integer not null default 0 check (total_slots >= 0),
  used_slots          integer not null default 0 check (used_slots >= 0),
  status              public.locker_status not null default 'offline',
  last_heartbeat_at   timestamptz,
  firmware_version    text,
  installed_at        date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint chk_lockers_slots check (used_slots <= total_slots)
);

comment on table public.smart_lockers is
  '智能回收柜。本期为模拟数据，不对接真实硬件。';
comment on column public.smart_lockers.status is
  '设备状态。offline 判定依据：last_heartbeat_at 超过阈值（建议 10 分钟）未更新。';

create index idx_lockers_school on public.smart_lockers (school_id);
create index idx_lockers_status on public.smart_lockers (status);
create index idx_lockers_heartbeat on public.smart_lockers (last_heartbeat_at desc);

create trigger trg_smart_lockers_updated_at
  before update on public.smart_lockers
  for each row execute function public.set_updated_at();

-- 补加外键（列在 0004 已创建）
alter table public.orders
  add constraint fk_orders_locker
  foreign key (locker_id) references public.smart_lockers (id) on delete set null;

alter table public.recycle_requests
  add constraint fk_recycle_requests_locker
  foreign key (locker_id) references public.smart_lockers (id) on delete set null;

-- ---------------------------------------------------------------------------
-- locker_usage_logs 柜体使用日志
-- ---------------------------------------------------------------------------
create table public.locker_usage_logs (
  id                  uuid primary key default gen_random_uuid(),
  locker_id           uuid not null references public.smart_lockers (id) on delete cascade,
  user_id             uuid references public.profiles (id) on delete set null,
  event               public.locker_event not null,
  slot_no             integer check (slot_no > 0),
  order_id            uuid references public.orders (id) on delete set null,
  recycle_request_id  uuid references public.recycle_requests (id) on delete set null,
  payload             jsonb not null default '{}'::jsonb,
  -- ⚠️ 设备端时间与入库时间必须分开记录：
  --    商业计划书 3.3 节要求网络中断时柜端离线暂存、恢复后自动补传，
  --    若只记录 now()，补传数据的时间将失真。
  occurred_at         timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

comment on table public.locker_usage_logs is
  '柜体事件流水。只增不改，仅服务端（webhook）可写入。';
comment on column public.locker_usage_logs.occurred_at is
  '设备端事件发生时间。与 created_at（入库时间）分开，以支持离线补传场景。';
comment on column public.locker_usage_logs.payload is
  '设备上报的原始内容，保留以便排查与审计。';

create index idx_locker_logs_locker_time on public.locker_usage_logs (locker_id, occurred_at desc);
create index idx_locker_logs_user on public.locker_usage_logs (user_id, occurred_at desc);
create index idx_locker_logs_order on public.locker_usage_logs (order_id);
create index idx_locker_logs_event on public.locker_usage_logs (event);

-- ---------------------------------------------------------------------------
-- condition_images 品相图片与识别结果
-- ---------------------------------------------------------------------------
create table public.condition_images (
  id                  uuid primary key default gen_random_uuid(),
  listing_id          uuid references public.listings (id) on delete cascade,
  recycle_request_id  uuid references public.recycle_requests (id) on delete cascade,
  storage_path        text not null,                  -- ⚠️ 私有桶路径，不存公开 URL
  image_type          text not null,                  -- cover / inner / defect / spine
  -- AI 识别结果（占位：当前无可用模型）
  ai_model            text,
  ai_labels           jsonb,
  ai_condition        public.book_condition,
  ai_confidence       numeric(4, 3) check (ai_confidence between 0 and 1),
  -- 人工复核
  manual_condition    public.book_condition,
  reviewer_id         uuid references public.profiles (id) on delete set null,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  -- 必须归属于某个挂牌或回收单
  constraint chk_condition_images_owner check (
    listing_id is not null or recycle_request_id is not null
  ),
  constraint chk_condition_images_type check (
    image_type in ('cover', 'inner', 'defect', 'spine')
  )
);

comment on table public.condition_images is
  '品相图片与 AI 识别结果。图片存于 Storage 私有桶，通过签名 URL 临时授权访问。';
comment on column public.condition_images.storage_path is
  '⚠️ 仅存私有桶内的相对路径。禁止在数据库中存公开 URL，避免图片被直接爬取。';
comment on column public.condition_images.ai_model is
  'AI 模型标识。当前为占位（如 yolov8-mock），无真实模型接入。';
comment on column public.condition_images.manual_condition is
  '人工复核品相。低置信度样本必须人工复核（版权与品相风控要求）。';

create index idx_condition_images_listing on public.condition_images (listing_id);
create index idx_condition_images_recycle on public.condition_images (recycle_request_id);
create index idx_condition_images_reviewer on public.condition_images (reviewer_id);
create index idx_condition_images_pending on public.condition_images (id)
  where manual_condition is null;
