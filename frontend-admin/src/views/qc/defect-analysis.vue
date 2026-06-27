<template>
  <div class="page-container">
    <PageHeader title="不良分析" />

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="日期范围">
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
    </SearchBar>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header><span>不良类型分布</span></template>
          <div ref="defectTypeChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header><span>不良趋势</span></template>
          <div ref="defectTrendChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="hover" style="margin-top: 20px">
      <template #header><span>不良明细</span></template>
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="productName" label="产品" width="150" />
        <el-table-column prop="defectType" label="不良类型" width="120" />
        <el-table-column prop="defectQty" label="不良数量" width="100" />
        <el-table-column prop="inspectQty" label="检验数量" width="100" />
        <el-table-column prop="defectRate" label="不良率" width="100">
          <template #default="{ row }">
            <span :style="{ color: row.defectRate > 5 ? '#f56c6c' : '#67c23a' }">{{ row.defectRate }}%</span>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="原因分析" min-width="200" show-overflow-tooltip />
        <el-table-column prop="date" label="日期" width="120" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as echarts from 'echarts'
import dayjs from 'dayjs'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getQcRecordList } from '@/api/qcRecord'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchKeyword = ref('')
const searchDate = ref<string[]>([])
const defectTypeChartRef = ref<HTMLElement>()
const defectTrendChartRef = ref<HTMLElement>()
let defectTypeChart: echarts.ECharts | null = null
let defectTrendChart: echarts.ECharts | null = null

type QcRecordItem = {
  productName?: string
  defectType?: string
  defectQty?: number
  sampleQty?: number
  defectDesc?: string
  remark?: string
  createdAt?: string
}

function initCharts() {
  if (defectTypeChartRef.value && !defectTypeChart) {
    defectTypeChart = echarts.init(defectTypeChartRef.value)
  }
  if (defectTrendChartRef.value && !defectTrendChart) {
    defectTrendChart = echarts.init(defectTrendChartRef.value)
  }
}

function buildCharts(records: QcRecordItem[]) {
  const typeMap = new Map<string, number>()
  const dayMap = new Map<string, { inspectQty: number; defectQty: number }>()

  for (const item of records) {
    const defectType = item.defectType || '未分类'
    const defectQty = item.defectQty ?? 0
    const inspectQty = item.sampleQty ?? 0
    const day = item.createdAt ? dayjs(item.createdAt).format('YYYY-MM-DD') : '未知'

    typeMap.set(defectType, (typeMap.get(defectType) || 0) + defectQty)

    const current = dayMap.get(day) || { inspectQty: 0, defectQty: 0 }
    current.inspectQty += inspectQty
    current.defectQty += defectQty
    dayMap.set(day, current)
  }

  const typeSeries = Array.from(typeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }))

  const trendEntries = Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b))
  const trendLabels = trendEntries.map(([day]) => day)
  const defectRates = trendEntries.map(([, value]) => {
    if (value.inspectQty <= 0) return 0
    return Number(((value.defectQty / value.inspectQty) * 100).toFixed(2))
  })

  defectTypeChart?.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [
      {
        name: '不良类型',
        type: 'pie',
        radius: ['35%', '65%'],
        data: typeSeries,
      },
    ],
  })

  defectTrendChart?.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: trendLabels },
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
}

async function fetchData() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page: 1,
      pageSize: 1000,
      keyword: searchKeyword.value || undefined,
      checkResult: 'FAIL',
    }
    if (searchDate.value.length === 2) {
      params.startDate = searchDate.value[0]
      params.endDate = searchDate.value[1]
    }

    const res: any = await getQcRecordList(params)
    const records: QcRecordItem[] = res.data?.records || res.data?.list || []
    tableData.value = records.map((item) => ({
      productName: item.productName || '-',
      defectType: item.defectType || '-',
      defectQty: item.defectQty ?? 0,
      inspectQty: item.sampleQty ?? 0,
      defectRate: item.sampleQty ? Number((((item.defectQty ?? 0) / item.sampleQty) * 100).toFixed(2)) : 0,
      reason: item.defectDesc || item.remark || '-',
      date: item.createdAt ? dayjs(item.createdAt).format('YYYY-MM-DD') : '-',
    }))
    buildCharts(records)
  } catch {
    tableData.value = []
    buildCharts([])
  } finally {
    loading.value = false
  }
}

function handleResize() {
  defectTypeChart?.resize()
  defectTrendChart?.resize()
}

function handleSearch(formData: { keyword: string }) {
  searchKeyword.value = formData.keyword || ''
  fetchData()
}

function handleReset() {
  searchKeyword.value = ''
  searchDate.value = []
  fetchData()
}

onMounted(async () => {
  initCharts()
  window.addEventListener('resize', handleResize)
  await fetchData()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  defectTypeChart?.dispose()
  defectTrendChart?.dispose()
})
</script>

<style scoped lang="scss">
.chart-container {
  height: 320px;
}
</style>
