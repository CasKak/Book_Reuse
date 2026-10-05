<script setup lang="ts">
/**
 * 重置密码页
 *
 * 进入方式：用户点击重置邮件中的链接，Supabase 会带上恢复令牌，
 * SDK 的 detectSessionInUrl 会自动建立临时会话，本页即可调用 updateUser。
 */
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import { ApiError } from '@/shared/api'
import { flattenZodErrors, resetPasswordSchema, updatePassword } from '@/entities/user'

const router = useRouter()

const form = reactive({
  password: '',
  confirmPassword: '',
})

const errors = reactive<Record<string, string>>({})
const submitting = ref(false)
const done = ref(false)

function clearErrors(): void {
  for (const key of Object.keys(errors)) {
    delete errors[key]
  }
}

async function handleSubmit(): Promise<void> {
  clearErrors()

  const parsed = resetPasswordSchema.safeParse({
    password: form.password,
    confirmPassword: form.confirmPassword,
  })

  if (!parsed.success) {
    Object.assign(errors, flattenZodErrors(parsed.error))
    return
  }

  submitting.value = true

  try {
    await updatePassword(parsed.data.password)
    done.value = true
    ElMessage.success('密码已重置')
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null
    ElMessage.error(apiError?.userMessage ?? '重置失败，请重新打开邮件中的链接')
  } finally {
    submitting.value = false
  }
}

async function goToLogin(): Promise<void> {
  await router.replace('/auth/login')
}
</script>

<template>
  <div class="qy-container flex min-h-[70vh] items-center justify-center py-10">
    <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <h1 class="text-2xl font-bold text-gray-800">设置新密码</h1>
        <p class="mt-2 text-sm text-gray-500">请设置一个未使用过的密码</p>
      </div>

      <div class="qy-card">
        <el-result v-if="done" icon="success" title="密码已重置" sub-title="请使用新密码重新登录">
          <template #extra>
            <el-button type="primary" @click="goToLogin">前往登录</el-button>
          </template>
        </el-result>

        <el-form v-else label-position="top" :model="form" @submit.prevent="handleSubmit">
          <el-form-item label="新密码" :error="errors['password']">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="至少 8 位，需包含字母与数字"
              autocomplete="new-password"
              size="large"
              show-password
            />
          </el-form-item>

          <el-form-item label="确认新密码" :error="errors['confirmPassword']">
            <el-input
              v-model="form.confirmPassword"
              type="password"
              placeholder="请再次输入新密码"
              autocomplete="new-password"
              size="large"
              show-password
              @keyup.enter="handleSubmit"
            />
          </el-form-item>

          <el-button
            type="primary"
            size="large"
            class="w-full"
            :loading="submitting"
            @click="handleSubmit"
          >
            确认重置
          </el-button>
        </el-form>
      </div>
    </div>
  </div>
</template>
