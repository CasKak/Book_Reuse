<script setup lang="ts">
/**
 * 退出登录按钮
 *
 * 行为：
 *   1. 二次确认，避免误触
 *   2. 调用 store.logout()（内部已保证即使请求失败也清空本地状态）
 *   3. 跳回首页
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import { useUserStore } from '@/entities/user'

const router = useRouter()
const userStore = useUserStore()
const loading = ref(false)

async function handleLogout(): Promise<void> {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '退出确认', {
      type: 'warning',
      confirmButtonText: '退出',
      cancelButtonText: '取消',
    })
  } catch {
    return // 用户取消
  }

  loading.value = true
  try {
    await userStore.logout()
    ElMessage.success('已退出登录')
    await router.replace('/')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <el-button text :loading="loading" @click="handleLogout">退出登录</el-button>
</template>
