/**
 * 应用入口
 *
 * 初始化顺序（不要随意调整）：
 *   1. 全局样式（品牌变量 + Tailwind；Element Plus 主题由 SCSS 编译期注入）
 *   2. Pinia（路由守卫中要用到 store，必须在 router 之前注册）
 *   3. 会话初始化与认证状态订阅
 *   4. 路由并挂载
 *
 * 与阶段 1 的差异：
 *   · 不再 import ElementPlus 与 'element-plus/dist/index.css'
 *     —— 改为按需引入，见 src/app/plugins/element-plus.ts 与 vite.config.ts
 *   · 中文语言包改由 App.vue 的 <el-config-provider :locale="zhCn"> 提供
 */
import { createApp } from 'vue'

import '@/app/styles/theme.css'
import '@/app/styles/index.css'

import App from '@/App.vue'
import { router } from '@/app/router'
import { pinia } from '@/app/stores'
import { useUserStore } from '@/entities/user'

const app = createApp(App)

app.use(pinia)
app.use(router)

const userStore = useUserStore(pinia)

// 订阅认证状态变化：
//   · access token 自动续期后同步
//   · 用户在其它标签页登出时本页同步退出
userStore.subscribeAuthChanges()

// 启动时初始化会话。此处不 await，避免阻塞首屏；
// 路由守卫在首次进入受保护页面时会再次确保初始化完成。
void userStore.initializeSession()

app.mount('#app')
