<template>
  <div class="page-container">
    <PageHeader title="生产工单">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增工单
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="状态">
        <el-select v-model="searchStatus" placeholder="请选择" clearable>
          <el-option label="待下发" value="pending" />
          <el-option label="生产中" value="producing" />
          <el-option label="已完成" value="completed" />
          <el-option label="已取消" value="cancelled" />
        </el-select>
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="编号" width="80" />
        <el-table-column prop="orderNo" label="工单编号" width="150" />
        <el-table-column prop="saleOrderNo" label="销售订单" width="150" />
        <el-table-column prop="productName" label="产品" width="150" />
        <el-table-column prop="quantity" label="计划数量" width="100" />
        <el-table-column prop="completedQty" label="完成数量" width="100" />
        <el-table-column prop="machineName" label="机台" width="120" />
        <el-table-column prop="moldName" label="模具" width="120" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'producing' ? '' : row.status === 'completed' ? 'success' : row.status === 'pending' ? 'warning' : 'info'">
              {{ ({ pending: '待下发', producing: '生产中', completed: '已完成', cancelled: '已取消' } as Record<string, string>)[row.status as string] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="planDate" label="计划日期" width="120" />
        <el-table-column label="操作" fixed="right" width="200">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="success" link @click="handleDispatch(row)" v-if="row.status === 'pending'">下发</el-button>
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
        <el-form-item label="销售订单" prop="saleOrderId">
          <el-input v-model="form.saleOrderId" placeholder="请输入关联销售订单" />
        </el-form-item>
        <el-form-item label="产品" prop="productId">
          <el-input v-model="form.productId" placeholder="请选择产品" />
        </el-form-item>
        <el-form-item label="计划数量" prop="quantity">
          <el-input-number v-model="form.quantity" :min="1" />
        </el-form-item>
        <el-form-item label="机台" prop="machineId">
          <el-input v-model="form.machineId" placeholder="请选择机台" />
        </el-form-item>
        <el-form-item label="模具" prop="moldId">
          <el-input v-model="form.moldId" placeholder="请选择模具" />
        </el-form-item>
        <el-form-item label="计划日期" prop="planDate">
          <el-date-picker v-model="form.planDate" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" />
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
import { getProdOrderList, createProdOrder, updateProdOrder, deleteProdOrder, dispatchProdOrder } from '@/api/prodOrder'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchStatus = ref('')
const dialogVisible = ref(false)
const dialogTitle = ref('新增工单')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({ id: 0, saleOrderId: '', productId: '', quantity: 1, machineId: '', moldId: '', planDate: '' })
const formRules: FormRules = {
  productId: [{ required: true, message: '请选择产品', trigger: 'change' }],
  quantity: [{ required: true, message: '请输入计划数量', trigger: 'blur' }],
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getProdOrderList({ page: pagination.page, pageSize: pagination.pageSize, status: searchStatus.value })
    tableData.value = res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch { /* */ } finally { loading.value = false }
}

function handleSearch() { pagination.page = 1; fetchData() }
function handleReset() { searchStatus.value = ''; pagination.page = 1; fetchData() }
function handleAdd() {
  dialogTitle.value = '新增工单'
  Object.assign(form, { id: 0, saleOrderId: '', productId: '', quantity: 1, machineId: '', moldId: '', planDate: '' })
  dialogVisible.value = true
}
function handleEdit(row: any) { dialogTitle.value = '编辑工单'; Object.assign(form, row); dialogVisible.value = true }

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    if (form.id) { await updateProdOrder(form.id, form); ElMessage.success('更新成功') }
    else { await createProdOrder(form); ElMessage.success('创建成功') }
    dialogVisible.value = false; fetchData()
  } catch { /* */ }
}

async function handleDispatch(row: any) {
  await ElMessageBox.confirm('确定下发该工单？', '提示', { type: 'warning' })
  try { await dispatchProdOrder(row.id); ElMessage.success('下发成功'); fetchData() } catch { /* */ }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm('确定删除该工单？', '提示', { type: 'warning' })
  try { await deleteProdOrder(row.id); ElMessage.success('删除成功'); fetchData() } catch { /* */ }
}

onMounted(() => { fetchData() })
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
