/**
 * book 实体 · 类型定义与展示辅助
 *
 * 分成两个概念（对应数据库设计）：
 *   · Book    书目元数据（一本书），如《高等数学（上册）》
 *   · Listing 挂牌（具体某一册），如「张三的 9 成新高等数学」
 *   一本 Book 可对应多个 Listing。
 */
import type { BookCondition, BookRow, ListingType } from '@/shared/api'

/** 品相的可展示信息 */
export interface ConditionDisplay {
  readonly label: string
  readonly tone: 'success' | 'info' | 'warning' | 'danger'
  /** 面向用户的品相说明 */
  readonly hint: string
  /** 排序权重：数值越大品相越好，用于列表排序 */
  readonly rank: number
}

/**
 * 品相映射
 *
 * 说明：与数据库枚举 book_condition 一一对应。
 *       hint 文案参考商业计划书对品相维度的描述（封面、内页、书写痕迹、缺页、破损）。
 */
const CONDITION_MAP: Record<BookCondition, ConditionDisplay> = {
  new: {
    label: '全新',
    tone: 'success',
    hint: '未拆封或几乎未使用',
    rank: 5,
  },
  like_new: {
    label: '9 成新',
    tone: 'success',
    hint: '仅翻阅过，无笔记与划线',
    rank: 4,
  },
  good: {
    label: '8 成新',
    tone: 'info',
    hint: '有少量笔记或划线，不影响阅读',
    rank: 3,
  },
  fair: {
    label: '7 成新',
    tone: 'warning',
    hint: '有明显使用痕迹或书角磨损',
    rank: 2,
  },
  poor: {
    label: '有瑕疵',
    tone: 'danger',
    hint: '有破损或缺页，已如实描述',
    rank: 1,
  },
}

/** 取品相展示信息 */
export function describeCondition(condition: BookCondition): ConditionDisplay {
  return CONDITION_MAP[condition]
}

/** 全部品相选项（供筛选器使用，按品相从好到差） */
export const CONDITION_OPTIONS: ReadonlyArray<{ value: BookCondition; label: string }> = (
  ['new', 'like_new', 'good', 'fair', 'poor'] as const
).map((value) => ({ value, label: CONDITION_MAP[value].label }))

/** 交易类型的可展示信息 */
export interface ListingTypeDisplay {
  readonly label: string
  readonly tone: 'primary' | 'success' | 'warning' | 'info'
  readonly hint: string
}

const LISTING_TYPE_MAP: Record<ListingType, ListingTypeDisplay> = {
  sell: {
    label: '出售',
    tone: 'primary',
    hint: '可直接下单购买',
  },
  exchange: {
    label: '换书',
    tone: 'success',
    hint: '希望与他人交换图书',
  },
  rent: {
    label: '租赁',
    tone: 'warning',
    hint: '按学期或按月租赁，需付押金',
  },
  donate: {
    label: '捐赠',
    tone: 'info',
    hint: '免费捐赠，用于公益流转',
  },
}

/** 取交易类型展示信息 */
export function describeListingType(type: ListingType): ListingTypeDisplay {
  return LISTING_TYPE_MAP[type]
}

/** 全部交易类型选项（供筛选器使用） */
export const LISTING_TYPE_OPTIONS: ReadonlyArray<{ value: ListingType; label: string }> = (
  ['sell', 'exchange', 'rent', 'donate'] as const
).map((value) => ({ value, label: LISTING_TYPE_MAP[value].label }))

/**
 * 书目的展示视图模型
 */
export interface BookViewModel {
  readonly id: string
  readonly isbn: string | null
  readonly title: string
  readonly author: string
  readonly publisher: string
  readonly listPrice: number | null
  readonly coverUrl: string | null
  readonly categoryId: string | null
  /**
   * 是否已通过 ISBN 权威库校验。
   *
   * ⚠️ 版权风控第一层（商业计划书 9.1 节）：
   *    未校验的书目不允许上架，界面上也要给出明确提示。
   */
  readonly isVerified: boolean
  /** 元数据来源说明（数据可核验要求） */
  readonly sourceNote: string | null
}

/** 未填写时的占位文案，避免界面出现空白或 null */
const UNKNOWN = '未标注'

/** 把 books 行映射为展示视图模型 */
export function toBookViewModel(row: BookRow): BookViewModel {
  return {
    id: row.id,
    isbn: row.isbn,
    title: row.title,
    author: row.author?.trim() !== undefined && row.author.trim() !== '' ? row.author : UNKNOWN,
    publisher:
      row.publisher?.trim() !== undefined && row.publisher.trim() !== ''
        ? row.publisher
        : UNKNOWN,
    listPrice: row.list_price,
    coverUrl: row.cover_url,
    categoryId: row.category_id,
    isVerified: row.is_verified,
    sourceNote: row.source_note,
  }
}

/**
 * 展示用 ISBN：为空时给出占位说明，便于用户理解为何该书目未经校验。
 */
export function formatIsbn(isbn: string | null): string {
  if (isbn === null || isbn.trim() === '') {
    return '无 ISBN'
  }
  return isbn
}
