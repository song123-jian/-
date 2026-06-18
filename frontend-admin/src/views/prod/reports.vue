<template>
  <div class="page-container">
    <PageHeader title="报工记录">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增报工
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="日期">
        <el-date-picker v-model="searchDate" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" />
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="prodOrderNo" label="工单编号" width="150" />
        <el-table-column prop="productName" label="产品" width="150" />
        <el-table-column prop="machineName" label="机台" width="120" />
        <el-table-column prop="workerName" label="操作员" width="100" />
        <el-table-column prop="quantity" label="报工数量" width="100" />
        <el-table-column prop="defectQty" label="不良数" width="100" />
        <el-table-column prop="workHours" label="工时(小时)" width="100" />
        <el-table-column prop="reportDate" label="报工日期" width="120" />
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
        <el-form-item label="工单" prop="prodOrderId">
          <el-input v-model="form.prodOrderId" placeholder="请输入工单编号" />
        </el-form-item>
        <el-form-item label="报工数量" prop="quantity">
          <el-input-number v-model="form.quantity" :min="0" />
        </el-form-item>
        <el-form-item label="不良数" prop="defectQty">
          <el-input-number v-model="form.defectQty" :min="0" />
        </el-form-item>
        <el-form-item label="工时" prop="workHours">
          <el-input-number v-model="form.workHours" :min="0" :precision="1" />
        </el-form-item>
        <el-form-item label="报工日期" prop="reportDate">
          <el-date-picker v-model="form.reportDate" type="date" placeholder="选择日期" value-format="YYYY-MM-DD" />
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
import { getProdReportList, createProdReport, updateProdReport, deleteProdReport } from '@/api/prodReport'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchDate = ref<string[]>([])
const dialogVisible = ref(false)
const dialogTitle = ref('新增报工')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({ id: 0, prodOrderId: '', quantity: 0, defectQty: 0, workHours: 0, reportDate: '' })
const formRules: FormRules = {
  prodOrderId: [{ required: true, message: '请输入工单编号', trigger: 'blur' }],
  quantity: [{ required: true, message: '请输入报工数量', trigger: 'blur' }],
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getProdReportList({ page: pagination.page, pageSize: pagination.pageSize })
    tableData.value = res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch { /* */ } finally { loading.value = false }
}

function handleSearch() { pagination.page = 1; fetchData() }
function handleReset() { searchDate.value = []; pagination.page = 1; fetchData() }
function handleAdd() {
  dialogTitle.value = '新增报工'
  Object.assign(form, { id: 0, prodOrderId: '', quantity: 0, defectQty: 0, workHours: 0, reportDate: '' })
  dialogVisible.value = true
}
function handleEdit(row: any) { dialogTitle.value = '编辑报工'; Object.assign(form, row); dialogVisible.value = true }

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    if (form.id) { await updateProdReport(form.id, form); ElMessage.success('更新成功') }
    else { await createProdReport(form); ElMessage.success('创建成功') }
    dialogVisible.value = false; fetchData()
  } catch { /* */ }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm('确定删除该报工记录？', '提示', { type: 'warning' })
  try { await deleteProdReport(row.id); ElMessage.success('删除成功'); fetchData() } catch { /* */ }
}

onMounted(() => { fetchData() })
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
