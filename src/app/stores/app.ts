/**
 * 全局应用状态（Pinia）
 *
 * 存放与具体业务实体无关的应用级状态：环境信息、全局加载、后端连通性等。
 * 业务状态请放在对应 entities 切片下的 model/store.ts 中。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { checkDatabaseHealth, env, isLocal, isProduction } from '@/shared'

/** Supabase 连通性状态 */
export type BackendStatus = 'unknown' | 'checking' | 'online' | 'offline'

export const useAppStore = defineStore('app', () => {
  // ---------------- state ----------------
  /** 后端连通性 */
  const backendStatus = ref<BackendStatus>('unknown')
  /** 最近一次连通性探测的失败原因 */
  const backendError = ref<string | null>(null)

  // ---------------- getters ----------------
  const appTitle = computed(() => env.VITE_APP_TITLE)
  const appEnv = computed(() => env.VITE_APP_ENV)
  const showEnvBadge = computed(() => !isProduction)
  const backendOnline = computed(() => backendStatus.value === 'online')

  // ---------------- actions ----------------
  /**
   * 探测与 Supabase 的连通性。
   *
   * 开发期用于快速定位「环境变量配错 / 网络不通 / 项目被暂停」三类问题。
   */
  async function probeBackend(): Promise<void> {
    backendStatus.value = 'checking'
    backendError.value = null

    const health = await checkDatabaseHealth()

    if (health.ok) {
      backendStatus.value = 'online'
      return
    }

    backendStatus.value = 'offline'
    backendError.value = health.reason ?? '未知原因'
  }

  return {
    // state
    backendStatus,
    backendError,
    // getters
    appTitle,
    appEnv,
    showEnvBadge,
    backendOnline,
    isLocal,
    // actions
    probeBackend,
  }
})
