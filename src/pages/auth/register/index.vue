<script setup lang="ts">
/**
 * 注册页
 */
import { RegisterForm } from '@/features'
</script>

<template>
  <div class="qy-container flex min-h-[70vh] items-center justify-center py-10">
    <div class="w-full max-w-lg">
      <div class="mb-8 text-center">
        <h1 class="text-2xl font-bold text-gray-800">注册青阅循环</h1>
        <p class="mt-2 text-sm text-gray-500">绑定学校与专业，就能按课程精准找到同校二手教材</p>
      </div>

      <div class="qy-card">
        <RegisterForm />
      </div>
    </div>
  </div>
</template>
