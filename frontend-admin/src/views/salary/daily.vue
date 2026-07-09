<template>
  <div class="page-container">
    <PageHeader title="日工资" />

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="员工">
        <el-select v-model="searchWorkerId" filterable placeholder="全部" clearable style="width: 180px">
          <el-option v-for="item in userOptions" :key="item.id" :label="userLabel(item)" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="searchStatus" placeholder="全部" clearable style="width: 120px">
          <el-option label="待结算" value="DRAFT" />
          <el-option label="已结算" value="SETTLED" />
        </el-select>
      </el-form-item>
      <el-form-item label="异常">
        <el-select v-model="searchAuditType" placeholder="全部" clearable style="width: 150px">
          <el-option label="只看缺单价" value="MISSING_PRICE" />
          <el-option label="只看异常金额" value="ZERO_AMOUNT_WITH_QTY" />
          <el-option label="只看阻断项" value="BLOCKING" />
        </el-select>
      </el-form-item>
      <el-form-item label="日期范围">
        <el-date-picker
          v-model="searchDate"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 260px"
        />
      </el-form-item>
    </SearchBar>

    <MetricStrip :items="dailyAuditCards" testid="salary-daily-audit" />

    <el-card shadow="hover">
      <el-table
        :data="filteredTableData"
        stripe
        v-loading="loading"
        show-summary
        :summary-method="salarySummaryMethod"
        empty-text="暂无日工资数据"
      >
        <el-table-column prop="id" label="报工编号" width="95" />
        <el-table-column prop="workerName" label="员工" fixed min-width="120" show-overflow-tooltip />
        <el-table-column prop="workDate" label="归属日期" width="115" />
        <el-table-column prop="productName" label="产品" min-width="150" show-overflow-tooltip />
        <el-table-column prop="processName" label="工序" min-width="120" show-overflow-tooltip />
        <el-table-column prop="qty" label="产量" width="90" align="right" />
        <el-table-column prop="badQty" label="不良" width="90" align="right" />
        <el-table-column prop="quantity" label="合格数" width="95" align="right" />
        <el-table-column prop="unitPrice" label="单价" width="105" align="right">
          <template #default="{ row }">
            <el-tag v-if="row.priceMissing" type="danger" effect="plain">缺单价</el-tag>
            <span v-else>¥{{ moneyText(row.unitPrice) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="amount" label="计件金额" width="120" align="right">
          <template #default="{ row }">
            <el-tooltip v-if="row.priceMissing" :content="row.priceMessage || '缺少有效计件单价'" placement="top">
              <el-tag type="danger" effect="plain">待处理</el-tag>
            </el-tooltip>
            <el-tooltip v-else-if="rowHasZeroAmount(row)" content="存在合格产量但计件金额为 0 或负数" placement="top">
              <el-tag type="danger" effect="plain">异常金额</el-tag>
            </el-tooltip>
            <span v-else>¥{{ moneyText(row.amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="审计" width="110" align="center">
          <template #default="{ row }">
            <el-tag v-if="rowBlockingCount(row) > 0" type="danger" effect="plain">阻断</el-tag>
            <el-tag v-else-if="rowWarningCount(row) > 0" type="warning" effect="plain">待结</el-tag>
            <el-tag v-else type="success" effect="plain">正常</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="105" align="center">
          <template #default="{ row }">
            <el-tag :type="isSalaryDailySettled(row.status) ? 'success' : 'warning'" effect="plain">
              {{ getSalaryDailyStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="confirmedAt" label="结算时间" width="170">
          <template #default="{ row }">{{ row.confirmedAt ? formatDateTime(row.confirmedAt) : '-' }}</template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @size-change="fetchData"
        @current-change="fetchData"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onMounted } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import MetricStrip from '@/components/MetricStrip.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getDailySalaryList } from '@/api/salary'
import { getUserList } from '@/api/user'
import { formatDateTime, formatMoney } from '@/utils'
import { getSalaryDailyStatusText, isSalaryDailySettled } from '@/utils/salary-monthly'
import { buildDailySalaryAuditCards, buildSalaryAuditIssues } from '@/utils/salary-audit'

type OptionItem = { id: number; realName?: string; username?: string }

const loading = ref(false)
const tableData = ref<any[]>([])
const userOptions = ref<OptionItem[]>([])
const searchWorkerId = ref<number | null>(null)
const searchStatus = ref('')
const searchAuditType = ref('')
const searchDate = ref<string[]>(currentMonthRange())
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const auditFilteredRows = computed(() => filterRowsByAudit(tableData.value))
const filteredTableData = computed(() => {
  if (!searchAuditType.value) return tableData.value
  const start = (pagination.page - 1) * pagination.pageSize
  return auditFilteredRows.value.slice(start, start + pagination.pageSize)
})
const dailyAuditCards = computed(() => buildDailySalaryAuditCards(searchAuditType.value ? auditFilteredRows.value : tableData.value))

function filterRowsByAudit(rows: any[]) {
  if (!searchAuditType.value) return rows
  return rows.filter((row) => {
    const issues = buildSalaryAuditIssues(row, 'daily')
    if (searchAuditType.value === 'BLOCKING') return issues.some((item) => item.level === 'blocking')
    return issues.some((item) => item.type === searchAuditType.value)
  })
}

function currentMonthRange() {
  const now = new Date()
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return [start, end]
}

function userLabel(item: OptionItem) {
  return item.realName || item.username || `用户${item.id}`
}

function moneyText(value: unknown) {
  return formatMoney(Number(value || 0))
}

async function loadOptions() {
  try {
    const res: any = await getUserList({ page: 1, pageSize: 200 })
    userOptions.value = res.data?.records || res.data?.list || []
  } catch {
    userOptions.value = []
  }
}

async function fetchData() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page: searchAuditType.value ? 1 : pagination.page,
      pageSize: searchAuditType.value ? 1000 : pagination.pageSize,
      workerId: searchWorkerId.value || undefined,
      status: searchStatus.value || undefined,
    }
    if (searchDate.value.length === 2) {
      params.startDate = searchDate.value[0]
      params.endDate = searchDate.value[1]
    }
    const res: any = await getDailySalaryList(params)
    const records = res.data?.list || res.data?.records || []
    tableData.value = records
    pagination.total = searchAuditType.value ? filterRowsByAudit(records).length : res.data?.total || 0
  } catch {
    tableData.value = []
    pagination.total = 0
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  pagination.page = 1
  fetchData()
}

function handleReset() {
  searchWorkerId.value = null
  searchStatus.value = ''
  searchAuditType.value = ''
  searchDate.value = currentMonthRange()
  pagination.page = 1
  fetchData()
}

function salarySummaryMethod({ columns, data }: { columns: any[]; data: any[] }) {
  return columns.map((column, index) => {
    if (index === 0) return '合计'
    const property = column.property
    if (['qty', 'badQty', 'quantity'].includes(property)) {
      return data.reduce((sum, item) => sum + Number(item[property] || 0), 0)
    }
    if (['amount'].includes(property)) {
      return `¥${moneyText(data.reduce((sum, item) => sum + Number(item[property] || 0), 0))}`
    }
    return ''
  })
}

function rowAuditIssues(row: Record<string, any>) {
  return buildSalaryAuditIssues(row, 'daily')
}

function rowBlockingCount(row: Record<string, any>) {
  return rowAuditIssues(row).filter((item) => item.level === 'blocking').length
}

function rowWarningCount(row: Record<string, any>) {
  return rowAuditIssues(row).filter((item) => item.level === 'warning').length
}

function rowHasZeroAmount(row: Record<string, any>) {
  return rowAuditIssues(row).some((item) => item.type === 'ZERO_AMOUNT_WITH_QTY')
}

onMounted(async () => {
  await loadOptions()
  fetchData()
})
</script>

<style scoped lang="scss">
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
