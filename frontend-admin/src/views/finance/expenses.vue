<template>
  <div class="page-container">
    <PageHeader title="费用支出">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>
        新增费用
      </el-button>
    </PageHeader>

    <SearchBar :keyword="searchKeyword" @search="handleSearch" @reset="handleReset">
      <el-form-item label="类型">
        <el-select v-model="searchType" placeholder="全部" clearable filterable style="width: 160px">
          <el-option v-for="item in expenseTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="日期">
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

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading" empty-text="暂无费用记录">
        <el-table-column prop="expenseNo" label="费用单号" min-width="170" show-overflow-tooltip />
        <el-table-column prop="expenseType" label="费用类型" width="110">
          <template #default="{ row }">{{ expenseTypeText(row.expenseType) }}</template>
        </el-table-column>
        <el-table-column prop="amount" label="金额" width="130" align="right">
          <template #default="{ row }">{{ moneyText(row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="expenseDate" label="费用日期" width="120" />
        <el-table-column prop="payee" label="收款人" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.payee || '-' }}</template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="创建时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="150">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
          </template>
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="min(640px, 96vw)" class="expense-dialog">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="96px">
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item label="费用类型" prop="expenseType">
              <el-select v-model="form.expenseType" placeholder="请选择" style="width: 100%">
                <el-option v-for="item in expenseTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-form-item label="费用日期" prop="expenseDate">
              <el-date-picker v-model="form.expenseDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item label="金额" prop="amount">
              <el-input-number v-model="form.amount" :min="0.01" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-form-item label="收款人" prop="payee">
              <el-input v-model.trim="form.payee" placeholder="请输入收款人" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注" prop="remark">
          <el-input v-model.trim="form.remark" type="textarea" :rows="3" placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="submitLoading" @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { createExpense, deleteExpense, getExpenseList, updateExpense } from '@/api/expense'
import { formatDate, formatDateTime, formatMoney } from '@/utils'
import {
  FINANCE_EXPENSE_TYPES,
  getFinanceExpenseTypeText,
  isFinanceExpenseType,
  normalizeExpenseDate,
  validateExpenseAmount,
  validateExpenseDate,
  validateExpensePayee,
} from '@/utils/finance-expense'

type ExpenseForm = {
  id: number
  expenseNo: string
  expenseType: string
  amount: number | null
  expenseDate: string
  payee: string
  remark: string
}

const loading = ref(false)
const submitLoading = ref(false)
const tableData = ref<any[]>([])
const searchType = ref('')
const searchKeyword = ref('')
const searchDate = ref<string[]>([])
const dialogVisible = ref(false)
const dialogTitle = ref('新增费用')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive<ExpenseForm>(createFormState())
const expenseTypeOptions = FINANCE_EXPENSE_TYPES

const formRules: FormRules = {
  expenseType: [
    {
      validator: (_rule, value, callback) => {
        if (!isFinanceExpenseType(value)) {
          callback(new Error('请选择正确的费用类型'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
  amount: [
    {
      validator: (_rule, value, callback) => {
        const error = validateExpenseAmount(value)
        if (error) {
          callback(new Error(error))
          return
        }
        callback()
      },
      trigger: ['blur', 'change'],
    },
  ],
  expenseDate: [
    {
      validator: (_rule, value, callback) => {
        const error = validateExpenseDate(value)
        if (error) {
          callback(new Error(error))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
  payee: [
    {
      validator: (_rule, value, callback) => {
        const error = validateExpensePayee(value)
        if (error) {
          callback(new Error(error))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

function createFormState(): ExpenseForm {
  return {
    id: 0,
    expenseNo: '',
    expenseType: '',
    amount: null,
    expenseDate: formatDate(new Date()),
    payee: '',
    remark: '',
  }
}

function moneyText(value: any) {
  return `¥${formatMoney(Number(value || 0))}`
}

function expenseTypeText(value: string) {
  return getFinanceExpenseTypeText(value)
}

function resetForm(next?: Partial<ExpenseForm>) {
  Object.assign(form, createFormState(), next || {})
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getExpenseList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      expenseType: searchType.value || undefined,
      keyword: searchKeyword.value || undefined,
      startDate: searchDate.value?.[0] || undefined,
      endDate: searchDate.value?.[1] || undefined,
    })
    const rows = res.data?.records || res.data?.list || []
    tableData.value = rows
    pagination.total = res.data?.total || rows.length
  } catch {
    tableData.value = []
    pagination.total = 0
  } finally {
    loading.value = false
  }
}

function handleSearch(formData: { keyword: string }) {
  searchKeyword.value = formData.keyword || ''
  pagination.page = 1
  fetchData()
}

function handleReset() {
  searchType.value = ''
  searchKeyword.value = ''
  searchDate.value = []
  pagination.page = 1
  fetchData()
}

function handleAdd() {
  dialogTitle.value = '新增费用'
  resetForm()
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function handleEdit(row: any) {
  dialogTitle.value = '编辑费用'
  resetForm({
    id: Number(row.id || 0),
    expenseNo: row.expenseNo || '',
    expenseType: row.expenseType || '',
    amount: Number(row.amount || 0),
    expenseDate: normalizeExpenseDate(row.expenseDate) || formatDate(new Date()),
    payee: row.payee || '',
    remark: row.remark || '',
  })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function handleSubmit() {
  if (submitLoading.value) return
  submitLoading.value = true
  try {
    const valid = await formRef.value?.validate().catch(() => false)
    if (!valid) return
    if (form.id) {
      await updateExpense(form.id, form)
      ElMessage.success('更新成功')
    } else {
      await createExpense(form)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch {
    // 交给全局拦截器提示
  } finally {
    submitLoading.value = false
  }
}

async function handleDelete(row: any) {
  try {
    await ElMessageBox.confirm('确定删除该费用记录？删除后将影响财务对账单费用口径。', '提示', { type: 'warning' })
    await deleteExpense(row.id)
    ElMessage.success('删除成功')
    fetchData()
  } catch {
    // 用户取消或全局拦截器已提示
  }
}

onMounted(() => {
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
