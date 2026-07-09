<template>
  <div class="page-container">
    <PageHeader title="奖惩管理">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增奖惩
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="员工">
        <el-select v-model="searchWorkerId" filterable placeholder="全部" clearable style="width: 180px">
          <el-option v-for="item in userOptions" :key="item.id" :label="userLabel(item)" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="类型">
        <el-select v-model="searchType" placeholder="全部" clearable style="width: 120px">
          <el-option label="奖励" value="bonus" />
          <el-option label="扣款" value="penalty" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="searchStatus" placeholder="全部" clearable style="width: 120px">
          <el-option label="待结算" value="DRAFT" />
          <el-option label="已结算" value="SETTLED" />
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

    <MetricStrip :items="adjustAuditCards" testid="salary-adjust-audit" />

    <el-card shadow="hover">
      <el-table
        :data="tableData"
        stripe
        v-loading="loading"
        show-summary
        :summary-method="adjustSummaryMethod"
        empty-text="暂无奖惩记录"
      >
        <el-table-column prop="id" label="编号" width="80" />
        <el-table-column prop="workerName" label="员工" min-width="120" />
        <el-table-column prop="type" label="类型" width="95" align="center">
          <template #default="{ row }">
            <el-tag :type="row.type === 'bonus' ? 'success' : 'danger'">
              {{ getSalaryAdjustTypeText(row.type || row.adjustType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="amount" label="金额" min-width="110" align="right">
          <template #default="{ row }">
            <span :class="row.type === 'bonus' ? 'amount-positive' : 'amount-negative'">
              {{ row.type === 'bonus' ? '+' : '-' }}¥{{ moneyText(row.amount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="date" label="奖惩日期" width="120" />
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="isSalaryAdjustSettled(row.status) ? 'success' : 'warning'" effect="plain">
              {{ getSalaryAdjustStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="confirmedAt" label="结算时间" width="170">
          <template #default="{ row }">{{ row.confirmedAt ? formatDateTime(row.confirmedAt) : '-' }}</template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" min-width="220" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="创建时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="150" align="center">
          <template #default="{ row }">
            <el-button type="primary" link :disabled="isSalaryAdjustSettled(row.status)" @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link :disabled="isSalaryAdjustSettled(row.status)" @click="handleDelete(row)">删除</el-button>
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="560px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="80px">
        <el-form-item label="员工" prop="workerId">
          <el-select v-model="form.workerId" filterable placeholder="请选择员工" style="width: 100%">
            <el-option v-for="item in userOptions" :key="item.id" :label="userLabel(item)" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="form.type" placeholder="请选择">
            <el-option label="奖励" value="bonus" />
            <el-option label="扣款" value="penalty" />
          </el-select>
        </el-form-item>
        <el-form-item label="金额" prop="amount">
          <el-input-number v-model="form.amount" :min="0.01" :precision="2" :step="10" style="width: 180px" />
        </el-form-item>
        <el-form-item label="日期" prop="date">
          <el-date-picker v-model="form.date" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="原因" prop="reason">
          <el-input v-model="form.reason" type="textarea" placeholder="请输入原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onMounted } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import MetricStrip from '@/components/MetricStrip.vue'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { formatDateTime, formatMoney } from '@/utils'
import { getUserList } from '@/api/user'
import { getSalaryAdjustList, createSalaryAdjust, updateSalaryAdjust, deleteSalaryAdjust } from '@/api/salary'
import {
  getSalaryAdjustStatusText,
  getSalaryAdjustTypeText,
  isSalaryAdjustSettled,
  validateSalaryAdjustInput,
} from '@/utils/salary-monthly'
import { buildSalaryAdjustAuditCards } from '@/utils/salary-audit'

type OptionItem = { id: number; realName?: string; username?: string }

const loading = ref(false)
const submitting = ref(false)
const tableData = ref<any[]>([])
const userOptions = ref<OptionItem[]>([])
const searchWorkerId = ref<number | null>(null)
const searchType = ref('')
const searchStatus = ref('')
const searchDate = ref<string[]>(currentMonthRange())
const dialogVisible = ref(false)
const dialogTitle = ref('新增奖惩')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({
  id: 0,
  workerId: null as number | null,
  type: 'bonus',
  amount: 0,
  date: '',
  reason: '',
  status: 'DRAFT',
})
const adjustAuditCards = computed(() => buildSalaryAdjustAuditCards(tableData.value))
const formRules: FormRules = {
  workerId: [{ required: true, message: '请选择员工', trigger: 'change' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  amount: [
    { required: true, message: '请输入金额', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        Number(value) > 0 ? callback() : callback(new Error('奖惩金额必须大于 0'))
      },
      trigger: 'blur',
    },
  ],
  date: [{ required: true, message: '请选择日期', trigger: 'change' }],
  reason: [
    { required: true, message: '请输入原因', trigger: 'blur' },
    { max: 500, message: '原因不能超过 500 个字符', trigger: 'blur' },
  ],
}

function todayDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
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
      page: pagination.page,
      pageSize: pagination.pageSize,
      workerId: searchWorkerId.value || undefined,
      type: searchType.value || undefined,
      status: searchStatus.value || undefined,
    }
    if (searchDate.value.length === 2) {
      params.startDate = searchDate.value[0]
      params.endDate = searchDate.value[1]
    }
    const res: any = await getSalaryAdjustList(params)
    tableData.value = res.data?.list || res.data?.records || []
    pagination.total = res.data?.total || 0
  } catch {
    tableData.value = []
    pagination.total = 0
  } finally { loading.value = false }
}

function handleSearch() { pagination.page = 1; fetchData() }
function handleReset() {
  searchWorkerId.value = null
  searchType.value = ''
  searchStatus.value = ''
  searchDate.value = currentMonthRange()
  pagination.page = 1
  fetchData()
}

function adjustSummaryMethod({ columns, data }: { columns: any[]; data: any[] }) {
  const bonusAmount = data.reduce((sum, item) => sum + (item.type === 'bonus' ? Number(item.amount || 0) : 0), 0)
  const penaltyAmount = data.reduce((sum, item) => sum + (item.type === 'penalty' ? Number(item.amount || 0) : 0), 0)
  return columns.map((column, index) => {
    if (index === 0) return '合计'
    if (column.property === 'amount') return `净额 ¥${moneyText(bonusAmount - penaltyAmount)}`
    return ''
  })
}
function handleAdd() {
  dialogTitle.value = '新增奖惩'
  Object.assign(form, { id: 0, workerId: null, type: 'bonus', amount: 0, date: todayDate(), reason: '', status: 'DRAFT' })
  dialogVisible.value = true
  formRef.value?.clearValidate()
}
function handleEdit(row: any) {
  if (isSalaryAdjustSettled(row.status)) {
    ElMessage.warning('已结算奖惩不可编辑')
    return
  }
  dialogTitle.value = '编辑奖惩'
  Object.assign(form, {
    id: row.id,
    workerId: Number(row.workerId || row.userId || 0) || null,
    type: row.type || (row.adjustType === 'PENALTY' ? 'penalty' : 'bonus'),
    amount: Number(row.amount || 0),
    date: row.date || row.adjustDate || '',
    reason: row.reason || '',
    status: row.status || 'DRAFT',
  })
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  const inputError = validateSalaryAdjustInput(form)
  if (inputError) {
    ElMessage.warning(inputError)
    return
  }
  submitting.value = true
  try {
    if (form.id) { await updateSalaryAdjust(form.id, form); ElMessage.success('更新成功') }
    else { await createSalaryAdjust(form); ElMessage.success('创建成功') }
    dialogVisible.value = false; fetchData()
  } catch {
    // 全局请求拦截器已提示
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: any) {
  if (isSalaryAdjustSettled(row.status)) {
    ElMessage.warning('已结算奖惩不可删除')
    return
  }
  try {
    await ElMessageBox.confirm(`确定删除 ${row.workerName || ''} 的${getSalaryAdjustTypeText(row.type)}记录？`, '删除奖惩记录', { type: 'warning' })
    await deleteSalaryAdjust(row.id)
    ElMessage.success('删除成功')
    fetchData()
  } catch {
    // 用户取消或全局请求拦截器已提示
  }
}

onMounted(async () => {
  await loadOptions()
  fetchData()
})
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
.amount-positive { color: var(--el-color-success); font-weight: 600; }
.amount-negative { color: var(--el-color-danger); font-weight: 600; }
</style>
