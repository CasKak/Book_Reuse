/**
 * 环境变量读取与校验
 *
 * 设计要点：
 *   1. 用 Zod 在**运行时**校验，缺失或格式错误立即抛错，避免出现
 *      "undefined" 被当成字符串拼接进请求 URL 的隐性故障。
 *   2. 只在 shared 层读取一次 import.meta.env，其他模块统一从这里取，
 *      避免散落的 import.meta.env.XXX 导致难以排查。
 *   3. 本模块只处理**可公开**变量。任何密钥都不应出现在这里。
 *
 * 安全提示：VITE_ 前缀变量会被打包进前端产物，可被任意访问者查看。
 *          真正的访问控制由数据库 RLS 策略承担，而非靠隐藏 key。
 */
import { z } from 'zod'

/** 环境变量 Schema */
const envSchema = z.object({
  /** Supabase 项目 URL */
  VITE_SUPABASE_URL: z
    .string()
    .min(1, 'VITE_SUPABASE_URL 未配置')
    .refine(
      (value) => value.startsWith('https://'),
      'VITE_SUPABASE_URL 必须以 https:// 开头（Supabase 要求 HTTPS）',
    )
    .refine(
      (value) => !value.endsWith('/'),
      'VITE_SUPABASE_URL 结尾不要带斜杠，否则会拼接出 //rest/v1 这类非法路径',
    ),

  /** Supabase anon / publishable key（权限受 RLS 约束，可公开） */
  VITE_SUPABASE_ANON_KEY: z.string().min(20, 'VITE_SUPABASE_ANON_KEY 未配置或长度异常'),

  /** 运行环境 */
  VITE_APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),

  /** 站点标题 */
  VITE_APP_TITLE: z.string().min(1).default('青阅循环'),
})

/** 校验通过后的环境变量类型 */
export type AppEnv = z.infer<typeof envSchema>

/**
 * 解析环境变量。
 *
 * 注意：使用白名单方式逐个取值，而不是把整个 import.meta.env 传进去，
 *       这样既能拿到正确的类型，也能避免把无关变量（如 MODE/DEV）混入。
 */
function resolveEnv(): AppEnv {
  const raw: Record<string, unknown> = {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
    VITE_APP_ENV: import.meta.env.VITE_APP_ENV,
    VITE_APP_TITLE: import.meta.env.VITE_APP_TITLE,
  }

  const result = envSchema.safeParse(raw)

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  · ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')

    throw new Error(
      `环境变量校验失败，请检查项目根目录的 .env.local 文件：\n${details}\n\n` +
        '获取方式：\n' +
        '  1. 复制模板：cp .env.example .env.local\n' +
        '  2. 填入 Supabase 项目 URL 与 anon key（Supabase 后台 → Project Settings → API）\n' +
        '  3. 重启开发服务器：pnpm dev\n',
    )
  }

  return result.data
}

/**
 * 应用环境变量（单例）。
 *
 * 首次访问时校验；校验失败会抛出带中文排错指引的错误。
 */
export const env: AppEnv = resolveEnv()

/** 是否本地开发环境 */
export const isLocal: boolean = env.VITE_APP_ENV === 'local'

/** 是否生产环境 */
export const isProduction: boolean = env.VITE_APP_ENV === 'production'
