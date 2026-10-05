import { describe, expect, it } from 'vitest'

import { cn } from '@/shared/lib/cn'

describe('cn', () => {
  it('拼接多个非空字符串', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1')
  })

  it('过滤所有假值', () => {
    expect(cn('px-2', null, undefined, false, '', 'py-1')).toBe('px-2 py-1')
  })

  it('支持条件表达式', () => {
    const isActive = false
    const isDisabled = true

    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe('base disabled')
  })

  it('递归展开嵌套数组', () => {
    expect(cn('a', ['b', ['c', 'd']])).toBe('a b c d')
  })

  it('接受数字并转为字符串', () => {
    expect(cn('z-', 10)).toBe('z- 10')
  })

  it('全部为空时返回空字符串', () => {
    expect(cn(null, undefined, false)).toBe('')
  })

  it('无参数时返回空字符串', () => {
    expect(cn()).toBe('')
  })
})
