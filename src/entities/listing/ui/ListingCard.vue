<script setup lang="ts">
/**
 * 图书卡片（市场列表用）
 *
 * 展示信息的合规要点：
 *   · 未通过 ISBN 权威库校验的书目**不展示**（后端查询已过滤，此处不再兜底）
 *   · 待人工复核的挂牌显示「审核中」角标且不可点击购买（版权风控第二层）
 *   · 价格为空（换书/捐赠）时显示「面议」「免费领取」，不显示 ¥0.00
 *   · 卖家仅展示昵称与认证状态，不展示院系、联系方式等个人信息
 */
import { computed } from 'vue'

import type { ListingViewModel } from '@/entities/listing'
import { formatPublishedAt } from '@/entities/listing'

const props = defineProps<{
  readonly listing: ListingViewModel
}>()

/** 封面缺失时的占位字母（取书名首字） */
const coverFallback = computed<string>(() => props.listing.book.title.slice(0, 1))

/** 上架时间文案 */
const publishedLabel = computed<string>(() => formatPublishedAt(props.listing.publishedAt))

/** 是否为租赁（需要额外展示押金与月租） */
const isRental = computed<boolean>(() => props.listing.listingType === 'rent')
</script>

<template>
  <RouterLink
    :to="`/book/${listing.id}`"
    class="group block h-full overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md"
  >
    <!-- ===================== 封面 ===================== -->
    <div class="relative aspect-[3/4] overflow-hidden bg-gray-50">
      <img
        v-if="listing.book.coverUrl"
        :src="listing.book.coverUrl"
        :alt="listing.book.title"
        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
      />
      <div
        v-else
        class="flex h-full w-full items-center justify-center text-3xl font-medium text-gray-300"
      >
        {{ coverFallback }}
      </div>

      <!-- 左上角：交易类型 -->
      <el-tag
        class="absolute left-2 top-2"
        :type="listing.listingType === 'sell' ? 'primary' : 'success'"
        size="small"
        effect="dark"
      >
        {{ listing.listingTypeLabel }}
      </el-tag>

      <!-- 右上角：不可购买时的状态提示 -->
      <el-tag
        v-if="!listing.purchasable"
        class="absolute right-2 top-2"
        type="warning"
        size="small"
        effect="dark"
      >
        {{ listing.needManualReview ? '审核中' : listing.statusLabel }}
      </el-tag>
    </div>

    <!-- ===================== 信息 ===================== -->
    <div class="p-3">
      <h3
        class="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-gray-800"
        :title="listing.book.title"
      >
        {{ listing.book.title }}
      </h3>

      <p class="mt-1 truncate text-xs text-gray-400">
        {{ listing.book.author }} · {{ listing.book.publisher }}
      </p>

      <!-- 品相 + 折扣 -->
      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <el-tag :type="listing.conditionTone" size="small" effect="plain">
          {{ listing.conditionLabel }}
        </el-tag>
        <el-tag v-if="listing.discountText" size="small" effect="plain">
          {{ listing.discountText }}
        </el-tag>
        <el-tag v-if="listing.hasFinalCondition" type="success" size="small" effect="plain">
          已质检
        </el-tag>
      </div>

      <!-- 价格 -->
      <div class="mt-2 flex items-baseline gap-1.5">
        <span
          :class="[
            'text-base font-semibold',
            listing.priceEmphasis ? 'text-red-500' : 'text-brand-700',
          ]"
        >
          {{ listing.priceText }}
        </span>
        <span
          v-if="listing.book.listPrice !== null && listing.priceEmphasis"
          class="text-xs text-gray-400 line-through"
        >
          ¥{{ listing.book.listPrice.toFixed(2) }}
        </span>
      </div>

      <!-- 租赁附加信息 -->
      <p v-if="isRental && listing.deposit !== null" class="mt-1 text-xs text-gray-500">
        押金 ¥{{ listing.deposit.toFixed(2) }}
        <template v-if="listing.rentalPriceMonth !== null">
          · 月租 ¥{{ listing.rentalPriceMonth.toFixed(2) }}
        </template>
      </p>

      <!-- 卖家与时间 -->
      <div class="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
        <span class="flex min-w-0 items-center gap-1 text-xs text-gray-500">
          <el-tag v-if="listing.sellerVerified" type="success" size="small" effect="plain">
            已认证
          </el-tag>
          <span class="truncate">{{ listing.sellerNickname }}</span>
        </span>
        <span class="shrink-0 text-xs text-gray-400">{{ publishedLabel }}</span>
      </div>
    </div>
  </RouterLink>
</template>

<style scoped>
/**
 * 两行截断。
 * Element Plus 与 Tailwind 均未内置多行截断工具类（Tailwind 3.4 已内置
 * line-clamp，但为使兼容性更稳，这里显式声明）。
 */
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
