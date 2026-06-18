<template>
  <div class="dashboard-container">
    <PageHeader title="工作台" />

    <!-- 统计卡片 -->
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

    <!-- 图表区域 -->
    <el-row :gutter="20" class="chart-row">
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <span>近7日产量趋势</span>
          </template>
          <div ref="productionChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <span>订单状态分布</span>
          </template>
          <div ref="orderChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 待办事项 -->
    <el-card shadow="hover" class="todo-card">
      <template #header>
        <span>待办事项</span>
      </template>
      <el-table :data="todoList" stripe>
        <el-table-column prop="type" label="类型" width="120" />
        <el-table-column prop="content" label="内容" />
        <el-table-column prop="time" label="时间" width="180" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === '紧急' ? 'danger' : 'warning'">{{ row.status }}</el-tag>
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

// 统计卡片数据
const statCards = ref([
  { title: '今日产量', value: '12,580', icon: 'Goods', color: '#409eff' },
  { title: '待处理订单', value: '28', icon: 'Document', color: '#e6a23c' },
  { title: '在线机台', value: '15/20', icon: 'Monitor', color: '#67c23a' },
  { title: '本月回款', value: '¥580,000', icon: 'Money', color: '#f56c6c' },
])

// 待办事项
const todoList = ref([
  { type: '生产', content: '工单 #20240301-001 待下发', time: '2024-03-01 09:00', status: '紧急' },
  { type: '品质', content: '批次 QC20240301 质检待审核', time: '2024-03-01 10:30', status: '一般' },
  { type: '仓库', content: '原材料库存不足预警', time: '2024-03-01 11:00', status: '紧急' },
  { type: '销售', content: '客户 A 追加订单待确认', time: '2024-03-01 14:00', status: '一般' },
])

// 图表引用
const productionChartRef = ref<HTMLElement>()
const orderChartRef = ref<HTMLElement>()
let productionChart: echarts.ECharts | null = null
let orderChart: echarts.ECharts | null = null

// 初始化图表
function initCharts() {
  // 产量趋势图
  if (productionChartRef.value) {
    productionChart = echarts.init(productionChartRef.value)
    productionChart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
      },
      yAxis: { type: 'value', name: '产量（件）' },
      series: [
        {
          name: '产量',
          type: 'line',
          data: [1200, 1800, 1500, 2100, 1900, 800, 600],
          smooth: true,
          areaStyle: { opacity: 0.3 },
          itemStyle: { color: '#409eff' },
        },
      ],
    })
  }

  // 订单状态分布图
  if (orderChartRef.value) {
    orderChart = echarts.init(orderChartRef.value)
    orderChart.setOption({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [
        {
          name: '订单状态',
          type: 'pie',
          radius: ['40%', '70%'],
          data: [
            { value: 35, name: '待确认' },
            { value: 20, name: '生产中' },
            { value: 15, name: '待发货' },
            { value: 25, name: '已完成' },
            { value: 5, name: '已取消' },
          ],
        },
      ],
    })
  }
}

// 窗口大小变化时重新调整图表
function handleResize() {
  productionChart?.resize()
  orderChart?.resize()
}

onMounted(() => {
  initCharts()
  window.addEventListener('resize', handleResize)
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
