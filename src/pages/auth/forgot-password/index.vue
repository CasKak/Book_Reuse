<script setup lang="ts">
/**
 * 忘记密码页
 *
 * 安全说明：
 *   无论邮箱是否已注册，都提示「重置邮件已发送」。
 *   避免通过错误信息差异判断某个邮箱是否注册过（账号枚举）。
 */
import { reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ElMessage } from 'element-plus'

import { ApiError } from '@/shared/api'
import { flattenZodErrors, forgotPasswordSchema, sendPasswordResetEmail } from '@/entities/user'

const form = reactive({ email: '' })
const errors = reactive<Record<string, string>>({})
const submitting = ref(false)
const sent = ref(false)

function clearErrors(): void {
  for (const key of Object.keys(errors)) {
    delete errors[key]
  }
}

async function handleSubmit(): Promise<void> {
  clearErrors()

  const parsed = forgotPasswordSchema.safeParse({ email: form.email })

  if (!parsed.success) {
    Object.assign(errors, flattenZodErrors(parsed.error))
    return
  }

  submitting.value = true

  try {
    await sendPasswordResetEmail(parsed.data.email)
    sent.value = true
    ElMessage.success('重置邮件已发送，请查收邮箱')
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null

    // 即便发送失败（如邮箱不存在），也不暴露账号是否存在
    if (apiError?.kind === 'not_found') {
      sent.value = true
      ElMessage.success('重置邮件已发送，请查收邮箱')
    } else {
      ElMessage.error(apiError?.userMessage ?? '发送失败，请稍后重试')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="qy-container flex min-h-[70vh] items-center justify-center py-10">
    <div class="w-full max-w-md">
      <div class="mb-8 text-center">
        <h1 class="text-2xl font-bold text-gray-800">找回密码</h1>
        <p class="mt-2 text-sm text-gray-500">输入注册邮箱，我们会发送重置链接</p>
      </div>

      <div class="qy-card">
        <el-result
          v-if="sent"
          icon="success"
          title="重置邮件已发送"
          sub-title="请检查邮箱（含垃圾邮件箱）。链接有效期通常为 1 小时。"
        >
          <template #extra>
            <el-button @click="sent = false">换个邮箱重试</el-button>
            <RouterLink to="/auth/login">
              <el-button type="primary">返回登录</el-button>
            </RouterLink>
          </template>
        </el-result>

        <el-form v-else label-position="top" :model="form" @submit.prevent="handleSubmit">
          <el-form-item label="注册邮箱" :error="errors['email']">
            <el-input
              v-model="form.email"
              type="email"
              placeholder="请输入注册时使用的邮箱"
              autocomplete="email"
              size="large"
              clearable
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
            发送重置邮件
          </el-button>

          <p class="mt-4 text-center text-sm text-gray-500">
            <RouterLink to="/auth/login" class="text-brand-700 hover:underline">
              返回登录
            </RouterLink>
          </p>
        </el-form>
      </div>
    </div>
  </div>
</template>
