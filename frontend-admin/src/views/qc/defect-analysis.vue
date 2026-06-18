<template>
  <div class="page-container">
    <PageHeader title="不良分析" />

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="日期范围">
        <el-date-picker v-model="searchDate" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" />
      </el-form-item>
    </SearchBar>

    <!-- 不良类型分布 -->
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

    <!-- 不良明细表 -->
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
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchDate = ref<string[]>([])
const defectTypeChartRef = ref<HTMLElement>()
const defectTrendChartRef = ref<HTMLElement>()
let defectTypeChart: echarts.ECharts | null = null
let defectTrendChart: echarts.ECharts | null = null

function initCharts() {
  if (defectTypeChartRef.value) {
    defectTypeChart = echarts.init(defectTypeChartRef.value)
    defectTypeChart.setOption({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [{
        name: '不良类型',
        type: 'pie',
        radius: ['35%', '65%'],
        data: [
          { value: 35, name: '缩水' },
          { value: 25, name: '缺胶' },
          { value: 20, name: '毛边' },
          { value: 12, name: '气纹' },
          { value: 8, name: '色差' },
        ],
      }],
    })
  }

  if (defectTrendChartRef.value) {
    defectTrendChart = echarts.init(defectTrendChartRef.value)
    defectTrendChart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: ['1月', '2月', '3月', '4月', '5月', '6月'] },
      yAxis: { type: 'value', name: '不良率(%)' },
      series: [{
        name: '不良率',
        type: 'line',
        data: [3.2, 2.8, 4.1, 3.5, 2.9, 3.0],
        smooth: true,
        areaStyle: { opacity: 0.3 },
        itemStyle: { color: '#f56c6c' },
      }],
    })
  }
}

function handleResize() {
  defectTypeChart?.resize()
  defectTrendChart?.resize()
}

function handleSearch() { /* TODO */ }
function handleReset() { searchDate.value = [] }

onMounted(() => {
  initCharts()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  defectTypeChart?.dispose()
  defectTrendChart?.dispose()
})
</script>

<style scoped lang="scss">
.chart-container { height: 320px; }
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
