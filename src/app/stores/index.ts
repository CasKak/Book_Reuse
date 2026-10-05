/**
 * Pinia 实例
 *
 * 单独导出实例（而非在 main.ts 里内联创建），便于单元测试与
 * 路由守卫中在组件外使用 store。
 */
import { createPinia } from 'pinia'

export const pinia = createPinia()
