<template>
  <div class="page-container">
    <PageHeader title="老板驾驶舱" />

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
          <template #header><span>经营结构</span></template>
          <div ref="financeChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover" v-loading="loading">
          <template #header><span>设备综合效率</span></template>
          <div ref="oeeChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as echarts from 'echarts'
import PageHeader from '@/components/PageHeader.vue'
import { getBossDashboard } from '@/api/dashboard'

type DashboardBoss = {
  monthOrderAmount?: number
  monthPaymentAmount?: number
  receivableBalance?: number
  paymentRate?: number
  monthCompletedQty?: number
  monthBadRate?: number
  monthSalaryTotal?: number
  monthExpenseTotal?: number
  monthGrossProfit?: number
  oee?: number
}

const statCards = ref([
  { title: '本月营收', value: '¥0', icon: 'Coin', color: '#409eff' },
  { title: '本月毛利', value: '¥0', icon: 'TrendCharts', color: '#67c23a' },
  { title: '应收账款', value: '¥0', icon: 'Money', color: '#e6a23c' },
  { title: '回款率', value: '0.0%', icon: 'Document', color: '#f56c6c' },
])
const loading = ref(false)

const financeChartRef = ref<HTMLElement>()
const oeeChartRef = ref<HTMLElement>()
let financeChart: echarts.ECharts | null = null
let oeeChart: echarts.ECharts | null = null

function moneyText(value?: number) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function initCharts() {
  if (financeChartRef.value && !financeChart) {
    financeChart = echarts.init(financeChartRef.value)
  }
  if (oeeChartRef.value && !oeeChart) {
    oeeChart = echarts.init(oeeChartRef.value)
  }
}

function buildCharts(data: DashboardBoss) {
  financeChart?.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: ['订单金额', '收款金额', '应收余额', '工资总额', '费用总额', '毛利润'],
    },
    yAxis: { type: 'value', name: '金额(元)' },
    series: [
      {
        type: 'bar',
        data: [
          data.monthOrderAmount || 0,
          data.monthPaymentAmount || 0,
          data.receivableBalance || 0,
          data.monthSalaryTotal || 0,
          data.monthExpenseTotal || 0,
          data.monthGrossProfit || 0,
        ],
        itemStyle: { color: '#409eff' },
      },
    ],
  })

  oeeChart?.setOption({
    series: [
      {
        type: 'gauge',
        progress: { show: true, width: 12 },
        axisLine: { lineStyle: { width: 12 } },
        detail: { valueAnimation: true, formatter: '{value}%' },
        data: [{ value: data.oee || 0, name: 'OEE' }],
      },
    ],
  })
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getBossDashboard()
    const data: DashboardBoss = res.data || {}

    statCards.value = [
      { title: '本月营收', value: moneyText(data.monthOrderAmount), icon: 'Coin', color: '#409eff' },
      { title: '本月毛利', value: moneyText(data.monthGrossProfit), icon: 'TrendCharts', color: '#67c23a' },
      { title: '应收账款', value: moneyText(data.receivableBalance), icon: 'Money', color: '#e6a23c' },
      { title: '回款率', value: `${Number(data.paymentRate || 0).toFixed(1)}%`, icon: 'Document', color: '#f56c6c' },
    ]

    buildCharts(data)
  } catch {
    buildCharts({})
  } finally {
    loading.value = false
  }
}

function handleResize() {
  financeChart?.resize()
  oeeChart?.resize()
}

onMounted(async () => {
  initCharts()
  window.addEventListener('resize', handleResize)
  await fetchData()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  financeChart?.dispose()
  oeeChart?.dispose()
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
