/**
 * 路由实例与全局守卫
 */
import { createRouter, createWebHistory } from 'vue-router'

import { routes } from './routes'

const DEFAULT_TITLE = '青阅循环 · 校园二手图书智能循环与生态服务平台'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  /**
   * 滚动行为：
   *   - 浏览器前进/后退时恢复原滚动位置（学生端浏览长列表后返回很关键）
   *   - 新导航时回到顶部
   */
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})

/**
 * 全局前置守卫
 *
 * 当前阶段只做标题设置。鉴权守卫在阶段 3（认证与用户档案）补充，
 * 届时按 meta.requiresAuth / meta.requiresRole 判断。
 */
router.beforeEach((to) => {
  const title = to.meta.title
  document.title =
    typeof title === 'string' && title.length > 0 ? `${title} · 青阅循环` : DEFAULT_TITLE

  // 不阻断导航
  return true
})

export default router
