<script setup lang="ts">
/**
 * 市场筛选面板
 *
 * 设计说明：
 *   · 受控组件：筛选值由父级（页面 + URL）持有，本组件只负责展示与派发
 *   · 学校 → 专业 → 课程 三级联动；切换上级时自动清空下级，避免出现
 *     「专业属于 A 校但学校已改为 B 校」这类非法组合
 *   · 多选项（品相、交易类型）用复选框而非下拉，移动端点击更省力
 *
 * 数据来源：
 *   · 学校/专业/课程均为公开数据（RLS 允许匿名读取），无需登录
 *   · 课程数量可能很多，用 filterable 提供搜索
 */
import { computed, onMounted, ref, watch } from 'vue'

import type { BookCondition, CourseRow, ListingType, MajorRow, SchoolRow } from '@/shared/api'
import { CONDITION_OPTIONS, LISTING_TYPE_OPTIONS } from '@/entities/book'
import type { MarketFilter, MarketSort } from '@/entities/listing'
import { MARKET_SORT_OPTIONS, countActiveFilters } from '@/entities/listing'
import { fetchCourses, fetchMajors, fetchSchools } from '@/entities/user'

const props = defineProps<{
  readonly filter: MarketFilter
  readonly sort: MarketSort
}>()

const emit = defineEmits<{
  /** 筛选条件变化（不含排序与页码，由父级一并重置到第 1 页） */
  (event: 'update:filter', value: MarketFilter): void
  (event: 'update:sort', value: MarketSort): void
  /** 请求清空全部筛选 */
  (event: 'clear'): void
}>()

// ---------------------------------------------------------------- 选项数据
const schools = ref<SchoolRow[]>([])
const majors = ref<MajorRow[]>([])
const courses = ref<CourseRow[]>([])

const loadingSchools = ref(false)
const loadingMajors = ref(false)
const loadingCourses = ref(false)

onMounted(async () => {
  loadingSchools.value = true
  try {
    schools.value = await fetchSchools()
  } finally {
    loadingSchools.value = false
  }
})

/** 加载指定学校下的专业 */
async function loadMajors(schoolId: string | null): Promise<void> {
  majors.value = []
  if (schoolId === null) {
    return
  }

  loadingMajors.value = true
  try {
    majors.value = await fetchMajors(schoolId)
  } finally {
    loadingMajors.value = false
  }
}

/** 加载指定条件下的课程 */
async function loadCourses(schoolId: string | null, majorId: string | null): Promise<void> {
  courses.value = []
  if (schoolId === null) {
    return
  }

  loadingCourses.value = true
  try {
    courses.value = await fetchCourses(schoolId, majorId)
  } finally {
    loadingCourses.value = false
  }
}

// 首次挂载后，若 URL 已带学校/专业，需把下级选项也补齐
onMounted(async () => {
  const schoolId = props.filter.schoolId ?? null
  if (schoolId !== null) {
    await loadMajors(schoolId)
    await loadCourses(schoolId, props.filter.majorId ?? null)
  }
})

// ---------------------------------------------------------------- 交互
const activeCount = computed<number>(() => countActiveFilters(props.filter))

/** 当前选中的品相（数组 ↔ 复选框绑定） */
const selectedConditions = computed<BookCondition[]>({
  get: () => [...(props.filter.conditions ?? [])],
  set: (value) => {
    emitFilter({ conditions: value })
  },
})

/** 当前选中的交易类型 */
const selectedTypes = computed<ListingType[]>({
  get: () => [...(props.filter.listingTypes ?? [])],
  set: (value) => {
    emitFilter({ listingTypes: value })
  },
})

/** 价格区间（绑定到本地字符串，避免空输入被当成 0） */
const priceMin = ref<string>('')
const priceMax = ref<string>('')

// 外部筛选变化时同步价格输入框（例如用户点了「清空筛选」）
watch(
  () => [props.filter.minPrice, props.filter.maxPrice] as const,
  ([min, max]) => {
    priceMin.value = min === null || min === undefined ? '' : String(min)
    priceMax.value = max === null || max === undefined ? '' : String(max)
  },
  { immediate: true },
)

/** 派发筛选变更（只覆盖传入的字段） */
function emitFilter(patch: Partial<MarketFilter>): void {
  emit('update:filter', { ...props.filter, ...patch })
}

/** 学校变更：清空专业与课程 */
async function handleSchoolChange(value: string | null): Promise<void> {
  emitFilter({ schoolId: value, majorId: null, courseId: null })
  await loadMajors(value)
  await loadCourses(value, null)
}

/** 专业变更：清空课程 */
async function handleMajorChange(value: string | null): Promise<void> {
  emitFilter({ majorId: value, courseId: null })
  await loadCourses(props.filter.schoolId ?? null, value)
}

/** 应用价格区间（由输入框失焦或回车触发，避免每敲一个数字就请求） */
function applyPriceRange(): void {
  const min = priceMin.value.trim() === '' ? null : Number(priceMin.value)
  const max = priceMax.value.trim() === '' ? null : Number(priceMax.value)

  emitFilter({
    minPrice: min !== null && Number.isFinite(min) && min >= 0 ? min : null,
    maxPrice: max !== null && Number.isFinite(max) && max >= 0 ? max : null,
  })
}

function handleClear(): void {
  priceMin.value = ''
  priceMax.value = ''
  emit('clear')
}
</script>

<template>
  <div class="space-y-5">
    <!-- ===================== 筛选头部 ===================== -->
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium text-gray-700">
        筛选
        <span v-if="activeCount > 0" class="ml-1 text-brand-700"
          >（已选 {{ activeCount }} 项）</span
        >
      </h2>
      <el-button v-if="activeCount > 0" text size="small" @click="handleClear">清空</el-button>
    </div>

    <!-- ===================== 学校 / 专业 / 课程 ===================== -->
    <div class="space-y-3">
      <div>
        <label class="mb-1.5 block text-xs text-gray-500">学校</label>
        <el-select
          :model-value="filter.schoolId ?? ''"
          placeholder="全部学校"
          class="w-full"
          :loading="loadingSchools"
          filterable
          clearable
          @change="handleSchoolChange(($event as string) === '' ? null : ($event as string))"
        >
          <el-option
            v-for="school in schools"
            :key="school.id"
            :label="school.name"
            :value="school.id"
          />
        </el-select>
      </div>

      <div>
        <label class="mb-1.5 block text-xs text-gray-500">专业</label>
        <el-select
          :model-value="filter.majorId ?? ''"
          placeholder="全部专业"
          class="w-full"
          :loading="loadingMajors"
          :disabled="filter.schoolId === null || filter.schoolId === undefined"
          filterable
          clearable
          @change="handleMajorChange(($event as string) === '' ? null : ($event as string))"
        >
          <el-option
            v-for="major in majors"
            :key="major.id"
            :label="major.name"
            :value="major.id"
          />
        </el-select>
      </div>

      <div>
        <label class="mb-1.5 block text-xs text-gray-500">课程</label>
        <el-select
          :model-value="filter.courseId ?? ''"
          placeholder="全部课程"
          class="w-full"
          :loading="loadingCourses"
          :disabled="filter.schoolId === null || filter.schoolId === undefined"
          filterable
          clearable
          @change="emitFilter({ courseId: ($event as string) === '' ? null : ($event as string) })"
        >
          <el-option
            v-for="course in courses"
            :key="course.id"
            :label="course.name"
            :value="course.id"
          />
        </el-select>
      </div>
    </div>

    <el-divider class="!my-0" />

    <!-- ===================== 交易类型 ===================== -->
    <div>
      <label class="mb-1.5 block text-xs text-gray-500">交易类型</label>
      <el-checkbox-group v-model="selectedTypes">
        <div class="flex flex-wrap gap-x-4 gap-y-1">
          <el-checkbox
            v-for="option in LISTING_TYPE_OPTIONS"
            :key="option.value"
            :value="option.value"
            :label="option.label"
          />
        </div>
      </el-checkbox-group>
    </div>

    <!-- ===================== 品相 ===================== -->
    <div>
      <label class="mb-1.5 block text-xs text-gray-500">品相</label>
      <el-checkbox-group v-model="selectedConditions">
        <div class="flex flex-wrap gap-x-4 gap-y-1">
          <el-checkbox
            v-for="option in CONDITION_OPTIONS"
            :key="option.value"
            :value="option.value"
            :label="option.label"
          />
        </div>
      </el-checkbox-group>
    </div>

    <el-divider class="!my-0" />

    <!-- ===================== 价格区间 ===================== -->
    <div>
      <label class="mb-1.5 block text-xs text-gray-500">价格区间（元）</label>
      <div class="flex items-center gap-2">
        <el-input
          v-model="priceMin"
          placeholder="最低"
          type="number"
          min="0"
          class="flex-1"
          @blur="applyPriceRange"
          @keyup.enter="applyPriceRange"
        />
        <span class="text-gray-300">—</span>
        <el-input
          v-model="priceMax"
          placeholder="最高"
          type="number"
          min="0"
          class="flex-1"
          @blur="applyPriceRange"
          @keyup.enter="applyPriceRange"
        />
      </div>
      <p class="mt-1 text-xs text-gray-400">换书与捐赠类型的图书无价格，不受区间限制</p>
    </div>

    <el-divider class="!my-0" />

    <!-- ===================== 排序 ===================== -->
    <div>
      <label class="mb-1.5 block text-xs text-gray-500">排序</label>
      <el-select
        :model-value="sort"
        class="w-full"
        @change="emit('update:sort', $event as MarketSort)"
      >
        <el-option
          v-for="option in MARKET_SORT_OPTIONS"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>
    </div>
  </div>
</template>
