/**
 * Supabase 数据库类型定义
 *
 * 来源：按 `supabase/migrations/` 的迁移文件整理（阶段 2，2026-01-01 版）。
 *
 * ⚠️ 维护约定（重要）
 * ---------------------------------------------------------------------------
 * 迁移变更后**必须重新生成**，不要手工增删字段：
 *
 *   supabase gen types typescript --local > src/shared/api/database.types.ts
 *   supabase gen types typescript --project-id <ref> > src/shared/api/database.types.ts
 *
 * 手工维护容易与迁移脱节；一旦脱节，类型检查就查不出真实错误。
 * 本文件当前为无 CLI 环境下的手工整理版，字段与迁移一一对应。
 */

/** 数据库中的枚举取值 */
export type DatabaseEnums = {
  user_role: 'student' | 'ambassador' | 'operator' | 'admin'
  verify_status: 'unverified' | 'pending' | 'verified' | 'rejected'
  book_condition: 'new' | 'like_new' | 'good' | 'fair' | 'poor'
  listing_type: 'sell' | 'exchange' | 'rent' | 'donate'
  listing_status:
    | 'draft'
    | 'pending_review'
    | 'active'
    | 'reserved'
    | 'sold'
    | 'exchanging'
    | 'rented'
    | 'donated'
    | 'rejected'
    | 'delisted'
  order_type: 'purchase' | 'recycle' | 'exchange' | 'rental' | 'donation'
  order_status:
    | 'pending_payment'
    | 'paid'
    | 'awaiting_delivery'
    | 'delivering'
    | 'completed'
    | 'cancelled'
    | 'refunding'
    | 'refunded'
    | 'disputed'
  payment_method: 'mock' | 'wechat' | 'alipay'
  delivery_method: 'self_pickup' | 'campus_delivery' | 'locker' | 'door_pickup'
  recycle_status:
    'submitted' | 'confirmed' | 'picked_up' | 'inspecting' | 'priced' | 'settled' | 'cancelled'
  carbon_action: 'recycle' | 'donate' | 'exchange' | 'buy_secondhand' | 'rent'
  coupon_status: 'unused' | 'used' | 'expired'
  locker_status: 'online' | 'offline' | 'maintenance' | 'fault'
  locker_event: 'deposit' | 'pickup' | 'inspect' | 'fault' | 'maintenance'
  notification_type: 'order' | 'recycle' | 'carbon' | 'campaign' | 'system'
  audit_action: 'insert' | 'update' | 'delete' | 'login' | 'export'
}

/** 枚举便捷别名（业务代码优先使用这些） */
export type UserRole = DatabaseEnums['user_role']
export type VerifyStatus = DatabaseEnums['verify_status']
export type BookCondition = DatabaseEnums['book_condition']
export type ListingType = DatabaseEnums['listing_type']
export type ListingStatus = DatabaseEnums['listing_status']
export type OrderType = DatabaseEnums['order_type']
export type OrderStatus = DatabaseEnums['order_status']
export type PaymentMethod = DatabaseEnums['payment_method']
export type DeliveryMethod = DatabaseEnums['delivery_method']
export type RecycleStatus = DatabaseEnums['recycle_status']
export type CarbonAction = DatabaseEnums['carbon_action']
export type CouponStatus = DatabaseEnums['coupon_status']
export type LockerStatus = DatabaseEnums['locker_status']
export type LockerEvent = DatabaseEnums['locker_event']
export type NotificationType = DatabaseEnums['notification_type']
export type AuditAction = DatabaseEnums['audit_action']

/** 带创建/更新时间戳的通用字段 */
type Timestamps = {
  created_at: string
  updated_at: string
}

/**
 * 数据库结构定义
 *
 * ⚠️ 必须使用 `type` 而非 `interface`：
 *    Supabase 的 GenericTable 约束要求 Row/Insert/Update 可赋值给
 *    `Record<string, unknown>`。interface 没有隐式索引签名，无法满足该约束，
 *    会导致所有查询的入参类型退化为 never（表现为「参数不能赋给 never」编译错误）。
 *
 * 📌 关于 Relationships 数组：
 *    当前各表均为 `Relationships: []`，即**不使用 PostgREST 的嵌套查询**
 *    （如 select('*, books(*)')）。原因与替代方案见 src/entities/listing/api/queries.ts
 *    顶部说明：嵌套查询要求 Relationships 精确描述每个外键，手工维护易与迁移脱节；
 *    本项目改为「两次查询 + 应用层合并」，类型完全由显式接口约束，更可控。
 *    若将来改用 `supabase gen types` 生成类型，可自然获得嵌套查询能力。
 *
 * 表的分组顺序与 supabase/migrations 保持一致，便于对照排查。
 */
export type Database = {
  public: {
    Tables: {
      // ================================================================ A 组
      schools: {
        Row: Timestamps & {
          id: string
          name: string
          province: string | null
          city: string | null
          level: string | null
          is_active: boolean
        }
        Insert: {
          id?: string
          name: string
          province?: string | null
          city?: string | null
          level?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['schools']['Insert']>
        Relationships: []
      }

      majors: {
        Row: Timestamps & {
          id: string
          school_id: string
          name: string
          college: string | null
        }
        Insert: {
          id?: string
          school_id: string
          name: string
          college?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['majors']['Insert']>
        Relationships: []
      }

      courses: {
        Row: Timestamps & {
          id: string
          school_id: string
          major_id: string | null
          name: string
          semester: string | null
          enroll_count: number
        }
        Insert: {
          id?: string
          school_id: string
          major_id?: string | null
          name: string
          semester?: string | null
          enroll_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['courses']['Insert']>
        Relationships: []
      }

      profiles: {
        Row: Timestamps & {
          id: string
          nickname: string | null
          avatar_url: string | null
          phone: string | null
          role: UserRole
          school_id: string | null
          major_id: string | null
          grade: number | null
          enroll_year: number | null
          verify_status: VerifyStatus
          verified_at: string | null
          credit_score: number
          blacklist_reason: string | null
          points_balance: number
          carbon_total_kg: number
          deleted_at: string | null
        }
        Insert: {
          id: string
          nickname?: string | null
          avatar_url?: string | null
          phone?: string | null
          role?: UserRole
          school_id?: string | null
          major_id?: string | null
          grade?: number | null
          enroll_year?: number | null
          verify_status?: VerifyStatus
          verified_at?: string | null
          credit_score?: number
          blacklist_reason?: string | null
          points_balance?: number
          carbon_total_kg?: number
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: []
      }

      user_addresses: {
        Row: Timestamps & {
          id: string
          user_id: string
          label: string | null
          campus_area: string | null
          building: string | null
          detail: string | null
          is_default: boolean
        }
        Insert: {
          id?: string
          user_id: string
          label?: string | null
          campus_area?: string | null
          building?: string | null
          detail?: string | null
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['user_addresses']['Insert']>
        Relationships: []
      }

      // ================================================================ B 组
      book_categories: {
        Row: Timestamps & {
          id: string
          name: string
          parent_id: string | null
          sort_order: number
        }
        Insert: {
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['book_categories']['Insert']>
        Relationships: []
      }

      books: {
        Row: Timestamps & {
          id: string
          isbn: string | null
          title: string
          subtitle: string | null
          author: string | null
          publisher: string | null
          publish_date: string | null
          list_price: number | null
          category_id: string | null
          cover_url: string | null
          language: string
          is_verified: boolean
          source_note: string | null
        }
        Insert: {
          id?: string
          isbn?: string | null
          title: string
          subtitle?: string | null
          author?: string | null
          publisher?: string | null
          publish_date?: string | null
          list_price?: number | null
          category_id?: string | null
          cover_url?: string | null
          language?: string
          is_verified?: boolean
          source_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['books']['Insert']>
        Relationships: []
      }

      listings: {
        Row: Timestamps & {
          id: string
          seller_id: string
          book_id: string
          listing_type: ListingType
          status: ListingStatus
          condition: BookCondition
          condition_ai: BookCondition | null
          condition_final: BookCondition | null
          ai_confidence: number | null
          need_manual_review: boolean
          price: number | null
          original_price: number | null
          deposit: number | null
          rental_price_month: number | null
          description: string | null
          school_id: string | null
          course_id: string | null
          delivery_method: DeliveryMethod | null
          view_count: number
          published_at: string | null
          sold_at: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          seller_id: string
          book_id: string
          listing_type?: ListingType
          status?: ListingStatus
          condition: BookCondition
          condition_ai?: BookCondition | null
          condition_final?: BookCondition | null
          ai_confidence?: number | null
          need_manual_review?: boolean
          price?: number | null
          original_price?: number | null
          deposit?: number | null
          rental_price_month?: number | null
          description?: string | null
          school_id?: string | null
          course_id?: string | null
          delivery_method?: DeliveryMethod | null
          view_count?: number
          published_at?: string | null
          sold_at?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['listings']['Insert']>
        Relationships: []
      }

      orders: {
        Row: Timestamps & {
          id: string
          order_no: string
          order_type: OrderType
          status: OrderStatus
          buyer_id: string | null
          seller_id: string | null
          school_id: string | null
          total_amount: number
          deposit_amount: number
          discount_amount: number
          payable_amount: number
          payment_method: PaymentMethod
          paid_at: string | null
          delivery_method: DeliveryMethod | null
          address_id: string | null
          locker_id: string | null
          pickup_code: string | null
          completed_at: string | null
          cancelled_at: string | null
          cancel_reason: string | null
          remark: string | null
        }
        Insert: {
          id?: string
          order_no?: string
          order_type: OrderType
          status?: OrderStatus
          buyer_id?: string | null
          seller_id?: string | null
          school_id?: string | null
          total_amount?: number
          deposit_amount?: number
          discount_amount?: number
          payable_amount?: number
          payment_method?: PaymentMethod
          paid_at?: string | null
          delivery_method?: DeliveryMethod | null
          address_id?: string | null
          locker_id?: string | null
          pickup_code?: string | null
          completed_at?: string | null
          cancelled_at?: string | null
          cancel_reason?: string | null
          remark?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['orders']['Insert']>
        Relationships: []
      }

      order_items: {
        Row: {
          id: string
          order_id: string
          listing_id: string
          book_id: string
          quantity: number
          unit_price: number
          subtotal: number
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          listing_id: string
          book_id: string
          quantity?: number
          unit_price: number
          subtotal: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>
        Relationships: []
      }

      recycle_requests: {
        Row: Timestamps & {
          id: string
          request_no: string
          user_id: string
          school_id: string | null
          status: RecycleStatus
          delivery_method: DeliveryMethod
          locker_id: string | null
          address_id: string | null
          expected_time: string | null
          book_count: number
          estimated_amount: number | null
          final_amount: number | null
          inspector_id: string | null
          inspected_at: string | null
          settle_note: string | null
        }
        Insert: {
          id?: string
          request_no?: string
          user_id: string
          school_id?: string | null
          status?: RecycleStatus
          delivery_method: DeliveryMethod
          locker_id?: string | null
          address_id?: string | null
          expected_time?: string | null
          book_count?: number
          estimated_amount?: number | null
          final_amount?: number | null
          inspector_id?: string | null
          inspected_at?: string | null
          settle_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['recycle_requests']['Insert']>
        Relationships: []
      }

      rentals: {
        Row: Timestamps & {
          id: string
          order_id: string
          listing_id: string
          renter_id: string
          start_date: string
          due_date: string
          returned_at: string | null
          rent_amount: number
          deposit_amount: number
          overdue_days: number
          overdue_fee: number
          condition_before: BookCondition | null
          condition_after: BookCondition | null
          deduction_amount: number
          deduction_reason: string | null
        }
        Insert: {
          id?: string
          order_id: string
          listing_id: string
          renter_id: string
          start_date: string
          due_date: string
          returned_at?: string | null
          rent_amount: number
          deposit_amount: number
          overdue_days?: number
          overdue_fee?: number
          condition_before?: BookCondition | null
          condition_after?: BookCondition | null
          deduction_amount?: number
          deduction_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['rentals']['Insert']>
        Relationships: []
      }

      donations: {
        Row: Timestamps & {
          id: string
          donor_id: string | null
          listing_id: string | null
          school_id: string | null
          partner_org: string | null
          book_count: number
          carbon_kg: number
          status: string
          delivered_at: string | null
        }
        Insert: {
          id?: string
          donor_id?: string | null
          listing_id?: string | null
          school_id?: string | null
          partner_org?: string | null
          book_count?: number
          carbon_kg?: number
          status?: string
          delivered_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['donations']['Insert']>
        Relationships: []
      }

      // ================================================================ C 组
      campaigns: {
        Row: Timestamps & {
          id: string
          title: string
          campaign_type: string
          description: string | null
          school_id: string | null
          points_reward: number
          cover_url: string | null
          start_at: string
          end_at: string
          is_active: boolean
        }
        Insert: {
          id?: string
          title: string
          campaign_type: string
          description?: string | null
          school_id?: string | null
          points_reward?: number
          cover_url?: string | null
          start_at: string
          end_at: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['campaigns']['Insert']>
        Relationships: []
      }

      carbon_records: {
        Row: {
          id: string
          user_id: string
          action: CarbonAction
          ref_table: string | null
          ref_id: string | null
          book_count: number
          carbon_kg: number
          factor_used: number
          factor_source: string
          is_estimated: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          action: CarbonAction
          ref_table?: string | null
          ref_id?: string | null
          book_count?: number
          carbon_kg: number
          factor_used: number
          factor_source: string
          is_estimated?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['carbon_records']['Insert']>
        Relationships: []
      }

      user_coupons: {
        Row: Timestamps & {
          id: string
          user_id: string
          campaign_id: string | null
          code: string
          title: string
          discount_amount: number | null
          discount_rate: number | null
          min_amount: number
          points_cost: number
          status: CouponStatus
          expired_at: string | null
          used_at: string | null
          used_order_id: string | null
        }
        Insert: {
          id?: string
          user_id: string
          campaign_id?: string | null
          code: string
          title: string
          discount_amount?: number | null
          discount_rate?: number | null
          min_amount?: number
          points_cost?: number
          status?: CouponStatus
          expired_at?: string | null
          used_at?: string | null
          used_order_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['user_coupons']['Insert']>
        Relationships: []
      }

      // ================================================================ D 组
      smart_lockers: {
        Row: Timestamps & {
          id: string
          code: string
          name: string
          school_id: string
          campus_area: string | null
          location_desc: string | null
          latitude: number | null
          longitude: number | null
          total_slots: number
          used_slots: number
          status: LockerStatus
          last_heartbeat_at: string | null
          firmware_version: string | null
          installed_at: string | null
        }
        Insert: {
          id?: string
          code: string
          name: string
          school_id: string
          campus_area?: string | null
          location_desc?: string | null
          latitude?: number | null
          longitude?: number | null
          total_slots?: number
          used_slots?: number
          status?: LockerStatus
          last_heartbeat_at?: string | null
          firmware_version?: string | null
          installed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['smart_lockers']['Insert']>
        Relationships: []
      }

      locker_usage_logs: {
        Row: {
          id: string
          locker_id: string
          user_id: string | null
          event: LockerEvent
          slot_no: number | null
          order_id: string | null
          recycle_request_id: string | null
          payload: Record<string, unknown>
          occurred_at: string
          created_at: string
        }
        Insert: {
          id?: string
          locker_id: string
          user_id?: string | null
          event: LockerEvent
          slot_no?: number | null
          order_id?: string | null
          recycle_request_id?: string | null
          payload?: Record<string, unknown>
          occurred_at?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['locker_usage_logs']['Insert']>
        Relationships: []
      }

      condition_images: {
        Row: {
          id: string
          listing_id: string | null
          recycle_request_id: string | null
          storage_path: string
          image_type: string
          ai_model: string | null
          ai_labels: Record<string, unknown> | null
          ai_condition: BookCondition | null
          ai_confidence: number | null
          manual_condition: BookCondition | null
          reviewer_id: string | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          listing_id?: string | null
          recycle_request_id?: string | null
          storage_path: string
          image_type: string
          ai_model?: string | null
          ai_labels?: Record<string, unknown> | null
          ai_condition?: BookCondition | null
          ai_confidence?: number | null
          manual_condition?: BookCondition | null
          reviewer_id?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['condition_images']['Insert']>
        Relationships: []
      }

      // ================================================================ E 组
      pricing_rules: {
        Row: Timestamps & {
          id: string
          rule_type: string
          rule_key: string
          rule_value: number
          min_value: number | null
          max_value: number | null
          school_id: string | null
          source_note: string
          is_active: boolean
          effective_from: string
          created_by: string | null
        }
        Insert: {
          id?: string
          rule_type: string
          rule_key: string
          rule_value: number
          min_value?: number | null
          max_value?: number | null
          school_id?: string | null
          source_note: string
          is_active?: boolean
          effective_from?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['pricing_rules']['Insert']>
        Relationships: []
      }

      sensitivity_analysis: {
        Row: Timestamps & {
          id: string
          scenario_name: string
          variable: string
          change_pct: number
          impact_gross_margin: number | null
          impact_monthly_profit: number | null
          basis_note: string
          is_example: boolean
        }
        Insert: {
          id?: string
          scenario_name: string
          variable: string
          change_pct: number
          impact_gross_margin?: number | null
          impact_monthly_profit?: number | null
          basis_note: string
          is_example?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['sensitivity_analysis']['Insert']>
        Relationships: []
      }

      cashflow_forecast: {
        Row: Timestamps & {
          id: string
          scenario_name: string
          period_label: string
          period_start: string
          period_end: string
          revenue: number
          variable_cost: number
          fixed_cost: number
          hardware_capex: number
          net_cashflow: number
          ending_cash: number
          is_example: boolean
        }
        Insert: {
          id?: string
          scenario_name: string
          period_label: string
          period_start: string
          period_end: string
          revenue?: number
          variable_cost?: number
          fixed_cost?: number
          hardware_capex?: number
          net_cashflow?: number
          ending_cash?: number
          is_example?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['cashflow_forecast']['Insert']>
        Relationships: []
      }

      // ================================================================ F 组
      notifications: {
        Row: {
          id: string
          user_id: string
          type: NotificationType
          title: string
          content: string | null
          link: string | null
          is_read: boolean
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: NotificationType
          title: string
          content?: string | null
          link?: string | null
          is_read?: boolean
          read_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>
        Relationships: []
      }

      audit_logs: {
        Row: {
          id: string
          actor_id: string | null
          actor_role: UserRole | null
          action: AuditAction
          table_name: string
          record_id: string | null
          before_data: Record<string, unknown> | null
          after_data: Record<string, unknown> | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id?: string | null
          actor_role?: UserRole | null
          action: AuditAction
          table_name: string
          record_id?: string | null
          before_data?: Record<string, unknown> | null
          after_data?: Record<string, unknown> | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['audit_logs']['Insert']>
        Relationships: []
      }
    }

    Views: {
      /** 用户公开档案视图：不含 phone、blacklist_reason 等敏感字段 */
      profiles_public: {
        Row: {
          id: string
          nickname: string | null
          avatar_url: string | null
          school_id: string | null
          major_id: string | null
          grade: number | null
          role: UserRole
          verify_status: VerifyStatus
          credit_score: number
          created_at: string
        }
        Relationships: []
      }
    }

    Functions: {
      /** 下单事务：金额服务端计算，锁定商品防超卖 */
      place_order: {
        Args: {
          p_listing_id: string
          p_delivery_method?: DeliveryMethod
          p_address_id?: string | null
          p_locker_id?: string | null
          p_remark?: string | null
        }
        Returns: Database['public']['Tables']['orders']['Row']
      }
      is_admin: { Args: Record<string, never>; Returns: boolean }
      is_staff: { Args: Record<string, never>; Returns: boolean }
      is_verified_student: { Args: Record<string, never>; Returns: boolean }
      is_blacklisted: { Args: Record<string, never>; Returns: boolean }
      current_school_id: { Args: Record<string, never>; Returns: string | null }
    }

    Enums: DatabaseEnums

    CompositeTypes: Record<never, never>
  }
}

// ---------------------------------------------------------------------------
// 便捷类型
// ---------------------------------------------------------------------------

/** 表名联合类型 */
export type TableName = keyof Database['public']['Tables']

/** 取某张表的行类型 */
export type TableRow<T extends TableName> = Database['public']['Tables'][T]['Row']

/** 取某张表的插入类型 */
export type TableInsert<T extends TableName> = Database['public']['Tables'][T]['Insert']

/** 取某张表的更新类型 */
export type TableUpdate<T extends TableName> = Database['public']['Tables'][T]['Update']

/** 取某个视图的行类型 */
export type ViewRow<V extends keyof Database['public']['Views']> =
  Database['public']['Views'][V]['Row']

/** 常用表的行类型别名，业务代码优先引用这些 */
export type ProfileRow = TableRow<'profiles'>
export type PublicProfileRow = ViewRow<'profiles_public'>
export type SchoolRow = TableRow<'schools'>
export type MajorRow = TableRow<'majors'>
export type CourseRow = TableRow<'courses'>
export type AddressRow = TableRow<'user_addresses'>
export type BookRow = TableRow<'books'>
export type BookCategoryRow = TableRow<'book_categories'>
export type ListingRow = TableRow<'listings'>
export type OrderRow = TableRow<'orders'>
export type OrderItemRow = TableRow<'order_items'>
export type RecycleRequestRow = TableRow<'recycle_requests'>
export type CarbonRecordRow = TableRow<'carbon_records'>
export type CouponRow = TableRow<'user_coupons'>
export type NotificationRow = TableRow<'notifications'>
export type LockerRow = TableRow<'smart_lockers'>
