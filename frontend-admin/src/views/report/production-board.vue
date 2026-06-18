<template>
  <div class="page-container">
    <PageHeader title="生产看板" />

    <!-- 产能概览 -->
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
          <template #header><span>日产量趋势</span></template>
          <div ref="productionChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header><span>机台利用率</span></template>
          <div ref="utilizationChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 机台状态 -->
    <el-card shadow="hover" style="margin-top: 20px">
      <template #header><span>机台实时状态</span></template>
      <el-table :data="machineStatus" stripe>
        <el-table-column prop="name" label="机台" width="120" />
        <el-table-column prop="product" label="当前产品" width="150" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'running' ? 'success' : row.status === 'idle' ? 'warning' : 'danger'">
              {{ row.status === 'running' ? '运行中' : row.status === 'idle' ? '空闲' : '维修中' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="todayQty" label="今日产量" width="100" />
        <el-table-column prop="planQty" label="计划产量" width="100" />
        <el-table-column prop="completionRate" label="完成率" width="100">
          <template #default="{ row }">
            <el-progress :percentage="row.completionRate" :color="row.completionRate >= 80 ? '#67c23a' : '#e6a23c'" />
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
  { title: '今日总产量', value: '12,580', icon: 'Goods', color: '#409eff' },
  { title: '运行机台', value: '15/20', icon: 'Monitor', color: '#67c23a' },
  { title: '完成工单', value: '8/12', icon: 'CircleCheck', color: '#e6a23c' },
  { title: '平均利用率', value: '85%', icon: 'Odometer', color: '#f56c6c' },
])

const machineStatus = ref([
  { name: '1号机', product: '产品A', status: 'running', todayQty: 1200, planQty: 1500, completionRate: 80 },
  { name: '2号机', product: '产品B', status: 'running', todayQty: 980, planQty: 1000, completionRate: 98 },
  { name: '3号机', product: '-', status: 'idle', todayQty: 0, planQty: 0, completionRate: 0 },
  { name: '4号机', product: '-', status: 'maintenance', todayQty: 0, planQty: 0, completionRate: 0 },
])

const productionChartRef = ref<HTMLElement>()
const utilizationChartRef = ref<HTMLElement>()
const charts: echarts.ECharts[] = []

function initCharts() {
  if (productionChartRef.value) {
    const chart = echarts.init(productionChartRef.value)
    chart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: ['6/11', '6/12', '6/13', '6/14', '6/15', '6/16', '6/17'] },
      yAxis: { type: 'value', name: '产量(件)' },
      series: [{ name: '产量', type: 'line', data: [11000, 12500, 11800, 13200, 12000, 12800, 12580], smooth: true, areaStyle: { opacity: 0.3 } }],
    })
    charts.push(chart)
  }

  if (utilizationChartRef.value) {
    const chart = echarts.init(utilizationChartRef.value)
    chart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: ['1号', '2号', '3号', '4号', '5号', '6号'] },
      yAxis: { type: 'value', name: '利用率(%)', max: 100 },
      series: [{ name: '利用率', type: 'bar', data: [85, 92, 0, 78, 88, 95], itemStyle: { color: '#409eff' } }],
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
