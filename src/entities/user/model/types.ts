/**
 * user 实体的类型定义与展示辅助
 *
 * 职责边界：
 *   · 本文件只放「类型」与「纯函数」，不放网络请求（见 api/auth.ts）
 *   · 展示相关的中文文案集中在这里，避免散落在各个组件
 */
import type { ProfileRow, PublicProfileRow, UserRole, VerifyStatus } from '@/shared'

/** 学生认证状态的可展示信息 */
export interface VerifyStatusDisplay {
  readonly label: string
  readonly tone: 'info' | 'warning' | 'success' | 'danger'
  /** 该状态下用户能做什么、不能做什么 */
  readonly hint: string
}

/** 认证状态 → 展示信息 */
const VERIFY_STATUS_MAP: Record<VerifyStatus, VerifyStatusDisplay> = {
  unverified: {
    label: '未认证',
    tone: 'info',
    hint: '认证后才能发布图书与下单交易',
  },
  pending: {
    label: '审核中',
    tone: 'warning',
    hint: '资料已提交，通常 1 个工作日内完成审核',
  },
  verified: {
    label: '已认证',
    tone: 'success',
    hint: '可正常发布图书、下单与参与活动',
  },
  rejected: {
    label: '未通过',
    tone: 'danger',
    hint: '请检查学生证照片是否清晰完整后重新提交',
  },
}

/** 取认证状态的展示信息 */
export function describeVerifyStatus(status: VerifyStatus): VerifyStatusDisplay {
  return VERIFY_STATUS_MAP[status]
}

/** 角色 → 中文名称 */
const ROLE_LABEL_MAP: Record<UserRole, string> = {
  student: '学生',
  ambassador: '校园大使',
  operator: '运营人员',
  admin: '管理员',
}

/** 取角色中文名 */
export function roleLabel(role: UserRole): string {
  return ROLE_LABEL_MAP[role]
}

/** 是否属于运营侧角色（可进入后台） */
export function isStaffRole(role: UserRole): boolean {
  return role === 'operator' || role === 'admin'
}

/** 年级 → 中文展示 */
export function gradeLabel(grade: number | null): string {
  if (grade === null || grade <= 0) {
    return '未填写'
  }
  const cn = ['零', '一', '二', '三', '四', '五', '六', '七', '八']
  return `${cn[grade] ?? grade}年级`
}

/**
 * 手机号脱敏：138****8888
 *
 * ⚠️ 合规要求（《个人信息保护法》）：手机号属个人信息，
 *    界面展示、日志输出、错误提示一律使用脱敏后的形式。
 */
export function maskPhone(phone: string | null): string {
  if (phone === null || phone.length < 7) {
    return '未填写'
  }
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

/** 昵称展示：为空时回退，避免界面出现空白 */
export function displayName(profile: Pick<ProfileRow, 'nickname'> | null): string {
  const nickname = profile?.nickname?.trim()
  return nickname !== undefined && nickname.length > 0 ? nickname : '未设置昵称'
}

/** 用户档案的展示视图模型 */
export interface UserProfileViewModel {
  readonly id: string
  readonly nickname: string
  readonly avatarUrl: string | null
  readonly phoneMasked: string
  readonly role: UserRole
  readonly roleLabel: string
  readonly schoolId: string | null
  readonly majorId: string | null
  readonly grade: number | null
  readonly gradeLabel: string
  readonly verifyStatus: VerifyStatus
  readonly verifyLabel: string
  readonly verifyTone: VerifyStatusDisplay['tone']
  readonly verifyHint: string
  readonly creditScore: number
  readonly pointsBalance: number
  readonly carbonTotalKg: number
  /** 是否可发布图书（需已认证且未被拉黑） */
  readonly canPublish: boolean
  /** 是否被列入黑名单（版权风控） */
  readonly isBlacklisted: boolean
}

/** 把数据库行映射为展示视图模型 */
export function toUserProfileViewModel(row: ProfileRow): UserProfileViewModel {
  const verify = describeVerifyStatus(row.verify_status)

  return {
    id: row.id,
    nickname: displayName(row),
    avatarUrl: row.avatar_url,
    phoneMasked: maskPhone(row.phone),
    role: row.role,
    roleLabel: roleLabel(row.role),
    schoolId: row.school_id,
    majorId: row.major_id,
    grade: row.grade,
    gradeLabel: gradeLabel(row.grade),
    verifyStatus: row.verify_status,
    verifyLabel: verify.label,
    verifyTone: verify.tone,
    verifyHint: verify.hint,
    creditScore: row.credit_score,
    pointsBalance: row.points_balance,
    carbonTotalKg: row.carbon_total_kg,
    canPublish: row.verify_status === 'verified' && row.blacklist_reason === null,
    isBlacklisted: row.blacklist_reason !== null,
  }
}

/** 公开档案的展示视图模型（用于图书详情页展示卖家） */
export interface PublicProfileViewModel {
  readonly id: string
  readonly nickname: string
  readonly avatarUrl: string | null
  readonly verifyLabel: string
  readonly creditScore: number
}

/** 把公开档案行映射为展示视图模型 */
export function toPublicProfileViewModel(row: PublicProfileRow): PublicProfileViewModel {
  return {
    id: row.id,
    nickname: displayName(row),
    avatarUrl: row.avatar_url,
    verifyLabel: describeVerifyStatus(row.verify_status).label,
    creditScore: row.credit_score,
  }
}
