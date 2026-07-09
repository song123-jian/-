<template>
  <div class="page-container">
    <PageHeader title="库存查询" subtitle="按仓库、供应商、产品和批次风险查询当前库存、可用量和库存金额。" />

    <el-alert
      v-if="errorMessage"
      class="page-alert"
      type="error"
      show-icon
      closable
      :title="errorMessage"
      @close="errorMessage = ''"
    />

    <SearchBar
      :keyword="searchKeyword"
      title="筛选库存"
      description="组合仓库、供应商、产品和关键字定位库存余额，风险汇总随筛选结果更新。"
      keyword-placeholder="产品、批次、库位"
      @search="handleSearch"
      @reset="handleReset"
    >
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

    <section class="stock-risk-summary" aria-label="库存风险汇总">
      <div
        v-for="item in summaryItems"
        :key="item.label"
        class="summary-item"
        :class="item.level ? `is-${item.level}` : ''"
      >
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <small>{{ item.tip }}</small>
      </div>
    </section>

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
        <el-table-column label="风险" width="120">
          <template #default="{ row }">
            <el-tag :type="stockRiskTag(row)" effect="plain">
              {{ stockRiskText(row) }}
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
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getProductList } from '@/api/product'
import { getStockList } from '@/api/stock'
import { getSupplierList } from '@/api/supplier'
import { getWarehouseList } from '@/api/warehouse'
import { formatDateTime, formatMoney } from '@/utils'
import {
  getStockQueryRisk,
  getStockQueryRiskTag,
  summarizeStockQueryRows,
  type StockQueryRiskLevel,
} from '@/utils/stock-query'

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
const errorMessage = ref('')
const searchKeyword = ref('')
const searchWarehouseId = ref<number | null>(null)
const searchSupplierId = ref<number | null>(null)
const searchProductId = ref<number | null>(null)
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const warehouseOptions = ref<OptionItem[]>([])
const supplierOptions = ref<OptionItem[]>([])
const productOptions = ref<OptionItem[]>([])

const stockSummary = computed(() => summarizeStockQueryRows(tableData.value))

const summaryItems = computed(() => [
  {
    label: '库存行数',
    value: stockSummary.value.recordCount,
    tip: '当前筛选结果',
  },
  {
    label: '可用库存',
    value: formatQty(stockSummary.value.availableQty),
    tip: `账面 ${formatQty(stockSummary.value.totalQty)} / 锁定 ${formatQty(stockSummary.value.lockedQty)}`,
  },
  {
    label: '风险库存',
    value: stockSummary.value.dangerCount,
    tip: `预警 ${stockSummary.value.warningCount} 条`,
    level: stockSummary.value.dangerCount > 0 ? 'danger' as StockQueryRiskLevel : stockSummary.value.warningCount > 0 ? 'warning' as StockQueryRiskLevel : 'success' as StockQueryRiskLevel,
  },
  {
    label: '低库存',
    value: stockSummary.value.lowStockCount,
    tip: `无可用 ${stockSummary.value.noAvailableCount} / 过期 ${stockSummary.value.expiredCount}`,
    level: stockSummary.value.lowStockCount > 0 || stockSummary.value.noAvailableCount > 0 ? 'warning' as StockQueryRiskLevel : 'success' as StockQueryRiskLevel,
  },
  {
    label: '库存金额',
    value: moneyText(stockSummary.value.inventoryAmount),
    tip: `锁定异常 ${stockSummary.value.lockedAnomalyCount} 条`,
    level: stockSummary.value.lockedAnomalyCount > 0 ? 'danger' as StockQueryRiskLevel : 'success' as StockQueryRiskLevel,
  },
])

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

function stockRisk(row: any) {
  return getStockQueryRisk(row)
}

function stockRiskTag(row: any) {
  return getStockQueryRiskTag(stockRisk(row).level)
}

function stockRiskText(row: any) {
  return stockRisk(row).text
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
  } catch (error: any) {
    errorMessage.value = error?.message || '库存基础选项加载失败，请检查仓库、供应商和产品配置。'
    ElMessage.error(errorMessage.value)
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
    errorMessage.value = ''
  } catch (error: any) {
    errorMessage.value = error?.message || '库存查询失败，请检查 Supabase 连接、库存余额和筛选条件。'
    ElMessage.error(errorMessage.value)
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
.page-alert {
  margin-bottom: 12px;
}

.stock-risk-summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.summary-item {
  min-height: 76px;
  padding: 12px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  background: #fff;
}

.summary-item span,
.summary-item small {
  display: block;
  color: #909399;
  font-size: 12px;
  line-height: 1.35;
}

.summary-item strong {
  display: block;
  margin: 6px 0 4px;
  color: #303133;
  font-size: 20px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.summary-item.is-danger {
  border-color: #f56c6c;
  background: #fef0f0;
}

.summary-item.is-warning {
  border-color: #e6a23c;
  background: #fdf6ec;
}

.summary-item.is-success {
  border-color: #67c23a;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 960px) {
  .stock-risk-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
