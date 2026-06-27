<template>
  <div class="page-container">
    <PageHeader title="品质看板" />

    <el-row :gutter="20" class="stat-row" v-loading="loading">
      <el-col :span="6" v-for="item in statCards" :key="item.title">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-card-content">
            <div class="stat-info">
              <div class="stat-title">{{ item.title }}</div>
              <div class="stat-value">{{ item.value }}</div>
            </div>
            <el-icon :size="48" :style="{ color: item.color }">
              <component :is="item.icon" />
            </el-icon>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card shadow="hover" v-loading="loading">
          <template #header><span>不良率趋势</span></template>
          <div ref="defectRateChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover" v-loading="loading">
          <template #header><span>不良类型分布</span></template>
          <div ref="defectTypeChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="hover" style="margin-top: 20px" v-loading="loading">
      <template #header><span>各产品品质情况</span></template>
      <el-table :data="qualityData" stripe empty-text="暂无品质数据">
        <el-table-column prop="productName" label="产品" width="150" />
        <el-table-column prop="inspectQty" label="检验数量" width="100" />
        <el-table-column prop="passQty" label="合格数量" width="100" />
        <el-table-column prop="defectQty" label="不良数量" width="100" />
        <el-table-column prop="passRate" label="合格率" width="120">
          <template #default="{ row }">
            <el-progress :percentage="row.passRate" :color="row.passRate >= 95 ? '#67c23a' : '#e6a23c'" />
          </template>
        </el-table-column>
        <el-table-column prop="defectRate" label="不良率" width="100">
          <template #default="{ row }">
            <span :style="{ color: row.defectRate > 5 ? '#f56c6c' : '#67c23a' }">{{ row.defectRate }}%</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as echarts from 'echarts'
import dayjs from 'dayjs'
import PageHeader from '@/components/PageHeader.vue'
import { getQualityBoard } from '@/api/dashboard'
import { getQcRecordList } from '@/api/qcRecord'

type DashboardQuality = {
  totalCheckQty?: number
  passQty?: number
  failQty?: number
  passRate?: number
  topDefects?: Array<{ defectType?: string; qty?: number }>
  trendData?: Array<{ date?: string; checkQty?: number; passQty?: number; failQty?: number; passRate?: number }>
}

type QcRecordItem = {
  productName?: string
  defectType?: string
  defectQty?: number
  sampleQty?: number
  checkResult?: string
  createdAt?: string
}

const statCards = ref([
  { title: '整体合格率', value: '0.0%', icon: 'CircleCheck', color: '#67c23a' },
  { title: '当月检验数', value: '0', icon: 'DocumentChecked', color: '#409eff' },
  { title: '当月不良数', value: '0', icon: 'WarningFilled', color: '#f56c6c' },
  { title: '不良记录数', value: '0', icon: 'Bell', color: '#e6a23c' },
])
const loading = ref(false)

const qualityData = ref<any[]>([])
const defectRateChartRef = ref<HTMLElement>()
const defectTypeChartRef = ref<HTMLElement>()
let defectRateChart: echarts.ECharts | null = null
let defectTypeChart: echarts.ECharts | null = null

function initCharts() {
  if (defectRateChartRef.value && !defectRateChart) {
    defectRateChart = echarts.init(defectRateChartRef.value)
  }
  if (defectTypeChartRef.value && !defectTypeChart) {
    defectTypeChart = echarts.init(defectTypeChartRef.value)
  }
}

function buildCharts(summary: DashboardQuality) {
  const trendData = summary.trendData || []
  const defectDates = trendData.map((item) => item.date || '-')
  const defectRates = trendData.map((item) => Number((100 - (item.passRate || 0)).toFixed(2)))

  defectRateChart?.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: defectDates },
    yAxis: { type: 'value', name: '不良率(%)' },
    series: [
      {
        name: '不良率',
        type: 'line',
        data: defectRates,
        smooth: true,
        areaStyle: { opacity: 0.3 },
        itemStyle: { color: '#f56c6c' },
      },
    ],
  })

  const topDefects = (summary.topDefects || []).map((item) => ({
    name: item.defectType || '-',
    value: item.qty || 0,
  }))

  defectTypeChart?.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['35%', '65%'],
        data: topDefects,
      },
    ],
  })
}

function buildProductSummary(records: QcRecordItem[]) {
  const map = new Map<string, { inspectQty: number; passQty: number; defectQty: number }>()

  for (const item of records) {
    const key = item.productName || '未命名产品'
    const inspectQty = item.sampleQty ?? 0
    const defectQty = item.defectQty ?? 0
    const current = map.get(key) || { inspectQty: 0, passQty: 0, defectQty: 0 }
    current.inspectQty += inspectQty
    current.defectQty += defectQty
    current.passQty += Math.max(inspectQty - defectQty, 0)
    map.set(key, current)
  }

  qualityData.value = Array.from(map.entries())
    .map(([productName, value]) => ({
      productName,
      inspectQty: value.inspectQty,
      passQty: value.passQty,
      defectQty: value.defectQty,
      passRate: value.inspectQty > 0 ? Number(((value.passQty / value.inspectQty) * 100).toFixed(1)) : 0,
      defectRate: value.inspectQty > 0 ? Number(((value.defectQty / value.inspectQty) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.defectRate - a.defectRate)
}

async function fetchData() {
  loading.value = true
  try {
    const monthStart = dayjs().startOf('month').format('YYYY-MM-DD')
    const monthEnd = dayjs().endOf('month').format('YYYY-MM-DD')

    const [summaryRes, recordRes] = await Promise.all([
      getQualityBoard(),
      getQcRecordList({ page: 1, pageSize: 1000, startDate: monthStart, endDate: monthEnd }),
    ])

    const summary: DashboardQuality = summaryRes.data || {}
    statCards.value = [
      { title: '整体合格率', value: `${(summary.passRate || 0).toFixed(1)}%`, icon: 'CircleCheck', color: '#67c23a' },
      { title: '当月检验数', value: String(summary.totalCheckQty || 0), icon: 'DocumentChecked', color: '#409eff' },
      { title: '当月不良数', value: String(summary.failQty || 0), icon: 'WarningFilled', color: '#f56c6c' },
      { title: '不良记录数', value: String((summary.topDefects || []).reduce((sum, item) => sum + (item.qty || 0), 0)), icon: 'Bell', color: '#e6a23c' },
    ]

    buildCharts(summary)
    buildProductSummary((recordRes.data?.records || []) as QcRecordItem[])
  } catch {
    buildCharts({})
    buildProductSummary([])
  } finally {
    loading.value = false
  }
}

function handleResize() {
  defectRateChart?.resize()
  defectTypeChart?.resize()
}

onMounted(async () => {
  initCharts()
  window.addEventListener('resize', handleResize)
  await fetchData()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  defectRateChart?.dispose()
  defectTypeChart?.dispose()
})
</script>

<style scoped lang="scss">
.stat-row {
  margin-bottom: 20px;
}

.stat-card {
  .stat-card-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .stat-info {
    .stat-title {
      font-size: 14px;
      color: #909399;
      margin-bottom: 8px;
    }

    .stat-value {
      font-size: 28px;
      font-weight: bold;
      color: #303133;
    }
  }
}

.chart-container {
  height: 320px;
}
</style>
