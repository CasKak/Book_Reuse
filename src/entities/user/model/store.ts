/**
 * user 实体状态（Pinia）
 *
 * 职责：
 *   · 维护当前会话（登录用户 id）
 *   · 缓存当前用户档案
 *   · 提供派生状态（是否登录、是否可发布、是否可进后台）
 *
 * 设计取舍：
 *   · 会话来源是 Supabase Auth；本 store 不重复存储 token，
 *     始终以 SDK 的会话为准，避免出现「前端认为已登录但 token 已失效」。
 *   · 档案缓存在内存；刷新页面后由 initializeSession() 重新拉取。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { ProfileRow } from '@/shared/api'
import { ApiError, getSupabaseClient, toApiError } from '@/shared/api'

import {
  fetchMyProfile,
  signIn as signInRequest,
  signOut as signOutRequest,
  signUp as signUpRequest,
  updateProfile as updateProfileRequest,
  type ProfileUpdateInput,
  type SignUpParams,
} from '../api/auth'
import { isStaffRole, toUserProfileViewModel } from '../model/types'
import type { UserProfileViewModel } from '../model/types'

export const useUserStore = defineStore('user', () => {
  // ---------------------------------------------------------------- state
  /** 当前登录用户 id；null 表示未登录 */
  const currentUserId = ref<string | null>(null)
  /** 当前用户档案原始行 */
  const profile = ref<ProfileRow | null>(null)
  /** 会话是否已初始化完成（避免首屏闪烁） */
  const initialized = ref(false)
  /** 是否正在执行登录/注册等操作 */
  const loading = ref(false)

  // -------------------------------------------------------------- getters
  /** 是否已登录 */
  const isAuthenticated = computed(() => currentUserId.value !== null)

  /** 档案的展示视图模型 */
  const profileVm = computed<UserProfileViewModel | null>(() =>
    profile.value === null ? null : toUserProfileViewModel(profile.value),
  )

  /** 是否可发布图书（已认证且未被拉黑） */
  const canPublish = computed(() => profileVm.value?.canPublish ?? false)

  /** 是否为运营侧角色（可进入后台） */
  const isStaff = computed(() => (profile.value === null ? false : isStaffRole(profile.value.role)))

  /** 是否已完成学生认证 */
  const isVerified = computed(() => profile.value?.verify_status === 'verified')

  // -------------------------------------------------------------- actions

  /**
   * 初始化会话。
   *
   * 调用时机：应用启动时（main.ts）与路由守卫首次进入受保护页面时。
   * 若已登录则拉取档案；失败不抛错，仅清空状态，避免阻断首屏渲染。
   */
  async function initializeSession(): Promise<void> {
    const client = getSupabaseClient()

    try {
      const { data, error } = await client.auth.getSession()

      if (error !== null) {
        // 会话读取失败（如 token 损坏）：按未登录处理
        currentUserId.value = null
        profile.value = null
        return
      }

      const userId = data.session?.user.id ?? null
      currentUserId.value = userId

      if (userId !== null) {
        await loadProfile(userId)
      }
    } catch {
      currentUserId.value = null
      profile.value = null
    } finally {
      initialized.value = true
    }
  }

  /**
   * 订阅 Supabase 认证状态变化。
   *
   * 作用：token 过期被刷新、用户在其它标签页登出时，本页面状态能同步。
   * @returns 取消订阅函数（组件卸载时调用）
   */
  function subscribeAuthChanges(): () => void {
    const client = getSupabaseClient()

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user.id ?? null
      currentUserId.value = userId

      if (userId === null) {
        profile.value = null
        return
      }

      // 异步补拉档案，避免在回调中直接 await（Supabase 要求回调保持轻量）
      void loadProfile(userId)
    })

    return () => {
      data.subscription.unsubscribe()
    }
  }

  /** 拉取当前用户档案 */
  async function loadProfile(userId: string): Promise<void> {
    try {
      profile.value = await fetchMyProfile(userId)
    } catch (error) {
      const apiError = toApiError(error)

      // 档案不存在（理论上不该发生，触发器会自动建档）：视为未登录
      if (apiError.kind === 'not_found') {
        profile.value = null
        currentUserId.value = null
        return
      }

      // 其它错误（网络等）不阻断，保留已有档案
      profile.value = null
    }
  }

  /** 重新加载当前用户档案（供操作后刷新） */
  async function refreshProfile(): Promise<void> {
    if (currentUserId.value === null) {
      return
    }
    await loadProfile(currentUserId.value)
  }

  /**
   * 注册并补全档案。
   *
   * @throws {ApiError} 注册失败时抛出，由调用方展示 userMessage
   */
  async function register(params: SignUpParams): Promise<void> {
    loading.value = true
    try {
      await signUpRequest(params)

      // 若 Supabase 未开启邮箱确认，注册后即有会话，可直接补全档案
      const client = getSupabaseClient()
      const { data } = await client.auth.getSession()
      const userId = data.session?.user.id ?? null

      if (userId === null) {
        // 需要邮箱确认：此时无法写入档案，等确认后登录再补
        return
      }

      currentUserId.value = userId
      profile.value = await updateProfileRequest(userId, {
        nickname: params.nickname,
        schoolId: params.schoolId,
        majorId: params.majorId,
        grade: params.grade,
      })
    } catch (error) {
      throw error instanceof ApiError ? error : toApiError(error)
    } finally {
      loading.value = false
    }
  }

  /**
   * 登录。
   * @throws {ApiError} 登录失败时抛出
   */
  async function login(email: string, password: string): Promise<void> {
    loading.value = true
    try {
      await signInRequest(email, password)

      const client = getSupabaseClient()
      const { data } = await client.auth.getSession()
      const userId = data.session?.user.id ?? null

      currentUserId.value = userId

      if (userId !== null) {
        await loadProfile(userId)
      }
    } catch (error) {
      throw error instanceof ApiError ? error : toApiError(error)
    } finally {
      loading.value = false
    }
  }

  /** 退出登录 */
  async function logout(): Promise<void> {
    loading.value = true
    try {
      await signOutRequest()
    } finally {
      // 无论请求是否成功，本地状态一律清空，避免停留在「假登录」状态
      currentUserId.value = null
      profile.value = null
      loading.value = false
    }
  }

  /** 更新档案并刷新本地缓存 */
  async function saveProfile(input: ProfileUpdateInput): Promise<void> {
    if (currentUserId.value === null) {
      throw new ApiError({ kind: 'unauthenticated', userMessage: '请先登录' })
    }

    profile.value = await updateProfileRequest(currentUserId.value, input)
  }

  return {
    // state
    currentUserId,
    profile,
    initialized,
    loading,
    // getters
    isAuthenticated,
    profileVm,
    canPublish,
    isStaff,
    isVerified,
    // actions
    initializeSession,
    subscribeAuthChanges,
    loadProfile,
    refreshProfile,
    register,
    login,
    logout,
    saveProfile,
  }
})
