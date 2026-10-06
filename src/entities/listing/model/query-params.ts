/**
 * 图书市场的 URL 查询参数 ⇄ 筛选条件 的相互转换
 *
 * 为什么用 URL 承载筛选状态：
 *   1. 学生可以把筛选结果直接分享给同学（「我们专业 8 成新以上的教材」）
 *   2. 刷新页面不丢筛选条件
 *   3. 浏览器前进/后退可用
 *
 * 设计取舍：
 *   · 参数值一律用短英文键，URL 更短且稳定（不随界面文案变化）
 *   · 未设置的参数不出现在 URL 中，保持链接干净
 *   · 解析时对非法值做降级处理（忽略而不是报错），避免手工改 URL 导致白屏
 */
import type { BookCondition, ListingType } from '@/shared/api'

import type { MarketFilter, MarketSort } from '../api/queries'

/** URL 查询参数键名 */
export const MARKET_QUERY_KEYS = {
  keyword: 'q',
  schoolId: 'school',
  majorId: 'major',
  courseId: 'course',
  conditions: 'cond',
  listingTypes: 'type',
  minPrice: 'min',
  maxPrice: 'max',
  sort: 'sort',
  page: 'page',
} as const

/** 可用的排序方式（含界面文案） */
export const MARKET_SORT_OPTIONS: ReadonlyArray<{ value: MarketSort; label: string }> = [
  { value: 'newest', label: '最新上架' },
  { value: 'price_asc', label: '价格从低到高' },
  { value: 'price_desc', label: '价格从高到低' },
  { value: 'condition_desc', label: '品相从好到差' },
]

/** 合法的品相取值 */
const VALID_CONDITIONS: readonly BookCondition[] = ['new', 'like_new', 'good', 'fair', 'poor']

/** 合法的交易类型取值 */
const VALID_LISTING_TYPES: readonly ListingType[] = ['sell', 'exchange', 'rent', 'donate']

/** 合法的排序取值 */
const VALID_SORTS: readonly MarketSort[] = ['newest', 'price_asc', 'price_desc', 'condition_desc']

/** 从 URL 查询参数解析出的完整市场状态 */
export interface MarketQueryState {
  readonly filter: MarketFilter
  readonly sort: MarketSort
  readonly page: number
}

/** 把可能为数组的查询参数取成单值字符串 */
function pickString(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0]
  }
  return ''
}

/** 解析逗号分隔的多选参数，并过滤非法值 */
function parseMulti<T extends string>(value: unknown, valid: readonly T[]): T[] {
  const raw = pickString(value)
  if (raw === '') {
    return []
  }

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is T => (valid as readonly string[]).includes(item))
}

/** 解析非负数字参数；非法或负数返回 null */
function parseNumber(value: unknown): number | null {
  const raw = pickString(value)
  if (raw === '') {
    return null
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }

  return parsed
}

/** 解析正整数页码；非法时回到第 1 页 */
function parsePage(value: unknown): number {
  const parsed = parseNumber(value)
  if (parsed === null || parsed < 1) {
    return 1
  }
  return Math.floor(parsed)
}

/**
 * 从路由查询参数解析市场状态。
 *
 * ⚠️ 容错策略：任何非法值都被**忽略**而非抛错。
 *    用户手工改 URL 或旧链接失效时，页面应正常渲染而不是白屏。
 */
export function parseMarketQuery(query: Record<string, unknown>): MarketQueryState {
  const sortRaw = pickString(query[MARKET_QUERY_KEYS.sort])
  const sort = (VALID_SORTS as readonly string[]).includes(sortRaw)
    ? (sortRaw as MarketSort)
    : 'newest'

  const keyword = pickString(query[MARKET_QUERY_KEYS.keyword]).trim()
  const minPrice = parseNumber(query[MARKET_QUERY_KEYS.minPrice])
  const maxPrice = parseNumber(query[MARKET_QUERY_KEYS.maxPrice])

  // 最低价高于最高价时交换，避免用户得到空结果却不知原因
  const [normalizedMin, normalizedMax] =
    minPrice !== null && maxPrice !== null && minPrice > maxPrice
      ? [maxPrice, minPrice]
      : [minPrice, maxPrice]

  return {
    filter: {
      keyword: keyword === '' ? null : keyword,
      schoolId: emptyToNull(pickString(query[MARKET_QUERY_KEYS.schoolId])),
      majorId: emptyToNull(pickString(query[MARKET_QUERY_KEYS.majorId])),
      courseId: emptyToNull(pickString(query[MARKET_QUERY_KEYS.courseId])),
      conditions: parseMulti(query[MARKET_QUERY_KEYS.conditions], VALID_CONDITIONS),
      listingTypes: parseMulti(query[MARKET_QUERY_KEYS.listingTypes], VALID_LISTING_TYPES),
      minPrice: normalizedMin,
      maxPrice: normalizedMax,
    },
    sort,
    page: parsePage(query[MARKET_QUERY_KEYS.page]),
  }
}

function emptyToNull(value: string): string | null {
  return value === '' ? null : value
}

/**
 * 把市场状态序列化为路由查询参数。
 *
 * 只输出有值的参数，保持 URL 简洁；页码为 1 时省略。
 */
export function buildMarketQuery(state: MarketQueryState): Record<string, string> {
  const result: Record<string, string> = {}
  const { filter, sort, page } = state

  const keyword = filter.keyword?.trim()
  if (keyword !== undefined && keyword !== '') {
    result[MARKET_QUERY_KEYS.keyword] = keyword
  }
  if (filter.schoolId !== undefined && filter.schoolId !== null) {
    result[MARKET_QUERY_KEYS.schoolId] = filter.schoolId
  }
  if (filter.majorId !== undefined && filter.majorId !== null) {
    result[MARKET_QUERY_KEYS.majorId] = filter.majorId
  }
  if (filter.courseId !== undefined && filter.courseId !== null) {
    result[MARKET_QUERY_KEYS.courseId] = filter.courseId
  }
  if (filter.conditions !== undefined && filter.conditions.length > 0) {
    result[MARKET_QUERY_KEYS.conditions] = filter.conditions.join(',')
  }
  if (filter.listingTypes !== undefined && filter.listingTypes.length > 0) {
    result[MARKET_QUERY_KEYS.listingTypes] = filter.listingTypes.join(',')
  }
  if (filter.minPrice !== undefined && filter.minPrice !== null) {
    result[MARKET_QUERY_KEYS.minPrice] = String(filter.minPrice)
  }
  if (filter.maxPrice !== undefined && filter.maxPrice !== null) {
    result[MARKET_QUERY_KEYS.maxPrice] = String(filter.maxPrice)
  }
  if (sort !== 'newest') {
    result[MARKET_QUERY_KEYS.sort] = sort
  }
  if (page > 1) {
    result[MARKET_QUERY_KEYS.page] = String(page)
  }

  return result
}

/** 判断当前是否设置了任何筛选条件（不含排序与页码） */
export function hasActiveFilter(filter: MarketFilter): boolean {
  const keyword = filter.keyword?.trim()
  return (
    (keyword !== undefined && keyword !== '') ||
    (filter.schoolId !== undefined && filter.schoolId !== null) ||
    (filter.majorId !== undefined && filter.majorId !== null) ||
    (filter.courseId !== undefined && filter.courseId !== null) ||
    (filter.conditions !== undefined && filter.conditions.length > 0) ||
    (filter.listingTypes !== undefined && filter.listingTypes.length > 0) ||
    (filter.minPrice !== undefined && filter.minPrice !== null) ||
    (filter.maxPrice !== undefined && filter.maxPrice !== null)
  )
}

/** 统计已启用的筛选条件数量（用于「已选 N 项」提示） */
export function countActiveFilters(filter: MarketFilter): number {
  let count = 0

  const keyword = filter.keyword?.trim()
  if (keyword !== undefined && keyword !== '') count += 1
  if (filter.schoolId !== undefined && filter.schoolId !== null) count += 1
  if (filter.majorId !== undefined && filter.majorId !== null) count += 1
  if (filter.courseId !== undefined && filter.courseId !== null) count += 1
  if (filter.conditions !== undefined && filter.conditions.length > 0) count += 1
  if (filter.listingTypes !== undefined && filter.listingTypes.length > 0) count += 1
  if (filter.minPrice !== undefined && filter.minPrice !== null) count += 1
  if (filter.maxPrice !== undefined && filter.maxPrice !== null) count += 1

  return count
}

/** 生成一个「清空全部筛选」的查询参数（保留排序） */
export function buildClearedQuery(sort: MarketSort): Record<string, string> {
  return sort === 'newest' ? {} : { [MARKET_QUERY_KEYS.sort]: sort }
}
