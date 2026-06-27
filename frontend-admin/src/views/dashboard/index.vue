<template>
  <div class="dashboard-container">
    <PageHeader title="工作台" />

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

    <el-row :gutter="20" class="chart-row">
      <el-col :span="12">
        <el-card shadow="hover" v-loading="loading">
          <template #header>
            <span>近7日产量趋势</span>
          </template>
          <div ref="productionChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover" v-loading="loading">
          <template #header>
            <span>订单状态分布</span>
          </template>
          <div ref="orderChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="hover" class="todo-card" v-loading="loading">
      <template #header>
        <span>待办事项</span>
      </template>
      <el-table :data="todoList" stripe empty-text="暂无待办">
        <el-table-column prop="type" label="类型" width="120" />
        <el-table-column prop="content" label="内容" min-width="300" show-overflow-tooltip />
        <el-table-column prop="time" label="时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.time) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="todoStatusType(row.status)">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as echarts from 'echarts'
import PageHeader from '@/components/PageHeader.vue'
import { getDashboardData } from '@/api/dashboard'
import { formatDateTime } from '@/utils'

type HomeDashboard = {
  todayProductionQty?: number
  pendingOrderQty?: number
  runningMachineQty?: number
  unreadNotificationQty?: number
  productionTrend?: Array<{
    date?: string
    qty?: number
  }>
  orderStatusDistribution?: Array<{
    status?: string
    label?: string
    count?: number
  }>
  todoList?: Array<{
    type?: string
    content?: string
    time?: string
    status?: string
  }>
}

const loading = ref(false)
const statCards = ref([
  { title: '今日产量', value: '0', icon: 'Goods', color: '#409eff' },
  { title: '待处理工单', value: '0', icon: 'Document', color: '#e6a23c' },
  { title: '在线机台', value: '0', icon: 'Monitor', color: '#67c23a' },
  { title: '未读消息', value: '0', icon: 'Bell', color: '#f56c6c' },
])
const todoList = ref<Array<{ type?: string; content?: string; time?: string; status?: string }>>([])

const productionChartRef = ref<HTMLElement>()
const orderChartRef = ref<HTMLElement>()
let productionChart: echarts.ECharts | null = null
let orderChart: echarts.ECharts | null = null

function numberText(value?: number) {
  return Number(value || 0).toLocaleString('zh-CN')
}

function todoStatusType(value?: string) {
  if (value === '紧急') return 'danger'
  if (value === '一般') return 'warning'
  return 'info'
}

function initCharts() {
  if (productionChartRef.value && !productionChart) {
    productionChart = echarts.init(productionChartRef.value)
  }
  if (orderChartRef.value && !orderChart) {
    orderChart = echarts.init(orderChartRef.value)
  }
}

function buildCharts(data: HomeDashboard) {
  const trend = data.productionTrend || []
  const orderDistribution = (data.orderStatusDistribution || []).filter((item) => (item.count || 0) > 0)

  productionChart?.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: trend.map((item) => item.date || '-'),
    },
    yAxis: { type: 'value', name: '产量（件）' },
    series: [
      {
        name: '产量',
        type: 'line',
        data: trend.map((item) => item.qty || 0),
        smooth: true,
        areaStyle: { opacity: 0.22 },
        itemStyle: { color: '#409eff' },
      },
    ],
  })

  orderChart?.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [
      {
        name: '订单状态',
        type: 'pie',
        radius: ['40%', '70%'],
        data: orderDistribution.map((item) => ({
          name: item.label || item.status || '-',
          value: item.count || 0,
        })),
      },
    ],
  })
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getDashboardData()
    const data: HomeDashboard = res.data || {}

    statCards.value = [
      { title: '今日产量', value: numberText(data.todayProductionQty), icon: 'Goods', color: '#409eff' },
      { title: '待处理工单', value: numberText(data.pendingOrderQty), icon: 'Document', color: '#e6a23c' },
      { title: '在线机台', value: numberText(data.runningMachineQty), icon: 'Monitor', color: '#67c23a' },
      { title: '未读消息', value: numberText(data.unreadNotificationQty), icon: 'Bell', color: '#f56c6c' },
    ]

    todoList.value = data.todoList || []
    buildCharts(data)
  } catch {
    todoList.value = []
    buildCharts({})
  } finally {
    loading.value = false
  }
}

function handleResize() {
  productionChart?.resize()
  orderChart?.resize()
}

onMounted(async () => {
  initCharts()
  window.addEventListener('resize', handleResize)
  await fetchData()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  productionChart?.dispose()
  orderChart?.dispose()
})
</script>

<style scoped lang="scss">
.dashboard-container {
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

  .chart-row {
    margin-bottom: 20px;
  }

  .chart-container {
    height: 320px;
  }

  .todo-card {
    margin-bottom: 20px;
  }
}
</style>
