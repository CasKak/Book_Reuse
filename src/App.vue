<script setup lang="ts">
/**
 * 应用根组件
 *
 * 结构：
 *   · 顶部品牌栏：LOGO、导航、登录态（头像 / 昵称 / 下拉菜单）
 *   · 内容区：RouterView
 *   · 页脚：宣传语
 *
 * 后续阶段：把顶栏与页脚抽到 widgets/app-header、widgets/app-footer，
 *           并支持按路由 meta 切换到后台布局。
 */
import { computed } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

import { useAppStore } from '@/app/stores/app'
import { LogoutButton } from '@/features'
import { useUserStore } from '@/entities/user'

const appStore = useAppStore()
const userStore = useUserStore()

/** 环境角标文案 */
const envLabel = computed<string>(() => {
  const map: Record<string, string> = {
    local: '本地开发',
    staging: '预发布',
    production: '生产',
  }
  return map[appStore.appEnv] ?? appStore.appEnv
})

const profileVm = computed(() => userStore.profileVm)

/** 头像占位显示昵称首字 */
const avatarText = computed<string>(() => profileVm.value?.nickname.slice(0, 1) ?? '?')
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <!-- ===================== 顶部品牌栏 ===================== -->
    <header class="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div class="qy-container flex h-14 items-center justify-between gap-4">
        <!-- 品牌区 -->
        <div class="flex items-center gap-6">
          <RouterLink to="/" class="flex shrink-0 items-center gap-2">
            <span class="text-base font-semibold text-brand-700">青阅循环</span>
          </RouterLink>

          <nav class="hidden items-center gap-4 sm:flex">
            <RouterLink to="/" class="text-sm text-gray-600 transition-colors hover:text-brand-700">
              首页
            </RouterLink>
          </nav>
        </div>

        <!-- 右侧：环境角标 + 登录态 -->
        <div class="flex items-center gap-3">
          <el-tag v-if="appStore.showEnvBadge" type="warning" size="small" effect="plain">
            {{ envLabel }}
          </el-tag>

          <!-- 未登录 -->
          <template v-if="!userStore.isAuthenticated">
            <RouterLink to="/auth/login">
              <el-button text>登录</el-button>
            </RouterLink>
            <RouterLink to="/auth/register">
              <el-button type="primary">注册</el-button>
            </RouterLink>
          </template>

          <!-- 已登录 -->
          <el-dropdown v-else trigger="click">
            <div class="flex cursor-pointer items-center gap-2">
              <el-avatar :size="30" :src="profileVm?.avatarUrl ?? undefined">
                {{ avatarText }}
              </el-avatar>
              <span class="hidden text-sm text-gray-700 sm:inline">
                {{ profileVm?.nickname ?? '我的账号' }}
              </span>
            </div>

            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item>
                  <RouterLink to="/my/profile" class="block w-full">个人中心</RouterLink>
                </el-dropdown-item>
                <el-dropdown-item>
                  <RouterLink to="/my/addresses" class="block w-full">收货地址</RouterLink>
                </el-dropdown-item>
                <el-dropdown-item divided>
                  <LogoutButton />
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </header>

    <!-- ===================== 页面内容 ===================== -->
    <main class="flex-1">
      <RouterView />
    </main>

    <!-- ===================== 页脚 ===================== -->
    <footer class="border-t border-gray-200 bg-white">
      <div class="qy-container py-10 text-center">
        <p class="text-sm text-gray-600">让闲置的书，再一次被需要</p>
        <p class="mt-2 text-xs text-gray-400">青阅循环 · 校园二手图书智能循环与生态服务平台</p>
      </div>
    </footer>
  </div>
</template>
