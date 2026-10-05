<script setup lang="ts">
/**
 * 登录表单
 *
 * 安全说明：
 *   · 登录失败时不区分「账号不存在」与「密码错误」，统一提示，避免账号枚举
 *   · 不在前端做任何登录次数限制（应由 Supabase Auth 的速率限制承担）
 */
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import { ApiError } from '@/shared/api'
import { flattenZodErrors, loginSchema, useUserStore } from '@/entities/user'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const form = reactive({
  email: '',
  password: '',
})

const errors = reactive<Record<string, string>>({})
const submitting = ref(false)

/** 登录成功后要跳转的路径（由路由守卫写入 query.redirect） */
const redirectPath = computed<string>(() => {
  const target = route.query['redirect']
  return typeof target === 'string' && target.startsWith('/') ? target : '/'
})

function clearErrors(): void {
  for (const key of Object.keys(errors)) {
    delete errors[key]
  }
}

async function handleSubmit(): Promise<void> {
  clearErrors()

  const parsed = loginSchema.safeParse({ email: form.email, password: form.password })

  if (!parsed.success) {
    Object.assign(errors, flattenZodErrors(parsed.error))
    return
  }

  submitting.value = true

  try {
    await userStore.login(parsed.data.email, parsed.data.password)
    ElMessage.success('登录成功')
    await router.replace(redirectPath.value)
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null
    ElMessage.error(apiError?.userMessage ?? '登录失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-form label-position="top" :model="form" @submit.prevent="handleSubmit">
    <el-form-item label="邮箱" :error="errors['email']">
      <el-input
        v-model="form.email"
        type="email"
        placeholder="请输入注册邮箱"
        autocomplete="email"
        size="large"
        clearable
      />
    </el-form-item>

    <el-form-item label="密码" :error="errors['password']">
      <el-input
        v-model="form.password"
        type="password"
        placeholder="请输入密码"
        autocomplete="current-password"
        size="large"
        show-password
        @keyup.enter="handleSubmit"
      />
    </el-form-item>

    <div class="mb-4 flex items-center justify-between text-sm">
      <RouterLink to="/auth/forgot-password" class="text-brand-700 hover:underline">
        忘记密码？
      </RouterLink>
      <RouterLink to="/auth/register" class="text-brand-700 hover:underline">
        注册新账号
      </RouterLink>
    </div>

    <el-button
      type="primary"
      size="large"
      class="w-full"
      :loading="submitting"
      @click="handleSubmit"
    >
      登录
    </el-button>
  </el-form>
</template>
