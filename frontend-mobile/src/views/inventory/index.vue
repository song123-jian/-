<template>
  <div class="inventory-page">
    <van-nav-bar title="盘点录入" left-arrow @click-left="router.back()" />

    <van-form @submit="onSubmit">
      <van-cell-group inset>
        <van-field
          v-model="warehouseName"
          is-link
          readonly
          label="仓库"
          placeholder="请选择仓库"
          :rules="[{ required: true, message: '请选择仓库' }]"
          @click="showWarehousePicker = true"
        />
        <van-field
          v-model="locationName"
          is-link
          readonly
          label="库位"
          placeholder="请选择库位"
          :rules="[{ required: true, message: '请选择库位' }]"
          @click="showLocationPicker = true"
        />
        <van-field
          v-model="productId"
          label="产品ID"
          placeholder="请输入产品ID"
          type="digit"
          :rules="[{ required: true, message: '请输入产品ID' }]"
        />
        <van-field
          v-model="actualQuantity"
          label="实盘数量"
          type="digit"
          placeholder="请输入实盘数量"
          :rules="[{ required: true, message: '请输入实盘数量' }]"
        />
        <van-field v-model="reason" label="原因" placeholder="可选" />
      </van-cell-group>

      <div class="btn-wrap">
        <van-button round block type="primary" native-type="submit" :loading="submitting">
          提交盘点
        </van-button>
      </div>
    </van-form>

    <van-popup v-model:show="showWarehousePicker" round position="bottom">
      <van-picker
        :columns="warehouseColumns"
        @confirm="onWarehouseConfirm"
        @cancel="showWarehousePicker = false"
      />
    </van-popup>

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
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { getLocations, getWarehouses, submitInventoryCheck } from '../../api/stock'

const router = useRouter()
const showWarehousePicker = ref(false)
const showLocationPicker = ref(false)
const warehouseName = ref('')
const locationName = ref('')
const productId = ref('')
const actualQuantity = ref('')
const reason = ref('')
const warehouseId = ref<number | undefined>()
const locationId = ref<number | undefined>()
const submitting = ref(false)
const warehouseColumns = ref<any[]>([])
const locationColumns = ref<any[]>([])

async function loadWarehouses() {
  try {
    const res = await getWarehouses() as any
    const list = res.data?.records || res.data || []
    warehouseColumns.value = list.map((item: any) => ({ text: item.name, value: item.id }))
  } catch {
    warehouseColumns.value = []
  }
}

async function loadLocations(id?: number) {
  try {
    const res = await getLocations(id) as any
    const list = res.data?.records || res.data || []
    locationColumns.value = list.map((item: any) => ({ text: item.code, value: item.id }))
  } catch {
    locationColumns.value = []
  }
}

function onWarehouseConfirm({ selectedOptions }: any) {
  const option = selectedOptions[0]
  warehouseName.value = option?.text || ''
  warehouseId.value = option?.value
  showWarehousePicker.value = false
  loadLocations(warehouseId.value)
}

function onLocationConfirm({ selectedOptions }: any) {
  const option = selectedOptions[0]
  locationName.value = option?.text || ''
  locationId.value = option?.value
  showLocationPicker.value = false
}

async function onSubmit() {
  if (!warehouseId.value || !locationId.value) {
    showToast('请选择仓库和库位')
    return
  }
  if (!productId.value) {
    showToast('请输入产品ID')
    return
  }
  submitting.value = true
  try {
    await submitInventoryCheck({
      warehouseId: warehouseId.value,
      locationId: locationId.value,
      productId: Number(productId.value),
      actualQuantity: Number(actualQuantity.value),
      reason: reason.value || undefined,
    } as any)
    showToast('盘点提交成功')
    productId.value = ''
    actualQuantity.value = ''
    reason.value = ''
  } catch {
    showToast('提交失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadWarehouses()
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
