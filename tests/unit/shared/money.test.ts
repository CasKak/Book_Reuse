import { describe, expect, it } from 'vitest'

import { formatCNY, toCents, toYuan } from '@/shared/lib/money'

describe('formatCNY', () => {
  it('整数金额补齐两位小数', () => {
    expect(formatCNY(12)).toBe('¥12.00')
  })

  it('保留两位小数', () => {
    expect(formatCNY(12.5)).toBe('¥12.50')
  })

  it('零值正常展示', () => {
    expect(formatCNY(0)).toBe('¥0.00')
  })

  it('四舍五入到分', () => {
    expect(formatCNY(12.345)).toBe('¥12.35')
    expect(formatCNY(12.344)).toBe('¥12.34')
  })

  it('支持不带货币符号', () => {
    expect(formatCNY(12.5, { withSymbol: false })).toBe('12.50')
  })

  it('负数金额（如退款）正常展示', () => {
    expect(formatCNY(-7)).toBe('¥-7.00')
  })

  it('非有限数返回占位符，避免展示 NaN', () => {
    expect(formatCNY(Number.NaN)).toBe('--')
    expect(formatCNY(Number.POSITIVE_INFINITY)).toBe('--')
  })

  it('大额金额不丢失精度', () => {
    expect(formatCNY(1234567.89)).toBe('¥1234567.89')
  })
})

describe('toCents / toYuan', () => {
  it('元转分使用四舍五入，避免浮点截断', () => {
    expect(toCents(12.35)).toBe(1235)
    // 0.1 + 0.2 这类浮点误差在转分后被消除
    expect(toCents(0.1 + 0.2)).toBe(30)
  })

  it('分转元', () => {
    expect(toYuan(1235)).toBe(12.35)
  })

  it('往返转换保持一致', () => {
    for (const amount of [0, 0.01, 2.5, 12, 99.99, 1234.56]) {
      expect(toYuan(toCents(amount))).toBeCloseTo(amount, 2)
    }
  })
})
