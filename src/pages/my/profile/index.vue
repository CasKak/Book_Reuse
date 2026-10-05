<script setup lang="ts">
/**
 * 个人中心 · 资料页
 *
 * 展示内容按合规要求处理：
 *   · 手机号脱敏展示，不显示明文
 *   · 认证状态给出明确的可做/不可做说明，避免用户困惑
 *   · 黑名单用户显示原因（版权风控，见商业计划书 9.1 节）
 */
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'

import { ApiError } from '@/shared/api'
import { LogoutButton, ProfileForm } from '@/features'
import { roleLabel, submitStudentVerification, useUserStore } from '@/entities/user'

const userStore = useUserStore()
const submittingVerify = ref(false)

const vm = computed(() => userStore.profileVm)

/** 提交学生认证申请 */
async function handleVerify(): Promise<void> {
  const userId = userStore.currentUserId
  if (userId === null) {
    return
  }

  submittingVerify.value = true
  try {
    await submitStudentVerification(userId)
    await userStore.refreshProfile()
    ElMessage.success('认证资料已提交，请等待审核')
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null
    ElMessage.error(apiError?.userMessage ?? '提交失败，请稍后重试')
  } finally {
    submittingVerify.value = false
  }
}
</script>

<template>
  <div v-if="vm === null" class="qy-container py-16 text-center text-gray-500">
    正在加载个人资料…
  </div>

  <div v-else class="qy-container py-8">
    <div class="grid gap-6 lg:grid-cols-[280px_1fr]">
      <!-- ===================== 左侧：概览 ===================== -->
      <aside class="space-y-4">
        <div class="qy-card text-center">
          <el-avatar :size="64" :src="vm.avatarUrl ?? undefined">
            {{ vm.nickname.slice(0, 1) }}
          </el-avatar>

          <h1 class="mt-3 text-lg font-semibold text-gray-800">{{ vm.nickname }}</h1>

          <div class="mt-2 flex flex-wrap items-center justify-center gap-2">
            <el-tag size="small" effect="plain">{{ vm.roleLabel }}</el-tag>
            <el-tag :type="vm.verifyTone" size="small">{{ vm.verifyLabel }}</el-tag>
          </div>

          <p class="mt-3 text-xs text-gray-400">{{ vm.phoneMasked }}</p>
        </div>

        <div class="qy-card">
          <h2 class="mb-3 text-sm font-medium text-gray-700">我的数据</h2>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between">
              <dt class="text-gray-500">信用分</dt>
              <dd class="font-medium">{{ vm.creditScore }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-500">积分</dt>
              <dd class="font-medium">{{ vm.pointsBalance }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-500">累计减排</dt>
              <dd class="font-medium">{{ vm.carbonTotalKg.toFixed(2) }} kg</dd>
            </div>
          </dl>
          <el-alert
            class="mt-3"
            type="warning"
            :closable="false"
            title="碳减排为测算值"
            description="系数取自示例参数，尚未经 LCA 实测校准。"
          />
        </div>

        <div class="qy-card space-y-2">
          <RouterLink to="/my/addresses" class="block">
            <el-button class="w-full">收货地址管理</el-button>
          </RouterLink>
          <LogoutButton class="w-full" />
        </div>
      </aside>

      <!-- ===================== 右侧：认证状态 + 资料表单 ===================== -->
      <div class="space-y-6">
        <!-- 认证状态 -->
        <section class="qy-card">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-base font-semibold text-gray-800">学生认证</h2>
              <p class="mt-1 text-sm text-gray-500">{{ vm.verifyHint }}</p>
            </div>
            <el-tag :type="vm.verifyTone">{{ vm.verifyLabel }}</el-tag>
          </div>

          <el-alert
            v-if="vm.isBlacklisted"
            class="mt-4"
            type="error"
            :closable="false"
            title="账号已被限制交易"
            description="因涉及盗版或未授权资料的流转，账号已被列入黑名单，无法发布与交易。如有异议请联系平台。"
          />

          <div
            v-if="vm.verifyStatus === 'unverified' || vm.verifyStatus === 'rejected'"
            class="mt-4"
          >
            <el-alert
              type="info"
              :closable="false"
              title="认证需要提交学生证照片"
              description="学生证照片属于敏感个人信息，平台将单独征得你的同意、加密存储，仅用于身份核验。当前为演示环境，暂未开放上传。"
            />
            <el-button
              class="mt-3"
              type="primary"
              :loading="submittingVerify"
              @click="handleVerify"
            >
              提交认证申请
            </el-button>
          </div>

          <el-alert
            v-else-if="vm.verifyStatus === 'pending'"
            class="mt-4"
            type="warning"
            :closable="false"
            title="认证审核中"
            description="通常 1 个工作日内完成审核，通过后即可发布图书。"
          />
        </section>

        <!-- 资料表单 -->
        <section class="qy-card">
          <h2 class="mb-4 text-base font-semibold text-gray-800">基本资料</h2>
          <ProfileForm />
        </section>

        <!-- 可做什么 -->
        <section class="qy-card">
          <h2 class="mb-3 text-base font-semibold text-gray-800">当前权限</h2>
          <ul class="space-y-2 text-sm">
            <li class="flex items-center gap-2">
              <el-tag :type="vm.canPublish ? 'success' : 'info'" size="small">
                {{ vm.canPublish ? '可以' : '不可' }}
              </el-tag>
              <span class="text-gray-600">发布图书 / 发起回收</span>
            </li>
            <li class="flex items-center gap-2">
              <el-tag :type="vm.isBlacklisted ? 'danger' : 'success'" size="small">
                {{ vm.isBlacklisted ? '受限' : '正常' }}
              </el-tag>
              <span class="text-gray-600">下单购买与参与活动</span>
            </li>
            <li class="flex items-center gap-2">
              <el-tag :type="roleLabel(vm.role) === '管理员' ? 'warning' : 'info'" size="small">
                {{ vm.roleLabel }}
              </el-tag>
              <span class="text-gray-600">当前角色（由平台分配，不可自行修改）</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
