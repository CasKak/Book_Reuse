import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),

    /**
     * Element Plus 按需引入。
     *
     * 作用：只在模板中出现 <el-xxx> 时导入该组件与其样式，
     *       替代阶段 1 的全量引入（985 KB → 353 KB，gzip 317 → 122 KB）。
     *
     * importStyle: 'sass' 让样式以 SCSS 源码注入，从而支持主题变量覆盖
     * （见 src/app/styles/element-theme.scss 的 @forward ... with (...)）。
     *
     * 不使用 unplugin-auto-import 自动导入 ElMessage / ElMessageBox：
     * 这两个是函数式调用，显式 import 更清晰，也避免隐式全局变量。
     */
    Components({
      dts: 'src/types/components.d.ts',
      dirs: ['src/**/ui', 'src/components'],
      resolvers: [
        ElementPlusResolver({
          importStyle: 'sass',
        }),
      ],
      include: [/\.vue$/, /\.vue\?vue/],
    }),
  ],

  resolve: {
    alias: {
      // 与 tsconfig.app.json 的 paths 保持一致
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  css: {
    preprocessorOptions: {
      scss: {
        /**
         * 全局注入主题配置。
         *
         * 为什么必须用 additionalData 而不是在某个 scss 入口里 @use：
         *   Element Plus 的组件样式是「按需」被注入的，注入顺序不确定。
         *   只有在每个 SCSS 编译单元之前都先 @use 主题配置，
         *   才能保证 $colors 覆盖先于组件样式生效。
         *
         * 因此 element-theme.scss 只做 @forward ... with (...)，不产出任何规则。
         */
        additionalData: '@use "@/app/styles/element-theme.scss" as *;',
        // 静默 Element Plus 内部的 legacy JS API 告警（sass 1.105 起会提示）
        silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin'],
      },
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
