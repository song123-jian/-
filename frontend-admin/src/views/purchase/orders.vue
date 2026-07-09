<template>
  <div class="page-container purchase-orders-page" v-loading="loading">
    <PageHeader title="采购订单" subtitle="串联缺料建议、请购、转采购、到货入库、批次成本和风险跟踪。">
      <el-button plain @click="fetchData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
      <el-button plain :loading="exporting" @click="handleExport">
        <el-icon><Download /></el-icon>
        导出Excel
      </el-button>
      <el-button type="primary" @click="goTo('/injection/purchase-requisition')">
        <el-icon><DocumentChecked /></el-icon>
        请购单
      </el-button>
      <el-button type="success" plain @click="goTo('/stock/in-purchase')">
        <el-icon><Bottom /></el-icon>
        采购入库
      </el-button>
    </PageHeader>

    <section class="purchase-flow" aria-label="采购闭环">
      <span v-for="step in flowSteps" :key="step">{{ step }}</span>
    </section>

    <MetricStrip :items="summaryCards" testid="purchase-order-metrics" />

    <el-card class="order-table-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <div class="card-title">
            <strong>订单闭环工作台</strong>
            <span>按风险优先级展示待处理采购事项</span>
          </div>
          <el-input v-model.trim="keyword" clearable placeholder="搜索采购单、请购单、物料、供应商" class="search-input" />
        </div>
      </template>

      <el-table :data="filteredRows" stripe empty-text="暂无采购订单" :row-class-name="tableRowClassName">
        <el-table-column prop="orderNo" label="采购单号" min-width="150" show-overflow-tooltip />
        <el-table-column prop="sourceNo" label="来源请购" min-width="150" show-overflow-tooltip />
        <el-table-column label="物料" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="primary-cell">
              <strong>{{ materialText(row) }}</strong>
              <small>{{ row.materialId ? `#${row.materialId}` : '-' }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="供应商" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <span :class="{ 'muted-text': row.noSupplier }">{{ supplierText(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="采购数量" width="110" align="right">
          <template #default="{ row }">{{ qtyText(row.requestedQty) }}</template>
        </el-table-column>
        <el-table-column label="已入库" width="100" align="right">
          <template #default="{ row }">{{ qtyText(row.receivedQty) }}</template>
        </el-table-column>
        <el-table-column label="剩余" width="150">
          <template #default="{ row }">
            <div class="progress-cell">
              <span>{{ qtyText(row.remainingQty) }}</span>
              <el-progress :percentage="row.receiveProgress" :stroke-width="8" :status="progressStatus(row)" />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="单价" width="110" align="right">
          <template #default="{ row }">{{ moneyText(row.unitCost) }}</template>
        </el-table-column>
        <el-table-column label="金额" width="120" align="right">
          <template #default="{ row }">{{ moneyText(row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="expectedDate" label="期望到货" width="120">
          <template #default="{ row }">{{ row.expectedDate || '-' }}</template>
        </el-table-column>
        <el-table-column prop="statusText" label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" effect="plain">{{ row.statusText }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="风险" width="110">
          <template #default="{ row }">
            <el-tag :type="riskTag(row)" effect="plain">{{ row.riskText }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column label="操作" width="170" fixed="right" align="center">
          <template #default="{ row }">
            <RowActions :actions="purchaseOrderRowActions(row)" @command="handlePurchaseOrderCommand(row, $event)" />
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Bottom, DocumentChecked, Download, Refresh } from '@element-plus/icons-vue'
import MetricStrip from '@/components/MetricStrip.vue'
import PageHeader from '@/components/PageHeader.vue'
import RowActions, { type RowActionItem } from '@/components/RowActions.vue'
import { getInjectionList, runInjectionAction } from '@/api/injection'
import { getStockLedger } from '@/api/stock'
import { formatMoney } from '@/utils'
import { recordBusinessAudit } from '@/utils/business-audit'
import { printBusinessDocument } from '@/utils/business-print'
import { exportExcelFile, type ExcelColumn } from '@/utils/export-excel'
import {
  buildPurchaseOrderRows,
  getPurchaseOrderStatusTag,
  summarizePurchaseOrders,
  validatePurchaseReceiveQty,
  type PurchaseOrderRow,
} from '@/utils/purchase-order'

const router = useRouter()
const loading = ref(false)
const exporting = ref(false)
const keyword = ref('')
const rows = ref<PurchaseOrderRow[]>([])
const convertingId = ref<number | string | null>(null)
const flowSteps = ['缺料建议', '采购请购', '审核转单', '供应商交期', '采购入库', '批次成本', '关闭']

const purchaseOrderExportColumns: ExcelColumn<PurchaseOrderRow>[] = [
  { label: '采购单号', prop: 'orderNo' },
  { label: '来源请购', prop: 'sourceNo' },
  { label: '物料', value: (row) => materialText(row) },
  { label: '供应商', value: (row) => supplierText(row) },
  { label: '采购数量', value: (row) => qtyText(row.requestedQty) },
  { label: '已入库', value: (row) => qtyText(row.receivedQty) },
  { label: '剩余', value: (row) => qtyText(row.remainingQty) },
  { label: '单价', value: (row) => moneyText(row.unitCost) },
  { label: '金额', value: (row) => moneyText(row.amount) },
  { label: '期望到货', value: (row) => row.expectedDate || '-' },
  { label: '状态', prop: 'statusText' },
  { label: '风险', prop: 'riskText' },
  { label: '备注', prop: 'remark' },
]

const filteredRows = computed(() => {
  const text = keyword.value.toLowerCase()
  if (!text) return rows.value
  return rows.value.filter((row) => JSON.stringify(row).toLowerCase().includes(text))
})

const summary = computed(() => summarizePurchaseOrders(rows.value))

const summaryCards = computed(() => [
  { label: '采购订单', value: summary.value.total, meta: `金额 ${moneyText(summary.value.purchaseAmount)}`, tone: 'primary' as const },
  { label: '待下单', value: summary.value.pending, meta: '已审核未转采购', tone: 'warning' as const },
  { label: '待到货', value: summary.value.ordered, meta: `剩余 ${qtyText(summary.value.remainingQty)}`, tone: 'primary' as const },
  { label: '部分到货', value: summary.value.partial, meta: `已入库 ${qtyText(summary.value.receivedQty)}`, tone: 'warning' as const },
  { label: '已到货', value: summary.value.received, meta: `入库金额 ${moneyText(summary.value.receivedAmount)}`, tone: 'success' as const },
  { label: '风险项', value: summary.value.risk, meta: `逾期 ${summary.value.overdue} / 缺供应商 ${summary.value.noSupplier}`, tone: 'danger' as const },
])

function orderWeight(row: PurchaseOrderRow) {
  if (row.noSupplier) return 0
  if (row.overdue) return 1
  const weights: Record<string, number> = {
    APPROVED: 2,
    PARTIAL_RECEIVED: 3,
    ORDERED: 4,
    SUBMITTED: 5,
    DRAFT: 6,
    RECEIVED: 7,
    CLOSED: 8,
    CANCELLED: 9,
  }
  return weights[row.status] ?? 10
}

function sortRows(input: PurchaseOrderRow[]) {
  return input.slice().sort((a, b) => orderWeight(a) - orderWeight(b) || String(a.expectedDate || '').localeCompare(String(b.expectedDate || '')))
}

async function fetchData() {
  loading.value = true
  try {
    const [requisitionRes, inboundRes] = await Promise.allSettled([
      getInjectionList('purchase-requisitions', { page: 1, pageSize: 500 }),
      getStockLedger({ page: 1, pageSize: 500, moveType: 'IN', moveReason: 'IN_PURCHASE' }),
    ])
    const requisitions = requisitionRes.status === 'fulfilled'
      ? requisitionRes.value.data?.records || requisitionRes.value.data?.list || requisitionRes.value.data || []
      : []
    const inboundRows = inboundRes.status === 'fulfilled'
      ? inboundRes.value.data?.records || inboundRes.value.data?.list || inboundRes.value.data || []
      : []
    rows.value = sortRows(buildPurchaseOrderRows(requisitions, inboundRows))
    if (requisitionRes.status === 'rejected' || inboundRes.status === 'rejected') {
      ElMessage.warning('采购订单数据未完全加载，请检查请购或库存流水接口')
    }
  } finally {
    loading.value = false
  }
}

function statusTag(status: string) {
  return getPurchaseOrderStatusTag(status)
}

function riskTag(row: PurchaseOrderRow) {
  if (row.noSupplier || row.overdue) return 'danger'
  if (row.remainingQty > 0) return 'warning'
  return 'success'
}

function progressStatus(row: PurchaseOrderRow) {
  if (row.overdue) return 'exception'
  if (row.status === 'RECEIVED' || row.status === 'CLOSED') return 'success'
  if (row.status === 'PARTIAL_RECEIVED') return 'warning'
  return undefined
}

function qtyText(value: number) {
  const num = Number(value || 0)
  return Number.isInteger(num) ? String(num) : num.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function moneyText(value: number) {
  return formatMoney(Number(value || 0))
}

function purchaseOrderRowActions(row: PurchaseOrderRow): RowActionItem[] {
  return [
    { key: 'print', label: '打印', type: 'primary' },
    {
      key: 'convert',
      label: '转采购',
      type: 'primary',
      loading: convertingId.value === row.id,
      disabled: !row.canConvert,
    },
    { key: 'receive', label: '入库', type: 'success', disabled: !row.canReceive },
    { key: 'requisition', label: '请购', type: 'info' },
  ]
}

function handlePurchaseOrderCommand(row: PurchaseOrderRow, command: string) {
  if (command === 'print') handlePrint(row)
  if (command === 'convert') handleConvert(row)
  if (command === 'receive') handleReceive(row)
  if (command === 'requisition') goTo('/injection/purchase-requisition')
}

async function handleExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    const exportRows = filteredRows.value
    const filename = `采购订单导出_${Date.now()}.xls`
    exportExcelFile({
      filename,
      sheetName: '采购订单',
      columns: purchaseOrderExportColumns,
      rows: exportRows,
    })
    await recordBusinessAudit({
      module: '采购订单',
      action: 'EXPORT',
      targetType: 'purchase_order',
      targetId: 'filtered',
      count: exportRows.length,
      scope: keyword.value ? '当前关键字筛选' : '当前工作台',
      filename,
      detail: {
        keyword: keyword.value,
        totalRows: rows.value.length,
      },
    })
    ElMessage.success(`已导出 ${exportRows.length} 条采购订单`)
  } catch {
    ElMessage.error('导出失败')
  } finally {
    exporting.value = false
  }
}

async function handlePrint(row: PurchaseOrderRow) {
  const opened = printBusinessDocument({
    title: '采购订单',
    subtitle: row.orderNo || `#${row.id || ''}`,
    sections: [
      { label: '来源请购', value: row.sourceNo || '-' },
      { label: '供应商', value: supplierText(row) },
      { label: '物料', value: materialText(row) },
      { label: '期望到货', value: row.expectedDate || '-' },
      { label: '状态', value: row.statusText || '-' },
      { label: '风险', value: row.riskText || '-' },
    ],
    columns: [
      { label: '物料', prop: 'material' },
      { label: '采购数量', prop: 'requestedQty', align: 'right' },
      { label: '已入库', prop: 'receivedQty', align: 'right' },
      { label: '剩余', prop: 'remainingQty', align: 'right' },
      { label: '单价', prop: 'unitCost', align: 'right' },
      { label: '金额', prop: 'amount', align: 'right' },
    ],
    rows: [{
      material: materialText(row),
      requestedQty: qtyText(row.requestedQty),
      receivedQty: qtyText(row.receivedQty),
      remainingQty: qtyText(row.remainingQty),
      unitCost: moneyText(row.unitCost),
      amount: moneyText(row.amount),
    }],
    totals: [
      { label: '采购金额', value: moneyText(row.amount) },
      { label: '入库进度', value: `${row.receiveProgress || 0}%` },
    ],
    remark: row.remark,
  })
  if (!opened) {
    ElMessage.error('打印窗口被浏览器拦截')
    return
  }
  await recordBusinessAudit({
    module: '采购订单',
    action: 'PRINT',
    targetType: 'purchase_order',
    targetId: row.id || row.orderNo,
    summary: `打印采购订单 ${row.orderNo || ''}`,
    detail: { orderNo: row.orderNo, sourceNo: row.sourceNo, supplier: supplierText(row), amount: row.amount },
  })
}

function materialText(row: PurchaseOrderRow) {
  return [row.materialCode, row.materialName].filter(Boolean).join(' - ') || (row.materialId ? `物料 ${row.materialId}` : '-')
}

function supplierText(row: PurchaseOrderRow) {
  return row.supplierName || (row.supplierId ? `供应商 ${row.supplierId}` : '未指定')
}

function tableRowClassName({ row }: { row: PurchaseOrderRow }) {
  if (row.noSupplier || row.overdue) return 'risk-row'
  if (row.status === 'RECEIVED') return 'done-row'
  return ''
}

async function handleConvert(row: PurchaseOrderRow) {
  if (!row.id) {
    ElMessage.warning('缺少请购单ID，不能转采购')
    return
  }
  if (row.noSupplier) {
    ElMessage.warning('采购订单缺少供应商，不能转采购')
    return
  }
  if (!row.canConvert) {
    ElMessage.warning('当前状态不能转采购')
    return
  }
  convertingId.value = row.id
  try {
    await runInjectionAction('purchase-requisitions', Number(row.id), 'generate')
    ElMessage.success('已转采购订单')
    fetchData()
  } catch {
    // 交给全局拦截器提示
  } finally {
    convertingId.value = null
  }
}

function handleReceive(row: PurchaseOrderRow) {
  const message = validatePurchaseReceiveQty(row, Math.min(1, row.remainingQty))
  if (message) {
    ElMessage.warning(message)
    return
  }
  router.push('/stock/in-purchase')
}

function goTo(path: string) {
  router.push(path)
}

onMounted(fetchData)
</script>

<style scoped lang="scss">
.purchase-orders-page {
  display: grid;
  gap: 14px;
}

.purchase-flow {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.purchase-flow span {
  min-height: 28px;
  padding: 5px 10px;
  border: 1px solid #d8dee8;
  border-radius: 6px;
  background: #fff;
  color: #435063;
  font-size: 13px;
}

.purchase-flow span + span::before {
  content: '';
}

.order-table-card {
  border-radius: 8px;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.card-title {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.card-title strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-section-title);
  line-height: var(--ui-line-height-body);
}

.card-title span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-meta);
  line-height: var(--ui-line-height-meta);
}

.search-input {
  width: min(340px, 42vw);
}

.primary-cell,
.progress-cell {
  display: grid;
  gap: 4px;
}

.primary-cell strong {
  color: #1f2933;
  font-size: 13px;
  font-weight: 600;
}

.primary-cell small,
.muted-text {
  color: #8a97a8;
}

.progress-cell :deep(.el-progress__text) {
  min-width: 34px;
}

:deep(.risk-row td) {
  background: #fff7f7 !important;
}

:deep(.done-row td) {
  color: #5f6f7f;
}

@media (max-width: 720px) {
  .card-header {
    align-items: stretch;
    flex-direction: column;
  }

  .search-input {
    width: 100%;
  }
}
</style>
