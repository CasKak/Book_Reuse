import { describe, expect, it } from 'vitest'

import {
  addressSchema,
  emailSchema,
  flattenZodErrors,
  loginSchema,
  passwordSchema,
  profileSchema,
  registerSchema,
  resetPasswordSchema,
} from '@/entities/user'

/** 构造一份合法的注册表单数据 */
function validRegisterInput(): Record<string, unknown> {
  return {
    email: 'student@example.com',
    password: 'Test123456',
    confirmPassword: 'Test123456',
    nickname: '小明',
    schoolId: '11111111-1111-4111-8111-111111111111',
    majorId: '22222222-2222-4222-8222-222222222201',
    grade: 3,
    agreed: true,
  }
}

describe('emailSchema', () => {
  it('接受合法邮箱', () => {
    expect(emailSchema.safeParse('a@b.com').success).toBe(true)
  })

  it('拒绝缺少 @ 的字符串', () => {
    expect(emailSchema.safeParse('abc').success).toBe(false)
  })

  it('拒绝空值并给出中文提示', () => {
    const result = emailSchema.safeParse('')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('请输入邮箱')
    }
  })
})

describe('passwordSchema', () => {
  it('接受字母加数字且长度达标的密码', () => {
    expect(passwordSchema.safeParse('Test1234').success).toBe(true)
  })

  it('拒绝短于 8 位', () => {
    expect(passwordSchema.safeParse('Te1').success).toBe(false)
  })

  it('拒绝纯数字', () => {
    const result = passwordSchema.safeParse('12345678')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === '密码需包含字母')).toBe(true)
    }
  })

  it('拒绝纯字母', () => {
    const result = passwordSchema.safeParse('abcdefgh')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === '密码需包含数字')).toBe(true)
    }
  })

  it('拒绝超过 72 位（bcrypt 上限）', () => {
    expect(passwordSchema.safeParse(`a1${'x'.repeat(80)}`).success).toBe(false)
  })
})

describe('loginSchema', () => {
  it('接受合法登录数据', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true)
  })

  it('登录时不校验密码强度，只要求非空', () => {
    // 老用户的密码可能不满足新规则，登录阶段不应拦截
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '1' }).success).toBe(true)
  })

  it('空密码被拒绝', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false)
  })
})

describe('registerSchema', () => {
  it('接受完整合法的注册数据', () => {
    expect(registerSchema.safeParse(validRegisterInput()).success).toBe(true)
  })

  it('两次密码不一致时在 confirmPassword 上报错', () => {
    const input = { ...validRegisterInput(), confirmPassword: 'Different123' }
    const result = registerSchema.safeParse(input)

    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'confirmPassword')
      expect(issue?.message).toBe('两次输入的密码不一致')
    }
  })

  it('未勾选协议时拒绝注册', () => {
    const input = { ...validRegisterInput(), agreed: false }
    const result = registerSchema.safeParse(input)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'agreed')).toBe(true)
    }
  })

  it('学校必须是 UUID，随意字符串被拒绝', () => {
    const input = { ...validRegisterInput(), schoolId: 'not-a-uuid' }
    expect(registerSchema.safeParse(input).success).toBe(false)
  })

  it('专业允许为空字符串（可选字段）', () => {
    const input = { ...validRegisterInput(), majorId: '' }
    expect(registerSchema.safeParse(input).success).toBe(true)
  })

  it('年级允许为 null（可选字段）', () => {
    const input = { ...validRegisterInput(), grade: null }
    expect(registerSchema.safeParse(input).success).toBe(true)
  })

  it('年级超出 1-8 范围被拒绝', () => {
    expect(registerSchema.safeParse({ ...validRegisterInput(), grade: 0 }).success).toBe(false)
    expect(registerSchema.safeParse({ ...validRegisterInput(), grade: 9 }).success).toBe(false)
  })

  it('昵称过短被拒绝', () => {
    expect(registerSchema.safeParse({ ...validRegisterInput(), nickname: '甲' }).success).toBe(
      false,
    )
  })

  it('昵称过长被拒绝', () => {
    const longName = '甲'.repeat(21)
    expect(registerSchema.safeParse({ ...validRegisterInput(), nickname: longName }).success).toBe(
      false,
    )
  })
})

describe('resetPasswordSchema', () => {
  it('接受匹配且合规的新密码', () => {
    expect(
      resetPasswordSchema.safeParse({ password: 'NewPass123', confirmPassword: 'NewPass123' })
        .success,
    ).toBe(true)
  })

  it('两次不一致时拒绝', () => {
    expect(
      resetPasswordSchema.safeParse({ password: 'NewPass123', confirmPassword: 'Other123' })
        .success,
    ).toBe(false)
  })
})

describe('profileSchema', () => {
  const base = {
    nickname: '小红',
    schoolId: '11111111-1111-4111-8111-111111111111',
    majorId: '',
    grade: null,
    enrollYear: null,
  }

  it('接受最小合法数据', () => {
    expect(profileSchema.safeParse(base).success).toBe(true)
  })

  it('入学年份超出范围被拒绝', () => {
    expect(profileSchema.safeParse({ ...base, enrollYear: 1999 }).success).toBe(false)
    expect(profileSchema.safeParse({ ...base, enrollYear: 2101 }).success).toBe(false)
  })

  it('学校允许为空字符串（用户可能暂不填写）', () => {
    expect(profileSchema.safeParse({ ...base, schoolId: '' }).success).toBe(true)
  })
})

describe('addressSchema', () => {
  const base = {
    label: '',
    campusArea: '',
    building: '3 号宿舍楼',
    detail: '',
    isDefault: false,
  }

  it('接受最小合法地址', () => {
    expect(addressSchema.safeParse(base).success).toBe(true)
  })

  it('楼栋为必填', () => {
    const result = addressSchema.safeParse({ ...base, building: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('请填写楼栋')
    }
  })

  it('楼栋只有空白字符也视为未填写（trim 后校验）', () => {
    expect(addressSchema.safeParse({ ...base, building: '   ' }).success).toBe(false)
  })

  it('补充说明过长被拒绝（限制到 60 字，减少敏感信息泄漏面）', () => {
    expect(addressSchema.safeParse({ ...base, detail: 'x'.repeat(61) }).success).toBe(false)
  })
})

describe('flattenZodErrors', () => {
  it('把校验错误压平为字段到首条信息的映射', () => {
    const result = loginSchema.safeParse({ email: '', password: '' })
    expect(result.success).toBe(false)

    if (!result.success) {
      const flat = flattenZodErrors(result.error)
      expect(flat['email']).toBe('请输入邮箱')
      expect(flat['password']).toBe('请输入密码')
    }
  })

  it('同一字段多条错误时只保留第一条', () => {
    const result = passwordSchema.safeParse('a')
    expect(result.success).toBe(false)

    if (!result.success) {
      const flat = flattenZodErrors(result.error)
      expect(flat['_']).toBe('密码至少 8 位')
    }
  })

  it('校验通过时不产生任何键', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: 'x' })
    if (result.success) {
      expect(Object.keys(flattenZodErrors(result.error ?? ({ issues: [] } as never)))).toEqual([])
    }
  })
})
