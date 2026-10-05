/**
 * Supabase 客户端
 *
 * 设计要点：
 *   1. **懒加载单例**：模块被导入时不会立即创建客户端，避免在没有环境变量时
 *      直接抛错影响单元测试；首次调用 getSupabaseClient() 时才创建。
 *   2. **不使用 any**：SupabaseClient 的泛型参数使用 Database 占位类型，
 *      阶段 2 迁移完成后通过 `supabase gen types` 替换为真实生成类型。
 *   3. **安全边界**：这里只使用 anon key。service_role key 绝不出现在前端，
 *      所有需要绕过 RLS 的操作必须放在 Edge Functions 中。
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { env } from '@/shared/config/env'

import type { Database } from './database.types'

/** Supabase 客户端的类型别名，便于其他模块引用 */
export type AppSupabaseClient = SupabaseClient<Database>

let client: AppSupabaseClient | null = null

/**
 * 获取 Supabase 客户端（懒加载单例）。
 *
 * 配置说明：
 *   - persistSession: 持久化登录态到 localStorage，刷新页面不丢登录
 *   - autoRefreshToken: 自动续期 access token，避免长时间停留后请求失败
 *   - detectSessionInUrl: 支持从邮箱验证/魔法链接跳回时自动建立会话
 */
export function getSupabaseClient(): AppSupabaseClient {
  if (client !== null) {
    return client
  }

  client = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  return client
}

/**
 * 重置客户端单例。
 *
 * 使用场景：用户登出后需要彻底清除会话、或单元测试之间需要隔离状态。
 */
export function resetSupabaseClient(): void {
  client = null
}

/** 与数据库的连接健康检查结果 */
export interface DatabaseHealth {
  /** 是否连通 */
  readonly ok: boolean
  /** 失败原因（仅 ok 为 false 时存在） */
  readonly reason?: string
}

/**
 * 探测与 Supabase 的连通性。
 *
 * 用于开发期自检：环境变量配置错误、网络不通、项目被暂停时能快速定位。
 * 注意：不查询任何业务表，避免依赖尚未创建的迁移。
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  try {
    const { error } = await getSupabaseClient().auth.getSession()

    if (error !== null) {
      return { ok: false, reason: error.message }
    }

    return { ok: true }
  } catch (error) {
    // 网络层异常（DNS、TLS、超时）不会走上面的 error 分支
    const reason = error instanceof Error ? error.message : String(error)
    return { ok: false, reason }
  }
}
