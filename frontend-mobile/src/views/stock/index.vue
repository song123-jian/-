<template>
  <div class="stock-page">
    <van-nav-bar title="库存查询" left-arrow @click-left="router.back()" />

    <!-- 搜索栏 -->
    <van-search
      v-model="keyword"
      placeholder="搜索产品名称或编码"
      show-action
      @search="onSearch"
      @cancel="onSearch"
    />

    <!-- 筛选条件 -->
    <van-cell-group inset class="filter-group">
      <van-field
        v-model="warehouseName"
        is-link
        readonly
        label="仓库"
        placeholder="选择仓库"
        @click="showWarehousePicker = true"
      />
      <van-field
        v-model="locationName"
        is-link
        readonly
        label="库位"
        placeholder="选择库位"
        @click="showLocationPicker = true"
      />
    </van-cell-group>

    <!-- 库存列表 -->
    <van-empty v-if="stockList.length === 0" description="暂无库存数据" />
    <van-cell-group v-else inset>
      <van-cell
        v-for="item in stockList"
        :key="item.id"
        :title="item.productName"
        :label="`${item.batchNo || '-'} · ${item.warehouseName} - ${item.locationCode || '-'}`"
      >
        <template #value>
          <span class="stock-qty">{{ item.qty }}{{ item.availableQty ? ` / ${item.availableQty}` : '' }}</span>
        </template>
      </van-cell>
    </van-cell-group>

    <!-- 仓库选择器 -->
    <van-popup v-model:show="showWarehousePicker" round position="bottom">
      <van-picker
        :columns="warehouseColumns"
        @confirm="onWarehouseConfirm"
        @cancel="showWarehousePicker = false"
      />
    </van-popup>

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
import { getStockList, getWarehouses, getLocations } from '../../api/stock'

const router = useRouter()
const keyword = ref('')
const warehouseName = ref('')
const locationName = ref('')
const warehouseId = ref<number | undefined>()
const locationId = ref<number | undefined>()
const showWarehousePicker = ref(false)
const showLocationPicker = ref(false)

const stockList = ref<any[]>([])
const warehouses = ref<any[]>([])
const locations = ref<any[]>([])
const warehousePage = ref({ records: [] as any[] })
const locationPage = ref({ records: [] as any[] })

/** 仓库选择列 */
const warehouseColumns = ref<any[]>([])
/** 库位选择列 */
const locationColumns = ref<any[]>([])

/** 加载仓库列表 */
async function loadWarehouses() {
  try {
    const res = await getWarehouses() as any
    warehousePage.value = res.data || res || { records: [] }
    warehouses.value = warehousePage.value.records || []
    warehouseColumns.value = warehouses.value.map((w: any) => ({
      text: w.name,
      value: w.id,
    }))
  } catch {
    // 静默处理
  }
}

/** 加载库位列表 */
async function loadLocations(wId?: number) {
  try {
    const res = await getLocations(wId) as any
    locationPage.value = res.data || res || { records: [] }
    locations.value = locationPage.value.records || []
    locationColumns.value = locations.value.map((l: any) => ({
      text: l.code,
      value: l.id,
    }))
  } catch {
    // 静默处理
  }
}

/** 搜索库存 */
async function onSearch() {
  try {
    const res = await getStockList({
      keyword: keyword.value || undefined,
      warehouseId: warehouseId.value,
      locationId: locationId.value,
    }) as any
    stockList.value = res.data?.records || res.data || res?.records || res || []
  } catch {
    stockList.value = []
  }
}

/** 仓库确认 */
function onWarehouseConfirm({ selectedOptions }: any) {
  const option = selectedOptions[0]
  warehouseName.value = option?.text || ''
  warehouseId.value = option?.value
  showWarehousePicker.value = false
  // 重新加载库位
  loadLocations(warehouseId.value)
  onSearch()
}

/** 库位确认 */
function onLocationConfirm({ selectedOptions }: any) {
  const option = selectedOptions[0]
  locationName.value = option?.text || ''
  locationId.value = option?.value
  showLocationPicker.value = false
  onSearch()
}

onMounted(() => {
  loadWarehouses()
  loadLocations()
  onSearch()
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

.stock-qty {
  font-size: 16px;
  font-weight: bold;
  color: #07c160;
}
</style>
