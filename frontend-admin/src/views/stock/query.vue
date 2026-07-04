<template>
  <div class="page-container">
    <PageHeader title="库存查询" />

    <SearchBar :keyword="searchKeyword" @search="handleSearch" @reset="handleReset">
      <el-form-item label="仓库">
        <el-select v-model="searchWarehouseId" placeholder="全部" clearable filterable style="width: 180px">
          <el-option
            v-for="item in enabledWarehouseOptions"
            :key="item.id"
            :label="warehouseLabel(item)"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="供应商">
        <el-select v-model="searchSupplierId" placeholder="全部" clearable filterable style="width: 180px">
          <el-option
            v-for="item in enabledSupplierOptions"
            :key="item.id"
            :label="supplierLabel(item)"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="产品">
        <el-select v-model="searchProductId" placeholder="全部" clearable filterable style="width: 200px">
          <el-option
            v-for="item in productOptions"
            :key="item.id"
            :label="productLabel(item)"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading" empty-text="暂无库存记录">
        <el-table-column prop="productCode" label="产品编码" width="120" show-overflow-tooltip />
        <el-table-column prop="productName" label="产品名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="warehouseName" label="仓库" min-width="140" show-overflow-tooltip />
        <el-table-column prop="supplierName" label="供应商" min-width="150" show-overflow-tooltip />
        <el-table-column prop="locationCode" label="库位" width="120" show-overflow-tooltip />
        <el-table-column prop="batchNo" label="批次" min-width="150" show-overflow-tooltip />
        <el-table-column label="批次状态" width="100">
          <template #default="{ row }">
            <el-tag :type="batchStatusTag(row.batchStatus)" effect="plain">
              {{ batchStatusText(row.batchStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="qty" label="库存数量" width="100">
          <template #default="{ row }">
            {{ formatQty(row.qty) }}
          </template>
        </el-table-column>
        <el-table-column prop="productUnit" label="单位" width="80" show-overflow-tooltip />
        <el-table-column prop="lockedQty" label="锁定数量" width="100">
          <template #default="{ row }">
            {{ formatQty(row.lockedQty) }}
          </template>
        </el-table-column>
        <el-table-column prop="availableQty" label="可用数量" width="100">
          <template #default="{ row }">
            <el-tag :type="Number(row.availableQty || 0) <= 0 ? 'danger' : 'success'" effect="plain">
              {{ formatQty(row.availableQty) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="库存单价" width="110" align="right">
          <template #default="{ row }">
            {{ moneyText(row.unitCost) }}
          </template>
        </el-table-column>
        <el-table-column label="库存金额" width="120" align="right">
          <template #default="{ row }">
            {{ moneyText(row.inventoryAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="updateTime" label="更新时间" width="170">
          <template #default="{ row }">
            {{ formatDateTime(row.updateTime) }}
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @size-change="fetchData"
        @current-change="fetchData"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getProductList } from '@/api/product'
import { getStockList } from '@/api/stock'
import { getSupplierList } from '@/api/supplier'
import { getWarehouseList } from '@/api/warehouse'
import { formatDateTime, formatMoney } from '@/utils'

type OptionItem = {
  id: number
  code?: string
  name?: string
  shortName?: string
  isEnabled?: number
  status?: number
}

const loading = ref(false)
const tableData = ref<any[]>([])
const searchKeyword = ref('')
const searchWarehouseId = ref<number | null>(null)
const searchSupplierId = ref<number | null>(null)
const searchProductId = ref<number | null>(null)
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const warehouseOptions = ref<OptionItem[]>([])
const supplierOptions = ref<OptionItem[]>([])
const productOptions = ref<OptionItem[]>([])

const enabledWarehouseOptions = computed(() =>
  warehouseOptions.value.filter((item) => item.isEnabled === undefined || Number(item.isEnabled) === 1)
)

const enabledSupplierOptions = computed(() =>
  supplierOptions.value.filter((item) => item.status === undefined || Number(item.status) === 1)
)

function optionText(item?: OptionItem | null) {
  if (!item) return '-'
  return [item.code, item.name || item.shortName].filter(Boolean).join(' - ') || `#${item.id}`
}

function warehouseLabel(item: OptionItem) {
  return optionText(item)
}

function supplierLabel(item: OptionItem) {
  return optionText(item)
}

function productLabel(item: OptionItem) {
  return optionText(item)
}

function formatQty(value: any) {
  return Number(value || 0).toFixed(0)
}

function moneyText(value: any) {
  return formatMoney(Number(value || 0))
}

function batchStatusTag(value?: string) {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
    NORMAL: 'success',
    EXPIRING: 'warning',
    EXPIRED: 'danger',
    DEPLETED: 'info',
  }
  return map[String(value || '').toUpperCase()] || 'info'
}

function batchStatusText(value?: string) {
  const map: Record<string, string> = {
    NORMAL: '正常',
    EXPIRING: '临期',
    EXPIRED: '已过期',
    DEPLETED: '已用尽',
  }
  return map[String(value || '').toUpperCase()] || '未记录'
}

async function loadOptions() {
  try {
    const [warehouseRes, supplierRes, productRes] = await Promise.all([
      getWarehouseList({ page: 1, pageSize: 200 }),
      getSupplierList({ page: 1, pageSize: 500 }),
      getProductList({ page: 1, pageSize: 500 }),
    ])
    warehouseOptions.value = warehouseRes.data?.records || warehouseRes.data?.list || []
    supplierOptions.value = supplierRes.data?.records || supplierRes.data?.list || []
    productOptions.value = productRes.data?.records || productRes.data?.list || []
  } catch {
    warehouseOptions.value = []
    supplierOptions.value = []
    productOptions.value = []
  }
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getStockList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || undefined,
      warehouseId: searchWarehouseId.value || undefined,
      supplierId: searchSupplierId.value || undefined,
      productId: searchProductId.value || undefined,
    })
    const rows = res.data?.records || res.data?.list || []
    tableData.value = rows
    pagination.total = res.data?.total || rows.length
  } catch {
    tableData.value = []
    pagination.total = 0
  } finally {
    loading.value = false
  }
}

function handleSearch(formData: { keyword: string }) {
  searchKeyword.value = formData.keyword || ''
  pagination.page = 1
  fetchData()
}

function handleReset() {
  searchKeyword.value = ''
  searchWarehouseId.value = null
  searchSupplierId.value = null
  searchProductId.value = null
  pagination.page = 1
  fetchData()
}

onMounted(async () => {
  await loadOptions()
  fetchData()
})
</script>

<style scoped lang="scss">
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
