/**
 * listing 实体 · 数据访问层（图书市场查询）
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 设计决策：为什么用「两次查询 + 应用层合并」而不是 PostgREST 嵌套查询
 * ─────────────────────────────────────────────────────────────────────────
 * PostgREST 支持 `select('*, books(*)')` 一次带回关联数据，但 supabase-js
 * 要推导这种查询的**返回类型**，必须在 Database 类型里为每张表精确声明
 * Relationships 数组（外键名、列、被引用表…）。
 *
 * 本项目在无 Supabase CLI 的环境下手工维护 database.types.ts，
 * 该数组一旦与迁移脱节，编译期就会报出难以定位的类型错误。
 * 因此改为：
 *   1) 先查 listings（显式列 + 过滤 + 排序 + 分页）
 *   2) 收集涉及的 book_id，一次 in() 查询 books
 *   3) 在应用层按 id 合并
 *
 * 收益：
 *   · 类型完全由显式接口约束，不依赖 Relationships 的准确性
 *   · 查询次数固定为 2 次（不是 N+1），性能同样可控
 * 代价：
 *   · 多一次网络往返（约 1 个 RTT）
 *   · 若某 book_id 在 books 中被删除（on delete restrict 已阻止该情况），需容错
 *
 * 若将来接入 `supabase gen types` 生成类型，可平滑改回嵌套查询。
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 其他安全约束：
 *   · 只查询 status = 'active' 且未软删除、且不需要人工复核的挂牌，
 *     与应用层过滤一致（数据库 RLS 已有 listings_select_active 兜底）
 *   · **卖家信息只从 profiles_public 视图读取**：profiles 表含 phone 等
 *     敏感字段，RLS 也只允许本人与运营读取；视图已固定可公开列
 */
import { runOrNull } from '@/shared/api'
import type {
  BookCondition,
  BookRow,
  ListingRow,
  ListingType,
  PublicProfileRow,
} from '@/shared/api'
import { getSupabaseClient } from '@/shared/api'

/** 排序方式 */
export type MarketSort =
  /** 最新上架 */
  | 'newest'
  /** 价格从低到高 */
  | 'price_asc'
  /** 价格从高到低 */
  | 'price_desc'
  /** 品相从好到差 */
  | 'condition_desc'

/** 市场筛选条件（全部可选，未提供即不限制） */
export interface MarketFilter {
  readonly schoolId?: string | null
  /** 专业 id（转为该专业下的课程集合后再过滤） */
  readonly majorId?: string | null
  readonly courseId?: string | null
  readonly conditions?: readonly BookCondition[]
  readonly listingTypes?: readonly ListingType[]
  readonly minPrice?: number | null
  readonly maxPrice?: number | null
  /** 关键词：匹配书名 / 作者 / ISBN */
  readonly keyword?: string | null
}

/** 分页参数 */
export interface MarketPagination {
  /** 页码，从 1 开始 */
  readonly page: number
  /** 每页数量 */
  readonly pageSize: number
}

/** 挂牌 + 所属书目 */
export interface ListingWithBook {
  readonly listing: ListingRow
  readonly book: BookRow
}

/** 市场查询结果 */
export interface MarketQueryResult {
  readonly items: ReadonlyArray<ListingWithBook>
  /** 符合条件的总条数（用于分页） */
  readonly total: number
}

/** 每页数量上限，防止前端传入过大值拖垮数据库 */
const MAX_PAGE_SIZE = 48

/** 默认每页数量 */
export const DEFAULT_PAGE_SIZE = 12

/** 排序字段解析结果 */
interface OrderSpec {
  readonly column: string
  readonly ascending: boolean
  readonly nullsFirst: boolean
}

/**
 * 解析排序配置。
 *
 * 说明：品相枚举的声明顺序（new → like_new → good → fair → poor）
 *       恰好与品相好坏一致，因此按该列升序即「好的在前」。
 */
function resolveOrder(sort: MarketSort): OrderSpec {
  switch (sort) {
    case 'price_asc':
      // 换书/捐赠类型的 price 为 null；nullsFirst: false 让它们排在最后
      return { column: 'price', ascending: true, nullsFirst: false }
    case 'price_desc':
      return { column: 'price', ascending: false, nullsFirst: false }
    case 'condition_desc':
      return { column: 'condition', ascending: true, nullsFirst: false }
    case 'newest':
    default:
      return { column: 'published_at', ascending: false, nullsFirst: false }
  }
}

/**
 * 转义 PostgREST or 表达式中的特殊字符。
 *
 * 为什么必须转义：or 语法用逗号分隔条件、用括号分组，
 * 用户输入若含这些字符会破坏查询结构（不会造成注入，但会让查询报错）。
 */
function escapePostgrestValue(value: string): string {
  return value.replace(/[%,()\\]/g, (char) => `\\${char}`)
}

/** 按专业查询其下全部课程 id */
async function fetchCourseIdsByMajor(majorId: string): Promise<string[]> {
  const client = getSupabaseClient()
  const rows = await runOrNull<Array<{ id: string }>>(
    client.from('courses').select('id').eq('major_id', majorId),
  )
  return (rows ?? []).map((row) => row.id)
}

/** 按 id 批量查询书目 */
async function fetchBooksByIds(bookIds: readonly string[]): Promise<Map<string, BookRow>> {
  const result = new Map<string, BookRow>()

  const unique = [...new Set(bookIds)]
  if (unique.length === 0) {
    return result
  }

  const client = getSupabaseClient()
  const rows = await runOrNull<BookRow[]>(client.from('books').select('*').in('id', unique))

  for (const row of rows ?? []) {
    result.set(row.id, row)
  }

  return result
}

/**
 * 查询图书市场列表。
 *
 * @param filter 筛选条件
 * @param pagination 分页（页码从 1 开始）
 * @param sort 排序方式
 */
export async function fetchMarketListings(
  filter: MarketFilter,
  pagination: MarketPagination,
  sort: MarketSort = 'newest',
): Promise<MarketQueryResult> {
  const client = getSupabaseClient()

  const pageSize = Math.min(Math.max(pagination.pageSize, 1), MAX_PAGE_SIZE)
  const page = Math.max(pagination.page, 1)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // 链式调用不标注类型：每次 eq()/in()/order() 都会改变 supabase-js 的
  // Result 泛型，显式标注会触发「同名类型不兼容」。结果处再断言为 ListingRow。
  let query = client
    .from('listings')
    .select('*', { count: 'exact' })
    .eq('status', 'active')
    .is('deleted_at', null)
    // 人工复核中的挂牌不对外展示（版权风控第二层）
    .eq('need_manual_review', false)

  if (filter.schoolId !== undefined && filter.schoolId !== null && filter.schoolId !== '') {
    query = query.eq('school_id', filter.schoolId)
  }

  if (filter.courseId !== undefined && filter.courseId !== null && filter.courseId !== '') {
    query = query.eq('course_id', filter.courseId)
  }

  if (filter.conditions !== undefined && filter.conditions.length > 0) {
    query = query.in('condition', [...filter.conditions])
  }

  if (filter.listingTypes !== undefined && filter.listingTypes.length > 0) {
    query = query.in('listing_type', [...filter.listingTypes])
  }

  if (filter.minPrice !== undefined && filter.minPrice !== null) {
    query = query.gte('price', filter.minPrice)
  }

  if (filter.maxPrice !== undefined && filter.maxPrice !== null) {
    query = query.lte('price', filter.maxPrice)
  }

  // 专业过滤：PostgREST 无法在单次过滤里做两层关联（listings → courses → majors），
  // 因此先把专业转成课程 id 集合。
  if (filter.majorId !== undefined && filter.majorId !== null && filter.majorId !== '') {
    const courseIds = await fetchCourseIdsByMajor(filter.majorId)

    if (courseIds.length === 0) {
      // 该专业下暂无课程，结果必然为空
      return { items: [], total: 0 }
    }

    query = query.in('course_id', courseIds)
  }

  const keyword = filter.keyword?.trim()
  if (keyword !== undefined && keyword !== '') {
    const safe = escapePostgrestValue(keyword)
    query = query.or(`title.ilike.%${safe}%,author.ilike.%${safe}%,isbn.ilike.%${safe}%`)
  }

  const order = resolveOrder(sort)
  query = query.order(order.column, {
    ascending: order.ascending,
    nullsFirst: order.nullsFirst,
  })

  const { data, error, count } = await query.range(from, to)

  if (error !== null) {
    throw error
  }

  const listings = (data ?? []) as ListingRow[]

  // 第二次查询：批量取书目，避免 N+1
  const booksById = await fetchBooksByIds(listings.map((row) => row.book_id))

  const items: ListingWithBook[] = []
  for (const listing of listings) {
    const book = booksById.get(listing.book_id)
    if (book === undefined) {
      // 书目缺失属异常数据（外键为 on delete restrict，正常不会发生），跳过并保留计数
      continue
    }
    items.push({ listing, book })
  }

  return { items, total: count ?? items.length }
}

/**
 * 查询挂牌详情。
 *
 * @returns 挂牌与书目；不存在或无权访问时返回 null
 */
export async function fetchListingDetail(listingId: string): Promise<ListingWithBook | null> {
  const client = getSupabaseClient()

  const listing = await runOrNull<ListingRow>(
    client.from('listings').select('*').eq('id', listingId).maybeSingle(),
  )

  if (listing === null) {
    return null
  }

  const book = await runOrNull<BookRow>(
    client.from('books').select('*').eq('id', listing.book_id).maybeSingle(),
  )

  if (book === null) {
    return null
  }

  return { listing, book }
}

/**
 * 批量查询卖家公开档案。
 *
 * ⚠️ 只读 profiles_public 视图。
 *    直接查 profiles 表会因 RLS 限制拿不到他人数据（策略仅允许本人与运营），
 *    且即使能拿到也会暴露 phone 等敏感字段。
 *
 * @returns id → 公开档案 的映射
 */
export async function fetchPublicProfiles(
  userIds: readonly string[],
): Promise<Map<string, PublicProfileRow>> {
  const result = new Map<string, PublicProfileRow>()

  const unique = [...new Set(userIds)].filter((id) => id !== '')
  if (unique.length === 0) {
    return result
  }

  const client = getSupabaseClient()
  const rows = await runOrNull<PublicProfileRow[]>(
    client.from('profiles_public').select('*').in('id', unique),
  )

  for (const row of rows ?? []) {
    result.set(row.id, row)
  }

  return result
}

/**
 * 统计某校在售挂牌数量。
 *
 * 用途：首页展示「本校现有 N 册在售」，帮助用户判断平台活跃度。
 * 使用 head: true 只取计数，不传输数据行。
 */
export async function countSchoolListings(schoolId: string): Promise<number> {
  const client = getSupabaseClient()

  const { count, error } = await client
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .eq('need_manual_review', false)
    .is('deleted_at', null)
    .eq('school_id', schoolId)

  if (error !== null) {
    return 0
  }

  return count ?? 0
}

/**
 * 增加挂牌浏览量。
 *
 * ⚠️ 当前实现为「读当前值 + 1」，存在并发丢失，且 RLS 的 listings_update_own
 *    只允许卖家本人更新，因此普通用户调用会**静默失败**。
 *    真实浏览量应由服务端在 Edge Function 中累加（阶段后续实现）。
 *    保留本函数作为调用点占位，避免页面代码后续大改。
 */
export async function incrementViewCount(listingId: string): Promise<void> {
  void listingId
}
