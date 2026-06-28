<template>
  <div class="page-container">
    <PageHeader title="回款登记">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增回款
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="日期">
        <el-date-picker v-model="searchDate" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" />
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="编号" width="80" />
        <el-table-column prop="paymentNo" label="回款单号" width="150" />
        <el-table-column prop="orderNo" label="关联订单" width="150" />
        <el-table-column prop="customerName" label="客户" width="120" />
        <el-table-column prop="amount" label="回款金额" width="120" />
        <el-table-column prop="paymentDate" label="回款日期" width="120" />
        <el-table-column prop="paymentMethod" label="付款方式" width="100" />
        <el-table-column prop="remark" label="备注" min-width="150" show-overflow-tooltip />
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
        <el-form-item label="关联订单" prop="orderId">
          <el-input v-model="form.orderId" placeholder="请输入关联订单" />
        </el-form-item>
        <el-form-item label="回款金额" prop="amount">
          <el-input-number v-model="form.amount" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="回款日期" prop="paymentDate">
          <el-date-picker v-model="form.paymentDate" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="付款方式" prop="paymentMethod">
          <el-select v-model="form.paymentMethod" placeholder="请选择">
            <el-option label="银行转账" value="bank" />
            <el-option label="现金" value="cash" />
            <el-option label="支票" value="check" />
          </el-select>
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
import { getPaymentList, createPayment, updatePayment, deletePayment } from '@/api/payment'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchDate = ref<string[]>([])
const dialogVisible = ref(false)
const dialogTitle = ref('新增回款')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({ id: 0, orderId: '', amount: 0, paymentDate: '', paymentMethod: '', remark: '' })
const formRules: FormRules = {
  orderId: [{ required: true, message: '请输入关联订单', trigger: 'blur' }],
  amount: [{ required: true, message: '请输入回款金额', trigger: 'blur' }],
  paymentDate: [{ required: true, message: '请选择回款日期', trigger: 'change' }],
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getPaymentList({ page: pagination.page, pageSize: pagination.pageSize })
    tableData.value = res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch { /* */ } finally { loading.value = false }
}

function handleSearch() { pagination.page = 1; fetchData() }
function handleReset() { searchDate.value = []; pagination.page = 1; fetchData() }
function handleAdd() {
  dialogTitle.value = '新增回款'
  Object.assign(form, { id: 0, orderId: '', amount: 0, paymentDate: '', paymentMethod: '', remark: '' })
  dialogVisible.value = true
}
function handleEdit(row: any) { dialogTitle.value = '编辑回款'; Object.assign(form, row); dialogVisible.value = true }

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    if (form.id) { await updatePayment(form.id, form); ElMessage.success('更新成功') }
    else { await createPayment(form); ElMessage.success('创建成功') }
    dialogVisible.value = false; fetchData()
  } catch { /* */ }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm('确定删除该回款记录？', '提示', { type: 'warning' })
  try { await deletePayment(row.id); ElMessage.success('删除成功'); fetchData() } catch { /* */ }
}

onMounted(() => { fetchData() })
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
