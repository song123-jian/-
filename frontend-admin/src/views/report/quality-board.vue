<template>
  <div class="page-container">
    <PageHeader title="品质看板" />

    <!-- 品质指标 -->
    <el-row :gutter="20" class="stat-row">
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

    <!-- 图表 -->
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header><span>不良率趋势</span></template>
          <div ref="defectRateChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header><span>不良类型分布</span></template>
          <div ref="defectTypeChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 品质明细 -->
    <el-card shadow="hover" style="margin-top: 20px">
      <template #header><span>各产品品质情况</span></template>
      <el-table :data="qualityData" stripe>
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
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import PageHeader from '@/components/PageHeader.vue'

const statCards = ref([
  { title: '整体合格率', value: '96.5%', icon: 'CircleCheck', color: '#67c23a' },
  { title: '今日检验数', value: '8,520', icon: 'DocumentChecked', color: '#409eff' },
  { title: '今日不良数', value: '298', icon: 'WarningFilled', color: '#f56c6c' },
  { title: '待处理异常', value: '3', icon: 'Bell', color: '#e6a23c' },
])

const qualityData = ref([
  { productName: '产品A', inspectQty: 2500, passQty: 2420, defectQty: 80, passRate: 96.8, defectRate: 3.2 },
  { productName: '产品B', inspectQty: 1800, passQty: 1750, defectQty: 50, passRate: 97.2, defectRate: 2.8 },
  { productName: '产品C', inspectQty: 1200, passQty: 1130, defectQty: 70, passRate: 94.2, defectRate: 5.8 },
  { productName: '产品D', inspectQty: 3020, passQty: 2920, defectQty: 100, passRate: 96.7, defectRate: 3.3 },
])

const defectRateChartRef = ref<HTMLElement>()
const defectTypeChartRef = ref<HTMLElement>()
const charts: echarts.ECharts[] = []

function initCharts() {
  if (defectRateChartRef.value) {
    const chart = echarts.init(defectRateChartRef.value)
    chart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: ['1月', '2月', '3月', '4月', '5月', '6月'] },
      yAxis: { type: 'value', name: '不良率(%)' },
      series: [{ name: '不良率', type: 'line', data: [3.5, 2.8, 4.2, 3.1, 2.9, 3.5], smooth: true, areaStyle: { opacity: 0.3 }, itemStyle: { color: '#f56c6c' } }],
    })
    charts.push(chart)
  }

  if (defectTypeChartRef.value) {
    const chart = echarts.init(defectTypeChartRef.value)
    chart.setOption({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [{
        type: 'pie', radius: ['35%', '65%'],
        data: [
          { value: 35, name: '缩水' },
          { value: 25, name: '缺胶' },
          { value: 20, name: '毛边' },
          { value: 12, name: '气纹' },
          { value: 8, name: '色差' },
        ],
      }],
    })
    charts.push(chart)
  }
}

function handleResize() { charts.forEach(c => c.resize()) }

onMounted(() => { initCharts(); window.addEventListener('resize', handleResize) })
onUnmounted(() => { window.removeEventListener('resize', handleResize); charts.forEach(c => c.dispose()) })
</script>

<style scoped lang="scss">
.stat-row { margin-bottom: 20px; }
.stat-card {
  .stat-card-content { display: flex; align-items: center; justify-content: space-between; }
  .stat-info {
    .stat-title { font-size: 14px; color: #909399; margin-bottom: 8px; }
    .stat-value { font-size: 28px; font-weight: bold; color: #303133; }
  }
}
.chart-container { height: 320px; }
</style>
