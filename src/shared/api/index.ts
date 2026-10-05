/**
 * shared/api 公共出口
 *
 * FSD 约定：跨层导入必须走此出口，禁止深链到具体文件。
 */
export { ApiError, run, runOrNull, toApiError } from './client'
export type { ApiErrorKind } from './client'

export { checkDatabaseHealth, getSupabaseClient, resetSupabaseClient } from './supabase'
export type { AppSupabaseClient, DatabaseHealth } from './supabase'

export type {
  // 数据库结构
  Database,
  DatabaseEnums,
  TableInsert,
  TableName,
  TableRow,
  TableUpdate,
  ViewRow,
  // 枚举别名
  AuditAction,
  BookCondition,
  CarbonAction,
  CouponStatus,
  DeliveryMethod,
  ListingStatus,
  ListingType,
  LockerEvent,
  LockerStatus,
  NotificationType,
  OrderStatus,
  OrderType,
  PaymentMethod,
  RecycleStatus,
  UserRole,
  VerifyStatus,
  // 常用表行类型
  AddressRow,
  BookCategoryRow,
  BookRow,
  CarbonRecordRow,
  CouponRow,
  CourseRow,
  ListingRow,
  LockerRow,
  MajorRow,
  NotificationRow,
  OrderItemRow,
  OrderRow,
  ProfileRow,
  PublicProfileRow,
  RecycleRequestRow,
  SchoolRow,
} from './database.types'
