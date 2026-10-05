-- ============================================================================
-- 迁移 0002：枚举类型（15 个）
-- ============================================================================
-- 说明：
--   枚举集中定义，便于全库状态取值统一。
--   PostgreSQL 枚举一旦创建，新增取值需用 ALTER TYPE ... ADD VALUE，
--   该语句在事务块中有版本限制，因此**后续需要扩展枚举时必须单独一个迁移文件**。
--
-- 命名规范：小写下划线，取值用完整单词而非缩写，避免语义歧义。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 用户与学校
-- ---------------------------------------------------------------------------

-- 用户角色：学生 / 校园大使 / 运营 / 管理员
create type public.user_role as enum (
  'student',
  'ambassador',
  'operator',
  'admin'
);

-- 学生认证状态
create type public.verify_status as enum (
  'unverified',   -- 未提交
  'pending',      -- 待审核
  'verified',     -- 已认证
  'rejected'      -- 已驳回
);

-- ---------------------------------------------------------------------------
-- 图书品相（对应商业计划书：全新 / 9成新 / 8成新 / 7成新 / 有瑕疵）
-- ---------------------------------------------------------------------------
create type public.book_condition as enum (
  'new',          -- 全新
  'like_new',     -- 9 成新
  'good',         -- 8 成新
  'fair',         -- 7 成新
  'poor'          -- 有瑕疵
);

-- ---------------------------------------------------------------------------
-- 交易类型与状态
-- ---------------------------------------------------------------------------

-- 挂牌类型：出售 / 换书 / 租赁 / 捐赠
create type public.listing_type as enum (
  'sell',
  'exchange',
  'rent',
  'donate'
);

-- 挂牌状态
create type public.listing_status as enum (
  'draft',            -- 草稿
  'pending_review',   -- 待审核（AI 低置信度或疑似资料类）
  'active',           -- 在售
  'reserved',         -- 已被预定
  'sold',             -- 已售出
  'exchanging',       -- 换书中
  'rented',           -- 已租出
  'donated',          -- 已捐赠
  'rejected',         -- 审核未通过
  'delisted'          -- 已下架
);

-- 订单类型
create type public.order_type as enum (
  'purchase',   -- 购买
  'recycle',    -- 回收
  'exchange',   -- 换书
  'rental',     -- 租赁
  'donation'    -- 捐赠
);

-- 订单状态
create type public.order_status as enum (
  'pending_payment',    -- 待支付
  'paid',               -- 已支付
  'awaiting_delivery',  -- 待交付
  'delivering',         -- 交付中
  'completed',          -- 已完成
  'cancelled',          -- 已取消
  'refunding',          -- 退款中
  'refunded',           -- 已退款
  'disputed'            -- 有争议
);

-- 支付方式（本期仅 mock 可用，真实支付需牌照，见安全合规文档）
create type public.payment_method as enum (
  'mock',     -- 模拟支付（本期唯一可用）
  'wechat',   -- 微信支付（未接入）
  'alipay'    -- 支付宝（未接入）
);

-- 交付方式
create type public.delivery_method as enum (
  'self_pickup',       -- 自提
  'campus_delivery',   -- 校内配送
  'locker',            -- 智能柜
  'door_pickup'        -- 上门回收
);

-- ---------------------------------------------------------------------------
-- 回收
-- ---------------------------------------------------------------------------
create type public.recycle_status as enum (
  'submitted',    -- 已提交
  'confirmed',    -- 已确认
  'picked_up',    -- 已揽收
  'inspecting',   -- 质检中
  'priced',       -- 已定价
  'settled',      -- 已结算
  'cancelled'     -- 已取消
);

-- ---------------------------------------------------------------------------
-- 碳账户与积分
-- ---------------------------------------------------------------------------

-- 产生碳减排的行为
create type public.carbon_action as enum (
  'recycle',         -- 回收
  'donate',          -- 捐赠
  'exchange',        -- 换书
  'buy_secondhand',  -- 购买二手
  'rent'             -- 租赁
);

-- 优惠券状态
create type public.coupon_status as enum (
  'unused',
  'used',
  'expired'
);

-- ---------------------------------------------------------------------------
-- 智能硬件
-- ---------------------------------------------------------------------------

-- 智能柜状态
create type public.locker_status as enum (
  'online',       -- 在线
  'offline',      -- 离线
  'maintenance',  -- 维护中
  'fault'         -- 故障
);

-- 柜体事件类型
create type public.locker_event as enum (
  'deposit',      -- 投书
  'pickup',       -- 取书
  'inspect',      -- 巡检
  'fault',        -- 故障
  'maintenance'   -- 维护
);

-- ---------------------------------------------------------------------------
-- 支撑
-- ---------------------------------------------------------------------------

-- 通知类型
create type public.notification_type as enum (
  'order',       -- 订单
  'recycle',     -- 回收
  'carbon',      -- 碳账户
  'campaign',    -- 活动
  'system'       -- 系统
);

-- 审计动作
create type public.audit_action as enum (
  'insert',
  'update',
  'delete',
  'login',
  'export'
);
