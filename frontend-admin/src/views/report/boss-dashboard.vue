<template>
  <div class="page-container">
    <PageHeader title="老板驾驶舱">
      <el-button type="primary" @click="goFinanceDashboard">
        <el-icon><Wallet /></el-icon>
        财务总览
      </el-button>
      <el-button @click="goFinanceStatements">
        <el-icon><Document /></el-icon>
        对账单
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
      <span>口径：销售订单、回款流水、销售出库、费用、已结工资、质检与设备状态统一归集。</span>
    </div>

    <MetricStrip v-loading="loading" class="kpi-grid" :items="kpiCards" testid="boss-dashboard-metrics" />

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

    <el-row :gutter="16" class="chart-row">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover" v-loading="loading">
          <template #header>
            <div class="section-header">
              <span>经营结构</span>
              <el-tag type="info" effect="plain">{{ normalizedSummary.months || monthRows.length }} 个月</el-tag>
            </div>
          </template>
          <div ref="financeChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover" v-loading="loading">
          <template #header>
            <div class="section-header">
              <span>运营效率</span>
              <el-tag :type="normalizedSummary.oee < 60 && normalizedSummary.machineCount > 0 ? 'warning' : 'success'" effect="plain">
                OEE {{ percentText(normalizedSummary.oee) }}
              </el-tag>
            </div>
          </template>
          <div ref="operationChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="hover">
      <template #header>
        <div class="section-header">
          <span>月度经营快照</span>
          <el-tag type="info" effect="plain">{{ monthRows.length }} 行</el-tag>
        </div>
      </template>
      <el-table :data="monthRows" stripe v-loading="loading" empty-text="暂无驾驶舱数据">
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
        <el-table-column label="销售出库" width="110" align="right">
          <template #default="{ row }">{{ numberText(row.shipmentQty) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center" fixed="right">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import {
  Calendar,
  Document,
  Refresh,
  Search,
  Wallet,
} from '@element-plus/icons-vue'
import MetricStrip from '@/components/MetricStrip.vue'
import PageHeader from '@/components/PageHeader.vue'
import { getBossDashboard } from '@/api/dashboard'
import { formatMoney } from '@/utils'
import {
  buildBossDashboardCards,
  buildBossDashboardRiskItems,
  buildBossFinanceChartRows,
  buildBossOperationGaugeRows,
  normalizeBossDashboardSummary,
  type BossDashboardRiskLevel,
  type BossDashboardSummary,
} from '@/utils/boss-dashboard'
import {
  createFinanceStatementScope,
  getFinanceStatementMonthKey,
  validateFinanceStatementRange,
} from '@/utils/finance-statement'

const router = useRouter()
const loading = ref(false)
const months = ref(6)
const monthRange = ref<string[]>([])
const errorMessage = ref('')
const summary = ref<BossDashboardSummary>({ monthItems: [], riskItems: [] })
const financeChartRef = ref<HTMLElement>()
const operationChartRef = ref<HTMLElement>()
let financeChart: echarts.ECharts | null = null
let operationChart: echarts.ECharts | null = null

const normalizedSummary = computed(() => normalizeBossDashboardSummary(summary.value))
const kpiCards = computed(() => buildBossDashboardCards(summary.value))
const riskItems = computed(() => buildBossDashboardRiskItems(summary.value))
const monthRows = computed(() => normalizedSummary.value.monthItems || [])
const scopeText = computed(() => {
  if (normalizedSummary.value.startDate && normalizedSummary.value.endDate) {
    return `${normalizedSummary.value.startDate} 至 ${normalizedSummary.value.endDate}`
  }
  if (monthRange.value?.length === 2) return `${monthRange.value[0]} 至 ${monthRange.value[1]}`
  return `近 ${months.value} 个月`
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

function riskAlertType(level: BossDashboardRiskLevel) {
  if (level === 'error') return 'error'
  if (level === 'warning') return 'warning'
  return 'info'
}

function statusTagType(status?: string | null) {
  if (status === 'LOSS') return 'danger'
  if (status === 'COST_GAP' || status === 'RECEIVABLE') return 'warning'
  return 'success'
}

function statusText(status?: string | null) {
  const labels: Record<string, string> = {
    LOSS: '亏损',
    COST_GAP: '缺成本',
    RECEIVABLE: '有应收',
    NORMAL: '正常',
  }
  return labels[String(status || '').toUpperCase()] || status || '正常'
}

function chartColor(tone?: string) {
  const colors: Record<string, string> = {
    primary: '#409eff',
    success: '#67c23a',
    warning: '#e6a23c',
    danger: '#f56c6c',
    neutral: '#909399',
  }
  return colors[tone || 'neutral'] || colors.neutral
}

function initCharts() {
  if (financeChartRef.value && !financeChart) financeChart = echarts.init(financeChartRef.value)
  if (operationChartRef.value && !operationChart) operationChart = echarts.init(operationChartRef.value)
}

function renderCharts() {
  const financeRows = buildBossFinanceChartRows(summary.value)
  const gaugeRows = buildBossOperationGaugeRows(summary.value)
  financeChart?.setOption({
    tooltip: { trigger: 'axis' },
    grid: { top: 24, left: 52, right: 20, bottom: 42 },
    xAxis: { type: 'category', data: financeRows.map((item) => item.label), axisLabel: { interval: 0, rotate: 20 } },
    yAxis: { type: 'value', name: '元' },
    series: [
      {
        type: 'bar',
        data: financeRows.map((item) => ({ value: item.value, itemStyle: { color: chartColor(item.tone) } })),
        barMaxWidth: 34,
      },
    ],
  })
  operationChart?.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c}%' },
    radar: {
      radius: '62%',
      indicator: gaugeRows.map((item) => ({ name: item.label, max: 100 })),
    },
    series: [
      {
        type: 'radar',
        areaStyle: { opacity: 0.14 },
        data: [
          {
            value: gaugeRows.map((item) => item.value),
            name: '运营效率',
            lineStyle: { color: '#409eff' },
            itemStyle: { color: '#409eff' },
          },
        ],
      },
    ],
  })
}

function handleResize() {
  financeChart?.resize()
  operationChart?.resize()
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

function buildDashboardQuery() {
  const params = buildDashboardParams()
  if ('startMonth' in params) {
    return {
      startMonth: params.startMonth,
      endMonth: params.endMonth,
    }
  }
  return { months: String(params.months) }
}

function goFinanceDashboard() {
  router.push({ path: '/finance/dashboard', query: buildDashboardQuery() })
}

function goFinanceStatements() {
  router.push({ path: '/finance/statements', query: buildDashboardQuery() })
}

function applyRecentMonths() {
  const scope = createFinanceStatementScope({ months: months.value })
  monthRange.value = [
    getFinanceStatementMonthKey(scope.startDate),
    getFinanceStatementMonthKey(scope.endDate),
  ]
}

async function fetchData() {
  const params = buildDashboardParams()
  const rangeError = validateFinanceStatementRange(params)
  if (rangeError) {
    summary.value = { monthItems: [], riskItems: [] }
    errorMessage.value = rangeError
    await nextTick()
    renderCharts()
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    const res: any = await getBossDashboard(params)
    summary.value = { monthItems: [], riskItems: [], ...(res.data || {}) }
  } catch {
    summary.value = { monthItems: [], riskItems: [] }
    errorMessage.value = '老板驾驶舱加载失败，请检查 Supabase 连接、经营数据与表结构迁移。'
  } finally {
    loading.value = false
    await nextTick()
    initCharts()
    renderCharts()
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

onMounted(() => {
  initCharts()
  window.addEventListener('resize', handleResize)
  applyRecentMonths()
  fetchData()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  financeChart?.dispose()
  operationChart?.dispose()
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

.chart-row {
  margin-bottom: 16px;
}

.chart-row :deep(.el-card) {
  margin-bottom: 16px;
}

.chart-container {
  height: 320px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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

  .chart-container {
    height: 280px;
  }
}
</style>
