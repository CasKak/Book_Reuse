/**
 * listing 实体 · 类型定义与展示辅助
 *
 * 核心概念：挂牌（listing）= 具体某一册图书的交易信息。
 * 列表页与详情页都基于本文件的视图模型渲染，避免组件里散落字段映射逻辑。
 */
import type {
  BookCondition,
  ListingRow,
  ListingStatus,
  ListingType,
  ProfileRow,
  PublicProfileRow,
} from '@/shared/api'

import { describeCondition, describeListingType } from '@/entities/book'
import type { BookViewModel } from '@/entities/book'

/** 挂牌状态的可展示信息 */
export interface ListingStatusDisplay {
  readonly label: string
  readonly tone: 'success' | 'info' | 'warning' | 'danger'
  /** 该状态下是否可被购买 */
  readonly purchasable: boolean
}

const LISTING_STATUS_MAP: Record<ListingStatus, ListingStatusDisplay> = {
  draft: { label: '草稿', tone: 'info', purchasable: false },
  pending_review: { label: '待审核', tone: 'warning', purchasable: false },
  active: { label: '在售', tone: 'success', purchasable: true },
  reserved: { label: '已预定', tone: 'warning', purchasable: false },
  sold: { label: '已售出', tone: 'info', purchasable: false },
  exchanging: { label: '换书中', tone: 'warning', purchasable: false },
  rented: { label: '已租出', tone: 'info', purchasable: false },
  donated: { label: '已捐赠', tone: 'info', purchasable: false },
  rejected: { label: '审核未通过', tone: 'danger', purchasable: false },
  delisted: { label: '已下架', tone: 'info', purchasable: false },
}

/** 取挂牌状态展示信息 */
export function describeListingStatus(status: ListingStatus): ListingStatusDisplay {
  return LISTING_STATUS_MAP[status]
}

/**
 * 计算相对图书定价的折扣。
 *
 * @returns 形如「3.2 折」；缺定价或缺售价时返回 null（界面不展示折扣）
 */
export function formatDiscount(
  price: number | null,
  listPrice: number | null,
): string | null {
  if (price === null || listPrice === null || listPrice <= 0 || price <= 0) {
    return null
  }

  const ratio = price / listPrice

  // 高于或等于原价时不展示「折扣」，避免出现「10 折」「12 折」这类无意义文案
  if (ratio >= 1) {
    return null
  }

  return `${(ratio * 10).toFixed(1)} 折`
}

/**
 * 是否为「需询价」的挂牌。
 *
 * 业务背景：换书与捐赠类型没有售价（price 为 null），
 * 此时界面不能显示 ¥0.00，而要显示「面议 / 免费」。
 * 对应数据库约束：price 可为 null。
 */
export function isPriceNegotiable(listingType: ListingType, price: number | null): boolean {
  if (price !== null && price > 0) {
    return false
  }
  return listingType === 'exchange' || listingType === 'donate'
}

/**
 * 价格展示文案。
 *
 * @returns 出售/租赁返回金额文案；换书/捐赠返回「面议」或「免费」
 */
export function formatListingPrice(
  listingType: ListingType,
  price: number | null,
): { readonly text: string; readonly emphasis: boolean } {
  if (price !== null && price > 0) {
    return { text: `¥${price.toFixed(2)}`, emphasis: true }
  }

  if (listingType === 'donate') {
    return { text: '免费领取', emphasis: false }
  }

  return { text: '面议', emphasis: false }
}

/**
 * 挂牌的展示视图模型。
 *
 * 同时承载书目信息与卖家公开信息，供列表与详情共用。
 */
export interface ListingViewModel {
  readonly id: string
  readonly listingType: ListingType
  readonly listingTypeLabel: string
  readonly status: ListingStatus
  readonly statusLabel: string
  readonly purchasable: boolean

  // ---------- 书目 ----------
  readonly book: BookViewModel

  // ---------- 品相 ----------
  /** 卖家自评品相 */
  readonly condition: BookCondition
  readonly conditionLabel: string
  readonly conditionTone: 'success' | 'info' | 'warning' | 'danger'
  readonly conditionHint: string
  /**
   * 人工质检终值。
   * ⚠️ 与卖家自评不一致时，界面需提示「以质检结果为准」。
   */
  readonly conditionFinal: BookCondition | null
  readonly conditionFinalLabel: string | null
  readonly hasFinalCondition: boolean

  // ---------- 价格 ----------
  readonly price: number | null
  readonly priceText: string
  readonly priceEmphasis: boolean
  readonly discountText: string | null
  /** 租赁押金（仅租赁类型有值） */
  readonly deposit: number | null
  /** 月租金（仅租赁类型有值） */
  readonly rentalPriceMonth: number | null

  // ---------- 交易信息 ----------
  readonly description: string | null
  readonly schoolId: string | null
  readonly courseId: string | null
  readonly deliveryMethod: string | null
  readonly viewCount: number
  readonly publishedAt: string | null

  // ---------- 卖家 ----------
  readonly sellerId: string
  readonly sellerNickname: string
  readonly sellerAvatarUrl: string | null
  readonly sellerVerified: boolean

  /**
   * 是否需要人工复核（AI 置信度低或疑似资料类）。
   * ⚠️ 版权风控第二层：此类挂牌不应对普通用户展示为可购买。
   */
  readonly needManualReview: boolean
}

/** 卖家信息的两种来源：自己的完整档案或他人的公开档案 */
export type SellerSource = ProfileRow | PublicProfileRow

/** 从档案中提取可公开的卖家展示信息 */
function pickSellerInfo(seller: SellerSource | null): {
  readonly nickname: string
  readonly avatarUrl: string | null
  readonly verified: boolean
} {
  if (seller === null) {
    return { nickname: '未知用户', avatarUrl: null, verified: false }
  }

  const nickname = seller.nickname?.trim()
  return {
    nickname: nickname !== undefined && nickname !== '' ? nickname : '未设置昵称',
    avatarUrl: seller.avatar_url,
    verified: seller.verify_status === 'verified',
  }
}

/** 把数据库行映射为展示视图模型 */
export function toListingViewModel(params: {
  readonly listing: ListingRow
  readonly book: BookViewModel
  readonly seller: SellerSource | null
}): ListingViewModel {
  const { listing, book, seller } = params

  const condition = describeCondition(listing.condition)
  const status = describeListingStatus(listing.status)
  const listingType = describeListingType(listing.listing_type)
  const finalCondition =
    listing.condition_final === null ? null : describeCondition(listing.condition_final)
  const price = formatListingPrice(listing.listing_type, listing.price)
  const sellerInfo = pickSellerInfo(seller)

  return {
    id: listing.id,
    listingType: listing.listing_type,
    listingTypeLabel: listingType.label,
    status: listing.status,
    statusLabel: status.label,
    // 待人工复核的挂牌不视为可购买，避免绕开版权风控
    purchasable: status.purchasable && !listing.need_manual_review,

    book,

    condition: listing.condition,
    conditionLabel: condition.label,
    conditionTone: condition.tone,
    conditionHint: condition.hint,
    conditionFinal: listing.condition_final,
    conditionFinalLabel: finalCondition?.label ?? null,
    hasFinalCondition: finalCondition !== null,

    price: listing.price,
    priceText: price.text,
    priceEmphasis: price.emphasis,
    discountText: formatDiscount(listing.price, book.listPrice),
    deposit: listing.deposit,
    rentalPriceMonth: listing.rental_price_month,

    description: listing.description,
    schoolId: listing.school_id,
    courseId: listing.course_id,
    deliveryMethod: listing.delivery_method,
    viewCount: listing.view_count,
    publishedAt: listing.published_at,

    sellerId: listing.seller_id,
    sellerNickname: sellerInfo.nickname,
    sellerAvatarUrl: sellerInfo.avatarUrl,
    sellerVerified: sellerInfo.verified,

    needManualReview: listing.need_manual_review,
  }
}

/** 上架时间的人类可读文案 */
export function formatPublishedAt(publishedAt: string | null): string {
  if (publishedAt === null) {
    return '未上架'
  }

  const published = new Date(publishedAt)
  const diffMs = Date.now() - published.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffDays <= 0) {
    return '今天上架'
  }
  if (diffDays === 1) {
    return '昨天上架'
  }
  if (diffDays < 30) {
    return `${diffDays} 天前上架`
  }

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) {
    return `${diffMonths} 个月前上架`
  }

  return `${Math.floor(diffMonths / 12)} 年前上架`
}
