<script setup lang="ts">
/**
 * 图书详情页
 *
 * 展示原则（合规相关，改动时请注意）：
 *   · 未通过 ISBN 权威库校验的书目绝不展示为可购买（后端查询已过滤）
 *   · 待人工复核的挂牌显示明确提示，禁用交易按钮（版权风控第二层）
 *   · 卖家只展示昵称与认证状态，不展示院系、联系方式等个人信息
 *   · 品相同时展示「卖家自评」与「人工质检终值」，二者不同时以质检为准
 *   · 碳减排相关数字若出现，必须标注为测算值（本页暂不展示碳数据）
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'

import { ApiError, formatCNY } from '@/shared'
import type { PublicProfileRow } from '@/shared/api'
import { describeCondition, formatIsbn, toBookViewModel } from '@/entities/book'
import {
  fetchListingDetail,
  fetchPublicProfiles,
  formatPublishedAt,
  toListingViewModel,
  type ListingViewModel,
} from '@/entities/listing'
import { useUserStore } from '@/entities/user'

const route = useRoute()
const userStore = useUserStore()

const listing = ref<ListingViewModel | null>(null)
const loading = ref(true)
const errorMessage = ref<string | null>(null)

/** 挂牌 id（来自路由参数） */
const listingId = computed<string>(() => {
  const raw = route.params['id']
  return typeof raw === 'string' ? raw : ''
})

/** 是否为当前用户自己发布的（自己不能买自己的书） */
const isOwnListing = computed<boolean>(
  () => listing.value !== null && listing.value.sellerId === userStore.currentUserId,
)

/** 是否可下单：可购买 + 已登录 + 非本人发布 */
const canBuy = computed<boolean>(() => {
  if (listing.value === null) return false
  if (!listing.value.purchasable) return false
  if (isOwnListing.value) return false
  return true
})

/** 不可下单时的原因文案 */
const disabledReason = computed<string>(() => {
  if (listing.value === null) return ''
  if (listing.value.needManualReview) {
    return '该图书正在人工复核中，暂不可交易'
  }
  if (!listing.value.purchasable) {
    return `该图书当前状态为「${listing.value.statusLabel}」，暂不可交易`
  }
  if (isOwnListing.value) {
    return '这是你自己发布的图书'
  }
  if (!userStore.isAuthenticated) {
    return '请先登录后再下单'
  }
  return ''
})

/** 交易按钮文案（按类型区分） */
const actionLabel = computed<string>(() => {
  if (listing.value === null) return '下单'
  switch (listing.value.listingType) {
    case 'rent':
      return '申请租赁'
    case 'exchange':
      return '发起换书'
    case 'donate':
      return '申请领取'
    case 'sell':
    default:
      return '立即购买'
  }
})

/** 上架时间文案 */
const publishedLabel = computed<string>(() =>
  listing.value === null ? '' : formatPublishedAt(listing.value.publishedAt),
)

/** 品相说明（卖家自评） */
const conditionHint = computed<string>(() =>
  listing.value === null ? '' : describeCondition(listing.value.condition).hint,
)

async function loadDetail(): Promise<void> {
  loading.value = true
  errorMessage.value = null
  listing.value = null

  if (listingId.value === '') {
    errorMessage.value = '图书地址不正确'
    loading.value = false
    return
  }

  try {
    const detail = await fetchListingDetail(listingId.value)

    if (detail === null) {
      errorMessage.value = '这本图书不存在，或已被下架'
      return
    }

    const sellerMap: Map<string, PublicProfileRow> = await fetchPublicProfiles([
      detail.listing.seller_id,
    ])

    listing.value = toListingViewModel({
      listing: detail.listing,
      book: toBookViewModel(detail.book),
      seller: sellerMap.get(detail.listing.seller_id) ?? null,
    })
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null
    errorMessage.value =
      apiError?.userMessage ??
      '图书详情加载失败。若数据库尚未初始化，请先执行 supabase/migrations 中的迁移。'
  } finally {
    loading.value = false
  }
}

/** 下单入口（真实下单在阶段 6 实现） */
function handleAction(): void {
  if (!userStore.isAuthenticated) {
    void route
    ElMessage.info('请先登录后再下单')
    return
  }
  ElMessage.info('下单流程将在后续阶段开放')
}

onMounted(() => {
  void loadDetail()
})
</script>

<template>
  <div class="qy-container py-6 sm:py-8">
    <!-- ===================== 加载中 ===================== -->
    <div v-if="loading" class="grid gap-8 lg:grid-cols-[360px_1fr]">
      <el-skeleton animated>
        <template #template>
          <el-skeleton-item variant="image" style="width: 100%; height: 420px" />
        </template>
      </el-skeleton>
      <div class="space-y-4">
        <el-skeleton :rows="8" animated />
      </div>
    </div>

    <!-- ===================== 错误 / 不存在 ===================== -->
    <el-result
      v-else-if="errorMessage !== null"
      icon="warning"
      title="无法显示这本图书"
      :sub-title="errorMessage"
    >
      <template #extra>
        <RouterLink to="/market">
          <el-button type="primary">返回图书市场</el-button>
        </RouterLink>
      </template>
    </el-result>

    <!-- ===================== 详情 ===================== -->
    <template v-else-if="listing !== null">
      <!-- 面包屑 -->
      <el-breadcrumb class="mb-5" separator="/">
        <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
        <el-breadcrumb-item :to="{ path: '/market' }">图书市场</el-breadcrumb-item>
        <el-breadcrumb-item>{{ listing.book.title }}</el-breadcrumb-item>
      </el-breadcrumb>

      <div class="grid gap-8 lg:grid-cols-[360px_1fr]">
        <!-- ---------- 左：封面 ---------- -->
        <div>
          <div
            class="relative aspect-[3/4] overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
          >
            <img
              v-if="listing.book.coverUrl"
              :src="listing.book.coverUrl"
              :alt="listing.book.title"
              class="h-full w-full object-cover"
            />
            <div
              v-else
              class="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-300"
            >
              <span class="text-5xl font-medium">{{ listing.book.title.slice(0, 1) }}</span>
              <span class="text-xs">暂无封面图</span>
            </div>
          </div>

          <p class="mt-2 text-center text-xs text-gray-400">
            封面为书目参考图，实际品相以下方说明与质检结果为准
          </p>
        </div>

        <!-- ---------- 右：信息与操作 ---------- -->
        <div class="min-w-0">
          <!-- 标题 -->
          <h1 class="text-xl font-semibold leading-snug text-gray-800 sm:text-2xl">
            {{ listing.book.title }}
          </h1>

          <p class="mt-2 text-sm text-gray-500">
            {{ listing.book.author }}
            <template v-if="listing.book.publisher !== '未标注'">
              · {{ listing.book.publisher }}
            </template>
          </p>

          <!-- 标签行 -->
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <el-tag :type="listing.listingType === 'sell' ? 'primary' : 'success'" effect="dark">
              {{ listing.listingTypeLabel }}
            </el-tag>
            <el-tag :type="listing.conditionTone" effect="plain">
              {{ listing.conditionLabel }}
            </el-tag>
            <el-tag v-if="listing.discountText" effect="plain">
              {{ listing.discountText }}
            </el-tag>
            <el-tag v-if="!listing.purchasable" type="warning">
              {{ listing.needManualReview ? '人工复核中' : listing.statusLabel }}
            </el-tag>
          </div>

          <!-- 价格区 -->
          <div class="mt-5 rounded-lg bg-brand-50 p-4">
            <div class="flex flex-wrap items-baseline gap-3">
              <span
                :class="[
                  'text-2xl font-semibold',
                  listing.priceEmphasis ? 'text-red-500' : 'text-brand-700',
                ]"
              >
                {{ listing.priceText }}
              </span>

              <span
                v-if="listing.book.listPrice !== null && listing.priceEmphasis"
                class="text-sm text-gray-400 line-through"
              >
                原价 {{ formatCNY(listing.book.listPrice) }}
              </span>
            </div>

            <!-- 租赁附加信息 -->
            <dl v-if="listing.listingType === 'rent'" class="mt-3 space-y-1 text-sm">
              <div v-if="listing.deposit !== null" class="flex gap-2">
                <dt class="text-gray-500">押金</dt>
                <dd class="font-medium text-gray-700">{{ formatCNY(listing.deposit) }}</dd>
                <span class="text-xs text-gray-400">（约为售价 80%，归还后退还）</span>
              </div>
              <div v-if="listing.rentalPriceMonth !== null" class="flex gap-2">
                <dt class="text-gray-500">月租</dt>
                <dd class="font-medium text-gray-700">
                  {{ formatCNY(listing.rentalPriceMonth) }}
                </dd>
              </div>
            </dl>
          </div>

          <!-- 交易按钮 -->
          <div class="mt-5">
            <el-button
              type="primary"
              size="large"
              :disabled="!canBuy"
              class="w-full sm:w-auto"
              @click="handleAction"
            >
              {{ actionLabel }}
            </el-button>

            <p v-if="disabledReason !== ''" class="mt-2 text-sm text-gray-500">
              {{ disabledReason }}
            </p>

            <el-alert
              v-if="!userStore.isAuthenticated && listing.purchasable"
              class="mt-3"
              type="info"
              :closable="false"
              title="登录后才能下单"
              description="登录后可查看订单、管理地址并使用积分。"
            />
          </div>

          <!-- ---------- 卖家信息 ---------- -->
          <div class="mt-6 rounded-lg border border-gray-200 p-4">
            <h2 class="mb-3 text-sm font-medium text-gray-700">卖家</h2>
            <div class="flex items-center gap-3">
              <el-avatar :size="40" :src="listing.sellerAvatarUrl ?? undefined">
                {{ listing.sellerNickname.slice(0, 1) }}
              </el-avatar>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="truncate text-sm font-medium text-gray-800">
                    {{ listing.sellerNickname }}
                  </span>
                  <el-tag
                    :type="listing.sellerVerified ? 'success' : 'info'"
                    size="small"
                    effect="plain"
                  >
                    {{ listing.sellerVerified ? '已通过学生认证' : '未认证' }}
                  </el-tag>
                </div>
                <p class="mt-0.5 text-xs text-gray-400">
                  为保护隐私，平台不展示卖家的院系与联系方式
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===================== 详细信息 ===================== -->
      <div class="mt-10 grid gap-6 lg:grid-cols-2">
        <!-- 品相说明 -->
        <section class="qy-card">
          <h2 class="mb-4 text-base font-semibold text-gray-800">品相说明</h2>

          <dl class="space-y-3 text-sm">
            <div class="flex items-start gap-3">
              <dt class="w-24 shrink-0 text-gray-500">卖家自评</dt>
              <dd class="flex-1">
                <el-tag :type="listing.conditionTone" size="small">
                  {{ listing.conditionLabel }}
                </el-tag>
                <p class="mt-1 text-gray-600">{{ conditionHint }}</p>
              </dd>
            </div>

            <div v-if="listing.hasFinalCondition" class="flex items-start gap-3">
              <dt class="w-24 shrink-0 text-gray-500">质检终值</dt>
              <dd class="flex-1">
                <el-tag type="success" size="small">{{ listing.conditionFinalLabel }}</el-tag>
                <p class="mt-1 text-gray-600">该图书已通过平台人工质检</p>
              </dd>
            </div>
            <div v-else class="flex items-start gap-3">
              <dt class="w-24 shrink-0 text-gray-500">质检状态</dt>
              <dd class="flex-1 text-gray-600">尚未质检，交易前平台会进行人工核验</dd>
            </div>
          </dl>

          <el-alert
            class="mt-4"
            type="info"
            :closable="false"
            title="品相分级标准"
            description="全新 › 9 成新（仅翻阅）› 8 成新（少量笔记）› 7 成新（明显痕迹）› 有瑕疵（破损或缺页，已如实描述）"
          />
        </section>

        <!-- 书目与交易信息 -->
        <section class="qy-card">
          <h2 class="mb-4 text-base font-semibold text-gray-800">图书信息</h2>

          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="ISBN">
              {{ formatIsbn(listing.book.isbn) }}
            </el-descriptions-item>
            <el-descriptions-item label="作者">{{ listing.book.author }}</el-descriptions-item>
            <el-descriptions-item label="出版社">
              {{ listing.book.publisher }}
            </el-descriptions-item>
            <el-descriptions-item label="定价">
              {{ listing.book.listPrice === null ? '未标注' : formatCNY(listing.book.listPrice) }}
            </el-descriptions-item>
            <el-descriptions-item label="上架时间">{{ publishedLabel }}</el-descriptions-item>
            <el-descriptions-item label="交付方式">
              {{ listing.deliveryMethod ?? '面议' }}
            </el-descriptions-item>
          </el-descriptions>

          <el-alert
            class="mt-4"
            :type="listing.book.isVerified ? 'success' : 'warning'"
            :closable="false"
            :title="listing.book.isVerified ? '已完成 ISBN 校验' : '未完成 ISBN 校验'"
            :description="
              listing.book.isVerified
                ? '该书目已通过权威图书数据库比对，可正常流转。'
                : '该书目尚未通过权威库比对，按平台规则不可上架交易。'
            "
          />
        </section>
      </div>

      <!-- ===================== 卖家描述 ===================== -->
      <section v-if="listing.description !== null" class="qy-card mt-6">
        <h2 class="mb-3 text-base font-semibold text-gray-800">卖家描述</h2>
        <p class="whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
          {{ listing.description }}
        </p>
      </section>

      <!-- ===================== 交易提示 ===================== -->
      <section class="qy-card mt-6">
        <h2 class="mb-3 text-base font-semibold text-gray-800">交易须知</h2>
        <ul class="space-y-2 text-sm text-gray-600">
          <li>
            · 平台仅流转<strong>合法取得的正版实体图书</strong>，
            严禁翻印、复印及未授权的内部讲义与考研资料。
          </li>
          <li>· 下单前请确认品相描述与交付方式，校内交付可当面验货。</li>
          <li v-if="listing.listingType === 'rent'">
            · 租赁逾期按 0.5 元/日计算；归还时如品相较出借时降一级，按差价从押金扣除。
          </li>
          <li>· 如发现盗版或与描述严重不符，请及时申诉，平台将介入处理。</li>
        </ul>
      </section>
    </template>
  </div>
</template>
