<script setup lang="ts">
/**
 * 注册表单
 *
 * 合规要点：
 *   · 用户协议与隐私政策必须**手动勾选**，不得默认勾选（《个人信息保护法》要求）
 *   · 注册即采集学校、专业、年级，属于个人信息，此处说明用途
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import { ApiError } from '@/shared/api'
import {
  fetchMajors,
  fetchSchools,
  flattenZodErrors,
  registerSchema,
  useUserStore,
} from '@/entities/user'
import type { MajorRow, SchoolRow } from '@/shared/api'

const router = useRouter()
const userStore = useUserStore()

const form = reactive({
  email: '',
  password: '',
  confirmPassword: '',
  nickname: '',
  schoolId: '',
  majorId: '',
  grade: null as number | null,
  agreed: false,
})

const errors = reactive<Record<string, string>>({})
const submitting = ref(false)

const schools = ref<SchoolRow[]>([])
const majors = ref<MajorRow[]>([])
const loadingSchools = ref(false)
const loadingMajors = ref(false)

/** 年级可选项（1-8 覆盖本科与部分研究生） */
const gradeOptions = [
  { label: '大一', value: 1 },
  { label: '大二', value: 2 },
  { label: '大三', value: 3 },
  { label: '大四', value: 4 },
  { label: '大五', value: 5 },
  { label: '研一', value: 6 },
  { label: '研二', value: 7 },
  { label: '研三', value: 8 },
]

const selectedSchoolName = computed<string>(
  () => schools.value.find((item) => item.id === form.schoolId)?.name ?? '',
)

function clearErrors(): void {
  for (const key of Object.keys(errors)) {
    delete errors[key]
  }
}

onMounted(async () => {
  loadingSchools.value = true
  try {
    schools.value = await fetchSchools()
  } finally {
    loadingSchools.value = false
  }
})

// 学校变更时重新加载专业，并清空已选专业（避免出现不匹配的组合）
watch(
  () => form.schoolId,
  async (schoolId) => {
    form.majorId = ''
    majors.value = []

    if (schoolId === '') {
      return
    }

    loadingMajors.value = true
    try {
      majors.value = await fetchMajors(schoolId)
    } finally {
      loadingMajors.value = false
    }
  },
)

async function handleSubmit(): Promise<void> {
  clearErrors()

  const parsed = registerSchema.safeParse({
    email: form.email,
    password: form.password,
    confirmPassword: form.confirmPassword,
    nickname: form.nickname,
    schoolId: form.schoolId,
    majorId: form.majorId,
    grade: form.grade,
    agreed: form.agreed,
  })

  if (!parsed.success) {
    Object.assign(errors, flattenZodErrors(parsed.error))
    return
  }

  submitting.value = true

  try {
    await userStore.register({
      email: parsed.data.email,
      password: parsed.data.password,
      nickname: parsed.data.nickname,
      schoolId: parsed.data.schoolId,
      majorId: parsed.data.majorId === '' ? null : parsed.data.majorId,
      grade: parsed.data.grade,
    })

    ElMessage.success('注册成功，请前往个人中心完成学生认证')
    await router.replace('/my/profile')
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null
    ElMessage.error(apiError?.userMessage ?? '注册失败，请稍后重试')
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
        placeholder="用于登录与找回密码"
        autocomplete="email"
        size="large"
        clearable
      />
    </el-form-item>

    <el-form-item label="昵称" :error="errors['nickname']">
      <el-input
        v-model="form.nickname"
        placeholder="2-20 个字符，将展示在图书详情页"
        size="large"
        maxlength="20"
        show-word-limit
        clearable
      />
    </el-form-item>

    <el-form-item label="密码" :error="errors['password']">
      <el-input
        v-model="form.password"
        type="password"
        placeholder="至少 8 位，需包含字母与数字"
        autocomplete="new-password"
        size="large"
        show-password
      />
    </el-form-item>

    <el-form-item label="确认密码" :error="errors['confirmPassword']">
      <el-input
        v-model="form.confirmPassword"
        type="password"
        placeholder="请再次输入密码"
        autocomplete="new-password"
        size="large"
        show-password
      />
    </el-form-item>

    <el-form-item label="学校" :error="errors['schoolId']">
      <el-select
        v-model="form.schoolId"
        placeholder="请选择所在学校"
        size="large"
        class="w-full"
        :loading="loadingSchools"
        filterable
      >
        <el-option
          v-for="school in schools"
          :key="school.id"
          :label="school.name"
          :value="school.id"
        />
      </el-select>
    </el-form-item>

    <el-form-item label="专业（可选）" :error="errors['majorId']">
      <el-select
        v-model="form.majorId"
        placeholder="请先选择学校"
        size="large"
        class="w-full"
        :loading="loadingMajors"
        :disabled="form.schoolId === ''"
        clearable
        filterable
      >
        <el-option v-for="major in majors" :key="major.id" :label="major.name" :value="major.id" />
      </el-select>
    </el-form-item>

    <el-form-item label="年级（可选）" :error="errors['grade']">
      <el-select
        v-model="form.grade"
        placeholder="请选择年级"
        size="large"
        class="w-full"
        clearable
      >
        <el-option
          v-for="option in gradeOptions"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>
    </el-form-item>

    <el-form-item :error="errors['agreed']">
      <el-checkbox v-model="form.agreed">
        我已阅读并同意
        <RouterLink to="/terms" class="text-brand-700 hover:underline">用户协议</RouterLink>
        与
        <RouterLink to="/privacy" class="text-brand-700 hover:underline">隐私政策</RouterLink>
      </el-checkbox>
    </el-form-item>

    <el-alert
      v-if="selectedSchoolName !== ''"
      class="mb-4"
      type="info"
      :closable="false"
      :title="`将加入：${selectedSchoolName}`"
      description="学校与专业用于同校图书匹配。按最小必要原则采集，不收集身份证号等无关信息。"
    />

    <el-button
      type="primary"
      size="large"
      class="w-full"
      :loading="submitting"
      @click="handleSubmit"
    >
      注册
    </el-button>

    <p class="mt-4 text-center text-sm text-gray-500">
      已有账号？
      <RouterLink to="/auth/login" class="text-brand-700 hover:underline">直接登录</RouterLink>
    </p>
  </el-form>
</template>
