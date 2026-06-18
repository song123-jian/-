<template>
  <div class="page-container">
    <PageHeader title="费用支出">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增费用
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="类型">
        <el-select v-model="searchType" placeholder="请选择" clearable>
          <el-option label="水电费" value="utility" />
          <el-option label="房租" value="rent" />
          <el-option label="维修费" value="repair" />
          <el-option label="人工费" value="labor" />
          <el-option label="其他" value="other" />
        </el-select>
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="type" label="费用类型" width="100">
          <template #default="{ row }">
            {{ ({ utility: '水电费', rent: '房租', repair: '维修费', labor: '人工费', other: '其他' } as Record<string, string>)[row.type as string] || row.type }}
          </template>
        </el-table-column>
        <el-table-column prop="amount" label="金额" width="120" />
        <el-table-column prop="expenseDate" label="费用日期" width="120" />
        <el-table-column prop="payer" label="支付人" width="100" />
        <el-table-column prop="remark" label="备注" min-width="200" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="创建时间" width="180" />
        <el-table-column label="操作" fixed="right" width="150">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link @click="handleDelete(row)">删除</el-button>
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="500px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="80px">
        <el-form-item label="费用类型" prop="type">
          <el-select v-model="form.type" placeholder="请选择">
            <el-option label="水电费" value="utility" />
            <el-option label="房租" value="rent" />
            <el-option label="维修费" value="repair" />
            <el-option label="人工费" value="labor" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="金额" prop="amount">
          <el-input-number v-model="form.amount" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="费用日期" prop="expenseDate">
          <el-date-picker v-model="form.expenseDate" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getExpenseList, createExpense, updateExpense, deleteExpense } from '@/api/expense'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchType = ref('')
const dialogVisible = ref(false)
const dialogTitle = ref('新增费用')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({ id: 0, type: '', amount: 0, expenseDate: '', remark: '' })
const formRules: FormRules = {
  type: [{ required: true, message: '请选择费用类型', trigger: 'change' }],
  amount: [{ required: true, message: '请输入金额', trigger: 'blur' }],
  expenseDate: [{ required: true, message: '请选择费用日期', trigger: 'change' }],
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getExpenseList({ page: pagination.page, pageSize: pagination.pageSize, type: searchType.value })
    tableData.value = res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch { /* */ } finally { loading.value = false }
}

function handleSearch() { pagination.page = 1; fetchData() }
function handleReset() { searchType.value = ''; pagination.page = 1; fetchData() }
function handleAdd() {
  dialogTitle.value = '新增费用'
  Object.assign(form, { id: 0, type: '', amount: 0, expenseDate: '', remark: '' })
  dialogVisible.value = true
}
function handleEdit(row: any) { dialogTitle.value = '编辑费用'; Object.assign(form, row); dialogVisible.value = true }

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    if (form.id) { await updateExpense(form.id, form); ElMessage.success('更新成功') }
    else { await createExpense(form); ElMessage.success('创建成功') }
    dialogVisible.value = false; fetchData()
  } catch { /* */ }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm('确定删除该费用记录？', '提示', { type: 'warning' })
  try { await deleteExpense(row.id); ElMessage.success('删除成功'); fetchData() } catch { /* */ }
}

onMounted(() => { fetchData() })
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
