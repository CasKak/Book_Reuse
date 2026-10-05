import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: {
      // 与 tsconfig.app.json 的 paths 保持一致
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    port: 5173,
    // 监听 0.0.0.0 便于用手机在同一局域网内访问，验证移动端适配
    host: true,
  },

  build: {
    // 目标浏览器：现代浏览器 + 微信内置浏览器（Android X5 / iOS WKWebView）
    target: 'es2020',
    // 单个 chunk 超过 800KB 时告警，便于及早发现体积失控
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // 把体积较大的第三方库拆出，避免主包过大影响首屏
        manualChunks(id: string): string | undefined {
          if (id.includes('node_modules')) {
            if (id.includes('element-plus') || id.includes('@element-plus')) {
              return 'element-plus'
            }
            if (id.includes('@supabase')) {
              return 'supabase'
            }
            if (id.includes('/vue/') || id.includes('vue-router') || id.includes('/pinia/')) {
              return 'vue'
            }
          }
          return undefined
        },
      },
    },
  },
})
