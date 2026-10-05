/// <reference types="vite/client" />

/**
 * Vite 环境变量类型声明
 *
 * ⚠️ 安全边界（详见 docs/security-compliance.md 第 2 节）：
 *   只有 VITE_ 前缀的变量会被注入前端产物，任何人都能在浏览器中看到。
 *   因此这里只声明「设计上可公开」的变量。
 *   service_role key、数据库密码等一律不得出现在此，只能放 Edge Function Secrets。
 */
interface ImportMetaEnv {
  /** Supabase 项目 URL，形如 https://<project-ref>.supabase.co */
  readonly VITE_SUPABASE_URL: string
  /** Supabase anon / publishable key —— 权限受 RLS 约束，非机密 */
  readonly VITE_SUPABASE_ANON_KEY: string
  /** 运行环境：local | staging | production */
  readonly VITE_APP_ENV: 'local' | 'staging' | 'production'
  /** 站点标题 */
  readonly VITE_APP_TITLE: string
  /** 当前模式（Vite 内置） */
  readonly MODE: string
  readonly DEV: boolean
  readonly PROD: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** 允许导入 .vue 单文件组件 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}
