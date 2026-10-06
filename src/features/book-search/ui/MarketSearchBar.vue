<script setup lang="ts">
/**
 * 市场搜索框
 *
 * 交互设计：
 *   · 受控组件，值由父级（页面 + URL）持有
 *   · 回车或点击按钮才触发搜索，避免每敲一个字就发请求
 *   · 支持清空；清空后立即触发一次搜索
 *   · 提示支持 ISBN，因为扫码/输入 ISBN 是学生找教材最快的方式
 */
import { ref, watch } from 'vue'

const props = defineProps<{
  /** 当前关键词（来自 URL） */
  readonly modelValue: string | null
  /** 是否正在加载 */
  readonly loading?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string | null): void
  /** 请求执行搜索 */
  (event: 'search', value: string | null): void
}>()

/** 输入框本地值（与外部值解耦，避免输入过程中被覆盖） */
const input = ref<string>(props.modelValue ?? '')

// 外部值变化时同步（如用户点「清空筛选」或浏览器后退）
watch(
  () => props.modelValue,
  (value) => {
    input.value = value ?? ''
  },
)

function submit(): void {
  const trimmed = input.value.trim()
  emit('update:modelValue', trimmed === '' ? null : trimmed)
  emit('search', trimmed === '' ? null : trimmed)
}

function clear(): void {
  input.value = ''
  emit('update:modelValue', null)
  emit('search', null)
}
</script>

<template>
  <div class="flex gap-2">
    <el-input
      v-model="input"
      placeholder="搜索书名、作者或 ISBN"
      size="large"
      clearable
      :prefix-icon="undefined"
      @keyup.enter="submit"
      @clear="clear"
    >
      <template #prepend>
        <span class="text-gray-400">🔍</span>
      </template>
    </el-input>

    <el-button type="primary" size="large" :loading="loading" @click="submit">搜索</el-button>
  </div>
</template>
