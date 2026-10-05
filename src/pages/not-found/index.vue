<script setup lang="ts">
/**
 * 404 页面
 */
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div
    class="qy-container flex min-h-[50vh] flex-col items-center justify-center py-20 text-center"
  >
    <p class="text-6xl font-bold text-brand-200">404</p>
    <h1 class="mt-4 text-lg font-semibold text-gray-800">页面不存在</h1>
    <p class="mt-2 text-sm text-gray-500">你访问的页面可能已被移除，或者链接有误。</p>
    <el-button class="mt-6" type="primary" @click="router.push('/')">返回首页</el-button>
  </div>
</template>
