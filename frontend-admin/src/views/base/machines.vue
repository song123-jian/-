<template>
  <div class="page-container">
    <PageHeader title="机台管理">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增机台
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="状态">
        <el-select v-model="searchStatus" placeholder="请选择" clearable>
          <el-option label="运行中" value="running" />
          <el-option label="停机" value="stopped" />
          <el-option label="维修中" value="maintenance" />
        </el-select>
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="code" label="机台编号" width="120" />
        <el-table-column prop="name" label="机台名称" width="150" />
        <el-table-column prop="model" label="型号" width="120" />
        <el-table-column prop="tonnage" label="吨位" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="位置" width="120" />
        <el-table-column prop="createdAt" label="创建时间" width="180" />
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="500px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="80px">
        <el-form-item label="机台编号" prop="code">
          <el-input v-model="form.code" placeholder="请输入机台编号" />
        </el-form-item>
        <el-form-item label="机台名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入机台名称" />
        </el-form-item>
        <el-form-item label="型号" prop="model">
          <el-input v-model="form.model" placeholder="请输入型号" />
        </el-form-item>
        <el-form-item label="吨位" prop="tonnage">
          <el-input-number v-model="form.tonnage" :min="1" />
        </el-form-item>
        <el-form-item label="位置" prop="location">
          <el-input v-model="form.location" placeholder="请输入位置" />
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-select v-model="form.status" placeholder="请选择状态">
            <el-option label="运行中" value="running" />
            <el-option label="停机" value="stopped" />
            <el-option label="维修中" value="maintenance" />
          </el-select>
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
import { getMachineList, createMachine, updateMachine, deleteMachine } from '@/api/machine'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchStatus = ref('')
const dialogVisible = ref(false)
const dialogTitle = ref('新增机台')
const formRef = ref<FormInstance>()

const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const form = reactive({
  id: 0, code: '', name: '', model: '', tonnage: 100, location: '', status: 'running',
})

const formRules: FormRules = {
  code: [{ required: true, message: '请输入机台编号', trigger: 'blur' }],
  name: [{ required: true, message: '请输入机台名称', trigger: 'blur' }],
}

function statusLabel(status: string) {
  const map: Record<string, string> = { running: '运行中', stopped: '停机', maintenance: '维修中' }
  return map[status] || status
}

function statusTagType(status: string) {
  const map: Record<string, string> = { running: 'success', stopped: 'danger', maintenance: 'warning' }
  return map[status] || 'info'
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getMachineList({ page: pagination.page, pageSize: pagination.pageSize, status: searchStatus.value })
    tableData.value = res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch { /* */ } finally { loading.value = false }
}

function handleSearch() { pagination.page = 1; fetchData() }
function handleReset() { searchStatus.value = ''; pagination.page = 1; fetchData() }

function handleAdd() {
  dialogTitle.value = '新增机台'
  Object.assign(form, { id: 0, code: '', name: '', model: '', tonnage: 100, location: '', status: 'running' })
  dialogVisible.value = true
}

function handleEdit(row: any) {
  dialogTitle.value = '编辑机台'
  Object.assign(form, row)
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    if (form.id) { await updateMachine(form.id, form); ElMessage.success('更新成功') }
    else { await createMachine(form); ElMessage.success('创建成功') }
    dialogVisible.value = false; fetchData()
  } catch { /* */ }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm('确定删除该机台？', '提示', { type: 'warning' })
  try { await deleteMachine(row.id); ElMessage.success('删除成功'); fetchData() } catch { /* */ }
}

onMounted(() => { fetchData() })
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
