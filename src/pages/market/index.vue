<script setup lang="ts">
/**
 * 图书市场页
 *
 * 状态管理策略：**URL 即状态**
 *   · 筛选、排序、页码全部由路由 query 承载，页面本身不保存副本
 *   · 好处：可分享链接、刷新不丢条件、浏览器前进后退可用
 *   · 副作用：每次筛选变化都会改 URL 并触发重新查询，这是预期行为
 *
 * 数据来源与合并：
 *   · fetchMarketListings 返回挂牌 + 书目（两次查询后在应用层合并）
 *   · 卖家信息单独批量读取 profiles_public 视图（不含敏感字段）
 *
 * ⚠️ 数据库未就绪时的表现：
 *   查询会失败并抛出 ApiError，页面展示可读的错误提示而非白屏。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/shared/api'
import type { BookRow, ListingRow, PublicProfileRow } from '@/shared/api'
import { toBookViewModel } from '@/entities/book'
import {
  DEFAULT_PAGE_SIZE,
  ListingCard,
  MarketFilterPanel,
  buildClearedQuery,
  buildMarketQuery,
  countActiveFilters,
  fetchMarketListings,
  fetchPublicProfiles,
  parseMarketQuery,
  toListingViewModel,
  type ListingViewModel,
  type MarketFilter,
  type MarketSort,
} from '@/entities/listing'
import { MarketSearchBar } from '@/features'

const route = useRoute()
const router = useRouter()

// ---------------------------------------------------------------- 页面状态
const items = ref<ListingViewModel[]>([])
const total = ref(0)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

/** 移动端筛选抽屉 */
const filterDrawerVisible = ref(false)

// -------------------------------------------------- 从 URL 解析出的当前状态
const queryState = computed(() => parseMarketQuery(route.query as Record<string, unknown>))
const currentFilter = computed<MarketFilter>(() => queryState.value.filter)
const currentSort = computed<MarketSort>(() => queryState.value.sort)
const currentPage = computed<number>(() => queryState.value.page)

const activeFilterCount = computed<number>(() => countActiveFilters(currentFilter.value))
const totalPages = computed<number>(() => Math.max(1, Math.ceil(total.value / DEFAULT_PAGE_SIZE)))

/** 是否有任何可清空的筛选（用于空状态文案区分） */
const hasFilter = computed<boolean>(() => activeFilterCount.value > 0)
/** 关键词（单独取出，空状态文案需要区分「搜索无结果」与「筛选无结果」） */
const currentKeyword = computed<string>(() => currentFilter.value.keyword ?? '')

// ---------------------------------------------------------------- URL 同步
/** 用新的筛选条件更新 URL，并重置到第 1 页 */
function applyFilter(filter: MarketFilter): void {
  void router.push({
    query: buildMarketQuery({ filter, sort: currentSort.value, page: 1 }),
  })
}

function applySort(sort: MarketSort): void {
  void router.push({
    query: buildMarketQuery({ filter: currentFilter.value, sort, page: 1 }),
  })
}

function applyPage(page: number): void {
  void router.push({
    query: buildMarketQuery({
      filter: currentFilter.value,
      sort: currentSort.value,
      page,
    }),
  })
}

function clearFilters(): void {
  void router.push({ query: buildClearedQuery(currentSort.value) })
}

// ---------------------------------------------------------------- 数据加载
/**
 * 把数据库行转换为展示视图模型。
 *
 * 这里做三件事：
 *   1. 批量取卖家公开档案（一次查询，避免 N+1）
 *   2. 用 toBookViewModel / toListingViewModel 完成字段映射
 *   3. 丢弃书目缺失的异常记录（外键为 restrict，正常不会发生）
 */
async function buildViewModels(
  rows: ReadonlyArray<{ listing: ListingRow; book: BookRow }>,
): Promise<ListingViewModel[]> {
  const sellerIds = rows.map((row) => row.listing.seller_id)
  const sellerMap: Map<string, PublicProfileRow> = await fetchPublicProfiles(sellerIds)

  return rows.map((row) =>
    toListingViewModel({
      listing: row.listing,
      book: toBookViewModel(row.book),
      seller: sellerMap.get(row.listing.seller_id) ?? null,
    }),
  )
}

async function loadListings(): Promise<void> {
  loading.value = true
  errorMessage.value = null

  try {
    const result = await fetchMarketListings(
      currentFilter.value,
      { page: currentPage.value, pageSize: DEFAULT_PAGE_SIZE },
      currentSort.value,
    )

    items.value = await buildViewModels(result.items)
    total.value = result.total
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null
    errorMessage.value =
      apiError?.userMessage ??
      '图书列表加载失败。若数据库尚未初始化，请先执行 supabase/migrations 中的迁移。'
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

// 任何查询参数变化都重新加载
watch(
  () => route.query,
  () => {
    void loadListings()
  },
  { deep: true },
)

onMounted(() => {
  void loadListings()
})
</script>

<template>
  <div class="qy-container py-6 sm:py-8">
    <!-- ===================== 标题与搜索 ===================== -->
    <div class="mb-6">
      <h1 class="text-xl font-semibold text-gray-800 sm:text-2xl">图书市场</h1>
      <p class="mt-1 text-sm text-gray-500">按学校、专业与课程找到同校在售的二手教材</p>
    </div>

    <div class="mb-6">
      <MarketSearchBar
        :model-value="currentFilter.keyword ?? null"
        :loading="loading"
        @search="(value) => applyFilter({ ...currentFilter, keyword: value })"
      />
    </div>

    <div class="flex gap-6">
      <!-- ===================== 左侧筛选（桌面端） ===================== -->
      <aside class="hidden w-64 shrink-0 lg:block">
        <div class="sticky top-20 rounded-lg border border-gray-200 bg-white p-4">
          <MarketFilterPanel
            :filter="currentFilter"
            :sort="currentSort"
            @update:filter="applyFilter"
            @update:sort="applySort"
            @clear="clearFilters"
          />
        </div>
      </aside>

      <!-- ===================== 右侧结果 ===================== -->
      <div class="min-w-0 flex-1">
        <!-- 结果统计 + 移动端筛选入口 -->
        <div class="mb-4 flex items-center justify-between gap-3">
          <p class="text-sm text-gray-500">
            <template v-if="loading">正在加载…</template>
            <template v-else-if="errorMessage === null">
              共 <span class="font-medium text-gray-700">{{ total }}</span> 册在售
              <span v-if="totalPages > 1" class="text-gray-400">
                · 第 {{ currentPage }}/{{ totalPages }} 页
              </span>
            </template>
          </p>

          <el-button class="lg:hidden" @click="filterDrawerVisible = true">
            筛选<template v-if="activeFilterCount > 0">（{{ activeFilterCount }}）</template>
          </el-button>
        </div>

        <!-- 错误提示 -->
        <el-alert
          v-if="errorMessage !== null"
          type="error"
          :closable="false"
          title="加载失败"
          :description="errorMessage"
          class="mb-4"
        />

        <!-- 骨架屏 -->
        <div v-if="loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div
            v-for="index in 8"
            :key="index"
            class="overflow-hidden rounded-lg border border-gray-200 bg-white"
          >
            <el-skeleton animated>
              <template #template>
                <el-skeleton-item variant="image" style="width: 100%; height: 200px" />
                <div class="p-3">
                  <el-skeleton-item variant="text" style="width: 80%" />
                  <el-skeleton-item variant="text" style="width: 50%; margin-top: 8px" />
                </div>
              </template>
            </el-skeleton>
          </div>
        </div>

        <!-- 结果列表 -->
        <div
          v-else-if="items.length > 0"
          class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          <ListingCard v-for="item in items" :key="item.id" :listing="item" />
        </div>

        <!-- 空状态 -->
        <el-empty
          v-else-if="errorMessage === null"
          :description="
            currentKeyword !== ''
              ? `没有找到与「${currentKeyword}」相关的图书`
              : hasFilter
                ? '当前筛选条件下没有在售图书'
                : '暂无在售图书，成为第一个发布的人吧'
          "
        >
          <el-button v-if="hasFilter" type="primary" @click="clearFilters">
            清空筛选条件
          </el-button>
          <RouterLink v-else to="/publish">
            <el-button type="primary">发布图书</el-button>
          </RouterLink>
        </el-empty>

        <!-- 分页 -->
        <div v-if="items.length > 0 && totalPages > 1" class="mt-8 flex justify-center">
          <el-pagination
            :current-page="currentPage"
            :page-size="DEFAULT_PAGE_SIZE"
            :total="total"
            layout="prev, pager, next"
            background
            hide-on-single-page
            @current-change="applyPage"
          />
        </div>
      </div>
    </div>

    <!-- ===================== 移动端筛选抽屉 ===================== -->
    <el-drawer
      v-model="filterDrawerVisible"
      title="筛选"
      direction="rtl"
      size="85%"
      :with-header="true"
    >
      <MarketFilterPanel
        :filter="currentFilter"
        :sort="currentSort"
        @update:filter="
          (value) => {
            applyFilter(value)
            filterDrawerVisible = false
          }
        "
        @update:sort="applySort"
        @clear="
          () => {
            clearFilters()
            filterDrawerVisible = false
          }
        "
      />
    </el-drawer>
  </div>
</template>
