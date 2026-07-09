<template>
  <div class="page-container">
    <PageHeader title="财务经营总览">
      <el-button type="primary" @click="goPath('/finance/statements')">
        <el-icon><Document /></el-icon>
        对账单
      </el-button>
      <el-button @click="goPath('/finance/expenses')">
        <el-icon><Wallet /></el-icon>
        费用支出
      </el-button>
      <el-button @click="goPath('/report/boss-dashboard')">
        <el-icon><TrendCharts /></el-icon>
        老板驾驶舱
      </el-button>
    </PageHeader>

    <div class="dashboard-filter">
      <el-form :inline="true" class="dashboard-filter__form">
        <el-form-item label="经营期间">
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

    <div class="scope-line">
      <span>周期：{{ scopeText }}</span>
      <span>口径：销售订单、回款流水、应收账期、费用、已结工资、销售出库成本统一归集。</span>
    </div>

    <MetricStrip v-loading="loading" class="kpi-grid" :items="kpiCards" testid="finance-dashboard-metrics" />

    <div v-if="riskItems.length" class="risk-list">
      <el-alert
        v-for="item in riskItems"
        :key="`${item.type}-${item.month || ''}-${item.title}`"
        :type="riskAlertType(item.level)"
        :title="item.title"
        :description="item.description"
        show-icon
        :closable="false"
      />
    </div>

    <el-row :gutter="16" class="section-row">
      <el-col :xs="24" :lg="10">
        <el-card shadow="hover" v-loading="loading">
          <template #header>
            <div class="section-header">
              <span>闭环动作</span>
              <el-tag type="info" effect="plain">{{ drilldowns.length }} 项</el-tag>
            </div>
          </template>
          <div class="action-list">
            <button
              v-for="item in drilldowns"
              :key="item.label"
              type="button"
              class="action-item"
              :class="`action-item--${item.tone}`"
              @click="goPath(item.path)"
            >
              <span>{{ item.label }}</span>
              <small>{{ item.description }}</small>
            </button>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="14">
        <el-card shadow="hover" v-loading="loading">
          <template #header>
            <div class="section-header">
              <span>经营结构</span>
              <el-tag :type="normalizedSummary.grossProfit < 0 ? 'danger' : 'success'" effect="plain">
                {{ normalizedSummary.grossProfit < 0 ? '亏损' : '盈利' }}
              </el-tag>
            </div>
          </template>
          <div class="structure-list">
            <div v-for="item in structureRows" :key="item.label" class="structure-row">
              <div class="structure-row__text">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
              <el-progress
                :percentage="item.percent"
                :status="item.status"
                :show-text="false"
                :stroke-width="8"
              />
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="hover">
      <template #header>
        <div class="section-header">
          <span>月度经营明细</span>
          <el-tag type="info" effect="plain">{{ monthRows.length }} 个月</el-tag>
        </div>
      </template>
      <el-table :data="monthRows" stripe v-loading="loading" empty-text="暂无财务经营数据">
        <el-table-column prop="month" label="月份" fixed width="105" />
        <el-table-column label="订单金额" min-width="125" align="right">
          <template #default="{ row }">{{ moneyText(row.orderAmount) }}</template>
        </el-table-column>
        <el-table-column label="回款金额" min-width="125" align="right">
          <template #default="{ row }">{{ moneyText(row.paymentAmount) }}</template>
        </el-table-column>
        <el-table-column label="应收余额" min-width="125" align="right">
          <template #default="{ row }">{{ moneyText(row.receivableBalance) }}</template>
        </el-table-column>
        <el-table-column label="费用" min-width="115" align="right">
          <template #default="{ row }">{{ moneyText(row.expenseTotal) }}</template>
        </el-table-column>
        <el-table-column label="工资" min-width="115" align="right">
          <template #default="{ row }">{{ moneyText(row.salaryTotal) }}</template>
        </el-table-column>
        <el-table-column label="出库成本" min-width="125" align="right">
          <template #default="{ row }">{{ moneyText(row.materialCost) }}</template>
        </el-table-column>
        <el-table-column label="经营毛利" min-width="125" align="right">
          <template #default="{ row }">
            <span :class="{ negative: Number(row.grossProfit || 0) < 0 }">{{ moneyText(row.grossProfit) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="回款率" width="100" align="right">
          <template #default="{ row }">{{ percentText(row.collectionRate) }}</template>
        </el-table-column>
        <el-table-column label="毛利率" width="100" align="right">
          <template #default="{ row }">{{ percentText(row.profitRate) }}</template>
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
            <el-tag :type="statusTag(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Calendar,
  Document,
  Refresh,
  Search,
  TrendCharts,
  Wallet,
} from '@element-plus/icons-vue'
import MetricStrip from '@/components/MetricStrip.vue'
import PageHeader from '@/components/PageHeader.vue'
import { getFinanceReceivables, getFinanceStatements } from '@/api/finance'
import { formatMoney } from '@/utils'
import {
  createFinanceStatementScope,
  getFinanceStatementMonthKey,
  validateFinanceStatementRange,
} from '@/utils/finance-statement'
import {
  buildFinanceDashboardCards,
  buildFinanceDashboardDrilldowns,
  buildFinanceDashboardRiskItems,
  financeDashboardStatusTag,
  financeDashboardStatusText,
  normalizeFinanceDashboardSummary,
  type FinanceDashboardRiskLevel,
  type FinanceDashboardStatementLike,
  type FinanceDashboardReceivableSummaryLike,
} from '@/utils/finance-dashboard'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const months = ref(6)
const monthRange = ref<string[]>([])
const errorMessage = ref('')
const statementSummary = ref<FinanceDashboardStatementLike>({ monthItems: [], riskItems: [] })
const receivableSummary = ref<FinanceDashboardReceivableSummaryLike>({})

const normalizedSummary = computed(() => normalizeFinanceDashboardSummary(statementSummary.value, receivableSummary.value))
const kpiCards = computed(() => buildFinanceDashboardCards(statementSummary.value, receivableSummary.value))
const riskItems = computed(() => buildFinanceDashboardRiskItems(statementSummary.value, receivableSummary.value))
const drilldowns = computed(() => buildFinanceDashboardDrilldowns())
const monthRows = computed(() => normalizedSummary.value.monthItems)
const scopeText = computed(() => {
  if (normalizedSummary.value.startDate && normalizedSummary.value.endDate) {
    return `${normalizedSummary.value.startDate} 至 ${normalizedSummary.value.endDate}`
  }
  if (monthRange.value?.length === 2) return `${monthRange.value[0]} 至 ${monthRange.value[1]}`
  return `近 ${months.value} 个月`
})
const structureRows = computed(() => {
  const data = normalizedSummary.value
  return [
    {
      label: '回款率',
      value: percentText(data.collectionRate),
      percent: clampProgress(data.collectionRate),
      status: data.collectionRate >= 80 ? 'success' : 'warning',
    },
    {
      label: '毛利率',
      value: percentText(data.profitRate),
      percent: clampProgress(data.profitRate),
      status: data.grossProfit < 0 ? 'exception' : 'success',
    },
    {
      label: '成本费用占比',
      value: percentText(costExpenseRate.value),
      percent: clampProgress(costExpenseRate.value),
      status: costExpenseRate.value >= 80 ? 'warning' : 'success',
    },
    {
      label: '逾期应收占比',
      value: percentText(overdueReceivableRate.value),
      percent: clampProgress(overdueReceivableRate.value),
      status: overdueReceivableRate.value > 0 ? 'exception' : 'success',
    },
  ] as Array<{ label: string; value: string; percent: number; status: 'success' | 'warning' | 'exception' }>
})
const costExpenseRate = computed(() => {
  const data = normalizedSummary.value
  if (data.orderAmount <= 0) return 0
  return ((data.materialCost + data.salaryTotal + data.expenseTotal) / data.orderAmount) * 100
})
const overdueReceivableRate = computed(() => {
  const data = normalizedSummary.value
  if (data.receivableAmount <= 0) return 0
  return (data.overdueAmount / data.receivableAmount) * 100
})

function moneyText(value: any) {
  return `¥${formatMoney(Number(value || 0))}`
}

function percentText(value: any) {
  return `${Number(value || 0).toFixed(1)}%`
}

function numberText(value: any) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function riskAlertType(level: FinanceDashboardRiskLevel) {
  if (level === 'error') return 'error'
  if (level === 'warning') return 'warning'
  if (level === 'success') return 'success'
  return 'info'
}

function statusText(status?: string | null) {
  return financeDashboardStatusText(status)
}

function statusTag(status?: string | null) {
  return financeDashboardStatusTag(status)
}

function clampProgress(value: unknown) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.max(0, Math.min(Number(num.toFixed(1)), 100))
}

function buildDashboardParams() {
  if (monthRange.value?.length === 2 && monthRange.value[0] && monthRange.value[1]) {
    return {
      startMonth: monthRange.value[0],
      endMonth: monthRange.value[1],
    }
  }
  return { months: months.value }
}

function buildNavigationQuery() {
  const params = buildDashboardParams()
  if ('startMonth' in params) {
    return {
      startMonth: params.startMonth,
      endMonth: params.endMonth,
    }
  }
  return { months: String(params.months) }
}

function applyRecentMonths() {
  const scope = createFinanceStatementScope({ months: months.value })
  monthRange.value = [
    getFinanceStatementMonthKey(scope.startDate),
    getFinanceStatementMonthKey(scope.endDate),
  ]
}

function applyRouteQuery() {
  const startMonth = String(route.query.startMonth || '')
  const endMonth = String(route.query.endMonth || '')
  const nextMonths = Number(route.query.months || 0)
  if (startMonth && endMonth) {
    monthRange.value = [startMonth, endMonth]
    return
  }
  if (Number.isFinite(nextMonths) && nextMonths > 0) {
    months.value = Math.min(Math.max(Math.trunc(nextMonths), 1), 24)
  }
  applyRecentMonths()
}

async function fetchData() {
  const params = buildDashboardParams()
  const rangeError = validateFinanceStatementRange(params)
  if (rangeError) {
    statementSummary.value = { monthItems: [], riskItems: [] }
    receivableSummary.value = {}
    errorMessage.value = rangeError
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    const [statementResult, receivableResult] = await Promise.allSettled([
      getFinanceStatements(params),
      getFinanceReceivables({ ...params, page: 1, pageSize: 1 }),
    ])

    if (statementResult.status === 'rejected') throw statementResult.reason
    statementSummary.value = { monthItems: [], riskItems: [], ...(statementResult.value as any).data }

    if (receivableResult.status === 'fulfilled') {
      receivableSummary.value = (receivableResult.value as any).data?.summary || {}
    } else {
      receivableSummary.value = {}
      errorMessage.value = '财务总览已加载，应收逾期汇总加载失败，请检查销售订单、客户账期和回款流水。'
    }
  } catch {
    statementSummary.value = { monthItems: [], riskItems: [] }
    receivableSummary.value = {}
    errorMessage.value = '财务经营总览加载失败，请检查 Supabase 连接、销售订单、回款、费用、工资与出库数据。'
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  fetchData()
}

function handleRecentMonths() {
  applyRecentMonths()
  fetchData()
}

function handleReset() {
  months.value = 6
  applyRecentMonths()
  fetchData()
}

function goPath(path: string) {
  router.push({ path, query: buildNavigationQuery() })
}

onMounted(() => {
  applyRouteQuery()
  fetchData()
})
</script>

<style scoped lang="scss">
.dashboard-filter {
  margin-bottom: 12px;
  padding: 16px 16px 4px;
  border: 1px solid #e6e8eb;
  border-radius: 4px;
  background: #fff;
}

.dashboard-filter__form {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: flex-start;
}

.section-alert {
  margin-bottom: 12px;
}

.scope-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-bottom: 12px;
  color: #606266;
  font-size: 13px;
  line-height: 1.5;
}

.kpi-grid {
  margin-bottom: 16px;
}

.risk-list {
  display: grid;
  gap: 10px;
  margin-bottom: 16px;
}

.section-row {
  margin-bottom: 16px;
}

.section-row :deep(.el-card) {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.action-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.action-item {
  display: flex;
  min-height: 74px;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid #e4e7ed;
  border-left: 4px solid #909399;
  border-radius: 4px;
  background: #fff;
  color: #303133;
  text-align: left;
  cursor: pointer;
}

.action-item:hover {
  background: #f5f7fa;
}

.action-item--primary {
  border-left-color: #409eff;
}

.action-item--success {
  border-left-color: #67c23a;
}

.action-item--warning {
  border-left-color: #e6a23c;
}

.action-item--danger {
  border-left-color: #f56c6c;
}

.action-item span {
  font-size: 14px;
  font-weight: 600;
}

.action-item small {
  color: #606266;
  font-size: 12px;
  line-height: 1.4;
}

.structure-list {
  display: grid;
  gap: 16px;
  padding: 4px 0;
}

.structure-row__text {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
  color: #606266;
  font-size: 13px;
}

.structure-row__text strong {
  color: #303133;
  font-size: 15px;
}

.negative {
  color: #f56c6c;
  font-weight: 600;
}

:deep(.dashboard-filter .el-form-item) {
  margin-bottom: 12px;
}

@media (max-width: 768px) {
  .dashboard-filter :deep(.el-date-editor.el-input__wrapper) {
    width: 100% !important;
  }

  .action-list {
    grid-template-columns: 1fr;
  }
}
</style>
