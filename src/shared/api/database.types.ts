/**
 * Supabase 数据库类型占位
 *
 * ⚠️ 当前为占位定义，**阶段 2 必须替换**。
 *
 * 替换步骤：
 *   1. 执行迁移：supabase db push（预发布环境）
 *   2. 生成类型：
 *      supabase gen types typescript --project-id <project-ref> > src/shared/api/database.types.ts
 *   3. 重新执行 pnpm typecheck 确认无类型错误
 *
 * 为什么先用占位而不是留空：
 *   SupabaseClient<Database> 需要 Database 具备 public.Tables 结构，否则
 *   所有查询的返回类型会退化为 unknown，失去类型检查价值。
 *   占位结构让工程可以先跑通，替换后自动获得完整表类型。
 */

/** 占位：数据库 Schema 名称 */
export type DatabaseSchema = 'public'

/** 占位：数据库结构定义 */
export interface Database {
  public: {
    Tables: Record<never, never>
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}

/** 便捷类型：取某张表的行类型（阶段 2 替换 Database 后自动生效） */
export type TableRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T] extends { Row: infer R } ? R : never

/** 便捷类型：取某张表的插入类型 */
export type TableInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T] extends { Insert: infer I } ? I : never

/** 便捷类型：取某张表的更新类型 */
export type TableUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T] extends { Update: infer U } ? U : never
