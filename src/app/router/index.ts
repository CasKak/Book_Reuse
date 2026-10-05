/**
 * 路由实例与全局守卫
 *
 * 鉴权策略说明（重要）：
 *   前端守卫只解决「体验」问题——避免未登录用户看到空白页或报错页。
 *   真正的权限边界在数据库 RLS（supabase/migrations/0008_rls_policies.sql）。
 *   即使有人绕过前端守卫，也无法读取到无权访问的数据。
 */
import { createRouter, createWebHistory } from 'vue-router'

import { useUserStore } from '@/entities/user'

import { routes } from './routes'

const DEFAULT_TITLE = '青阅循环 · 校园二手图书智能循环与生态服务平台'

/** 登录页路径 */
const LOGIN_PATH = '/auth/login'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  /**
   * 滚动行为：
   *   · 浏览器前进/后退恢复原位置（学生浏览长列表后返回很关键）
   *   · 新导航回到顶部
   */
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})

/**
 * 全局前置守卫
 *
 * 顺序很重要：
 *   1. 先确保会话已初始化，否则刷新页面时 store 还是空的，会误判为未登录
 *   2. 再判断是否需要登录
 *   3. 最后判断是否需要运营角色
 */
router.beforeEach(async (to) => {
  // ---------- 标题 ----------
  const title = to.meta.title
  document.title =
    typeof title === 'string' && title.length > 0 ? `${title} · 青阅循环` : DEFAULT_TITLE

  const userStore = useUserStore()

  // ---------- 会话初始化（仅一次）----------
  if (!userStore.initialized) {
    await userStore.initializeSession()
  }

  // ---------- 需要登录 ----------
  if (to.meta.requiresAuth === true && !userStore.isAuthenticated) {
    return {
      path: LOGIN_PATH,
      // 记录来源路径，登录后跳回
      query: { redirect: to.fullPath },
    }
  }

  // ---------- 需要运营角色 ----------
  if (to.meta.requiresStaff === true && !userStore.isStaff) {
    return { path: '/' }
  }

  // ---------- 已登录用户不必再访问认证页 ----------
  if (userStore.isAuthenticated && (to.path === LOGIN_PATH || to.path === '/auth/register')) {
    return { path: '/' }
  }

  return true
})

export default router
