<script setup lang="ts">
/**
 * 登录页
 */
import { RouterLink } from 'vue-router'

import { LoginForm } from '@/features'
</script>

<template>
  <div class="qy-container flex min-h-[70vh] items-center justify-center py-10">
    <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <h1 class="text-2xl font-bold text-gray-800">欢迎回来</h1>
        <p class="mt-2 text-sm text-gray-500">登录后即可发布与购买二手图书</p>
      </div>

      <div class="qy-card">
        <LoginForm />
      </div>

      <p class="mt-6 text-center text-xs text-gray-400">
        登录即表示你同意
        <RouterLink to="/terms" class="text-brand-700 hover:underline">用户协议</RouterLink>
        与
        <RouterLink to="/privacy" class="text-brand-700 hover:underline">隐私政策</RouterLink>
      </p>
    </div>
  </div>
</template>
