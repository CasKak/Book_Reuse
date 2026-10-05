import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * Vitest 独立配置
 *
 * 为什么不复用 vite.config.ts：
 *   Vite 8 的 defineConfig 类型不包含 `test` 字段，写在 vite.config.ts 里
 *   会触发 TS 类型错误（本项目要求 typecheck 零错误）。因此单独提供测试配置。
 *
 * 运行：pnpm test
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // 纯函数与数据模型测试运行在 node 环境即可；组件测试后续按需切 jsdom
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // 定价与碳计算对应「数据可核验」要求，纳入强制覆盖范围
      include: ['src/shared/lib/**/*.ts', 'src/entities/**/model/**/*.ts'],
      exclude: ['**/*.d.ts', '**/index.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
})
