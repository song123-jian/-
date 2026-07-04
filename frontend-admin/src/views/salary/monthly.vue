<template>
  <div class="page-container">
    <PageHeader title="月工资汇总">
      <el-button type="success" :loading="settling" :disabled="loading" @click="handleSettle">
        <el-icon><Check /></el-icon>月度结算
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="月份">
        <el-date-picker v-model="searchMonth" type="month" placeholder="选择月份" value-format="YYYY-MM" />
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table
        :data="tableData"
        stripe
        v-loading="loading"
        show-summary
        :summary-method="salarySummaryMethod"
        empty-text="暂无月工资数据"
      >
        <el-table-column prop="workerName" label="员工" fixed min-width="120" />
        <el-table-column prop="month" label="月份" width="105" />
        <el-table-column prop="workDays" label="出勤天数" width="100" align="right" />
        <el-table-column prop="settledDays" label="已结天数" width="100" align="right" />
        <el-table-column prop="pendingDays" label="未结天数" width="100" align="right" />
        <el-table-column prop="pieceAmount" label="计件工资" min-width="120" align="right">
          <template #default="{ row }">¥{{ moneyText(row.pieceAmount) }}</template>
        </el-table-column>
        <el-table-column prop="baseSalary" label="底薪" min-width="100" align="right">
          <template #default="{ row }">¥{{ moneyText(row.baseSalary) }}</template>
        </el-table-column>
        <el-table-column prop="bonus" label="奖励" min-width="100" align="right">
          <template #default="{ row }">¥{{ moneyText(row.bonus) }}</template>
        </el-table-column>
        <el-table-column prop="penalty" label="扣款" min-width="100" align="right">
          <template #default="{ row }">¥{{ moneyText(row.penalty) }}</template>
        </el-table-column>
        <el-table-column prop="adjustAmount" label="调整合计" min-width="120" align="right">
          <template #default="{ row }">
            <span :class="{ negative: Number(row.adjustAmount || 0) < 0 }">¥{{ moneyText(row.adjustAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="payableAmount" label="应发合计" min-width="130" align="right">
          <template #default="{ row }">¥{{ moneyText(row.payableAmount ?? row.totalAmount) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" fixed="right" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'SETTLED' ? 'success' : 'warning'" effect="plain">
              {{ row.status === 'SETTLED' ? '已结算' : '待结算' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="pagination.page" v-model:page-size="pagination.pageSize"
        :total="pagination.total" :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper" class="pagination"
        @size-change="fetchData" @current-change="fetchData"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getMonthlySalaryList, settleMonthlySalary } from '@/api/salary'
import { formatMoney } from '@/utils'

const loading = ref(false)
const settling = ref(false)
const tableData = ref<any[]>([])
const searchMonth = ref(currentMonth())
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function moneyText(value: unknown) {
  return formatMoney(Number(value || 0))
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getMonthlySalaryList({ page: pagination.page, pageSize: pagination.pageSize, month: searchMonth.value })
    tableData.value = res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch { /* */ } finally { loading.value = false }
}

function handleSearch() { pagination.page = 1; fetchData() }
function handleReset() { searchMonth.value = currentMonth(); pagination.page = 1; fetchData() }

function salarySummaryMethod({ columns, data }: { columns: any[]; data: any[] }) {
  const amountProps = new Set(['pieceAmount', 'baseSalary', 'bonus', 'penalty', 'adjustAmount', 'payableAmount'])
  return columns.map((column, index) => {
    if (index === 0) return '合计'
    const property = column.property
    if (['workDays', 'settledDays', 'pendingDays'].includes(property)) {
      return data.reduce((sum, item) => sum + Number(item[property] || 0), 0)
    }
    if (amountProps.has(property)) {
      return `¥${moneyText(data.reduce((sum, item) => sum + Number(item[property] || 0), 0))}`
    }
    return ''
  })
}

async function handleSettle() {
  const month = searchMonth.value || currentMonth()
  await ElMessageBox.confirm(`确定结算 ${month} 的工资明细？结算后将锁定该月日工资与奖惩记录。`, '月度工资结算', { type: 'warning' })
  settling.value = true
  try {
    const res: any = await settleMonthlySalary({ month })
    const result = res.data || {}
    ElMessage.success(`结算成功：${result.workerCount || 0} 人，${result.settledCount || 0} 条明细，合计 ¥${moneyText(result.totalAmount)}`)
    fetchData()
  } catch { /* */ } finally { settling.value = false }
}

onMounted(() => { fetchData() })
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
.negative { color: var(--el-color-danger); }
</style>
