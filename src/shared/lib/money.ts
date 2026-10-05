/**
 * 金额格式化
 *
 * 业务约定（来自商业计划书与 docs/data-model.md）：
 *   - 数据库金额字段一律 numeric(12,2)，单位为「元」
 *   - 前端展示统一保留 2 位小数并带 ¥ 前缀
 *
 * ⚠️ 精度提示：涉及金额计算时不要用 JavaScript number 直接累加，
 *    应使用整数分（cent）运算或引入 decimal 库。本模块只负责展示。
 */

/** 人民币符号 */
const CNY_SYMBOL = '¥'

/**
 * 格式化为人民币展示字符串。
 *
 * @param amount 金额（元）
 * @param options.withSymbol 是否带 ¥ 前缀，默认 true
 * @returns 形如 "¥12.00"；入参非法时返回 "--"
 *
 * @example
 * formatCNY(12)        // '¥12.00'
 * formatCNY(12.5)      // '¥12.50'
 * formatCNY(0)         // '¥0.00'
 * formatCNY(Number.NaN) // '--'
 */
export function formatCNY(amount: number, options?: { withSymbol?: boolean }): string {
  if (!Number.isFinite(amount)) {
    return '--'
  }

  const withSymbol = options?.withSymbol ?? true
  const fixed = amount.toFixed(2)

  return withSymbol ? `${CNY_SYMBOL}${fixed}` : fixed
}

/**
 * 把元转换为分（整数），用于金额计算避免浮点误差。
 *
 * @example toCents(12.35) // 1235
 */
export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

/**
 * 把分转换为元。
 *
 * @example toYuan(1235) // 12.35
 */
export function toYuan(cents: number): number {
  return cents / 100
}
