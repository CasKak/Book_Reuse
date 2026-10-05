<script setup lang="ts">
/**
 * 个人资料表单
 *
 * 安全说明：
 *   role、verify_status、积分、碳减排总量等字段由数据库触发器保护，
 *   即使这里提交也会被保留原值（见 0008_rls_policies.sql）。
 *   本表单只提交用户真正可改的字段。
 */
import { onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { ApiError } from '@/shared/api'
import type { MajorRow, SchoolRow } from '@/shared/api'
import {
  fetchMajors,
  fetchSchools,
  flattenZodErrors,
  profileSchema,
  useUserStore,
} from '@/entities/user'

const userStore = useUserStore()

const form = reactive({
  nickname: '',
  schoolId: '',
  majorId: '',
  grade: null as number | null,
  enrollYear: null as number | null,
})

const errors = reactive<Record<string, string>>({})
const submitting = ref(false)

const schools = ref<SchoolRow[]>([])
const majors = ref<MajorRow[]>([])
const loadingMajors = ref(false)

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

/** 用当前档案回填表单 */
function fillFromProfile(): void {
  const profile = userStore.profile
  if (profile === null) {
    return
  }
  form.nickname = profile.nickname ?? ''
  form.schoolId = profile.school_id ?? ''
  form.majorId = profile.major_id ?? ''
  form.grade = profile.grade
  form.enrollYear = profile.enroll_year
}

function clearErrors(): void {
  for (const key of Object.keys(errors)) {
    delete errors[key]
  }
}

async function loadMajors(schoolId: string): Promise<void> {
  if (schoolId === '') {
    majors.value = []
    return
  }

  loadingMajors.value = true
  try {
    majors.value = await fetchMajors(schoolId)
  } finally {
    loadingMajors.value = false
  }
}

onMounted(async () => {
  fillFromProfile()

  schools.value = await fetchSchools()

  if (form.schoolId !== '') {
    await loadMajors(form.schoolId)
  }
})

// 切换学校时清空专业并重新加载
watch(
  () => form.schoolId,
  async (schoolId, previous) => {
    if (previous !== undefined && schoolId !== previous) {
      form.majorId = ''
    }
    await loadMajors(schoolId)
  },
)

async function handleSubmit(): Promise<void> {
  clearErrors()

  const parsed = profileSchema.safeParse({
    nickname: form.nickname,
    schoolId: form.schoolId,
    majorId: form.majorId,
    grade: form.grade,
    enrollYear: form.enrollYear,
  })

  if (!parsed.success) {
    Object.assign(errors, flattenZodErrors(parsed.error))
    return
  }

  submitting.value = true

  try {
    await userStore.saveProfile({
      nickname: parsed.data.nickname,
      schoolId: parsed.data.schoolId === '' ? null : parsed.data.schoolId,
      majorId: parsed.data.majorId === '' ? null : parsed.data.majorId,
      grade: parsed.data.grade,
      enrollYear: parsed.data.enrollYear,
    })

    ElMessage.success('资料已保存')
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null
    ElMessage.error(apiError?.userMessage ?? '保存失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-form label-position="top" :model="form" @submit.prevent="handleSubmit">
    <el-form-item label="昵称" :error="errors['nickname']">
      <el-input
        v-model="form.nickname"
        placeholder="2-20 个字符"
        maxlength="20"
        show-word-limit
        clearable
      />
    </el-form-item>

    <el-form-item label="学校" :error="errors['schoolId']">
      <el-select
        v-model="form.schoolId"
        placeholder="请选择学校"
        class="w-full"
        filterable
        clearable
      >
        <el-option
          v-for="school in schools"
          :key="school.id"
          :label="school.name"
          :value="school.id"
        />
      </el-select>
    </el-form-item>

    <el-form-item label="专业" :error="errors['majorId']">
      <el-select
        v-model="form.majorId"
        placeholder="请先选择学校"
        class="w-full"
        :loading="loadingMajors"
        :disabled="form.schoolId === ''"
        filterable
        clearable
      >
        <el-option v-for="major in majors" :key="major.id" :label="major.name" :value="major.id" />
      </el-select>
    </el-form-item>

    <div class="grid gap-4 sm:grid-cols-2">
      <el-form-item label="年级" :error="errors['grade']">
        <el-select v-model="form.grade" placeholder="请选择年级" class="w-full" clearable>
          <el-option
            v-for="option in gradeOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="入学年份" :error="errors['enrollYear']">
        <el-input-number
          v-model="form.enrollYear"
          :min="2000"
          :max="2100"
          placeholder="如 2023"
          class="w-full"
          controls-position="right"
        />
      </el-form-item>
    </div>

    <el-button type="primary" :loading="submitting" @click="handleSubmit"> 保存资料 </el-button>
  </el-form>
</template>
