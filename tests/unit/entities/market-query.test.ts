import { describe, expect, it } from 'vitest'

// 直接从模型文件导入，而非走切片公共出口 '@/entities/listing'。
// 原因：公共出口同时导出 Vue 组件（ListingCard 等），
//       在 node 环境的单元测试中引入 .vue 会触发额外的 SFC 转换需求。
//       测试只针对纯函数，直接引用可保持测试环境轻量。
import {
  MARKET_QUERY_KEYS,
  buildClearedQuery,
  buildMarketQuery,
  countActiveFilters,
  hasActiveFilter,
  parseMarketQuery,
} from '@/entities/listing/model/query-params'

describe('parseMarketQuery', () => {
  it('空查询返回默认状态', () => {
    const state = parseMarketQuery({})
    expect(state.sort).toBe('newest')
    expect(state.page).toBe(1)
    expect(state.filter.keyword).toBeNull()
    expect(state.filter.conditions).toEqual([])
  })

  it('解析关键词并去除首尾空白', () => {
    const state = parseMarketQuery({ [MARKET_QUERY_KEYS.keyword]: '  高等数学  ' })
    expect(state.filter.keyword).toBe('高等数学')
  })

  it('空白关键词视为未设置', () => {
    const state = parseMarketQuery({ [MARKET_QUERY_KEYS.keyword]: '   ' })
    expect(state.filter.keyword).toBeNull()
  })

  it('解析逗号分隔的多选值', () => {
    const state = parseMarketQuery({
      [MARKET_QUERY_KEYS.conditions]: 'like_new,good',
      [MARKET_QUERY_KEYS.listingTypes]: 'sell,rent',
    })
    expect(state.filter.conditions).toEqual(['like_new', 'good'])
    expect(state.filter.listingTypes).toEqual(['sell', 'rent'])
  })

  it('过滤非法的品相与交易类型取值', () => {
    const state = parseMarketQuery({
      [MARKET_QUERY_KEYS.conditions]: 'like_new,不存在,good',
      [MARKET_QUERY_KEYS.listingTypes]: 'sell,hack',
    })
    expect(state.filter.conditions).toEqual(['like_new', 'good'])
    expect(state.filter.listingTypes).toEqual(['sell'])
  })

  it('非法排序值回落到默认排序', () => {
    expect(parseMarketQuery({ [MARKET_QUERY_KEYS.sort]: 'evil' }).sort).toBe('newest')
  })

  it('合法排序值被保留', () => {
    expect(parseMarketQuery({ [MARKET_QUERY_KEYS.sort]: 'price_asc' }).sort).toBe('price_asc')
  })

  it('页码非法时回落到第 1 页', () => {
    expect(parseMarketQuery({ [MARKET_QUERY_KEYS.page]: '0' }).page).toBe(1)
    expect(parseMarketQuery({ [MARKET_QUERY_KEYS.page]: '-5' }).page).toBe(1)
    expect(parseMarketQuery({ [MARKET_QUERY_KEYS.page]: 'abc' }).page).toBe(1)
  })

  it('页码为小数时向下取整', () => {
    expect(parseMarketQuery({ [MARKET_QUERY_KEYS.page]: '3.8' }).page).toBe(3)
  })

  it('价格非法值返回 null 而非 0', () => {
    const state = parseMarketQuery({
      [MARKET_QUERY_KEYS.minPrice]: 'abc',
      [MARKET_QUERY_KEYS.maxPrice]: '-1',
    })
    expect(state.filter.minPrice).toBeNull()
    expect(state.filter.maxPrice).toBeNull()
  })

  it('最低价高于最高价时自动交换', () => {
    const state = parseMarketQuery({
      [MARKET_QUERY_KEYS.minPrice]: '50',
      [MARKET_QUERY_KEYS.maxPrice]: '10',
    })
    expect(state.filter.minPrice).toBe(10)
    expect(state.filter.maxPrice).toBe(50)
  })

  it('支持数组形式的查询参数（取第一个值）', () => {
    const state = parseMarketQuery({ [MARKET_QUERY_KEYS.keyword]: ['数据结构', '计算机网络'] })
    expect(state.filter.keyword).toBe('数据结构')
  })

  it('空字符串的 id 参数视为未设置', () => {
    const state = parseMarketQuery({
      [MARKET_QUERY_KEYS.schoolId]: '',
      [MARKET_QUERY_KEYS.majorId]: '',
    })
    expect(state.filter.schoolId).toBeNull()
    expect(state.filter.majorId).toBeNull()
  })
})

describe('buildMarketQuery', () => {
  it('默认状态生成空查询，保持 URL 干净', () => {
    const query = buildMarketQuery({
      filter: {},
      sort: 'newest',
      page: 1,
    })
    expect(query).toEqual({})
  })

  it('只输出有值的参数', () => {
    const query = buildMarketQuery({
      filter: { keyword: '数据结构', schoolId: 'school-1' },
      sort: 'price_asc',
      page: 2,
    })
    expect(query[MARKET_QUERY_KEYS.keyword]).toBe('数据结构')
    expect(query[MARKET_QUERY_KEYS.schoolId]).toBe('school-1')
    expect(query[MARKET_QUERY_KEYS.sort]).toBe('price_asc')
    expect(query[MARKET_QUERY_KEYS.page]).toBe('2')
    // 未设置的专业不应出现
    expect(query[MARKET_QUERY_KEYS.majorId]).toBeUndefined()
  })

  it('多选值用逗号连接', () => {
    const query = buildMarketQuery({
      filter: { conditions: ['like_new', 'good'] },
      sort: 'newest',
      page: 1,
    })
    expect(query[MARKET_QUERY_KEYS.conditions]).toBe('like_new,good')
  })

  it('价格 0 应被保留（0 元是合法筛选）', () => {
    const query = buildMarketQuery({
      filter: { minPrice: 0 },
      sort: 'newest',
      page: 1,
    })
    expect(query[MARKET_QUERY_KEYS.minPrice]).toBe('0')
  })
})

describe('parseMarketQuery 与 buildMarketQuery 往返一致', () => {
  it('序列化后再解析得到相同状态', () => {
    const original = {
      filter: {
        keyword: '高等数学',
        schoolId: '11111111-1111-4111-8111-111111111111',
        conditions: ['like_new' as const, 'good' as const],
        listingTypes: ['sell' as const],
        minPrice: 5,
        maxPrice: 30,
      },
      sort: 'price_desc' as const,
      page: 3,
    }

    const query = buildMarketQuery(original)
    const parsed = parseMarketQuery(query)

    expect(parsed.filter.keyword).toBe(original.filter.keyword)
    expect(parsed.filter.schoolId).toBe(original.filter.schoolId)
    expect(parsed.filter.conditions).toEqual(original.filter.conditions)
    expect(parsed.filter.listingTypes).toEqual(original.filter.listingTypes)
    expect(parsed.filter.minPrice).toBe(original.filter.minPrice)
    expect(parsed.filter.maxPrice).toBe(original.filter.maxPrice)
    expect(parsed.sort).toBe(original.sort)
    expect(parsed.page).toBe(original.page)
  })
})

describe('hasActiveFilter / countActiveFilters', () => {
  it('空筛选不算启用', () => {
    expect(hasActiveFilter({})).toBe(false)
    expect(countActiveFilters({})).toBe(0)
  })

  it('空白关键词不算启用', () => {
    expect(hasActiveFilter({ keyword: '   ' })).toBe(false)
  })

  it('空数组不算启用', () => {
    expect(hasActiveFilter({ conditions: [], listingTypes: [] })).toBe(false)
  })

  it('价格 0 算启用（用户确实设了最低价 0）', () => {
    expect(hasActiveFilter({ minPrice: 0 })).toBe(true)
  })

  it('正确统计启用项数量', () => {
    expect(
      countActiveFilters({
        keyword: 'a',
        schoolId: 's',
        conditions: ['good'],
        minPrice: 0,
      }),
    ).toBe(4)
  })
})

describe('buildClearedQuery', () => {
  it('清空筛选但保留非默认排序', () => {
    expect(buildClearedQuery('price_asc')).toEqual({
      [MARKET_QUERY_KEYS.sort]: 'price_asc',
    })
  })

  it('默认排序时返回空对象', () => {
    expect(buildClearedQuery('newest')).toEqual({})
  })
})
