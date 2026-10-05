/**
 * 路由表
 *
 * 约定（对应 docs/page-list.md）：
 *   1. 页面组件一律懒加载（动态 import），保证首屏体积可控
 *   2. meta.title 用于设置浏览器标题
 *   3. meta.requiresAuth 标记需登录；meta.requiresRole 标记所需角色
 *   4. 后续阶段按页面清单逐步补充路由，此处先建立骨架与 404 兜底
 */
import type { RouteRecordRaw } from 'vue-router'

/** 路由名称常量，避免在代码中散落字符串 */
export const ROUTE_NAMES = {
  home: 'home',
  market: 'market',
  bookDetail: 'book-detail',
  login: 'login',
  notFound: 'not-found',
  forbidden: 'forbidden',
  serverError: 'server-error',
} as const

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: ROUTE_NAMES.home,
    component: () => import('@/pages/home/index.vue'),
    meta: { title: '首页' },
  },

  // ---------- 404 兜底（必须放在最后） ----------
  {
    path: '/:pathMatch(.*)*',
    name: ROUTE_NAMES.notFound,
    component: () => import('@/pages/not-found/index.vue'),
    meta: { title: '页面不存在' },
  },
]
