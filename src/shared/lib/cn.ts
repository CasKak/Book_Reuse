/**
 * 样式工具
 */

/** 可参与 className 拼接的值类型 */
export type ClassValue = string | number | null | undefined | false | ClassValue[]

/**
 * 合并 className（轻量实现，替代 clsx 依赖）。
 *
 * 与 clsx 的差异：不支持对象写法 { 'a': true }，本项目统一用三元表达式，
 * 保持实现简单可预测。
 *
 * @example
 * cn('px-2', isActive && 'bg-brand-700', undefined, ['text-sm'])
 * // => 'px-2 bg-brand-700 text-sm'
 */
export function cn(...values: ClassValue[]): string {
  const parts: string[] = []

  const walk = (value: ClassValue): void => {
    if (value === null || value === undefined || value === false || value === '') {
      return
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item)
      }
      return
    }

    parts.push(String(value))
  }

  for (const value of values) {
    walk(value)
  }

  return parts.join(' ')
}
