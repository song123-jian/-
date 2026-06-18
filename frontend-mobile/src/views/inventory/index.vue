<template>
  <div class="inventory-page">
    <van-nav-bar title="盘点录入" left-arrow @click-left="router.back()" />

    <van-form @submit="onSubmit">
      <van-cell-group inset>
        <!-- 选择库位 -->
        <van-field
          v-model="locationName"
          is-link
          readonly
          label="库位"
          placeholder="请选择库位"
          :rules="[{ required: true, message: '请选择库位' }]"
          @click="showLocationPicker = true"
        />

        <!-- 扫码/选择产品 -->
        <van-field
          v-model="productCode"
          label="产品编码"
          placeholder="扫码或手动输入产品编码"
          clearable
          :rules="[{ required: true, message: '请输入产品编码' }]"
        >
          <template #button>
            <van-button size="small" type="primary" @click="onScan">扫码</van-button>
          </template>
        </van-field>

        <!-- 产品名称（自动回显） -->
        <van-field
          v-if="productName"
          v-model="productName"
          label="产品名称"
          readonly
        />

        <!-- 实盘数量 -->
        <van-field
          v-model="actualQuantity"
          label="实盘数量"
          type="digit"
          placeholder="请输入实盘数量"
          :rules="[{ required: true, message: '请输入实盘数量' }]"
        />
      </van-cell-group>

      <div class="btn-wrap">
        <van-button round block type="primary" native-type="submit" :loading="submitting">
          提交盘点
        </van-button>
      </div>
    </van-form>

    <!-- 库位选择器 -->
    <van-popup v-model:show="showLocationPicker" round position="bottom">
      <van-picker
        :columns="locationColumns"
        @confirm="onLocationConfirm"
        @cancel="showLocationPicker = false"
      />
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { getLocations, submitInventoryCheck } from '../../api/stock'

const router = useRouter()
const locationName = ref('')
const locationId = ref<number>(0)
const productCode = ref('')
const productName = ref('')
const actualQuantity = ref('')
const submitting = ref(false)
const showLocationPicker = ref(false)

const locationColumns = ref<any[]>([])

/** 扫码 */
function onScan() {
  showToast('请使用扫码枪扫描产品条码')
}

/** 加载库位列表 */
async function loadLocations() {
  try {
    const res = await getLocations() as any
    const list = res.data || res || []
    locationColumns.value = list.map((l: any) => ({
      text: l.code,
      value: l.id,
    }))
  } catch {
    // 静默处理
  }
}

/** 库位确认 */
function onLocationConfirm({ selectedOptions }: any) {
  const option = selectedOptions[0]
  locationName.value = option?.text || ''
  locationId.value = option?.value || 0
  showLocationPicker.value = false
}

/** 提交盘点 */
async function onSubmit() {
  submitting.value = true
  try {
    await submitInventoryCheck({
      locationId: locationId.value,
      productId: 0,
      actualQuantity: Number(actualQuantity.value),
    })
    showToast('盘点提交成功')
    // 重置表单
    productCode.value = ''
    productName.value = ''
    actualQuantity.value = ''
  } catch {
    showToast('提交失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadLocations()
})
</script>

<style scoped lang="scss">
.inventory-page {
  min-height: 100vh;
  background: #f5f5f5;
}

.btn-wrap {
  padding: 24px 32px;
}
</style>
