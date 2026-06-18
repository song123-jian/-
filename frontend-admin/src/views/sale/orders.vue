<template>
  <div class="page-container">
    <PageHeader title="销售订单">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增订单
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="状态">
        <el-select v-model="searchStatus" placeholder="请选择" clearable>
          <el-option label="待确认" value="pending" />
          <el-option label="已确认" value="confirmed" />
          <el-option label="生产中" value="producing" />
          <el-option label="已完成" value="completed" />
          <el-option label="已取消" value="cancelled" />
        </el-select>
      </el-form-item>
      <el-form-item label="日期">
        <el-date-picker v-model="searchDate" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" />
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="orderNo" label="订单编号" width="150" />
        <el-table-column prop="customerName" label="客户" width="120" />
        <el-table-column prop="productName" label="产品" width="150" />
        <el-table-column prop="quantity" label="数量" width="100" />
        <el-table-column prop="unitPrice" label="单价" width="100" />
        <el-table-column prop="totalAmount" label="总金额" width="120" />
        <el-table-column prop="deliveryDate" label="交货日期" width="120" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="orderStatusType(row.status)">{{ orderStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180" />
        <el-table-column label="操作" fixed="right" width="200">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="success" link @click="handleApprove(row)" v-if="row.status === 'pending'">审核</el-button>
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="600px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="80px">
        <el-form-item label="客户" prop="customerId">
          <el-input v-model="form.customerId" placeholder="请选择客户" />
        </el-form-item>
        <el-form-item label="产品" prop="productId">
          <el-input v-model="form.productId" placeholder="请选择产品" />
        </el-form-item>
        <el-form-item label="数量" prop="quantity">
          <el-input-number v-model="form.quantity" :min="1" />
        </el-form-item>
        <el-form-item label="单价" prop="unitPrice">
          <el-input-number v-model="form.unitPrice" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="交货日期" prop="deliveryDate">
          <el-date-picker v-model="form.deliveryDate" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" />
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
import { getSaleOrderList, createSaleOrder, updateSaleOrder, deleteSaleOrder, approveSaleOrder } from '@/api/saleOrder'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchStatus = ref('')
const searchDate = ref<string[]>([])
const dialogVisible = ref(false)
const dialogTitle = ref('新增订单')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({ id: 0, customerId: '', productId: '', quantity: 1, unitPrice: 0, deliveryDate: '', remark: '' })
const formRules: FormRules = {
  customerId: [{ required: true, message: '请选择客户', trigger: 'change' }],
  productId: [{ required: true, message: '请选择产品', trigger: 'change' }],
  quantity: [{ required: true, message: '请输入数量', trigger: 'blur' }],
}

function orderStatusLabel(status: string) {
  const map: Record<string, string> = { pending: '待确认', confirmed: '已确认', producing: '生产中', completed: '已完成', cancelled: '已取消' }
  return map[status] || status
}
function orderStatusType(status: string) {
  const map: Record<string, string> = { pending: 'warning', confirmed: 'primary', producing: '', completed: 'success', cancelled: 'info' }
  return map[status] || 'info'
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getSaleOrderList({ page: pagination.page, pageSize: pagination.pageSize, status: searchStatus.value })
    tableData.value = res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch { /* */ } finally { loading.value = false }
}

function handleSearch() { pagination.page = 1; fetchData() }
function handleReset() { searchStatus.value = ''; searchDate.value = []; pagination.page = 1; fetchData() }
function handleAdd() {
  dialogTitle.value = '新增订单'
  Object.assign(form, { id: 0, customerId: '', productId: '', quantity: 1, unitPrice: 0, deliveryDate: '', remark: '' })
  dialogVisible.value = true
}
function handleEdit(row: any) { dialogTitle.value = '编辑订单'; Object.assign(form, row); dialogVisible.value = true }

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    if (form.id) { await updateSaleOrder(form.id, form); ElMessage.success('更新成功') }
    else { await createSaleOrder(form); ElMessage.success('创建成功') }
    dialogVisible.value = false; fetchData()
  } catch { /* */ }
}

async function handleApprove(row: any) {
  await ElMessageBox.confirm('确定审核通过该订单？', '提示', { type: 'warning' })
  try { await approveSaleOrder(row.id); ElMessage.success('审核成功'); fetchData() } catch { /* */ }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm('确定删除该订单？', '提示', { type: 'warning' })
  try { await deleteSaleOrder(row.id); ElMessage.success('删除成功'); fetchData() } catch { /* */ }
}

onMounted(() => { fetchData() })
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
