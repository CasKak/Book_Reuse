<script setup lang="ts">
/**
 * 首页
 *
 * 阶段 1 的首页为「工程验证页」：验证路由、Tailwind、Element Plus、
 * Pinia 与 Supabase 客户端五条链路都正常工作。
 *
 * 阶段 4 会按 docs/page-list.md 第 2 节重做为正式落地页：
 * 品牌首屏、核心业务流程、四大价值主张、热门教材入口等。
 */
import { onMounted } from 'vue'

import { useAppStore } from '@/app/stores/app'

const appStore = useAppStore()

/** 四大价值主张（转述自商业计划书 4.1 节） */
const valueProps = [
  {
    title: '对卖方',
    desc: '方便、透明、低时间成本的旧书处理渠道，不用再搬着书找废品站。',
  },
  {
    title: '对买方',
    desc: '价格更低、距离更近、按专业与课程精准匹配的二手教材。',
  },
  {
    title: '对学校',
    desc: '可量化的绿色校园与毕业季图书回收服务，环保成果有数据可展示。',
  },
  {
    title: '对合作方',
    desc: '校园品牌曝光与可验证的循环经济合作场景。',
  },
] as const

/** 核心业务闭环（转述自商业计划书 1.1 节与 docs/PRD.md 第 3 节） */
const flowSteps = ['回收投递', '质检分级', '入库上架', '供需匹配', '履约交付', '碳积分'] as const

/** 后端连通状态对应的展示配置 */
const statusMap = {
  unknown: { text: '未检测', type: 'info' },
  checking: { text: '检测中…', type: 'warning' },
  online: { text: '已连接', type: 'success' },
  offline: { text: '连接失败', type: 'danger' },
} as const

onMounted(() => {
  // 进入首页时探测一次后端连通性，便于开发期快速定位配置问题
  void appStore.probeBackend()
})
</script>

<template>
  <div>
    <!-- ===================== 品牌首屏 ===================== -->
    <section class="bg-gradient-to-b from-brand-50 to-white">
      <div class="qy-container py-16 text-center sm:py-24">
        <h1 class="text-3xl font-bold tracking-tight text-brand-800 sm:text-5xl">青阅循环</h1>
        <p class="mt-4 text-base text-gray-600 sm:text-lg">校园二手图书智能循环与生态服务平台</p>
        <p class="mt-6 text-lg font-medium text-brand-700 sm:text-xl">让闲置的书，再一次被需要</p>

        <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
          <el-button type="primary" size="large" disabled>进入图书市场</el-button>
          <el-button size="large" disabled>我要卖书</el-button>
        </div>
        <p class="mt-3 text-xs text-gray-400">
          功能开发中 —— 当前为阶段 1 工程骨架，页面清单见 docs/page-list.md
        </p>
      </div>
    </section>

    <div class="qy-container space-y-10 py-12">
      <!-- ===================== 核心业务闭环 ===================== -->
      <section class="qy-card">
        <h2 class="text-lg font-semibold text-gray-800">核心业务闭环</h2>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <template v-for="(step, index) in flowSteps" :key="step">
            <el-tag type="success" effect="plain" size="large">{{ step }}</el-tag>
            <span v-if="index < flowSteps.length - 1" class="text-gray-300">→</span>
          </template>
        </div>
      </section>

      <!-- ===================== 价值主张 ===================== -->
      <section>
        <h2 class="mb-4 text-lg font-semibold text-gray-800">价值主张</h2>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div v-for="item in valueProps" :key="item.title" class="qy-card">
            <h3 class="font-medium text-brand-700">{{ item.title }}</h3>
            <p class="mt-2 text-sm leading-relaxed text-gray-600">{{ item.desc }}</p>
          </div>
        </div>
      </section>

      <!-- ===================== 工程自检面板 ===================== -->
      <section class="qy-card">
        <h2 class="text-lg font-semibold text-gray-800">工程自检</h2>
        <p class="mt-1 text-xs text-gray-400">仅开发期展示，用于确认五条基础链路是否打通</p>

        <el-descriptions class="mt-4" :column="1" border size="small">
          <el-descriptions-item label="Vue + 路由">
            <el-tag type="success" size="small">正常</el-tag>
            <span class="ml-2 text-xs text-gray-500">当前路由：首页</span>
          </el-descriptions-item>
          <el-descriptions-item label="Tailwind CSS">
            <el-tag type="success" size="small">正常</el-tag>
            <span class="ml-2 text-xs text-gray-500">品牌色与响应式栅格已生效</span>
          </el-descriptions-item>
          <el-descriptions-item label="Element Plus">
            <el-tag type="success" size="small">正常</el-tag>
            <span class="ml-2 text-xs text-gray-500">中文语言包已加载</span>
          </el-descriptions-item>
          <el-descriptions-item label="Pinia">
            <el-tag type="success" size="small">正常</el-tag>
            <span class="ml-2 text-xs text-gray-500">环境：{{ appStore.appEnv }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="Supabase 客户端">
            <el-tag :type="statusMap[appStore.backendStatus].type" size="small">
              {{ statusMap[appStore.backendStatus].text }}
            </el-tag>
            <span v-if="appStore.backendError" class="ml-2 text-xs text-red-500">
              {{ appStore.backendError }}
            </span>
          </el-descriptions-item>
        </el-descriptions>

        <el-alert
          class="mt-4"
          type="info"
          :closable="false"
          title="阶段 1 说明"
          description="当前数据库尚未创建任何表（阶段 2 交付迁移），因此首页不查询业务数据。Supabase 显示「已连接」表示环境变量与网络配置正确。"
        />
      </section>
    </div>
  </div>
</template>
