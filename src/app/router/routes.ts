/**
 * 路由表
 *
 * 约定（对应 docs/page-list.md）：
 *   1. 页面组件一律懒加载，保证首屏体积可控
 *   2. meta.title        用于设置浏览器标题
 *   3. meta.requiresAuth 为 true 时未登录会被重定向到登录页
 *   4. meta.requiresStaff 为 true 时需要运营/管理员角色
 *   5. 动态 import 必须写到具体文件（如 index.vue）；
 *      写目录路径 TypeScript 无法解析
 */
import type { RouteRecordRaw } from 'vue-router'

/** 路由名称常量，避免在代码中散落字符串 */
export const ROUTE_NAMES = {
  home: 'home',
  login: 'login',
  register: 'register',
  forgotPassword: 'forgot-password',
  resetPassword: 'reset-password',
  myProfile: 'my-profile',
  myAddresses: 'my-addresses',
  notFound: 'not-found',
} as const

/**
 * 路由 meta 的类型声明
 *
 * TypeScript 要求扩展 RouteMeta 才能让 to.meta.xxx 有类型，
 * 否则只能取到 unknown。声明与路由表同文件，便于一起维护。
 */
declare module 'vue-router' {
  interface RouteMeta {
    /** 浏览器标题（不含站点后缀） */
    title?: string
    /** 是否需要登录 */
    requiresAuth?: boolean
    /** 是否需要运营/管理员角色 */
    requiresStaff?: boolean
  }
}

export const routes: RouteRecordRaw[] = [
  // ---------------------------------------------------------------- 公共区
  {
    path: '/',
    name: ROUTE_NAMES.home,
    component: () => import('@/pages/home/index.vue'),
    meta: { title: '首页' },
  },

  // ---------------------------------------------------------------- 认证区
  {
    path: '/auth/login',
    name: ROUTE_NAMES.login,
    component: () => import('@/pages/auth/login/index.vue'),
    meta: { title: '登录' },
  },
  {
    path: '/auth/register',
    name: ROUTE_NAMES.register,
    component: () => import('@/pages/auth/register/index.vue'),
    meta: { title: '注册' },
  },
  {
    path: '/auth/forgot-password',
    name: ROUTE_NAMES.forgotPassword,
    component: () => import('@/pages/auth/forgot-password/index.vue'),
    meta: { title: '找回密码' },
  },
  {
    path: '/auth/reset-password',
    name: ROUTE_NAMES.resetPassword,
    component: () => import('@/pages/auth/reset-password/index.vue'),
    meta: { title: '重置密码' },
  },

  // ------------------------------------------------------------ 个人中心
  {
    path: '/my/profile',
    name: ROUTE_NAMES.myProfile,
    component: () => import('@/pages/my/profile/index.vue'),
    meta: { title: '个人中心', requiresAuth: true },
  },
  {
    path: '/my/addresses',
    name: ROUTE_NAMES.myAddresses,
    component: () => import('@/pages/my/addresses/index.vue'),
    meta: { title: '收货地址', requiresAuth: true },
  },

  // ------------------------------------------------- 404 兜底（必须最后）
  {
    path: '/:pathMatch(.*)*',
    name: ROUTE_NAMES.notFound,
    component: () => import('@/pages/not-found/index.vue'),
    meta: { title: '页面不存在' },
  },
]
