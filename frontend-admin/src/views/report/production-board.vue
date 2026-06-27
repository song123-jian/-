<template>
  <div class="page-container">
    <PageHeader title="生产看板" />

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
          <template #header><span>班次产量</span></template>
          <div ref="shiftChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover" v-loading="loading">
          <template #header><span>机台状态分布</span></template>
          <div ref="machineChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="12">
        <el-card shadow="hover" v-loading="loading">
          <template #header><span>机台实时状态</span></template>
          <el-table :data="machineStatus" stripe empty-text="暂无机台数据">
            <el-table-column prop="machineName" label="机台" width="120" />
            <el-table-column prop="productName" label="当前产品" width="150" />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status)">
                  {{ statusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="orderNo" label="当前工单" width="150" />
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover" v-loading="loading">
          <template #header><span>工单进度</span></template>
          <el-table :data="orderProgress" stripe empty-text="暂无工单数据">
            <el-table-column prop="orderNo" label="工单编号" width="150" />
            <el-table-column prop="productName" label="产品" width="150" />
            <el-table-column prop="planQty" label="计划数量" width="100" />
            <el-table-column prop="completedQty" label="完成数量" width="100" />
            <el-table-column prop="completionRate" label="完成率" width="120">
              <template #default="{ row }">
                <el-progress :percentage="row.completionRate" :color="row.completionRate >= 80 ? '#67c23a' : '#e6a23c'" />
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as echarts from 'echarts'
import PageHeader from '@/components/PageHeader.vue'
import { getProductionBoard } from '@/api/dashboard'

type MachineStatusItem = {
  machineId?: number
  machineName?: string
  status?: string
  orderNo?: string
  productName?: string
}

type OrderProgressItem = {
  orderId?: number
  orderNo?: string
  productName?: string
  planQty?: number
  completedQty?: number
  completionRate?: number
  status?: string
}

type ShiftOutputItem = {
  shift?: string
  qty?: number
  badQty?: number
}

const statCards = ref([
  { title: '今日总产量', value: '0', icon: 'Goods', color: '#409eff' },
  { title: '运行机台', value: '0', icon: 'Monitor', color: '#67c23a' },
  { title: '工单总数', value: '0', icon: 'CircleCheck', color: '#e6a23c' },
  { title: '平均完成率', value: '0.0%', icon: 'Odometer', color: '#f56c6c' },
])
const loading = ref(false)

const machineStatus = ref<MachineStatusItem[]>([])
const orderProgress = ref<OrderProgressItem[]>([])
const shiftChartRef = ref<HTMLElement>()
const machineChartRef = ref<HTMLElement>()
let shiftChart: echarts.ECharts | null = null
let machineChart: echarts.ECharts | null = null

function statusText(value?: string) {
  const map: Record<string, string> = {
    RUNNING: '运行中',
    IDLE: '空闲',
    MAINTENANCE: '维护中',
    STOPPED: '停机',
  }
  return map[value || ''] || value || '-'
}

function statusTagType(value?: string) {
  if (value === 'RUNNING') return 'success'
  if (value === 'IDLE') return 'warning'
  if (value === 'MAINTENANCE') return 'danger'
  return 'info'
}

function initCharts() {
  if (shiftChartRef.value && !shiftChart) {
    shiftChart = echarts.init(shiftChartRef.value)
  }
  if (machineChartRef.value && !machineChart) {
    machineChart = echarts.init(machineChartRef.value)
  }
}

function buildCharts(shifts: ShiftOutputItem[], machines: MachineStatusItem[]) {
  const shiftLabels = shifts.map((item) => item.shift || '-')
  const shiftQty = shifts.map((item) => item.qty || 0)
  const shiftBadQty = shifts.map((item) => item.badQty || 0)

  shiftChart?.setOption({
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    xAxis: { type: 'category', data: shiftLabels },
    yAxis: { type: 'value', name: '数量' },
    series: [
      { name: '良品数量', type: 'bar', data: shiftQty, itemStyle: { color: '#409eff' } },
      { name: '不良数量', type: 'bar', data: shiftBadQty, itemStyle: { color: '#f56c6c' } },
    ],
  })

  const statusMap = new Map<string, number>()
  for (const item of machines) {
    const key = statusText(item.status)
    statusMap.set(key, (statusMap.get(key) || 0) + 1)
  }

  machineChart?.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['35%', '65%'],
        data: Array.from(statusMap.entries()).map(([name, value]) => ({ name, value })),
      },
    ],
  })
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getProductionBoard()
    const data = res.data || {}
    const machines: MachineStatusItem[] = data.machineStatuses || []
    const orders: OrderProgressItem[] = data.orderProgresses || []
    const shifts: ShiftOutputItem[] = data.shiftOutputs || []

    machineStatus.value = machines
    orderProgress.value = orders

    const totalQty = shifts.reduce((sum, item) => sum + (item.qty || 0), 0)
    const runningMachines = machines.filter((item) => item.status === 'RUNNING').length
    const avgCompletion = orders.length
      ? Number((orders.reduce((sum, item) => sum + (item.completionRate || 0), 0) / orders.length).toFixed(1))
      : 0

    statCards.value = [
      { title: '今日总产量', value: String(totalQty), icon: 'Goods', color: '#409eff' },
      { title: '运行机台', value: String(runningMachines), icon: 'Monitor', color: '#67c23a' },
      { title: '工单总数', value: String(orders.length), icon: 'CircleCheck', color: '#e6a23c' },
      { title: '平均完成率', value: `${avgCompletion}%`, icon: 'Odometer', color: '#f56c6c' },
    ]

    buildCharts(shifts, machines)
  } catch {
    machineStatus.value = []
    orderProgress.value = []
    buildCharts([], [])
  } finally {
    loading.value = false
  }
}

function handleResize() {
  shiftChart?.resize()
  machineChart?.resize()
}

onMounted(async () => {
  initCharts()
  window.addEventListener('resize', handleResize)
  await fetchData()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  shiftChart?.dispose()
  machineChart?.dispose()
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
