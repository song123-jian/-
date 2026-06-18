<template>
  <div class="page-container">
    <PageHeader title="老板驾驶舱" />

    <!-- 核心指标 -->
    <el-row :gutter="20" class="stat-row">
      <el-col :span="6" v-for="item in statCards" :key="item.title">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-card-content">
            <div class="stat-info">
              <div class="stat-title">{{ item.title }}</div>
              <div class="stat-value">{{ item.value }}</div>
              <div class="stat-sub" :style="{ color: item.trend > 0 ? '#67c23a' : '#f56c6c' }">
                {{ item.trend > 0 ? '↑' : '↓' }} {{ Math.abs(item.trend) }}%
              </div>
            </div>
            <el-icon :size="48" :style="{ color: item.color }">
              <component :is="item.icon" />
            </el-icon>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表区域 -->
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header><span>月度营收趋势</span></template>
          <div ref="revenueChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header><span>成本构成</span></template>
          <div ref="costChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header><span>客户回款情况</span></template>
          <div ref="paymentChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header><span>利润趋势</span></template>
          <div ref="profitChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import PageHeader from '@/components/PageHeader.vue'

const statCards = ref([
  { title: '本月营收', value: '¥2,580,000', icon: 'Coin', color: '#409eff', trend: 12.5 },
  { title: '本月利润', value: '¥680,000', icon: 'TrendCharts', color: '#67c23a', trend: 8.3 },
  { title: '应收账款', value: '¥1,250,000', icon: 'Money', color: '#e6a23c', trend: -5.2 },
  { title: '订单数量', value: '156', icon: 'Document', color: '#f56c6c', trend: 15.8 },
])

const revenueChartRef = ref<HTMLElement>()
const costChartRef = ref<HTMLElement>()
const paymentChartRef = ref<HTMLElement>()
const profitChartRef = ref<HTMLElement>()
const charts: echarts.ECharts[] = []

function initCharts() {
  const months = ['1月', '2月', '3月', '4月', '5月', '6月']

  if (revenueChartRef.value) {
    const chart = echarts.init(revenueChartRef.value)
    chart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: months },
      yAxis: { type: 'value', name: '金额(万)' },
      series: [{ name: '营收', type: 'bar', data: [180, 220, 195, 258, 240, 280], itemStyle: { color: '#409eff' } }],
    })
    charts.push(chart)
  }

  if (costChartRef.value) {
    const chart = echarts.init(costChartRef.value)
    chart.setOption({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [{
        type: 'pie', radius: ['35%', '65%'],
        data: [
          { value: 45, name: '原材料' },
          { value: 25, name: '人工' },
          { value: 15, name: '水电' },
          { value: 10, name: '房租' },
          { value: 5, name: '其他' },
        ],
      }],
    })
    charts.push(chart)
  }

  if (paymentChartRef.value) {
    const chart = echarts.init(paymentChartRef.value)
    chart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: months },
      yAxis: { type: 'value', name: '金额(万)' },
      series: [
        { name: '应收', type: 'bar', data: [100, 120, 110, 130, 125, 140] },
        { name: '已收', type: 'bar', data: [85, 100, 95, 110, 105, 120] },
      ],
    })
    charts.push(chart)
  }

  if (profitChartRef.value) {
    const chart = echarts.init(profitChartRef.value)
    chart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: months },
      yAxis: { type: 'value', name: '利润(万)' },
      series: [{ name: '利润', type: 'line', data: [45, 55, 48, 68, 60, 72], smooth: true, areaStyle: { opacity: 0.3 }, itemStyle: { color: '#67c23a' } }],
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
    .stat-sub { font-size: 13px; margin-top: 4px; }
  }
}
.chart-container { height: 320px; }
</style>
