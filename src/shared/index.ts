/**
 * shared 层公共出口
 *
 * FSD 约定：其他层统一从 `@/shared` 导入，不要深链到 shared/api/xxx 这类内部路径。
 */
export * from './api'
export * from './config'
export * from './lib'
