<template>
  <div class="stock-page">
    <van-nav-bar title="库存查询" left-arrow @click-left="router.back()" />

    <van-search
      v-model="keyword"
      placeholder="搜索产品名称、编码、仓库、库位、批次或供应商"
      show-action
      @search="onSearch"
      @cancel="onCancelSearch"
    />

    <van-cell-group inset class="filter-group">
      <van-field
        v-model="warehouseName"
        is-link
        readonly
        label="仓库"
        placeholder="全部仓库"
        :disabled="warehouseLoading"
        @click="showWarehousePicker = true"
      />
      <van-field
        v-model="locationName"
        is-link
        readonly
        label="库位"
        placeholder="全部库位"
        :disabled="locationLoading"
        @click="showLocationPicker = true"
      />
      <div class="filter-actions">
        <van-button size="small" plain type="default" @click="resetFilters">清除筛选</van-button>
        <van-button size="small" type="primary" :loading="loading" @click="onSearch">刷新</van-button>
      </div>
    </van-cell-group>

    <van-loading v-if="loading" class="page-loading" type="spinner">加载中...</van-loading>
    <van-empty v-else-if="stockList.length === 0" description="暂无库存数据" />
    <van-cell-group v-else inset>
      <van-cell
        v-for="item in stockList"
        :key="item.id"
        :title="`${item.productName || '-'} · ${item.productCode || '-'}`"
        :label="stockLabel(item)"
      >
        <template #value>
          <div class="stock-value">
            <span class="stock-qty">{{ formatStockQtyPair(item) }}</span>
            <van-tag :type="riskTagType(item.riskLevel)" plain>{{ item.riskText || '正常' }}</van-tag>
          </div>
        </template>
      </van-cell>
    </van-cell-group>

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
import { getLocations, getStockList, getWarehouses } from '../../api/stock'
import { formatStockQty, formatStockQtyPair, stockTraceLabel } from '../../utils/stock-query'

const router = useRouter()
const keyword = ref('')
const warehouseName = ref('')
const locationName = ref('')
const warehouseId = ref<number | undefined>()
const locationId = ref<number | undefined>()
const showWarehousePicker = ref(false)
const showLocationPicker = ref(false)
const loading = ref(false)
const warehouseLoading = ref(false)
const locationLoading = ref(false)

const stockList = ref<any[]>([])
const warehouseColumns = ref<any[]>([{ text: '全部仓库', value: 0 }])
const locationColumns = ref<any[]>([{ text: '全部库位', value: 0 }])

function unwrapRecords(res: any) {
  const data = res?.data?.records || res?.data?.list || res?.data || res?.records || res || []
  return Array.isArray(data) ? data : [data].filter(Boolean)
}

function riskTagType(level?: string) {
  if (level === 'danger') return 'danger'
  if (level === 'warning') return 'warning'
  return 'success'
}

function stockLabel(item: any) {
  const trace = stockTraceLabel(item)
  const location = `${item.warehouseName || '-'} / ${item.locationCode || '-'}`
  const locked = Number(item.lockedQty || 0) > 0 ? ` · 锁定 ${formatStockQty(item.lockedQty, item.unit)}` : ''
  const safe = Number(item.safeStock || 0) > 0 ? ` · 安全 ${formatStockQty(item.safeStock, item.unit)}` : ''
  return `${trace} · ${location}${locked}${safe}`
}

async function loadWarehouses() {
  warehouseLoading.value = true
  try {
    const res = await getWarehouses() as any
    const records = unwrapRecords(res)
    warehouseColumns.value = [
      { text: '全部仓库', value: 0 },
      ...records.map((item: any) => ({
        text: item.name || item.code || `仓库${item.id}`,
        value: Number(item.id),
      })),
    ]
  } catch (error: any) {
    warehouseColumns.value = [{ text: '全部仓库', value: 0 }]
    showToast(error?.message || '仓库列表加载失败')
  } finally {
    warehouseLoading.value = false
  }
}

async function loadLocations(wId?: number) {
  locationLoading.value = true
  try {
    const res = await getLocations(wId) as any
    const records = unwrapRecords(res)
    locationColumns.value = [
      { text: '全部库位', value: 0 },
      ...records.map((item: any) => ({
        text: item.code || item.name || `库位${item.id}`,
        value: Number(item.id),
      })),
    ]
  } catch (error: any) {
    locationColumns.value = [{ text: '全部库位', value: 0 }]
    showToast(error?.message || '库位列表加载失败')
  } finally {
    locationLoading.value = false
  }
}

async function onSearch() {
  loading.value = true
  try {
    const res = await getStockList({
      keyword: keyword.value.trim() || undefined,
      warehouseId: warehouseId.value,
      locationId: locationId.value,
    }) as any
    stockList.value = unwrapRecords(res)
  } catch (error: any) {
    stockList.value = []
    showToast(error?.message || '库存查询失败')
  } finally {
    loading.value = false
  }
}

function onCancelSearch() {
  keyword.value = ''
  onSearch()
}

async function onWarehouseConfirm({ selectedOptions }: any) {
  const option = selectedOptions[0]
  warehouseId.value = Number(option?.value || 0) || undefined
  warehouseName.value = warehouseId.value ? option?.text || '' : ''
  locationId.value = undefined
  locationName.value = ''
  showWarehousePicker.value = false
  await loadLocations(warehouseId.value)
  await onSearch()
}

async function onLocationConfirm({ selectedOptions }: any) {
  const option = selectedOptions[0]
  locationId.value = Number(option?.value || 0) || undefined
  locationName.value = locationId.value ? option?.text || '' : ''
  showLocationPicker.value = false
  await onSearch()
}

async function resetFilters() {
  keyword.value = ''
  warehouseId.value = undefined
  warehouseName.value = ''
  locationId.value = undefined
  locationName.value = ''
  await loadLocations()
  await onSearch()
}

onMounted(async () => {
  await Promise.all([loadWarehouses(), loadLocations()])
  await onSearch()
})
</script>

<style scoped lang="scss">
.stock-page {
  min-height: 100vh;
  background: #f5f5f5;
}

.filter-group {
  margin: 8px 0;
}

.filter-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 16px 12px;
}

.page-loading {
  display: flex;
  justify-content: center;
  padding: 32px 0;
}

.stock-value {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.stock-qty {
  font-size: 15px;
  font-weight: bold;
  color: #07c160;
  white-space: nowrap;
}
</style>
