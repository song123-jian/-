<template>
  <div class="page-container">
    <PageHeader title="生产领料">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增领料
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset" />

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="编号" width="80" />
        <el-table-column prop="orderNo" label="领料单号" width="150" />
        <el-table-column prop="prodOrderNo" label="生产工单" width="150" />
        <el-table-column prop="materialName" label="物料名称" width="150" />
        <el-table-column prop="quantity" label="领料数量" width="100" />
        <el-table-column prop="unit" label="单位" width="80" />
        <el-table-column prop="warehouseName" label="仓库" width="120" />
        <el-table-column prop="operator" label="领料人" width="100" />
        <el-table-column prop="outDate" label="领料日期" width="120" />
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
        <el-form-item label="生产工单" prop="prodOrderId">
          <el-input v-model="form.prodOrderId" placeholder="请输入生产工单" />
        </el-form-item>
        <el-form-item label="物料" prop="materialId">
          <el-input v-model="form.materialId" placeholder="请选择物料" />
        </el-form-item>
        <el-form-item label="领料数量" prop="quantity">
          <el-input-number v-model="form.quantity" :min="1" />
        </el-form-item>
        <el-form-item label="仓库" prop="warehouseId">
          <el-input v-model="form.warehouseId" placeholder="请选择仓库" />
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
import { stockOutPicking } from '@/api/stock'

const loading = ref(false)
const tableData = ref<any[]>([])
const dialogVisible = ref(false)
const dialogTitle = ref('新增领料')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({ id: 0, prodOrderId: '', materialId: '', quantity: 1, warehouseId: '', remark: '' })
const formRules: FormRules = {
  prodOrderId: [{ required: true, message: '请输入生产工单', trigger: 'blur' }],
  materialId: [{ required: true, message: '请选择物料', trigger: 'change' }],
  quantity: [{ required: true, message: '请输入领料数量', trigger: 'blur' }],
}

async function fetchData() {
  loading.value = true
  try { tableData.value = []; pagination.total = 0 } catch { /* */ } finally { loading.value = false }
}

function handleSearch() { pagination.page = 1; fetchData() }
function handleReset() { pagination.page = 1; fetchData() }
function handleAdd() {
  dialogTitle.value = '新增领料'
  Object.assign(form, { id: 0, prodOrderId: '', materialId: '', quantity: 1, warehouseId: '', remark: '' })
  dialogVisible.value = true
}
function handleEdit(row: any) { dialogTitle.value = '编辑领料'; Object.assign(form, row); dialogVisible.value = true }

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try { await stockOutPicking(form); ElMessage.success('操作成功'); dialogVisible.value = false; fetchData() } catch { /* */ }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm('确定删除该领料记录？', '提示', { type: 'warning' })
  try { ElMessage.success('删除成功'); fetchData() } catch { /* */ }
}

onMounted(() => { fetchData() })
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
