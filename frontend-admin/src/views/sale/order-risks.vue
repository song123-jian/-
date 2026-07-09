<template>
  <div class="page-container sale-risk-page" v-loading="loading">
    <PageHeader title="交期风险" subtitle="按客户订单联动生产、库存、质检、发货和回款，提前识别延期与交付风险。">
      <el-button plain @click="fetchData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
      <el-button type="primary" plain @click="goTo('/sale/orders')">
        <el-icon><Document /></el-icon>
        销售订单
      </el-button>
      <el-button type="warning" plain @click="goTo('/workbench/abnormal-center')">
        <el-icon><WarningFilled /></el-icon>
        异常闭环
      </el-button>
    </PageHeader>

    <MetricStrip :items="metricCards" testid="sale-risk-metrics" />

    <el-alert
      v-if="errorMessage"
      class="page-alert"
      type="warning"
      :title="errorMessage"
      show-icon
      :closable="false"
    />

    <SearchBar
      :keyword="searchKeyword"
      title="筛选交期风险"
      description="按客户、订单、产品、风险类型和风险等级定位需要处理的订单。"
      keyword-placeholder="订单编号、客户、产品、风险"
      @search="handleSearch"
      @reset="handleReset"
    >
      <el-form-item label="风险等级">
        <el-select v-model="searchLevel" placeholder="全部" clearable style="width: 140px">
          <el-option label="高风险" value="RED" />
          <el-option label="需关注" value="YELLOW" />
          <el-option label="正常" value="GREEN" />
        </el-select>
      </el-form-item>
      <el-form-item label="风险类型">
        <el-select v-model="searchIssueType" placeholder="全部" clearable style="width: 160px">
          <el-option label="交期逾期" value="delivery_overdue" />
          <el-option label="临近交期" value="delivery_due_soon" />
          <el-option label="库存缺口" value="stock_shortage" />
          <el-option label="原料缺口" value="material_shortage" />
          <el-option label="生产风险" value="production_missing" />
          <el-option label="质量风险" value="quality_failed" />
          <el-option label="回款风险" value="payment_overdue" />
        </el-select>
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="filteredRows" stripe empty-text="暂无订单风险">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="issue-list">
              <div v-for="item in row.issues" :key="`${row.orderId}-${item.type}-${item.title}`" class="issue-item">
                <el-tag :type="riskTag(item.level)" effect="plain">{{ getSaleOrderRiskLevelText(item.level) }}</el-tag>
                <div>
                  <strong>{{ item.title }}</strong>
                  <span>{{ item.message }}</span>
                  <small>{{ item.action }}</small>
                </div>
                <el-button type="primary" link @click="handleIssueAction(row, item.route)">处理</el-button>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="riskText" label="等级" width="95">
          <template #default="{ row }">
            <el-tag :type="riskTag(row.riskLevel)" effect="plain">{{ row.riskText }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="orderNo" label="订单编号" min-width="160" fixed="left" show-overflow-tooltip />
        <el-table-column prop="customerName" label="客户" min-width="150" show-overflow-tooltip />
        <el-table-column prop="productName" label="产品" min-width="190" show-overflow-tooltip />
        <el-table-column prop="primaryRisk" label="主要风险" min-width="180" show-overflow-tooltip />
        <el-table-column prop="deliveryDate" label="交货日期" width="115">
          <template #default="{ row }">{{ row.deliveryDate || '-' }}</template>
        </el-table-column>
        <el-table-column label="距交期" width="95" align="right">
          <template #default="{ row }">{{ daysText(row.daysToDelivery) }}</template>
        </el-table-column>
        <el-table-column label="交付进度" min-width="160">
          <template #default="{ row }">
            <div class="progress-cell">
              <el-progress :percentage="deliveryPercent(row)" :stroke-width="10" :show-text="false" />
              <span>{{ Number(row.deliveredQty || 0).toFixed(0) }}/{{ Number(row.orderQty || 0).toFixed(0) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="可用/已产" width="120" align="right">
          <template #default="{ row }">
            {{ Number(row.availableQty || 0).toFixed(0) }}/{{ Number(row.producedQty || 0).toFixed(0) }}
          </template>
        </el-table-column>
        <el-table-column label="原料缺口" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag v-if="row.materialShortageCount" type="danger" effect="plain">
              {{ materialShortageText(row) }}
            </el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="receivableAmount" label="应收余额" width="125" align="right">
          <template #default="{ row }">{{ moneyText(row.receivableAmount) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right" align="center">
          <template #default="{ row }">
            <RowActions :actions="rowActions(row)" :max-visible="2" @command="handleCommand(row, $event)" />
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Document, Refresh, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import MetricStrip from '@/components/MetricStrip.vue'
import PageHeader from '@/components/PageHeader.vue'
import RowActions, { type RowActionItem } from '@/components/RowActions.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getDeliveryList } from '@/api/delivery'
import { getPaymentList } from '@/api/payment'
import { getProdOrderList } from '@/api/prodOrder'
import { getProductList } from '@/api/product'
import { getQcRecordList } from '@/api/qcRecord'
import { getSaleOrderList } from '@/api/saleOrder'
import { getStockList } from '@/api/stock'
import { formatMoney } from '@/utils'
import {
  buildSaleOrderPurchaseRequisitionQuery,
  buildSaleOrderRisks,
  getSaleOrderRiskLevelText,
  summarizeSaleOrderRisks,
  type SaleOrderRiskRow,
} from '@/utils/sale-risk'

const PURCHASE_REQUISITION_PATH = '/injection/purchase-requisition'
const router = useRouter()
const loading = ref(false)
const errorMessage = ref('')
const riskRows = ref<SaleOrderRiskRow[]>([])
const searchKeyword = ref('')
const searchLevel = ref('')
const searchIssueType = ref('')

const summary = computed(() => summarizeSaleOrderRisks(riskRows.value))

const metricCards = computed(() => [
  { label: '订单总数', value: summary.value.total, meta: '当前风险扫描范围', tone: 'primary' as const },
  { label: '高风险', value: summary.value.red, meta: '逾期、严重缺口或质量未闭环', tone: 'danger' as const },
  { label: '需关注', value: summary.value.yellow, meta: '临期、部分缺口或回款待跟进', tone: 'warning' as const },
  { label: '库存缺口', value: summary.value.stockShortage, meta: '可用库存与已产不足', tone: 'danger' as const },
  { label: '原料缺口', value: summary.value.materialShortage, meta: `建议请购 ${summary.value.purchaseSuggestionQty.toFixed(0)}`, tone: summary.value.materialShortage ? 'danger' as const : 'success' as const },
  { label: '应收余额', value: summary.value.receivableAmount, valueType: 'money' as const, meta: '风险订单应收合计', tone: summary.value.receivableAmount ? 'warning' as const : 'success' as const },
])

const filteredRows = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  return riskRows.value.filter((row) => {
    const keywordHit = !keyword || [
      row.orderNo,
      row.customerName,
      row.productName,
      row.primaryRisk,
      row.materialShortages.map((item) => `${item.materialName} ${item.materialCode}`).join(' '),
      row.issues.map((item) => `${item.title} ${item.message}`).join(' '),
    ].join(' ').toLowerCase().includes(keyword)
    const levelHit = !searchLevel.value || row.riskLevel === searchLevel.value
    const typeHit = !searchIssueType.value || row.issues.some((item) => {
      if (searchIssueType.value === 'production_missing') return item.type === 'production_missing' || item.type === 'production_lagging'
      return item.type === searchIssueType.value
    })
    return keywordHit && levelHit && typeHit
  })
})

function unwrapRecords(res: any) {
  const data = res?.data?.records || res?.data?.list || res?.data || []
  return Array.isArray(data) ? data : [data].filter(Boolean)
}

function failureText(error: any, fallback: string) {
  return error?.message || error?.data?.message || fallback
}

function riskTag(level: string) {
  if (level === 'RED') return 'danger'
  if (level === 'YELLOW') return 'warning'
  return 'success'
}

function moneyText(value: any) {
  return `¥${formatMoney(Number(value || 0))}`
}

function daysText(value: number | null) {
  if (value === null || value === undefined) return '-'
  if (value < 0) return `逾期${Math.abs(value)}天`
  if (value === 0) return '今天'
  return `${value}天`
}

function deliveryPercent(row: SaleOrderRiskRow) {
  if (row.orderQty <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((row.deliveredQty / row.orderQty) * 100)))
}

function materialShortageText(row: SaleOrderRiskRow) {
  const first = row.materialShortages[0]
  if (!first) return '-'
  const suffix = row.materialShortages.length > 1 ? ` 等${row.materialShortages.length}项` : ''
  return `${first.materialName}缺${Number(first.shortageQty || 0).toFixed(0)}${first.unit || ''}${suffix}`
}

function rowActions(row: SaleOrderRiskRow): RowActionItem[] {
  const routes = Array.from(new Set(row.issues.map((item) => item.route).filter(Boolean)))
  return [
    { key: '/sale/orders', label: '订单', type: 'primary' },
    ...routes
      .filter((route) => route !== '/sale/orders')
      .slice(0, 4)
      .map((route) => ({ key: route, label: routeLabel(route), type: routeType(route) })),
  ]
}

function routeLabel(route: string) {
  const labels: Record<string, string> = {
    '/prod/orders': '生产',
    '/stock/query': '库存',
    [PURCHASE_REQUISITION_PATH]: '请购',
    '/qc/defect-disposal': '质量',
    '/sale/deliveries': '发货',
    '/sale/payments': '回款',
  }
  return labels[route] || '处理'
}

function routeType(route: string): RowActionItem['type'] {
  if (route === '/stock/query' || route === '/qc/defect-disposal') return 'danger'
  if (route === '/prod/orders' || route === '/sale/payments' || route === PURCHASE_REQUISITION_PATH) return 'warning'
  return 'primary'
}

function handleCommand(row: SaleOrderRiskRow, command: string) {
  goToRiskRoute(row, command)
}

function handleIssueAction(row: SaleOrderRiskRow, path: string) {
  goToRiskRoute(row, path)
}

function handleSearch(formData: { keyword: string }) {
  searchKeyword.value = formData.keyword || ''
}

function handleReset() {
  searchKeyword.value = ''
  searchLevel.value = ''
  searchIssueType.value = ''
}

function goTo(path: string) {
  router.push(path)
}

function goToRiskRoute(row: SaleOrderRiskRow, path: string) {
  if (path === PURCHASE_REQUISITION_PATH) {
    const query = buildSaleOrderPurchaseRequisitionQuery(row)
    if (query) {
      router.push({ path, query })
      return
    }
  }
  goTo(path)
}

async function fetchData() {
  loading.value = true
  errorMessage.value = ''
  const [orderRes, productionRes, stockRes, productRes, qcRes, deliveryRes, paymentRes] = await Promise.allSettled([
    getSaleOrderList({ page: 1, pageSize: 1000 }),
    getProdOrderList({ page: 1, pageSize: 1000 }),
    getStockList({ page: 1, pageSize: 2000 }),
    getProductList({ page: 1, pageSize: 2000 }),
    getQcRecordList({ page: 1, pageSize: 1000 }),
    getDeliveryList({ page: 1, pageSize: 1000 }),
    getPaymentList({ page: 1, pageSize: 1000 }),
  ])

  riskRows.value = buildSaleOrderRisks({
    orders: orderRes.status === 'fulfilled' ? unwrapRecords(orderRes.value) : [],
    productionOrders: productionRes.status === 'fulfilled' ? unwrapRecords(productionRes.value) : [],
    stockRows: stockRes.status === 'fulfilled' ? unwrapRecords(stockRes.value) : [],
    productRows: productRes.status === 'fulfilled' ? unwrapRecords(productRes.value) : [],
    qcRecords: qcRes.status === 'fulfilled' ? unwrapRecords(qcRes.value) : [],
    deliveryRows: deliveryRes.status === 'fulfilled' ? unwrapRecords(deliveryRes.value) : [],
    paymentRows: paymentRes.status === 'fulfilled' ? unwrapRecords(paymentRes.value) : [],
  })

  const failed = [orderRes, productionRes, stockRes, productRes, qcRes, deliveryRes, paymentRes]
    .filter((item) => item.status === 'rejected') as PromiseRejectedResult[]
  if (failed.length) {
    errorMessage.value = `部分数据源加载失败：${failureText(failed[0].reason, '请检查 Supabase 连接和销售相关表结构。')}`
    ElMessage.warning(errorMessage.value)
  }
  loading.value = false
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped lang="scss">
.page-alert {
  margin-bottom: 12px;
}

.issue-list {
  display: grid;
  gap: 10px;
  padding: 8px 18px 10px;
}

.issue-item {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr) 52px;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #e6e8eb;
  border-radius: 8px;
  background: #fafbfc;
}

.issue-item div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.issue-item strong {
  color: #1f2933;
}

.issue-item span,
.issue-item small {
  color: #64748b;
}

.progress-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-cell :deep(.el-progress) {
  flex: 1;
  min-width: 0;
}

.progress-cell span {
  width: 76px;
  flex-shrink: 0;
  text-align: right;
  color: #606266;
  font-size: 12px;
}

@media (max-width: 768px) {
  .issue-item {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
}
</style>
