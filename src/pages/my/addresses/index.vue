<script setup lang="ts">
/**
 * 个人中心 · 地址管理页
 */
import { AddressBook } from '@/features'
</script>

<template>
  <div class="qy-container py-8">
    <div class="mb-6">
      <h1 class="text-xl font-semibold text-gray-800">收货地址</h1>
      <p class="mt-1 text-sm text-gray-500">用于校内交付与上门回收，地址仅你本人与运营人员可见</p>
    </div>

    <div class="qy-card">
      <AddressBook />
    </div>
  </div>
</template>
