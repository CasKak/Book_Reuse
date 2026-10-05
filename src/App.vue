<script setup lang="ts">
/**
 * 应用根组件
 *
 * 当前阶段（阶段 1）只提供最小可运行骨架：
 *   - 顶部品牌栏 + 底部宣传语，验证 Tailwind 与 Element Plus 均正常工作
 *   - 非生产环境显示环境角标，便于区分本地 / 预发布 / 生产
 *
 * 后续阶段：替换为 widgets/app-header + widgets/app-footer 组合，
 *           并按路由 meta 决定是否使用后台布局。
 */
import { computed } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

import { useAppStore } from '@/app/stores/app'

const appStore = useAppStore()

/** 环境角标文案 */
const envLabel = computed<string>(() => {
  const map: Record<string, string> = {
    local: '本地开发',
    staging: '预发布',
    production: '生产',
  }
  return map[appStore.appEnv] ?? appStore.appEnv
})
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <!-- ===================== 顶部品牌栏 ===================== -->
    <header class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div class="qy-container flex h-14 items-center justify-between">
        <RouterLink to="/" class="flex items-center gap-2">
          <span class="text-base font-semibold text-brand-700">青阅循环</span>
        </RouterLink>

        <div class="flex items-center gap-3">
          <el-tag v-if="appStore.showEnvBadge" type="warning" size="small" effect="plain">
            {{ envLabel }}
          </el-tag>
        </div>
      </div>
    </header>

    <!-- ===================== 页面内容 ===================== -->
    <main class="flex-1">
      <RouterView />
    </main>

    <!-- ===================== 页脚 ===================== -->
    <footer class="border-t border-gray-200 bg-white">
      <div class="qy-container py-12 text-center">
        <p class="text-sm text-gray-600">让闲置的书，再一次被需要</p>
        <p class="mt-2 text-xs text-gray-400">青阅循环 · 校园二手图书智能循环与生态服务平台</p>
      </div>
    </footer>
  </div>
</template>
