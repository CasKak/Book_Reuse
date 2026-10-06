/**
 * listing 实体 · 数据访问层出口
 */
export {
  DEFAULT_PAGE_SIZE,
  countSchoolListings,
  fetchListingDetail,
  fetchMarketListings,
  fetchPublicProfiles,
  incrementViewCount,
  type ListingWithBook,
  type MarketFilter,
  type MarketPagination,
  type MarketQueryResult,
  type MarketSort,
} from './queries'
