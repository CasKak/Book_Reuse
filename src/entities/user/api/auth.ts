/**
 * user 实体的数据访问层
 *
 * 职责：把 Supabase 的调用封装成语义化函数，并统一错误处理。
 * 上层（store / 组件）只调用这里，不直接接触 Supabase SDK。
 *
 * ⚠️ 安全前提：
 *   本文件的查询依赖数据库 RLS 策略做权限控制（见 supabase/migrations/
 *   0008_rls_policies.sql）。前端代码不做任何安全假设。
 */
import { run, runOrNull, toApiError } from '@/shared/api'
import type {
  AddressRow,
  CourseRow,
  MajorRow,
  ProfileRow,
  SchoolRow,
  TableUpdate,
} from '@/shared/api'
import { getSupabaseClient } from '@/shared/api'

import type { AddressFormValues } from '../model/schema'

// ---------------------------------------------------------------------------
// 认证
// ---------------------------------------------------------------------------

/** 注册参数 */
export interface SignUpParams {
  readonly email: string
  readonly password: string
  readonly nickname: string
  readonly schoolId: string
  readonly majorId: string | null
  readonly grade: number | null
}

/**
 * 注册账号。
 *
 * 说明：
 *   · profiles 记录由数据库触发器 trg_on_auth_user_created 自动创建，
 *     因此注册后需要再用 updateProfile 补全学校、专业、年级。
 *   · 若 Supabase 开启了邮箱确认，此处不会直接返回 session。
 */
export async function signUp(params: SignUpParams): Promise<void> {
  const client = getSupabaseClient()

  const { error } = await client.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: { nickname: params.nickname },
    },
  })

  if (error !== null) {
    throw toApiError(error)
  }
}

/**
 * 登录。
 *
 * 安全说明：失败时统一提示「邮箱或密码不正确」，
 * 不区分「账号不存在」与「密码错误」，避免账号枚举攻击。
 */
export async function signIn(email: string, password: string): Promise<void> {
  const client = getSupabaseClient()

  const { error } = await client.auth.signInWithPassword({ email, password })

  if (error !== null) {
    throw toApiError(error)
  }
}

/** 退出登录 */
export async function signOut(): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client.auth.signOut()

  if (error !== null) {
    throw toApiError(error)
  }
}

/** 发送找回密码邮件 */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  const client = getSupabaseClient()

  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  })

  if (error !== null) {
    throw toApiError(error)
  }
}

/** 重置密码（在邮件链接打开的会话中调用） */
export async function updatePassword(newPassword: string): Promise<void> {
  const client = getSupabaseClient()

  const { error } = await client.auth.updateUser({ password: newPassword })

  if (error !== null) {
    throw toApiError(error)
  }
}

/** 当前登录用户的 id（未登录返回 null） */
export async function getCurrentUserId(): Promise<string | null> {
  const client = getSupabaseClient()
  const { data, error } = await client.auth.getUser()

  if (error !== null) {
    return null
  }

  return data.user?.id ?? null
}

// ---------------------------------------------------------------------------
// 用户档案
// ---------------------------------------------------------------------------

/** 读取当前用户的完整档案 */
export async function fetchMyProfile(userId: string): Promise<ProfileRow> {
  const client = getSupabaseClient()

  return run(client.from('profiles').select('*').eq('id', userId).is('deleted_at', null).single())
}

/** 档案更新入参（与 profiles 表的可更新字段对应） */
export interface ProfileUpdateInput {
  readonly nickname?: string
  readonly schoolId?: string | null
  readonly majorId?: string | null
  readonly grade?: number | null
  readonly enrollYear?: number | null
  readonly phone?: string | null
  readonly avatarUrl?: string | null
}

/**
 * 更新用户档案。
 *
 * ⚠️ role、verify_status、points_balance、carbon_total_kg、credit_score、
 *    blacklist_reason 由数据库触发器保护，即使前端传入也会被保留原值
 *    （见 0008_rls_policies.sql 的 trg_profiles_protect_sensitive）。
 */
export async function updateProfile(
  userId: string,
  input: ProfileUpdateInput,
): Promise<ProfileRow> {
  const client = getSupabaseClient()

  // 使用 TableUpdate 而非 Record<string, ...>：
  // Supabase 的 update() 会拒绝索引签名类型（RejectExcessProperties），
  // 必须传入具体的列类型。
  const payload: TableUpdate<'profiles'> = {}
  if (input.nickname !== undefined) payload.nickname = input.nickname
  if (input.schoolId !== undefined) payload.school_id = input.schoolId
  if (input.majorId !== undefined) payload.major_id = input.majorId
  if (input.grade !== undefined) payload.grade = input.grade
  if (input.enrollYear !== undefined) payload.enroll_year = input.enrollYear
  if (input.phone !== undefined) payload.phone = input.phone
  if (input.avatarUrl !== undefined) payload.avatar_url = input.avatarUrl

  return run(client.from('profiles').update(payload).eq('id', userId).select('*').single())
}

/**
 * 提交学生认证申请。
 *
 * 实现说明：本方法只把状态置为 pending 并记录提交时间。
 *   真实项目中学生证照片应上传到 Storage 私有桶，并在服务端（Edge Function）
 *   记录待审记录；照片属敏感个人信息，需单独同意与加密存储。
 *   ⚠️ 当前角色校验由触发器保护，verify_status 的最终变更必须由运营人员在
 *      后台完成（admin 角色不受保护触发器限制）。
 */
export async function submitStudentVerification(userId: string): Promise<ProfileRow> {
  const client = getSupabaseClient()

  return run(
    client
      .from('profiles')
      .update({ verify_status: 'pending' })
      .eq('id', userId)
      .select('*')
      .single(),
  )
}

// ---------------------------------------------------------------------------
// 学校 / 专业 / 课程（供注册与筛选使用）
// ---------------------------------------------------------------------------

/** 读取可用的学校列表 */
export async function fetchSchools(): Promise<SchoolRow[]> {
  const client = getSupabaseClient()

  const result = await runOrNull(
    client.from('schools').select('*').eq('is_active', true).order('name'),
  )

  return result ?? []
}

/** 读取指定学校下的专业列表 */
export async function fetchMajors(schoolId: string): Promise<MajorRow[]> {
  const client = getSupabaseClient()

  const result = await runOrNull(
    client.from('majors').select('*').eq('school_id', schoolId).order('name'),
  )

  return result ?? []
}

/** 读取指定学校下的课程列表（可按专业过滤） */
export async function fetchCourses(
  schoolId: string,
  majorId?: string | null,
): Promise<CourseRow[]> {
  const client = getSupabaseClient()

  let query = client.from('courses').select('*').eq('school_id', schoolId)

  if (majorId !== undefined && majorId !== null && majorId !== '') {
    query = query.eq('major_id', majorId)
  }

  const result = await runOrNull(query.order('name'))

  return result ?? []
}

// ---------------------------------------------------------------------------
// 收货 / 收书地址
// ---------------------------------------------------------------------------

/** 读取当前用户的全部地址（默认地址排在最前） */
export async function fetchMyAddresses(userId: string): Promise<AddressRow[]> {
  const client = getSupabaseClient()

  const result = await runOrNull(
    client
      .from('user_addresses')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false }),
  )

  return result ?? []
}

/** 新增地址 */
export async function createAddress(
  userId: string,
  values: AddressFormValues,
): Promise<AddressRow> {
  const client = getSupabaseClient()

  return run(
    client
      .from('user_addresses')
      .insert({
        user_id: userId,
        label: values.label === '' ? null : values.label,
        campus_area: values.campusArea === '' ? null : values.campusArea,
        building: values.building,
        detail: values.detail === '' ? null : values.detail,
        is_default: values.isDefault,
      })
      .select('*')
      .single(),
  )
}

/** 更新地址 */
export async function updateAddress(
  addressId: string,
  values: AddressFormValues,
): Promise<AddressRow> {
  const client = getSupabaseClient()

  return run(
    client
      .from('user_addresses')
      .update({
        label: values.label === '' ? null : values.label,
        campus_area: values.campusArea === '' ? null : values.campusArea,
        building: values.building,
        detail: values.detail === '' ? null : values.detail,
        is_default: values.isDefault,
      })
      .eq('id', addressId)
      .select('*')
      .single(),
  )
}

/**
 * 删除地址。
 *
 * 注意：数据库对「每用户仅一个默认地址」建了部分唯一索引，
 * 因此把默认地址设为其它地址时无需先取消原默认地址（直接覆盖即可）。
 */
export async function deleteAddress(addressId: string): Promise<void> {
  const client = getSupabaseClient()

  const { error } = await client.from('user_addresses').delete().eq('id', addressId)

  if (error !== null) {
    throw toApiError(error)
  }
}

/** 把指定地址设为默认（并取消其它默认地址） */
export async function setDefaultAddress(userId: string, addressId: string): Promise<void> {
  const client = getSupabaseClient()

  // 先取消全部默认，再设置目标地址；两步都在同一用户的 RLS 范围内
  const { error: clearError } = await client
    .from('user_addresses')
    .update({ is_default: false })
    .eq('user_id', userId)
    .eq('is_default', true)

  if (clearError !== null) {
    throw toApiError(clearError)
  }

  const { error: setError } = await client
    .from('user_addresses')
    .update({ is_default: true })
    .eq('id', addressId)

  if (setError !== null) {
    throw toApiError(setError)
  }
}
