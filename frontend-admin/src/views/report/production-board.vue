<template>
  <div class="page-container">
    <PageHeader title="生产看板" />

    <div class="dashboard-filter">
      <el-form :inline="true" class="dashboard-filter__form">
        <el-form-item label="生产期间">
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
          <el-input-number v-model="months" :min="1" :max="24" :precision="0" style="width: 140px" />
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
      <span>口径：生产报工按 start_time 归集，质检按 check_time 归集，工单、机台、产品与不良类型统一联动。</span>
    </div>

    <MetricStrip v-loading="loading" class="kpi-grid" :items="statCards" testid="production-board-metrics" />

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
              <span>班次产量</span>
              <el-tag type="info" effect="plain">{{ normalizedSummary.shiftCount }} 个班次</el-tag>
            </div>
          </template>
          <div ref="shiftChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover" v-loading="loading">
          <template #header>
            <div class="section-header">
              <span>机台状态</span>
              <el-tag :type="normalizedSummary.runningMachineCount > 0 ? 'success' : 'warning'" effect="plain">
                {{ normalizedSummary.runningMachineCount }}/{{ normalizedSummary.machineCount }} 运行
              </el-tag>
            </div>
          </template>
          <div ref="machineChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="table-row">
      <el-col :xs="24" :xl="12">
        <el-card shadow="hover">
          <template #header>
            <div class="section-header">
              <span>机台实时状态</span>
              <el-tag type="info" effect="plain">{{ machineStatus.length }} 台</el-tag>
            </div>
          </template>
          <el-table :data="machineStatus" stripe v-loading="loading" empty-text="暂无机台数据">
            <el-table-column prop="machineName" label="机台" min-width="130" />
            <el-table-column prop="productName" label="当前产品" min-width="150" />
            <el-table-column label="状态" width="105" align="center">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status)" effect="plain">
                  {{ statusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="orderNo" label="当前工单" min-width="150" />
          </el-table>
        </el-card>
      </el-col>
      <el-col :xs="24" :xl="12">
        <el-card shadow="hover">
          <template #header>
            <div class="section-header">
              <span>工单进度</span>
              <el-tag :type="normalizedSummary.overdueOrderCount > 0 ? 'warning' : 'success'" effect="plain">
                逾期 {{ normalizedSummary.overdueOrderCount }}
              </el-tag>
            </div>
          </template>
          <el-table :data="orderProgress" stripe v-loading="loading" empty-text="暂无工单数据">
            <el-table-column prop="orderNo" label="工单编号" min-width="150" />
            <el-table-column prop="productName" label="产品" min-width="150" />
            <el-table-column label="计划数量" width="105" align="right">
              <template #default="{ row }">{{ numberText(row.planQty) }}</template>
            </el-table-column>
            <el-table-column label="完成数量" width="105" align="right">
              <template #default="{ row }">{{ numberText(row.completedQty) }}</template>
            </el-table-column>
            <el-table-column label="完成率" width="140">
              <template #default="{ row }">
                <el-progress :percentage="progressPercent(row.completionRate)" :color="progressColor(row.completionRate)" />
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="hover">
      <template #header>
        <div class="section-header">
          <span>不良类型排行</span>
          <el-tag type="info" effect="plain">{{ topDefects.length }} 类</el-tag>
        </div>
      </template>
      <el-table :data="topDefects" stripe v-loading="loading" empty-text="暂无不良数据">
        <el-table-column prop="defectType" label="不良类型" min-width="160" />
        <el-table-column label="不良数量" width="140" align="right">
          <template #default="{ row }">{{ numberText(row.qty) }}</template>
        </el-table-column>
        <el-table-column label="占比" min-width="180">
          <template #default="{ row }">
            <el-progress :percentage="defectPercent(row.qty)" :color="defectPercent(row.qty) > 50 ? '#f56c6c' : '#e6a23c'" />
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import * as echarts from 'echarts'
import {
  Calendar,
  Refresh,
  Search,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import MetricStrip from '@/components/MetricStrip.vue'
import PageHeader from '@/components/PageHeader.vue'
import { getProductionBoard } from '@/api/dashboard'
import {
  createFinanceStatementScope,
  getFinanceStatementMonthKey,
  validateFinanceStatementRange,
} from '@/utils/finance-statement'
import {
  buildProductionBoardCards,
  buildProductionBoardRiskItems,
  buildProductionMachineChartRows,
  buildProductionShiftChartRows,
  clampProductionPercent,
  getProductionStatusTagType,
  getProductionStatusText,
  normalizeProductionBoardSummary,
  productionRatioPercent,
  type ProductionBoardRiskItem,
  type ProductionBoardSummary,
} from '@/utils/production-board'

const loading = ref(false)
const months = ref(3)
const monthRange = ref<string[]>([])
const errorMessage = ref('')
const summary = ref<ProductionBoardSummary>({ machineStatuses: [], orderProgresses: [], shiftOutputs: [], topDefects: [] })
const shiftChartRef = ref<HTMLElement>()
const machineChartRef = ref<HTMLElement>()
let shiftChart: echarts.ECharts | null = null
let machineChart: echarts.ECharts | null = null

const normalizedSummary = computed(() => normalizeProductionBoardSummary(summary.value))
const statCards = computed(() => buildProductionBoardCards(summary.value))
const riskItems = computed(() => buildProductionBoardRiskItems(summary.value))
const machineStatus = computed(() => normalizedSummary.value.machineStatuses)
const orderProgress = computed(() => normalizedSummary.value.orderProgresses)
const topDefects = computed(() => normalizedSummary.value.topDefects)
const scopeText = computed(() => {
  if (normalizedSummary.value.startDate && normalizedSummary.value.endDate) {
    return `${normalizedSummary.value.startDate} 至 ${normalizedSummary.value.endDate}`
  }
  if (monthRange.value?.length === 2) return `${monthRange.value[0]} 至 ${monthRange.value[1]}`
  return `近 ${months.value} 个月`
})

function failureText(error: any, fallback: string) {
  return error?.message || error?.data?.message || fallback
}

function numberText(value: any) {
  return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function percentText(value: any) {
  return `${Number(value || 0).toFixed(1)}%`
}

function riskAlertType(level: ProductionBoardRiskItem['level']) {
  if (level === 'error') return 'error'
  if (level === 'warning') return 'warning'
  return 'info'
}

function statusText(value?: string | null) {
  return getProductionStatusText(value)
}

function statusTagType(value?: string | null) {
  return getProductionStatusTagType(value)
}

function progressPercent(value: any) {
  return clampProductionPercent(value)
}

function progressColor(value: any) {
  const percent = Number(value || 0)
  if (percent >= 95) return '#67c23a'
  if (percent >= 80) return '#409eff'
  return '#e6a23c'
}

function defectPercent(value: any) {
  return clampProductionPercent(productionRatioPercent(value, normalizedSummary.value.defectQty))
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
  if (shiftChartRef.value && !shiftChart) shiftChart = echarts.init(shiftChartRef.value)
  if (machineChartRef.value && !machineChart) machineChart = echarts.init(machineChartRef.value)
}

function renderCharts() {
  const shiftRows = buildProductionShiftChartRows(summary.value)
  const machineRows = buildProductionMachineChartRows(summary.value)
  const hasShiftRows = shiftRows.length > 0
  const hasMachineRows = machineRows.length > 0

  shiftChart?.setOption({
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { top: 28, left: 52, right: 42, bottom: 56 },
    xAxis: { type: 'category', data: hasShiftRows ? shiftRows.map((item) => item.label) : ['暂无数据'] },
    yAxis: [
      { type: 'value', name: '数量' },
      { type: 'value', name: '不良率(%)', min: 0, max: 100 },
    ],
    series: [
      {
        name: '良品数量',
        type: 'bar',
        data: hasShiftRows ? shiftRows.map((item) => item.goodQty) : [0],
        itemStyle: { color: '#67c23a' },
        barMaxWidth: 36,
      },
      {
        name: '不良数量',
        type: 'bar',
        data: hasShiftRows ? shiftRows.map((item) => item.badQty) : [0],
        itemStyle: { color: '#f56c6c' },
        barMaxWidth: 36,
      },
      {
        name: '不良率',
        type: 'line',
        yAxisIndex: 1,
        data: hasShiftRows ? shiftRows.map((item) => item.badRate) : [0],
        smooth: true,
        itemStyle: { color: '#e6a23c' },
      },
    ],
  })

  machineChart?.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    title: hasMachineRows ? undefined : { text: '暂无机台数据', left: 'center', top: '42%', textStyle: { color: '#909399', fontSize: 14 } },
    series: [
      {
        type: 'pie',
        radius: ['38%', '66%'],
        center: ['50%', '45%'],
        data: hasMachineRows
          ? machineRows.map((item) => ({ name: item.label, value: item.value, itemStyle: { color: chartColor(item.tone) } }))
          : [{ name: '暂无数据', value: 0, itemStyle: { color: '#dcdfe6' } }],
      },
    ],
  })
}

function handleResize() {
  shiftChart?.resize()
  machineChart?.resize()
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
    summary.value = { machineStatuses: [], orderProgresses: [], shiftOutputs: [], topDefects: [] }
    errorMessage.value = rangeError
    ElMessage.warning(rangeError)
    await nextTick()
    initCharts()
    renderCharts()
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    const res: any = await getProductionBoard(params)
    summary.value = { machineStatuses: [], orderProgresses: [], shiftOutputs: [], topDefects: [], ...(res.data || {}) }
  } catch (error: any) {
    summary.value = { machineStatuses: [], orderProgresses: [], shiftOutputs: [], topDefects: [] }
    errorMessage.value = failureText(error, '生产看板加载失败，请检查 Supabase 连接、生产报工、质检记录与表结构迁移。')
    ElMessage.error(errorMessage.value)
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
  shiftChart?.dispose()
  machineChart?.dispose()
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

.chart-row,
.table-row {
  margin-bottom: 16px;
}

.chart-row :deep(.el-card),
.table-row :deep(.el-card) {
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

@media (max-width: 768px) {
  .dashboard-filter {
    padding: 12px 12px 0;
  }

}
</style>
