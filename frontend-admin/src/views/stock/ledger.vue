<template>
  <div class="page-container">
    <PageHeader title="库存台账">
      <el-button plain @click="fetchData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
      <el-button type="primary" plain :disabled="!tableData.length" @click="handleExport">
        <el-icon><Download /></el-icon>
        导出当前页CSV
      </el-button>
    </PageHeader>

    <SearchBar :keyword="searchKeyword" @search="handleSearch" @reset="handleReset">
      <el-form-item label="日期">
        <el-date-picker
          v-model="searchDate"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 260px"
        />
      </el-form-item>
      <el-form-item label="类型">
        <el-select v-model="searchMoveType" placeholder="全部" clearable style="width: 120px">
          <el-option label="入库" value="IN" />
          <el-option label="出库" value="OUT" />
          <el-option label="调拨" value="TRANSFER" />
        </el-select>
      </el-form-item>
      <el-form-item label="原因">
        <el-select v-model="searchMoveReason" placeholder="全部" clearable filterable style="width: 160px">
          <el-option v-for="item in moveReasonOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
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

    <div class="summary-grid">
      <div v-for="item in summaryItems" :key="item.label" class="summary-item">
        <span>{{ item.label }}</span>
        <strong :class="{ negative: item.negative }">{{ item.value }}</strong>
        <small>{{ item.tip }}</small>
      </div>
    </div>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading" empty-text="暂无库存台账记录">
        <el-table-column prop="moveNo" label="流水号" min-width="170" show-overflow-tooltip />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag :type="moveTypeTag(row.moveType)" effect="plain">{{ moveTypeText(row.moveType) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="原因" width="120">
          <template #default="{ row }">
            {{ moveReasonText(row.moveReason) }}
          </template>
        </el-table-column>
        <el-table-column label="产品" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">
            {{ productText(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="qty" label="数量" width="90">
          <template #default="{ row }">
            {{ Number(row.qty || 0).toFixed(0) }}
          </template>
        </el-table-column>
        <el-table-column prop="productUnit" label="单位" width="80" show-overflow-tooltip />
        <el-table-column label="采购单价" width="120" align="right">
          <template #default="{ row }">{{ row.moveReason === 'IN_PURCHASE' ? moneyText(row.purchaseUnitCost) : '-' }}</template>
        </el-table-column>
        <el-table-column label="采购金额" width="120" align="right">
          <template #default="{ row }">{{ row.moveReason === 'IN_PURCHASE' ? moneyText(row.purchaseAmount) : '-' }}</template>
        </el-table-column>
        <el-table-column label="销售金额" width="120" align="right">
          <template #default="{ row }">{{ row.relatedOrderType === 'SALE_ORDER' ? moneyText(row.saleAmount) : '-' }}</template>
        </el-table-column>
        <el-table-column label="估算成本" width="120" align="right">
          <template #default="{ row }">{{ row.costStatus ? moneyText(row.materialCost) : '-' }}</template>
        </el-table-column>
        <el-table-column label="估算毛利" width="120" align="right">
          <template #default="{ row }">
            <span v-if="row.costStatus" :class="{ negative: Number(row.grossProfit || 0) < 0 }">{{ moneyText(row.grossProfit) }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="成本状态" width="110">
          <template #default="{ row }">
            <el-tag v-if="row.costStatus" :type="costStatusTag(row.costStatus)" effect="plain">
              {{ costStatusText(row.costStatus, row.costGapReason) }}
            </el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="warehouseName" label="仓库" min-width="140" show-overflow-tooltip />
        <el-table-column prop="toWarehouseName" label="调入仓库" min-width="140" show-overflow-tooltip />
        <el-table-column prop="locationCode" label="库位" min-width="120" show-overflow-tooltip />
        <el-table-column prop="supplierName" label="供应商" min-width="150" show-overflow-tooltip />
        <el-table-column prop="batchNo" label="批次" min-width="150" show-overflow-tooltip />
        <el-table-column label="批次状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.batchStatus" :type="batchStatusTag(row.batchStatus)" effect="plain">
              {{ batchStatusText(row.batchStatus) }}
            </el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="业务单号" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            {{ relatedOrderText(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="operatorName" label="操作人" width="120" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="时间" width="170">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip />
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
import { Download, Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getProductList } from '@/api/product'
import { getStockLedger } from '@/api/stock'
import { getSupplierList } from '@/api/supplier'
import { getWarehouseList } from '@/api/warehouse'
import { formatDateTime, formatMoney } from '@/utils'
import type { StockLedgerExportContext, StockLedgerSummary } from '@/utils/stock-ledger'
import {
  STOCK_MOVE_REASON_LABELS,
  buildStockLedgerCsv,
  getLedgerMoveReasonText,
  getLedgerMoveTypeText,
  getLedgerProductText,
  getLedgerRelatedOrderText,
  summarizeStockLedgerRows,
} from '@/utils/stock-ledger'

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
const searchDate = ref<string[]>([])
const searchMoveType = ref('')
const searchMoveReason = ref('')
const searchWarehouseId = ref<number | null>(null)
const searchSupplierId = ref<number | null>(null)
const searchProductId = ref<number | null>(null)
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const ledgerSummary = ref<StockLedgerSummary>(emptySummary())

const warehouseOptions = ref<OptionItem[]>([])
const supplierOptions = ref<OptionItem[]>([])
const productOptions = ref<OptionItem[]>([])

const moveReasonOptions = Object.entries(STOCK_MOVE_REASON_LABELS).map(([value, label]) => ({ label, value }))

const enabledWarehouseOptions = computed(() =>
  warehouseOptions.value.filter((item) => item.isEnabled === undefined || Number(item.isEnabled) === 1)
)

const enabledSupplierOptions = computed(() =>
  supplierOptions.value.filter((item) => item.status === undefined || Number(item.status) === 1)
)

const summaryItems = computed(() => [
  {
    label: '筛选流水',
    value: `${ledgerSummary.value.recordCount} 条`,
    tip: `当前页 ${tableData.value.length} 条，可导出当前页`,
  },
  {
    label: '库存净变动',
    value: qtyText(ledgerSummary.value.netQty),
    tip: `入 ${qtyText(ledgerSummary.value.inQty)} / 出 ${qtyText(ledgerSummary.value.outQty)}`,
    negative: Number(ledgerSummary.value.netQty) < 0,
  },
  {
    label: '调拨数量',
    value: qtyText(ledgerSummary.value.transferQty),
    tip: '不计入净变动',
  },
  {
    label: '采购金额',
    value: moneyText(ledgerSummary.value.purchaseAmount),
    tip: '采购入库合计',
  },
  {
    label: '销售毛利',
    value: moneyText(ledgerSummary.value.grossProfit),
    tip: `销售 ${moneyText(ledgerSummary.value.saleAmount)} / 成本 ${moneyText(ledgerSummary.value.materialCost)}`,
    negative: Number(ledgerSummary.value.grossProfit) < 0,
  },
  {
    label: '盘点差异',
    value: `${qtyText(ledgerSummary.value.inventoryProfitQty)} / ${qtyText(ledgerSummary.value.inventoryLossQty)}`,
    tip: '盘盈 / 盘亏',
  },
  {
    label: '成本异常',
    value: `${ledgerSummary.value.costGapCount} 条`,
    tip: '需补充成本依据',
    negative: ledgerSummary.value.costGapCount > 0,
  },
])

function emptySummary(): StockLedgerSummary {
  return {
    recordCount: 0,
    inQty: 0,
    outQty: 0,
    transferQty: 0,
    netQty: 0,
    inventoryProfitQty: 0,
    inventoryLossQty: 0,
    purchaseAmount: 0,
    saleAmount: 0,
    materialCost: 0,
    grossProfit: 0,
    costGapCount: 0,
  }
}

function optionText(item?: OptionItem | null) {
  if (!item) return '-'
  return [item.code, item.name || item.shortName].filter(Boolean).join(' - ') || `#${item.id}`
}

function optionTextById(options: OptionItem[], id?: number | null) {
  if (!id) return ''
  return optionText(options.find((item) => Number(item.id) === Number(id)) || { id })
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

function productText(row: any) {
  return getLedgerProductText(row)
}

function moneyText(value: any) {
  return formatMoney(Number(value || 0))
}

function qtyText(value: any) {
  const num = Number(value || 0)
  return Number.isInteger(num) ? String(num) : String(Number(num.toFixed(2)))
}

function costStatusTag(value?: string) {
  return value === 'GAP' ? 'warning' : 'success'
}

function costStatusText(value?: string, reason?: string) {
  if (value === 'GAP') return reason || '缺成本'
  if (value === 'ESTIMATED') return '已估算'
  return '-'
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

function moveTypeText(value?: string) {
  return getLedgerMoveTypeText(value)
}

function moveTypeTag(value?: string) {
  if (value === 'IN') return 'success'
  if (value === 'OUT') return 'danger'
  if (value === 'TRANSFER') return 'warning'
  return 'info'
}

function moveReasonText(value?: string) {
  return getLedgerMoveReasonText(value)
}

function relatedOrderText(row: any) {
  return getLedgerRelatedOrderText(row)
}

function createExportContext(): StockLedgerExportContext {
  return {
    generatedAt: new Date(),
    scopeLabel: '当前页',
    totalCount: pagination.total || ledgerSummary.value.recordCount || tableData.value.length,
    page: pagination.page,
    pageSize: pagination.pageSize,
    keyword: searchKeyword.value,
    dateRange: searchDate.value,
    moveTypeText: searchMoveType.value ? moveTypeText(searchMoveType.value) : '',
    moveReasonText: searchMoveReason.value ? moveReasonText(searchMoveReason.value) : '',
    warehouseText: optionTextById(warehouseOptions.value, searchWarehouseId.value),
    supplierText: optionTextById(supplierOptions.value, searchSupplierId.value),
    productText: optionTextById(productOptions.value, searchProductId.value),
  }
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
    const params: Record<string, any> = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || undefined,
      moveType: searchMoveType.value || undefined,
      moveReason: searchMoveReason.value || undefined,
      warehouseId: searchWarehouseId.value || undefined,
      supplierId: searchSupplierId.value || undefined,
      productId: searchProductId.value || undefined,
    }
    if (searchDate.value.length === 2) {
      params.startDate = searchDate.value[0]
      params.endDate = searchDate.value[1]
    }
    const res: any = await getStockLedger(params)
    const rows = res.data?.records || res.data?.list || []
    tableData.value = rows
    pagination.total = res.data?.total || rows.length
    ledgerSummary.value = res.data?.summary || summarizeStockLedgerRows(rows)
  } catch {
    tableData.value = []
    pagination.total = 0
    ledgerSummary.value = emptySummary()
  } finally {
    loading.value = false
  }
}

function handleExport() {
  if (!tableData.value.length) {
    ElMessage.warning('暂无可导出的台账数据')
    return
  }
  const csv = buildStockLedgerCsv(tableData.value, createExportContext())
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
  link.href = url
  link.download = `库存台账_${timestamp}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function handleSearch(formData: { keyword: string }) {
  searchKeyword.value = formData.keyword || ''
  pagination.page = 1
  fetchData()
}

function handleReset() {
  searchKeyword.value = ''
  searchDate.value = []
  searchMoveType.value = ''
  searchMoveReason.value = ''
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

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin: 12px 0;
}

.summary-item {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #e8ebf0;
  border-radius: 6px;
  background: #fff;
  display: grid;
  gap: 4px;
}

.summary-item span,
.summary-item small {
  color: #606266;
  line-height: 1.2;
}

.summary-item strong {
  font-size: 18px;
  color: #303133;
  line-height: 1.2;
}

.negative {
  color: #f56c6c;
  font-weight: 600;
}
</style>
