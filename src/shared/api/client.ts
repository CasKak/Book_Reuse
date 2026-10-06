/**
 * 统一 API 客户端
 *
 * 解决的问题：
 *   1. Supabase SDK 的错误信息是英文且偏技术（如 "JWT expired"），
 *      直接展示给学生不友好，这里统一翻译为可读中文。
 *   2. 每个调用点都写 try/catch 与错误转换会大量重复。
 *   3. 区分「预期内的业务失败」与「意外异常」，便于上层决定是否上报。
 *
 * 设计取舍：
 *   · supabase-js 的查询构造器（PostgrestFilterBuilder）是 thenable，
 *     因此这里的 run() 接收的是「已构造但未执行的查询」，由 run 负责 await。
 *   · 不使用 any：错误统一走 unknown + 类型守卫。
 */
import type { PostgrestError } from '@supabase/supabase-js'

/** 错误分类 */
export type ApiErrorKind =
  /** 未登录或登录已过期 */
  | 'unauthenticated'
  /** 已登录但无权限（多由 RLS 策略拒绝） */
  | 'forbidden'
  /** 违反数据库约束（唯一键、检查约束、触发器 raise） */
  | 'conflict'
  /** 目标不存在 */
  | 'not_found'
  /** 请求参数不合法 */
  | 'invalid'
  /** 超出速率限制 */
  | 'rate_limited'
  /** 网络不可达或超时 */
  | 'network'
  /** 其它未归类错误 */
  | 'unknown'

/** 统一的 API 错误对象 */
export class ApiError extends Error {
  /** 显式 override：基类 Error 已声明 name */
  override readonly name = 'ApiError'
  readonly kind: ApiErrorKind
  /** 原始错误码（PostgreSQL SQLSTATE 或 HTTP 状态码） */
  readonly code: string | null
  /** 面向用户的中文提示 */
  readonly userMessage: string
  /** 原始错误，便于排查（不直接展示）。override 因为 ES2022 的 Error 已有 cause */
  override readonly cause: unknown

  constructor(params: {
    kind: ApiErrorKind
    userMessage: string
    code?: string | null
    cause?: unknown
  }) {
    super(params.userMessage)
    this.kind = params.kind
    this.userMessage = params.userMessage
    this.code = params.code ?? null
    this.cause = params.cause
  }

  /** 是否为「需要重新登录」类错误 */
  get requiresReauth(): boolean {
    return this.kind === 'unauthenticated'
  }

  /** 是否为「权限不足」类错误 */
  get isPermissionDenied(): boolean {
    return this.kind === 'forbidden'
  }
}

/** 宽松判断：对象是否含 PostgrestError 的关键字段 */
function isPostgrestError(value: unknown): value is PostgrestError {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return typeof candidate['message'] === 'string' && typeof candidate['code'] === 'string'
}

/**
 * 把 PostgreSQL SQLSTATE 与错误信息映射为错误分类与中文提示。
 *
 * SQLSTATE 参考：
 *   42501 insufficient_privilege —— RLS 拒绝或无 GRANT
 *   23505 unique_violation       —— 唯一约束冲突
 *   23514 check_violation        —— 检查约束 / 触发器 raise
 *   23503 foreign_key_violation  —— 外键约束
 *   PGRST301                     —— PostgREST：JWT 过期
 *   PGRST116                     —— PostgREST：单行查询无结果
 */
function classify(error: PostgrestError): { kind: ApiErrorKind; userMessage: string } {
  const code = error.code
  const message = error.message.toLowerCase()

  // PostgREST 层错误
  if (code === 'PGRST301' || message.includes('jwt expired')) {
    return { kind: 'unauthenticated', userMessage: '登录已过期，请重新登录' }
  }
  if (code === 'PGRST116') {
    return { kind: 'not_found', userMessage: '未找到相关数据' }
  }

  // 数据库层错误
  switch (code) {
    case '42501':
      // 触发器 raise 的中文信息已经在 message 中，优先透出
      return {
        kind: 'forbidden',
        userMessage: pickChineseMessage(error.message) ?? '没有权限执行该操作',
      }
    case '23505':
      return {
        kind: 'conflict',
        userMessage: pickChineseMessage(error.message) ?? '数据已存在，请勿重复提交',
      }
    case '23514':
      return {
        kind: 'invalid',
        userMessage: pickChineseMessage(error.message) ?? '提交的数据不符合要求',
      }
    case '23503':
      return { kind: 'invalid', userMessage: '关联数据不存在，请刷新后重试' }
    default:
      break
  }

  if (message.includes('rate limit') || code === '429') {
    return { kind: 'rate_limited', userMessage: '操作过于频繁，请稍后再试' }
  }
  if (message.includes('failed to fetch') || message.includes('networkerror')) {
    return { kind: 'network', userMessage: '网络连接失败，请检查网络后重试' }
  }
  if (message.includes('invalid login credentials')) {
    return { kind: 'unauthenticated', userMessage: '邮箱或密码不正确' }
  }
  if (message.includes('email not confirmed')) {
    return { kind: 'unauthenticated', userMessage: '邮箱尚未验证，请先完成验证' }
  }
  if (message.includes('user already registered')) {
    return { kind: 'conflict', userMessage: '该邮箱已注册，请直接登录' }
  }

  return { kind: 'unknown', userMessage: '操作失败，请稍后重试' }
}

/**
 * 从错误信息中提取中文提示。
 *
 * 背景：本项目的数据库触发器与约束用中文 raise exception（例如
 * 「书目未通过 ISBN 权威库校验，禁止上架」），这类信息对用户最有价值，
 * 应优先透出而不是替换成通用文案。
 */
function pickChineseMessage(message: string): string | null {
  const hasChinese = /[\u4e00-\u9fff]/.test(message)
  if (!hasChinese) {
    return null
  }
  // 去掉 Supabase 追加的技术前缀，只保留第一行中文说明
  const firstLine = message.split('\n')[0]?.trim() ?? ''
  return firstLine.length > 0 ? firstLine : null
}

/** 从任意异常构造 ApiError */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error
  }

  if (isPostgrestError(error)) {
    const { kind, userMessage } = classify(error)
    return new ApiError({ kind, userMessage, code: error.code, cause: error })
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    if (message.includes('failed to fetch') || message.includes('networkerror')) {
      return new ApiError({
        kind: 'network',
        userMessage: '网络连接失败，请检查网络后重试',
        cause: error,
      })
    }
    if (error.name === 'AbortError') {
      return new ApiError({ kind: 'network', userMessage: '请求超时，请重试', cause: error })
    }
    return new ApiError({ kind: 'unknown', userMessage: error.message, cause: error })
  }

  return new ApiError({ kind: 'unknown', userMessage: '发生未知错误', cause: error })
}

/**
 * Supabase 查询构造器 / 响应对象的运行期结构
 *
 * ⚠️ 类型设计说明（经过多轮实测与试错，改动前请务必读完）
 * ---------------------------------------------------------------------------
 * 实测结论（用类型探针逐一验证过）：
 *   · supabase-js 的查询构造器（PostgrestFilterBuilder）**本身不含 data/error**，
 *     这两个字段只出现在 await 之后的响应对象上；
 *   · 各种查询 await 后的形状统一为 PostgrestSingleResponse<D>：
 *       select('*')                        → D = Row[]
 *       select('*').eq(...)                → D = Row[]
 *       select('*').eq(...).single()       → D = Row
 *       select('*').eq(...).maybeSingle()  → D = Row | null
 *   · 因此「从构造器自动推导 D」需要依赖 postgrest-js 内部的复杂泛型，
 *     而它的 `then` 把 onrejected 声明为 `(reason: any)`，任何自建约束都会
 *     在协变/逆变比较中失败，并把泛型推断退化为 never / {}。
 *
 * 最终方案（简单、可预测、不需要与 SDK 泛型搏斗）：
 *   · 本模块用**结构化强转**完成「await → 校验 error → 返回 data」，
 *     不做自动类型推导；
 *   · 调用方显式声明数据类型，把「运行时形状」与「静态类型」对齐：
 *       const rows = await run<ListingRow[]>(client.from('listings').select('*'))
 *       const one  = await run<ProfileRow>(client.from('profiles')...single())
 *       const opt  = await runOrNull<ProfileRow>(client.from('profiles')...maybeSingle())
 *
 * 这样做的代价是调用处要写一次类型参数；收益是类型行为完全确定性，
 * 不会出现「改一行查询就报莫名 never 错误」的情况。
 * ---------------------------------------------------------------------------
 */
interface QueryResultLike {
  readonly data: unknown
  readonly error: PostgrestError | null
}

/** 可 await 的查询对象（运行时是 thenable；编译期只关心 await 结果） */
type AnyQuery = PromiseLike<QueryResultLike> | QueryResultLike

/** 把查询结果做统一校验，返回 data 或抛出 ApiError */
async function unwrap(query: AnyQuery, options?: { allowNull?: boolean }): Promise<unknown> {
  let result: QueryResultLike

  try {
    result = await (query as PromiseLike<QueryResultLike>)
  } catch (error) {
    // 网络层异常不会走 error 字段
    throw toApiError(error)
  }

  if (result.error !== null) {
    throw toApiError(result.error)
  }

  if (result.data === null && options?.allowNull !== true) {
    throw new ApiError({ kind: 'not_found', userMessage: '未找到相关数据' })
  }

  return result.data
}

/**
 * 执行一次 Supabase 查询，失败时抛出 ApiError。
 *
 * ⚠️ 需要显式传入数据类型 T（原因见本文件顶部的类型设计说明）：
 *   · 列表查询传 `T[]`；单行查询（.single()）传 `T`
 *
 * @example
 * const rows = await run<ListingRow[]>(client.from('listings').select('*'))
 * const one  = await run<ProfileRow>(client.from('profiles').select('*').eq('id', id).single())
 */
export async function run<T>(query: AnyQuery): Promise<T> {
  return (await unwrap(query)) as T
}

/**
 * 执行一次 Supabase 查询，失败或为空时返回 null 而不抛错。
 *
 * 适用场景：
 *   · 可选数据（如「当前用户是否已收藏」）
 *   · 使用 maybeSingle() 的查询，无结果属正常情况
 *
 * @example
 * const row = await runOrNull<ProfileRow>(client.from('profiles').select('*').eq('id', id).maybeSingle())
 * const list = await runOrNull<SchoolRow[]>(client.from('schools').select('*'))
 */
export async function runOrNull<T>(query: AnyQuery): Promise<T | null> {
  try {
    return (await unwrap(query, { allowNull: true })) as T | null
  } catch {
    return null
  }
}
