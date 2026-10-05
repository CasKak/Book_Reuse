/**
 * 应用入口
 *
 * 初始化顺序（不要随意调整）：
 *   1. 全局样式（Tailwind base + Element Plus 主题变量覆盖）
 *   2. Element Plus 组件库（中文语言包）
 *   3. Pinia（路由守卫中要用到 store，必须在 router 之前注册）
 *   4. 会话初始化与认证状态订阅
 *   5. 路由并挂载
 */
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

import 'element-plus/dist/index.css'
import '@/app/styles/element-theme.css'
import '@/app/styles/index.css'

import App from '@/App.vue'
import { router } from '@/app/router'
import { pinia } from '@/app/stores'
import { useUserStore } from '@/entities/user'

const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })

const userStore = useUserStore(pinia)

// 订阅认证状态变化：
//   · access token 自动续期后同步
//   · 用户在其它标签页登出时本页同步退出
userStore.subscribeAuthChanges()

// 启动时初始化会话。此处 await 会阻塞首屏，因此不等待；
// 路由守卫在首次进入受保护页面时会再次确保初始化完成。
void userStore.initializeSession()

app.mount('#app')
