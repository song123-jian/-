<template>
  <div class="page-container">
    <PageHeader title="财务对账单">
      <el-button type="warning" @click="openReceivableDrawer">
        <el-icon><Wallet /></el-icon>
        应收明细
      </el-button>
    </PageHeader>

    <div class="statement-filter">
      <el-form :inline="true" class="statement-filter__form">
        <el-form-item label="财务期间">
          <el-date-picker
            v-model="monthRange"
            type="monthrange"
            range-separator="至"
            start-placeholder="开始月份"
            end-placeholder="结束月份"
            value-format="YYYY-MM"
            style="width: 280px"
            clearable
          />
        </el-form-item>
        <el-form-item label="快捷月数">
          <el-input-number v-model="months" :min="1" :max="24" style="width: 140px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon>
            查询
          </el-button>
          <el-button @click="handleRecentMonths">
            <el-icon><Calendar /></el-icon>
            最近月数
          </el-button>
          <el-button @click="handleReset">
            <el-icon><Refresh /></el-icon>
            重置
          </el-button>
        </el-form-item>
      </el-form>
    </div>

    <el-alert
      v-if="errorMessage"
      class="section-alert"
      type="warning"
      :title="errorMessage"
      show-icon
      :closable="false"
    />

    <div class="statement-scope">
      <span>对账周期：{{ scopeText }}</span>
      <span>应收余额按期初已收与回款流水统一口径计算；出库成本优先取销售出库流水成本，历史缺失项兜底估算并列示。</span>
    </div>

    <el-row :gutter="16" class="summary-row" v-loading="loading">
      <el-col v-for="item in summaryCards" :key="item.label" :xs="24" :sm="12" :md="8" :lg="6" :xl="6">
        <div class="summary-card" :class="`summary-card--${item.tone}`">
          <div class="summary-label">{{ item.label }}</div>
          <div class="summary-value">{{ item.value }}</div>
          <div class="summary-meta">{{ item.meta }}</div>
        </div>
      </el-col>
    </el-row>

    <div v-if="riskItems.length" class="risk-list">
      <el-alert
        v-for="item in riskItems"
        :key="`${item.type}-${item.month}-${item.title}`"
        :type="riskAlertType(item.level)"
        :title="item.title"
        :description="item.description"
        show-icon
        :closable="false"
      />
    </div>

    <el-card shadow="hover">
      <template #header>
        <div class="table-header">
          <span>月度经营明细</span>
          <el-tag type="info" effect="plain">{{ monthRows.length }} 个月</el-tag>
        </div>
      </template>
      <el-table :data="monthRows" stripe v-loading="loading" empty-text="暂无对账数据">
        <el-table-column prop="month" label="月份" fixed width="105" />
        <el-table-column label="订单金额" min-width="130" align="right">
          <template #default="{ row }">{{ moneyText(row.orderAmount) }}</template>
        </el-table-column>
        <el-table-column label="回款金额" min-width="130" align="right">
          <template #default="{ row }">{{ moneyText(row.paymentAmount) }}</template>
        </el-table-column>
        <el-table-column label="应收余额" min-width="130" align="right">
          <template #default="{ row }">{{ moneyText(row.receivableBalance) }}</template>
        </el-table-column>
        <el-table-column label="费用支出" min-width="130" align="right">
          <template #default="{ row }">{{ moneyText(row.expenseTotal) }}</template>
        </el-table-column>
        <el-table-column label="工资总额" min-width="130" align="right">
          <template #default="{ row }">{{ moneyText(row.salaryTotal) }}</template>
        </el-table-column>
        <el-table-column label="出库成本" min-width="150" align="right">
          <template #default="{ row }">{{ moneyText(row.materialCost) }}</template>
        </el-table-column>
        <el-table-column label="经营毛利" min-width="130" align="right">
          <template #default="{ row }">
            <span :class="{ negative: Number(row.grossProfit || 0) < 0 }">{{ moneyText(row.grossProfit) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="回款率" width="105" align="right">
          <template #default="{ row }">{{ percentText(row.collectionRate) }}</template>
        </el-table-column>
        <el-table-column label="毛利率" width="105" align="right">
          <template #default="{ row }">{{ percentText(row.profitRate) }}</template>
        </el-table-column>
        <el-table-column label="出库数量" width="110" align="right">
          <template #default="{ row }">{{ numberText(row.shipmentQty) }}</template>
        </el-table-column>
        <el-table-column label="成本缺口" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.costGapCount ? 'warning' : 'success'" effect="plain">
              {{ row.costGapCount || 0 }} 笔
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center" fixed="right">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-drawer
      v-model="receivableDrawerVisible"
      title="应收订单明细"
      size="min(1040px, 96vw)"
      class="receivable-drawer"
    >
      <el-alert
        v-if="receivableError"
        class="section-alert"
        type="warning"
        :title="receivableError"
        show-icon
        :closable="false"
      />

      <div class="receivable-summary">
        <div>
          <span>期末应收</span>
          <strong>{{ moneyText(receivableSummary.receivableAmount) }}</strong>
        </div>
        <div>
          <span>未结订单</span>
          <strong>{{ receivableSummary.openOrderCount || 0 }} 单</strong>
        </div>
        <div>
          <span>逾期订单</span>
          <strong>{{ receivableSummary.overdueOrderCount || 0 }} 单</strong>
        </div>
        <div>
          <span>最长逾期</span>
          <strong>{{ receivableSummary.maxOverdueDays || 0 }} 天</strong>
        </div>
      </div>

      <el-table :data="receivableRows" stripe v-loading="receivableLoading" empty-text="暂无应收订单">
        <el-table-column prop="orderNo" label="销售订单" min-width="150" show-overflow-tooltip />
        <el-table-column prop="customerName" label="客户" min-width="150" show-overflow-tooltip />
        <el-table-column prop="orderDate" label="订单日期" width="110" />
        <el-table-column prop="dueDate" label="到期日" width="110" />
        <el-table-column label="账期" width="80" align="right">
          <template #default="{ row }">{{ row.paymentDays || 0 }} 天</template>
        </el-table-column>
        <el-table-column label="订单金额" width="120" align="right">
          <template #default="{ row }">{{ moneyText(row.totalAmount) }}</template>
        </el-table-column>
        <el-table-column label="期末已收" width="120" align="right">
          <template #default="{ row }">{{ moneyText(row.receivedAmount) }}</template>
        </el-table-column>
        <el-table-column label="期末未收" width="120" align="right">
          <template #default="{ row }">{{ moneyText(row.receivableAmount) }}</template>
        </el-table-column>
        <el-table-column label="逾期" width="90" align="right">
          <template #default="{ row }">{{ row.overdueDays || 0 }} 天</template>
        </el-table-column>
        <el-table-column label="风险" width="120">
          <template #default="{ row }">
            <el-tag :type="receivableRiskTag(row.riskLevel)" effect="plain">{{ row.riskText }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="registerReceivablePayment(row)">登记回款</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="receivablePagination.page"
        v-model:page-size="receivablePagination.pageSize"
        :total="receivablePagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @size-change="fetchReceivables"
        @current-change="fetchReceivables"
      />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Calendar, Refresh, Search, Wallet } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { getFinanceReceivables, getFinanceStatements } from '@/api/finance'
import { formatMoney } from '@/utils'
import {
  createFinanceStatementScope,
  getFinanceStatementMonthKey,
  validateFinanceStatementRange,
} from '@/utils/finance-statement'

type RiskLevel = 'error' | 'warning' | 'info' | string

type FinanceRiskItem = {
  type: string
  level: RiskLevel
  month: string
  title: string
  description: string
}

type FinanceMonthRow = {
  month: string
  orderAmount: number
  paymentAmount: number
  expenseTotal: number
  salaryTotal: number
  pendingSalaryTotal?: number
  materialCost: number
  grossProfit: number
  receivableBalance: number
  collectionRate: number
  profitRate: number
  shipmentQty: number
  costGapCount: number
  pendingSalaryCount?: number
  status: string
}

type FinanceSummary = {
  periodMode?: string
  months?: number
  startDate?: string
  endDate?: string
  monthOrderAmount?: number
  monthPaymentAmount?: number
  monthExpenseTotal?: number
  monthSalaryTotal?: number
  pendingSalaryTotal?: number
  monthMaterialCost?: number
  monthGrossProfit?: number
  receivableBalance?: number
  collectionRate?: number
  profitRate?: number
  orderCount?: number
  paymentCount?: number
  shipmentQty?: number
  shipmentCount?: number
  costGapCount?: number
  pendingSalaryCount?: number
  draftOrderCount?: number
  monthItems: FinanceMonthRow[]
  riskItems: FinanceRiskItem[]
}

type FinanceReceivableRow = {
  saleOrderId: number
  orderNo: string
  customerName: string
  orderDate: string
  dueDate: string
  paymentDays: number
  totalAmount: number
  receivedAmount: number
  receivableAmount: number
  overdueDays: number
  riskLevel: RiskLevel
  riskText: string
}

type FinanceReceivableSummary = {
  totalAmount?: number
  receivedAmount?: number
  receivableAmount?: number
  orderCount?: number
  openOrderCount?: number
  overdueOrderCount?: number
  maxOverdueDays?: number
}

const router = useRouter()
const loading = ref(false)
const months = ref(6)
const monthRange = ref<string[]>([])
const errorMessage = ref('')
const summary = ref<FinanceSummary>(createEmptySummary())
const receivableDrawerVisible = ref(false)
const receivableLoading = ref(false)
const receivableError = ref('')
const receivableRows = ref<FinanceReceivableRow[]>([])
const receivableSummary = ref<FinanceReceivableSummary>({})
const receivablePagination = reactive({ page: 1, pageSize: 20, total: 0 })

const summaryCards = computed(() => [
  {
    label: '订单金额',
    value: moneyText(summary.value.monthOrderAmount),
    meta: `${summary.value.orderCount || 0} 单`,
    tone: 'primary',
  },
  {
    label: '回款金额',
    value: moneyText(summary.value.monthPaymentAmount),
    meta: `回款率 ${percentText(summary.value.collectionRate)}`,
    tone: 'success',
  },
  {
    label: '应收余额',
    value: moneyText(summary.value.receivableBalance),
    meta: summary.value.receivableBalance ? '需持续跟进' : '无未收余额',
    tone: 'warning',
  },
  {
    label: '费用支出',
    value: moneyText(summary.value.monthExpenseTotal),
    meta: '经营费用',
    tone: 'neutral',
  },
  {
    label: '工资总额',
    value: moneyText(summary.value.monthSalaryTotal),
    meta: summary.value.pendingSalaryCount
      ? `${summary.value.pendingSalaryCount} 条待结，${moneyText(summary.value.pendingSalaryTotal)}`
      : '已结工资汇总',
    tone: summary.value.pendingSalaryCount ? 'warning' : 'neutral',
  },
  {
    label: '出库成本',
    value: moneyText(summary.value.monthMaterialCost),
    meta: `${summary.value.costGapCount || 0} 笔缺口`,
    tone: summary.value.costGapCount ? 'warning' : 'neutral',
  },
  {
    label: '经营毛利',
    value: moneyText(summary.value.monthGrossProfit),
    meta: `毛利率 ${percentText(summary.value.profitRate)}`,
    tone: Number(summary.value.monthGrossProfit || 0) < 0 ? 'danger' : 'success',
  },
  {
    label: '销售出库',
    value: numberText(summary.value.shipmentQty),
    meta: `${summary.value.shipmentCount || 0} 笔出库`,
    tone: 'primary',
  },
])

const monthRows = computed(() => summary.value.monthItems || [])
const riskItems = computed(() => summary.value.riskItems || [])
const scopeText = computed(() => {
  if (summary.value.startDate && summary.value.endDate) {
    return `${summary.value.startDate} 至 ${summary.value.endDate}`
  }
  if (monthRange.value?.length === 2) {
    return `${monthRange.value[0]} 至 ${monthRange.value[1]}`
  }
  return `近 ${months.value} 个月`
})

function createEmptySummary(): FinanceSummary {
  return {
    monthItems: [],
    riskItems: [],
  }
}

function moneyText(value: any) {
  return `¥${formatMoney(Number(value || 0))}`
}

function percentText(value: any) {
  return `${Number(value || 0).toFixed(1)}%`
}

function numberText(value: any) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function riskAlertType(level: RiskLevel) {
  if (level === 'error') return 'error'
  if (level === 'warning') return 'warning'
  return 'info'
}

function receivableRiskTag(level: RiskLevel) {
  if (level === 'error') return 'danger'
  if (level === 'warning') return 'warning'
  if (level === 'success') return 'success'
  return 'info'
}

function statusTagType(status: string) {
  if (status === 'LOSS') return 'danger'
  if (status === 'COST_GAP' || status === 'RECEIVABLE') return 'warning'
  return 'success'
}

function statusText(status: string) {
  const labels: Record<string, string> = {
    LOSS: '亏损',
    COST_GAP: '缺成本',
    RECEIVABLE: '有应收',
    NORMAL: '正常',
  }
  return labels[status] || status || '正常'
}

async function fetchData() {
  const params = buildStatementParams()
  const rangeError = validateFinanceStatementRange(params)
  if (rangeError) {
    summary.value = createEmptySummary()
    errorMessage.value = rangeError
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    const res: any = await getFinanceStatements(params)
    summary.value = { ...createEmptySummary(), ...(res.data || {}) }
  } catch {
    summary.value = createEmptySummary()
    errorMessage.value = '对账单加载失败，请检查 Supabase 连接、销售订单、回款、费用、工资与出库数据。'
  } finally {
    loading.value = false
  }
}

async function fetchReceivables() {
  const params = buildStatementParams()
  const rangeError = validateFinanceStatementRange(params)
  if (rangeError) {
    receivableRows.value = []
    receivableSummary.value = {}
    receivablePagination.total = 0
    receivableError.value = rangeError
    return
  }

  receivableLoading.value = true
  receivableError.value = ''
  try {
    const res: any = await getFinanceReceivables({
      ...params,
      page: receivablePagination.page,
      pageSize: receivablePagination.pageSize,
    })
    const rows = res.data?.records || res.data?.list || []
    receivableRows.value = rows
    receivableSummary.value = res.data?.summary || {}
    receivablePagination.total = res.data?.total || rows.length
  } catch {
    receivableRows.value = []
    receivableSummary.value = {}
    receivablePagination.total = 0
    receivableError.value = '应收明细加载失败，请检查销售订单、客户账期和回款流水。'
  } finally {
    receivableLoading.value = false
  }
}

function buildStatementParams() {
  if (monthRange.value?.length === 2 && monthRange.value[0] && monthRange.value[1]) {
    return {
      startMonth: monthRange.value[0],
      endMonth: monthRange.value[1],
    }
  }
  return { months: months.value }
}

function applyRecentMonths() {
  const scope = createFinanceStatementScope({ months: months.value })
  monthRange.value = [
    getFinanceStatementMonthKey(scope.startDate),
    getFinanceStatementMonthKey(scope.endDate),
  ]
}

function handleRecentMonths() {
  applyRecentMonths()
  fetchData()
  if (receivableDrawerVisible.value) {
    receivablePagination.page = 1
    fetchReceivables()
  }
}

function handleSearch() {
  fetchData()
  if (receivableDrawerVisible.value) {
    receivablePagination.page = 1
    fetchReceivables()
  }
}

function handleReset() {
  months.value = 6
  applyRecentMonths()
  fetchData()
  if (receivableDrawerVisible.value) {
    receivablePagination.page = 1
    fetchReceivables()
  }
}

function openReceivableDrawer() {
  receivableDrawerVisible.value = true
  receivablePagination.page = 1
  fetchReceivables()
}

function registerReceivablePayment(row: FinanceReceivableRow) {
  router.push({
    path: '/sale/payments',
    query: {
      saleOrderId: String(row.saleOrderId),
      open: '1',
    },
  })
}

onMounted(() => {
  applyRecentMonths()
  fetchData()
})
</script>

<style scoped lang="scss">
.statement-filter {
  margin-bottom: 12px;
  padding: 16px 16px 4px;
  border: 1px solid #e6e8eb;
  border-radius: 4px;
  background: #fff;
}

.statement-filter__form {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: flex-start;
}

.section-alert {
  margin-bottom: 12px;
}

.statement-scope {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-bottom: 12px;
  color: #606266;
  font-size: 13px;
  line-height: 1.5;
}

.summary-row {
  margin-bottom: 16px;
}

.summary-card {
  min-height: 104px;
  margin-bottom: 16px;
  padding: 14px 14px 12px;
  border: 1px solid #e4e7ed;
  border-left: 4px solid #909399;
  border-radius: 4px;
  background: #fff;
}

.summary-card--primary {
  border-left-color: #409eff;
}

.summary-card--success {
  border-left-color: #67c23a;
}

.summary-card--warning {
  border-left-color: #e6a23c;
}

.summary-card--danger {
  border-left-color: #f56c6c;
}

.summary-card--neutral {
  border-left-color: #909399;
}

.summary-label {
  font-size: 13px;
  color: #909399;
  margin-bottom: 8px;
}

.summary-value {
  font-size: 24px;
  line-height: 1.2;
  font-weight: 700;
  color: #303133;
  overflow-wrap: anywhere;
}

.summary-meta {
  margin-top: 8px;
  font-size: 12px;
  color: #606266;
}

.risk-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-bottom: 16px;
}

.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.negative {
  color: #f56c6c;
  font-weight: 600;
}

.receivable-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.receivable-summary > div {
  min-height: 74px;
  padding: 12px;
  border: 1px solid #e4e7ed;
  border-left: 4px solid #e6a23c;
  border-radius: 4px;
  background: #fff;
}

.receivable-summary span {
  display: block;
  margin-bottom: 8px;
  color: #909399;
  font-size: 12px;
}

.receivable-summary strong {
  display: block;
  color: #303133;
  font-size: 18px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

:deep(.statement-filter .el-form-item) {
  margin-bottom: 12px;
}

@media (max-width: 768px) {
  .statement-filter :deep(.el-date-editor.el-input__wrapper) {
    width: 100% !important;
  }

  .summary-value {
    font-size: 22px;
  }

  .receivable-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
