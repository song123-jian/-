<template>
  <div class="page-container">
    <PageHeader title="质量看板" />

    <div class="dashboard-filter">
      <el-form :inline="true" class="dashboard-filter__form">
        <el-form-item label="质检期间">
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
      <span>口径：质检记录按 check_time 归集，抽样数、不良数、产品、不良类型和检验结果统一计算。</span>
    </div>

    <div v-loading="loading" class="kpi-grid">
      <div v-for="item in statCards" :key="item.label" class="kpi-card" :class="`kpi-card--${item.tone}`">
        <div class="kpi-card__main">
          <div>
            <div class="kpi-card__label">{{ item.label }}</div>
            <div class="kpi-card__value">{{ cardValueText(item) }}</div>
          </div>
          <el-icon :size="30">
            <component :is="cardIcon(item.icon)" />
          </el-icon>
        </div>
        <div class="kpi-card__meta">{{ item.meta }}</div>
      </div>
    </div>

    <div v-if="riskItems.length" class="risk-list">
      <el-alert
        v-for="item in riskItems"
        :key="`${item.type}-${item.title}`"
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
              <span>不良率趋势</span>
              <el-tag type="info" effect="plain">{{ trendRows.length }} 天</el-tag>
            </div>
          </template>
          <div ref="defectRateChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover" v-loading="loading">
          <template #header>
            <div class="section-header">
              <span>不良类型分布</span>
              <el-tag :type="normalizedSummary.defectQty > 0 ? 'warning' : 'success'" effect="plain">
                {{ numberText(normalizedSummary.defectQty) }} 不良
              </el-tag>
            </div>
          </template>
          <div ref="defectTypeChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="hover">
      <template #header>
        <div class="section-header">
          <span>各产品品质情况</span>
          <el-tag type="info" effect="plain">{{ productRows.length }} 个产品</el-tag>
        </div>
      </template>
      <el-table :data="productRows" stripe v-loading="loading" empty-text="暂无品质数据">
        <el-table-column prop="productName" label="产品" min-width="160" />
        <el-table-column label="检验数量" width="110" align="right">
          <template #default="{ row }">{{ numberText(row.inspectQty) }}</template>
        </el-table-column>
        <el-table-column label="合格数量" width="110" align="right">
          <template #default="{ row }">{{ numberText(row.passQty) }}</template>
        </el-table-column>
        <el-table-column label="不良数量" width="110" align="right">
          <template #default="{ row }">{{ numberText(row.defectQty) }}</template>
        </el-table-column>
        <el-table-column label="合格率" min-width="150">
          <template #default="{ row }">
            <el-progress :percentage="progressPercent(row.passRate)" :color="row.passRate >= 95 ? '#67c23a' : '#e6a23c'" />
          </template>
        </el-table-column>
        <el-table-column label="不良率" width="100" align="right">
          <template #default="{ row }">
            <span :class="{ danger: Number(row.defectRate || 0) > 5, warning: Number(row.defectRate || 0) > 3 }">
              {{ percentText(row.defectRate) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="不良记录" width="100" align="right">
          <template #default="{ row }">{{ numberText(row.failCount) }}</template>
        </el-table-column>
        <el-table-column label="异常记录" width="100" align="right">
          <template #default="{ row }">{{ numberText(row.abnormalCount) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import * as echarts from 'echarts'
import {
  Bell,
  Calendar,
  CircleCheck,
  DataAnalysis,
  DocumentChecked,
  Goods,
  Odometer,
  Refresh,
  Search,
  WarningFilled,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { getQualityBoard } from '@/api/dashboard'
import {
  createFinanceStatementScope,
  getFinanceStatementMonthKey,
  validateFinanceStatementRange,
} from '@/utils/finance-statement'
import {
  buildQualityBoardCards,
  buildQualityBoardRiskItems,
  clampQualityPercent,
  normalizeQualityBoardSummary,
  type QualityBoardCard,
  type QualityBoardRiskItem,
  type QualityBoardSummary,
} from '@/utils/quality-board'

const iconMap = {
  Bell,
  CircleCheck,
  DataAnalysis,
  DocumentChecked,
  Goods,
  Odometer,
  WarningFilled,
}

const loading = ref(false)
const months = ref(3)
const monthRange = ref<string[]>([])
const errorMessage = ref('')
const summary = ref<QualityBoardSummary>({ productRows: [], trendData: [], topDefects: [] })
const defectRateChartRef = ref<HTMLElement>()
const defectTypeChartRef = ref<HTMLElement>()
let defectRateChart: echarts.ECharts | null = null
let defectTypeChart: echarts.ECharts | null = null

const normalizedSummary = computed(() => normalizeQualityBoardSummary(summary.value))
const statCards = computed(() => buildQualityBoardCards(summary.value))
const riskItems = computed(() => buildQualityBoardRiskItems(summary.value))
const productRows = computed(() => normalizedSummary.value.productRows)
const trendRows = computed(() => normalizedSummary.value.trendData)
const topDefects = computed(() => normalizedSummary.value.topDefects)
const scopeText = computed(() => {
  if (normalizedSummary.value.startDate && normalizedSummary.value.endDate) {
    return `${normalizedSummary.value.startDate} 至 ${normalizedSummary.value.endDate}`
  }
  if (monthRange.value?.length === 2) return `${monthRange.value[0]} 至 ${monthRange.value[1]}`
  return `近 ${months.value} 个月`
})

function cardIcon(name: string) {
  return iconMap[name as keyof typeof iconMap] || DataAnalysis
}

function numberText(value: any) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function percentText(value: any) {
  return `${Number(value || 0).toFixed(1)}%`
}

function cardValueText(item: QualityBoardCard) {
  if (item.valueType === 'percent') return percentText(item.value)
  return numberText(item.value)
}

function riskAlertType(level: QualityBoardRiskItem['level']) {
  if (level === 'error') return 'error'
  if (level === 'warning') return 'warning'
  return 'info'
}

function progressPercent(value: any) {
  return clampQualityPercent(value)
}

function chartColor(index: number) {
  const colors = ['#f56c6c', '#e6a23c', '#409eff', '#67c23a', '#909399', '#b88230', '#c45656', '#337ecc']
  return colors[index % colors.length]
}

function initCharts() {
  if (defectRateChartRef.value && !defectRateChart) defectRateChart = echarts.init(defectRateChartRef.value)
  if (defectTypeChartRef.value && !defectTypeChart) defectTypeChart = echarts.init(defectTypeChartRef.value)
}

function renderCharts() {
  const trendData = trendRows.value
  const defectRows = topDefects.value
  const hasTrend = trendData.length > 0
  const hasDefects = defectRows.length > 0

  defectRateChart?.setOption({
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { top: 28, left: 52, right: 42, bottom: 56 },
    xAxis: { type: 'category', data: hasTrend ? trendData.map((item) => item.date) : ['暂无数据'] },
    yAxis: [
      { type: 'value', name: '数量' },
      { type: 'value', name: '不良率(%)', min: 0, max: 100 },
    ],
    series: [
      {
        name: '检验数量',
        type: 'bar',
        data: hasTrend ? trendData.map((item) => item.inspectQty) : [0],
        itemStyle: { color: '#409eff' },
        barMaxWidth: 34,
      },
      {
        name: '不良数量',
        type: 'bar',
        data: hasTrend ? trendData.map((item) => item.defectQty) : [0],
        itemStyle: { color: '#f56c6c' },
        barMaxWidth: 34,
      },
      {
        name: '不良率',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: hasTrend ? trendData.map((item) => item.defectRate) : [0],
        itemStyle: { color: '#e6a23c' },
      },
    ],
  })

  defectTypeChart?.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    title: hasDefects ? undefined : { text: '暂无不良数据', left: 'center', top: '42%', textStyle: { color: '#909399', fontSize: 14 } },
    series: [
      {
        type: 'pie',
        radius: ['38%', '66%'],
        center: ['50%', '45%'],
        data: hasDefects
          ? defectRows.map((item, index) => ({ name: item.defectType, value: item.qty, itemStyle: { color: chartColor(index) } }))
          : [{ name: '暂无数据', value: 0, itemStyle: { color: '#dcdfe6' } }],
      },
    ],
  })
}

function handleResize() {
  defectRateChart?.resize()
  defectTypeChart?.resize()
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
    summary.value = { productRows: [], trendData: [], topDefects: [] }
    errorMessage.value = rangeError
    await nextTick()
    initCharts()
    renderCharts()
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    const res: any = await getQualityBoard(params)
    summary.value = { productRows: [], trendData: [], topDefects: [], ...(res.data || {}) }
  } catch {
    summary.value = { productRows: [], trendData: [], topDefects: [] }
    errorMessage.value = '质量看板加载失败，请检查 Supabase 连接、质检记录、产品档案与表结构迁移。'
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
  months.value = 3
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
  defectRateChart?.dispose()
  defectTypeChart?.dispose()
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
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.kpi-card {
  min-width: 0;
  min-height: 112px;
  padding: 14px;
  border: 1px solid #e4e7ed;
  border-left: 4px solid #909399;
  border-radius: 4px;
  background: #fff;
}

.kpi-card--primary {
  border-left-color: #409eff;
}

.kpi-card--success {
  border-left-color: #67c23a;
}

.kpi-card--warning {
  border-left-color: #e6a23c;
}

.kpi-card--danger {
  border-left-color: #f56c6c;
}

.kpi-card__main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.kpi-card__label {
  color: #909399;
  font-size: 13px;
  line-height: 1.2;
}

.kpi-card__value {
  margin-top: 8px;
  color: #303133;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.kpi-card__meta {
  margin-top: 10px;
  color: #606266;
  font-size: 12px;
  line-height: 1.4;
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

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.chart-container {
  height: 320px;
}

.warning {
  color: #e6a23c;
}

.danger {
  color: #f56c6c;
}

@media (max-width: 768px) {
  .dashboard-filter {
    padding: 12px 12px 0;
  }

  .kpi-grid {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .kpi-card__value {
    font-size: 20px;
  }
}
</style>
