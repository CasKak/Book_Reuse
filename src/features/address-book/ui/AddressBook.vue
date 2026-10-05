<script setup lang="ts">
/**
 * 地址管理
 *
 * 合规说明（见 docs/security-compliance.md 1.1）：
 *   校内地址属于个人信息，按最小必要原则只采集到「楼栋」层级，
 *   不要求精确门牌。detail 字段提示用户不要填写可识别到具体个人的信息。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { ApiError } from '@/shared/api'
import type { AddressRow } from '@/shared/api'
import {
  addressSchema,
  createAddress,
  deleteAddress,
  fetchMyAddresses,
  flattenZodErrors,
  setDefaultAddress,
  updateAddress,
  useUserStore,
} from '@/entities/user'

const userStore = useUserStore()

const addresses = ref<AddressRow[]>([])
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
/** 正在编辑的地址 id；null 表示新增 */
const editingId = ref<string | null>(null)

const form = reactive({
  label: '',
  campusArea: '',
  building: '',
  detail: '',
  isDefault: false,
})

const errors = reactive<Record<string, string>>({})

const dialogTitle = computed(() => (editingId.value === null ? '新增地址' : '编辑地址'))
const isEmpty = computed(() => !loading.value && addresses.value.length === 0)

function clearErrors(): void {
  for (const key of Object.keys(errors)) {
    delete errors[key]
  }
}

function resetForm(): void {
  form.label = ''
  form.campusArea = ''
  form.building = ''
  form.detail = ''
  form.isDefault = false
  clearErrors()
}

async function loadAddresses(): Promise<void> {
  const userId = userStore.currentUserId
  if (userId === null) {
    return
  }

  loading.value = true
  try {
    addresses.value = await fetchMyAddresses(userId)
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null
    ElMessage.error(apiError?.userMessage ?? '地址加载失败')
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  editingId.value = null
  resetForm()
  form.isDefault = addresses.value.length === 0 // 首个地址默认设为默认地址
  dialogVisible.value = true
}

function openEdit(address: AddressRow): void {
  editingId.value = address.id
  clearErrors()
  form.label = address.label ?? ''
  form.campusArea = address.campus_area ?? ''
  form.building = address.building ?? ''
  form.detail = address.detail ?? ''
  form.isDefault = address.is_default
  dialogVisible.value = true
}

async function handleSubmit(): Promise<void> {
  clearErrors()

  const parsed = addressSchema.safeParse({
    label: form.label,
    campusArea: form.campusArea,
    building: form.building,
    detail: form.detail,
    isDefault: form.isDefault,
  })

  if (!parsed.success) {
    Object.assign(errors, flattenZodErrors(parsed.error))
    return
  }

  const userId = userStore.currentUserId
  if (userId === null) {
    ElMessage.error('请先登录')
    return
  }

  submitting.value = true

  try {
    if (editingId.value === null) {
      const created = await createAddress(userId, parsed.data)
      if (parsed.data.isDefault) {
        await setDefaultAddress(userId, created.id)
      }
      ElMessage.success('地址已新增')
    } else {
      await updateAddress(editingId.value, parsed.data)
      ElMessage.success('地址已更新')
    }

    dialogVisible.value = false
    await loadAddresses()
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null
    ElMessage.error(apiError?.userMessage ?? '保存失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

async function handleSetDefault(address: AddressRow): Promise<void> {
  const userId = userStore.currentUserId
  if (userId === null) {
    return
  }

  try {
    await setDefaultAddress(userId, address.id)
    ElMessage.success('已设为默认地址')
    await loadAddresses()
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null
    ElMessage.error(apiError?.userMessage ?? '设置失败')
  }
}

async function handleDelete(address: AddressRow): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除「${address.building}」这个地址吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return // 用户取消
  }

  try {
    await deleteAddress(address.id)
    ElMessage.success('地址已删除')
    await loadAddresses()
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null
    ElMessage.error(apiError?.userMessage ?? '删除失败')
  }
}

onMounted(loadAddresses)
</script>

<template>
  <div v-loading="loading">
    <div class="mb-4 flex items-center justify-between">
      <p class="text-sm text-gray-500">地址仅用于校内交付，按最小必要原则只精确到楼栋</p>
      <el-button type="primary" @click="openCreate">新增地址</el-button>
    </div>

    <el-empty v-if="isEmpty" description="还没有填写地址">
      <el-button type="primary" @click="openCreate">添加第一个地址</el-button>
    </el-empty>

    <div v-else class="space-y-3">
      <div
        v-for="address in addresses"
        :key="address.id"
        class="rounded-lg border border-gray-200 p-4"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-800">
                {{ address.building }}
              </span>
              <el-tag v-if="address.is_default" type="success" size="small">默认</el-tag>
              <el-tag v-if="address.label" size="small" effect="plain">
                {{ address.label }}
              </el-tag>
            </div>
            <p class="mt-1 text-sm text-gray-500">
              <span v-if="address.campus_area">{{ address.campus_area }} · </span>
              {{ address.detail ?? '无补充说明' }}
            </p>
          </div>

          <div class="flex shrink-0 gap-2">
            <el-button
              v-if="!address.is_default"
              size="small"
              text
              @click="handleSetDefault(address)"
            >
              设为默认
            </el-button>
            <el-button size="small" text @click="openEdit(address)">编辑</el-button>
            <el-button size="small" text type="danger" @click="handleDelete(address)">
              删除
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================== 新增 / 编辑弹窗 ===================== -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="90%" style="max-width: 480px">
      <el-form label-position="top" :model="form">
        <el-form-item label="楼栋" :error="errors['building']" required>
          <el-input v-model="form.building" placeholder="如：3 号宿舍楼" maxlength="30" />
        </el-form-item>

        <el-form-item label="校区" :error="errors['campusArea']">
          <el-input v-model="form.campusArea" placeholder="如：东校区" maxlength="30" />
        </el-form-item>

        <el-form-item label="标签" :error="errors['label']">
          <el-input v-model="form.label" placeholder="如：宿舍、教学楼" maxlength="20" />
        </el-form-item>

        <el-form-item label="补充说明" :error="errors['detail']">
          <el-input
            v-model="form.detail"
            type="textarea"
            :rows="2"
            placeholder="如：楼下快递点代收"
            maxlength="60"
            show-word-limit
          />
        </el-form-item>

        <el-form-item>
          <el-checkbox v-model="form.isDefault">设为默认地址</el-checkbox>
        </el-form-item>

        <el-alert
          type="info"
          :closable="false"
          title="请勿填写可识别到个人的信息"
          description="不需要填写具体门牌号、身份证号或联系方式，这些信息平台不会采集。"
        />
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit"> 保存 </el-button>
      </template>
    </el-dialog>
  </div>
</template>
