<template>
  <div class="page-container">
    <PageHeader title="对账单" />

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="月份数">
        <el-input-number v-model="months" :min="1" :max="12" style="width: 140px" />
      </el-form-item>
    </SearchBar>

    <el-row :gutter="16" class="summary-row" v-loading="loading">
      <el-col :span="4" v-for="item in summaryCards" :key="item.label">
        <div class="summary-card">
          <div class="summary-label">{{ item.label }}</div>
          <div class="summary-value">{{ item.value }}</div>
        </div>
      </el-col>
    </el-row>

    <el-card shadow="hover">
      <el-table :data="monthRows" stripe v-loading="loading">
        <el-table-column prop="month" label="月份" width="100" />
        <el-table-column prop="orderAmount" label="订单金额" width="120" />
        <el-table-column prop="paymentAmount" label="回款金额" width="120" />
        <el-table-column prop="expenseTotal" label="费用支出" width="120" />
        <el-table-column prop="salaryTotal" label="工资总额" width="120" />
        <el-table-column prop="materialCost" label="物料成本" width="120" />
        <el-table-column prop="grossProfit" label="毛利" width="120" />
        <el-table-column prop="receivableBalance" label="应收余额" width="120" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getFinanceStatements } from '@/api/finance'

const loading = ref(false)
const months = ref(6)
const summary = ref<any>({})

const summaryCards = computed(() => [
  { label: '订单金额', value: summary.value.monthOrderAmount ?? 0 },
  { label: '回款金额', value: summary.value.monthPaymentAmount ?? 0 },
  { label: '费用支出', value: summary.value.monthExpenseTotal ?? 0 },
  { label: '工资总额', value: summary.value.monthSalaryTotal ?? 0 },
  { label: '物料成本', value: summary.value.monthMaterialCost ?? 0 },
  { label: '毛利', value: summary.value.monthGrossProfit ?? 0 },
])

const monthRows = computed(() => summary.value.monthItems || [])

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getFinanceStatements({ months: months.value })
    summary.value = res.data || {}
  } catch {
    summary.value = {}
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  fetchData()
}

function handleReset() {
  months.value = 6
  fetchData()
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped lang="scss">
.summary-row {
  margin-bottom: 16px;
}

.summary-card {
  padding: 12px 10px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fff;
}

.summary-label {
  font-size: 13px;
  color: #909399;
  margin-bottom: 6px;
}

.summary-value {
  font-size: 22px;
  font-weight: 700;
  color: #303133;
}
</style>
