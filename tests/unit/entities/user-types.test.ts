import { describe, expect, it } from 'vitest'

import type { ProfileRow, PublicProfileRow } from '@/shared/api'
import {
  describeVerifyStatus,
  displayName,
  gradeLabel,
  isStaffRole,
  maskPhone,
  roleLabel,
  toPublicProfileViewModel,
  toUserProfileViewModel,
} from '@/entities/user'

/** 构造一个完整的 profiles 行，避免逐个用例重复写字段 */
function makeProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    nickname: '测试同学',
    avatar_url: null,
    phone: null,
    role: 'student',
    school_id: '11111111-1111-4111-8111-111111111111',
    major_id: '22222222-2222-4222-8222-222222222201',
    grade: 3,
    enroll_year: 2023,
    verify_status: 'verified',
    verified_at: '2026-01-01T00:00:00.000Z',
    credit_score: 100,
    blacklist_reason: null,
    points_balance: 0,
    carbon_total_kg: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('maskPhone', () => {
  it('脱敏中间四位，仅保留首三末四', () => {
    expect(maskPhone('13812345678')).toBe('138****5678')
  })

  it('空值返回「未填写」，避免界面出现 null', () => {
    expect(maskPhone(null)).toBe('未填写')
  })

  it('长度不足时不强行脱敏，避免越界', () => {
    expect(maskPhone('123456')).toBe('未填写')
    expect(maskPhone('')).toBe('未填写')
  })
})

describe('gradeLabel', () => {
  it('数字年级转为中文', () => {
    expect(gradeLabel(1)).toBe('一年级')
    expect(gradeLabel(4)).toBe('四年级')
    expect(gradeLabel(8)).toBe('八年级')
  })

  it('空值或非正数返回未填写', () => {
    expect(gradeLabel(null)).toBe('未填写')
    expect(gradeLabel(0)).toBe('未填写')
    expect(gradeLabel(-1)).toBe('未填写')
  })

  it('超出中文数组范围时回退为数字，不出现 undefined', () => {
    expect(gradeLabel(99)).toBe('99年级')
  })
})

describe('displayName', () => {
  it('有昵称时返回昵称', () => {
    expect(displayName({ nickname: '小明' })).toBe('小明')
  })

  it('昵称为空字符串时回退', () => {
    expect(displayName({ nickname: '' })).toBe('未设置昵称')
  })

  it('昵称只有空白字符时回退', () => {
    expect(displayName({ nickname: '   ' })).toBe('未设置昵称')
  })

  it('档案为空时回退', () => {
    expect(displayName(null)).toBe('未设置昵称')
  })
})

describe('roleLabel / isStaffRole', () => {
  it('角色映射为中文', () => {
    expect(roleLabel('student')).toBe('学生')
    expect(roleLabel('ambassador')).toBe('校园大使')
    expect(roleLabel('operator')).toBe('运营人员')
    expect(roleLabel('admin')).toBe('管理员')
  })

  it('运营与管理员属于运营侧', () => {
    expect(isStaffRole('operator')).toBe(true)
    expect(isStaffRole('admin')).toBe(true)
  })

  it('学生与校园大使不属于运营侧', () => {
    expect(isStaffRole('student')).toBe(false)
    expect(isStaffRole('ambassador')).toBe(false)
  })
})

describe('describeVerifyStatus', () => {
  it('四种状态都有中文文案与色调', () => {
    for (const status of ['unverified', 'pending', 'verified', 'rejected'] as const) {
      const info = describeVerifyStatus(status)
      expect(info.label.length).toBeGreaterThan(0)
      expect(info.hint.length).toBeGreaterThan(0)
    }
  })

  it('已认证为成功色调，未通过为危险色调', () => {
    expect(describeVerifyStatus('verified').tone).toBe('success')
    expect(describeVerifyStatus('rejected').tone).toBe('danger')
  })
})

describe('toUserProfileViewModel', () => {
  it('已认证且未拉黑时可以发布', () => {
    const vm = toUserProfileViewModel(makeProfile())
    expect(vm.canPublish).toBe(true)
    expect(vm.isBlacklisted).toBe(false)
  })

  it('未认证不可发布', () => {
    const vm = toUserProfileViewModel(makeProfile({ verify_status: 'unverified' }))
    expect(vm.canPublish).toBe(false)
  })

  it('待审核不可发布', () => {
    const vm = toUserProfileViewModel(makeProfile({ verify_status: 'pending' }))
    expect(vm.canPublish).toBe(false)
  })

  it('黑名单用户即使已认证也不可发布', () => {
    const vm = toUserProfileViewModel(
      makeProfile({ verify_status: 'verified', blacklist_reason: '流转盗版资料' }),
    )
    expect(vm.canPublish).toBe(false)
    expect(vm.isBlacklisted).toBe(true)
  })

  it('手机号在视图模型中已脱敏，不出现明文', () => {
    const vm = toUserProfileViewModel(makeProfile({ phone: '13812345678' }))
    expect(vm.phoneMasked).toBe('138****5678')
    expect(JSON.stringify(vm)).not.toContain('13812345678')
  })

  it('碳减排与积分正确透出', () => {
    const vm = toUserProfileViewModel(makeProfile({ carbon_total_kg: 2.55, points_balance: 25 }))
    expect(vm.carbonTotalKg).toBe(2.55)
    expect(vm.pointsBalance).toBe(25)
  })
})

describe('toPublicProfileViewModel', () => {
  it('公开视图模型不含手机号等敏感字段', () => {
    const row: PublicProfileRow = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      nickname: '卖家同学',
      avatar_url: null,
      school_id: null,
      major_id: null,
      grade: null,
      role: 'student',
      verify_status: 'verified',
      credit_score: 100,
      created_at: '2026-01-01T00:00:00.000Z',
    }

    const vm = toPublicProfileViewModel(row)

    expect(vm.nickname).toBe('卖家同学')
    expect(vm.verifyLabel).toBe('已认证')
    expect(Object.keys(vm)).not.toContain('phone')
    expect(Object.keys(vm)).not.toContain('phoneMasked')
  })
})
