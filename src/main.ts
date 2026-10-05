/**
 * 应用入口
 *
 * 初始化顺序（不要随意调整）：
 *   1. 全局样式（含 Tailwind base 与 Element Plus 主题变量覆盖）
 *   2. Element Plus 组件库（中文语言包）
 *   3. Pinia（路由守卫中可能要用到 store，必须在 router 之前注册）
 *   4. 路由并挂载
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

const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })

app.mount('#app')
