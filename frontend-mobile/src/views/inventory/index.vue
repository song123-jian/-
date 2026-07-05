<template>
  <div class="inventory-page">
    <van-nav-bar title="盘点录入" left-arrow @click-left="router.back()" />

    <van-form @submit="onSubmit">
      <van-cell-group inset class="form-group">
        <van-field
          v-model="warehouseName"
          is-link
          readonly
          label="仓库"
          placeholder="请选择仓库"
          :disabled="warehouseLoading"
          :rules="[{ required: true, message: '请选择仓库' }]"
          @click="showWarehousePicker = true"
        />
        <van-field
          v-model="locationName"
          is-link
          readonly
          label="库位"
          placeholder="请选择库位"
          :disabled="locationLoading || !warehouseId"
          :rules="[{ required: true, message: '请选择库位' }]"
          @click="showLocationPicker = true"
        />
        <van-field
          v-model.trim="productKeyword"
          label="产品"
          placeholder="扫码或输入产品编码/ID/供应商"
          clearable
          :rules="[{ required: true, message: '请输入产品编码、ID或供应商' }]"
          @blur="queryStockPreview"
        >
          <template #button>
            <ScanEntryButton
              :raw-value="productKeyword"
              expected-type="product"
              @scanned="onProductScanned"
            />
          </template>
        </van-field>
        <van-field
          v-model="actualQuantity"
          label="实盘数量"
          type="digit"
          placeholder="请输入实盘数量"
          :rules="[{ required: true, message: '请输入实盘数量' }]"
        />
        <van-field
          v-model.trim="reason"
          label="原因"
          type="textarea"
          rows="2"
          maxlength="200"
          show-word-limit
          placeholder="差异盘点必填"
        />
      </van-cell-group>

      <div class="preview-actions">
        <van-button
          size="small"
          plain
          type="primary"
          :loading="stockLoading"
          :disabled="!canQueryStock"
          native-type="button"
          @click="queryStockPreview"
        >
          查询账面库存
        </van-button>
        <van-button size="small" plain native-type="button" @click="resetEntry">
          清空录入
        </van-button>
      </div>

      <van-loading v-if="stockLoading" class="page-loading" type="spinner">查询账面库存...</van-loading>
      <van-cell-group v-else-if="selectedStock" inset title="账面库存" class="stock-preview">
        <van-cell
          title="产品"
          :label="stockLocationLabel(selectedStock)"
          :value="stockProductText(selectedStock)"
        />
        <van-cell title="供应商" :value="stockSupplierText(selectedStock)" />
        <van-cell title="账面数量" :value="formatInventoryQty(bookQty, selectedStock.unit)" />
        <van-cell title="可用数量" :value="formatInventoryQty(availableQty, selectedStock.unit)" />
        <van-cell title="盘点差异">
          <template #value>
            <van-tag :type="diffTagType" plain>{{ formatInventoryQty(diffQty, selectedStock.unit) }}</van-tag>
          </template>
        </van-cell>
      </van-cell-group>

      <van-notice-bar
        v-if="blockedText"
        class="submit-warning"
        color="#ed6a0c"
        background="#fff7e8"
        :text="blockedText"
      />

      <div class="btn-wrap">
        <van-button
          round
          block
          type="primary"
          native-type="submit"
          :disabled="Boolean(blockedText) || stockLoading"
          :loading="submitting"
        >
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
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import ScanEntryButton from '../../components/ScanEntryButton.vue'
import { getLocations, getStockList, getWarehouses, submitInventoryCheck } from '../../api/stock'
import { saveOfflineActionTask } from '../../utils/offline'
import {
  buildMobileInventoryCheckPayload,
  chooseInventoryStockRow,
  formatInventoryQty,
  getInventoryAvailableQty,
  getInventoryBookQty,
  getInventoryDiffQty,
  getInventorySubmitBlockedText,
  inventorySupplierText,
  inventoryTraceLabel,
} from '../../utils/inventory-check'
import type { MobileScanPayload } from '../../utils/scan-entry'

const router = useRouter()
const showWarehousePicker = ref(false)
const showLocationPicker = ref(false)
const warehouseName = ref('')
const locationName = ref('')
const productKeyword = ref('')
const actualQuantity = ref('')
const reason = ref('')
const warehouseId = ref<number | undefined>()
const locationId = ref<number | undefined>()
const submitting = ref(false)
const warehouseLoading = ref(false)
const locationLoading = ref(false)
const stockLoading = ref(false)
const selectedStock = ref<any>(null)
const warehouseColumns = ref<any[]>([])
const locationColumns = ref<any[]>([])

function unwrapRecords(res: any) {
  const data = res?.data?.records || res?.data?.list || res?.data || res?.records || res || []
  return Array.isArray(data) ? data : [data].filter(Boolean)
}

const canQueryStock = computed(() => Boolean(warehouseId.value && locationId.value && productKeyword.value.trim()))
const inventoryInput = computed(() => ({
  warehouseId: warehouseId.value,
  locationId: locationId.value,
  productId: selectedStock.value?.productId || productKeyword.value,
  actualQuantity: actualQuantity.value,
  reason: reason.value,
}))
const bookQty = computed(() => getInventoryBookQty(selectedStock.value))
const availableQty = computed(() => getInventoryAvailableQty(selectedStock.value))
const diffQty = computed(() => getInventoryDiffQty(inventoryInput.value, selectedStock.value))
const diffTagType = computed(() => (diffQty.value === 0 ? 'success' : 'warning'))
const blockedText = computed(() => {
  if (!warehouseId.value) return '请选择仓库'
  if (!locationId.value) return '请选择库位'
  if (!productKeyword.value.trim()) return '请输入产品编码、ID或供应商'
  if (!selectedStock.value) return '请先查询账面库存'
  return getInventorySubmitBlockedText(inventoryInput.value, selectedStock.value)
})

async function loadWarehouses() {
  warehouseLoading.value = true
  try {
    const res = await getWarehouses() as any
    const list = unwrapRecords(res)
    warehouseColumns.value = list.map((item: any) => ({
      text: item.name || item.code || `仓库${item.id}`,
      value: Number(item.id),
    }))
  } catch (error: any) {
    warehouseColumns.value = []
    showToast(error?.message || '仓库列表加载失败')
  } finally {
    warehouseLoading.value = false
  }
}

async function loadLocations(id?: number) {
  locationLoading.value = true
  try {
    const res = await getLocations(id) as any
    const list = unwrapRecords(res)
    locationColumns.value = list.map((item: any) => ({
      text: item.code || item.name || `库位${item.id}`,
      value: Number(item.id),
    }))
  } catch (error: any) {
    locationColumns.value = []
    showToast(error?.message || '库位列表加载失败')
  } finally {
    locationLoading.value = false
  }
}

async function onWarehouseConfirm({ selectedOptions }: any) {
  const option = selectedOptions[0]
  warehouseName.value = option?.text || ''
  warehouseId.value = Number(option?.value || 0) || undefined
  locationName.value = ''
  locationId.value = undefined
  selectedStock.value = null
  showWarehousePicker.value = false
  await loadLocations(warehouseId.value)
  if (canQueryStock.value) await queryStockPreview()
}

async function onLocationConfirm({ selectedOptions }: any) {
  const option = selectedOptions[0]
  locationName.value = option?.text || ''
  locationId.value = Number(option?.value || 0) || undefined
  selectedStock.value = null
  showLocationPicker.value = false
  if (canQueryStock.value) await queryStockPreview()
}

function stockProductText(stock: any) {
  return [stock.productCode, stock.productName].filter(Boolean).join(' - ') || `#${stock.productId}`
}

function stockLocationLabel(stock: any) {
  return inventoryTraceLabel(stock, { warehouseName: warehouseName.value, locationCode: locationName.value })
}

function stockSupplierText(stock: any) {
  return inventorySupplierText(stock)
}

async function queryStockPreview() {
  if (!canQueryStock.value || stockLoading.value) return
  stockLoading.value = true
  selectedStock.value = null
  try {
    const res = await getStockList({
      warehouseId: warehouseId.value,
      locationId: locationId.value,
      keyword: productKeyword.value.trim(),
    }) as any
    const selection = chooseInventoryStockRow(unwrapRecords(res), productKeyword.value, {
      warehouseId: warehouseId.value,
      locationId: locationId.value,
    })
    if (selection.error) {
      showToast(selection.error)
      return
    }
    const row = selection.row
    if (!row) throw new Error('未查询到账面库存，不能提交盘点')
    selectedStock.value = row
    productKeyword.value = row.productCode || String(row.productId || productKeyword.value)
  } catch (error: any) {
    showToast(error?.message || '账面库存查询失败')
  } finally {
    stockLoading.value = false
  }
}

function onProductScanned(payload: MobileScanPayload) {
  productKeyword.value = payload.value
  queryStockPreview()
}

function resetEntry() {
  productKeyword.value = ''
  actualQuantity.value = ''
  reason.value = ''
  selectedStock.value = null
}

async function onSubmit() {
  if (submitting.value) return
  if (!selectedStock.value) {
    await queryStockPreview()
  }
  const validationMessage = getInventorySubmitBlockedText(inventoryInput.value, selectedStock.value)
  if (validationMessage) {
    showToast(validationMessage)
    return
  }

  submitting.value = true
  const payload = buildMobileInventoryCheckPayload(inventoryInput.value, selectedStock.value)
  try {
    await submitInventoryCheck(payload)
    showToast('盘点提交成功')
    resetEntry()
  } catch (error: any) {
    saveOfflineActionTask({
      source: 'inventory',
      title: `盘点 ${selectedStock.value?.productCode || payload.productId}`,
      description: stockLocationLabel(selectedStock.value),
      payload,
      last_error: error?.message || '提交失败',
    })
    showToast('提交失败，已保存到离线任务')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadWarehouses(), loadLocations()])
})
</script>

<style scoped lang="scss">
.inventory-page {
  min-height: 100vh;
  background: #f5f5f5;
}

.form-group {
  margin-top: 8px;
}

.preview-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px 4px;
}

.page-loading {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}

.stock-preview {
  margin-top: 8px;
}

.submit-warning {
  margin: 12px;
  border-radius: 8px;
}

.btn-wrap {
  padding: 24px 32px;
}
</style>
