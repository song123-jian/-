<template>
  <div class="page-container">
    <PageHeader title="模具管理">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增模具
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="状态">
        <el-select v-model="searchStatus" placeholder="请选择" clearable>
          <el-option label="正常" value="normal" />
          <el-option label="维修中" value="maintenance" />
          <el-option label="报废" value="scrapped" />
        </el-select>
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="code" label="模具编号" width="120" />
        <el-table-column prop="name" label="模具名称" width="150" />
        <el-table-column prop="productCode" label="对应产品" width="120" />
        <el-table-column prop="cavityCount" label="穴数" width="80" />
        <el-table-column prop="totalShots" label="总模次" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'normal' ? 'success' : row.status === 'maintenance' ? 'warning' : 'danger'">
              {{ row.status === 'normal' ? '正常' : row.status === 'maintenance' ? '维修中' : '报废' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="存放位置" width="120" />
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
        <el-form-item label="模具编号" prop="code">
          <el-input v-model="form.code" placeholder="请输入模具编号" />
        </el-form-item>
        <el-form-item label="模具名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入模具名称" />
        </el-form-item>
        <el-form-item label="对应产品" prop="productCode">
          <el-input v-model="form.productCode" placeholder="请输入对应产品编号" />
        </el-form-item>
        <el-form-item label="穴数" prop="cavityCount">
          <el-input-number v-model="form.cavityCount" :min="1" />
        </el-form-item>
        <el-form-item label="存放位置" prop="location">
          <el-input v-model="form.location" placeholder="请输入存放位置" />
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-select v-model="form.status" placeholder="请选择状态">
            <el-option label="正常" value="normal" />
            <el-option label="维修中" value="maintenance" />
            <el-option label="报废" value="scrapped" />
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
import { getMoldList, createMold, updateMold, deleteMold } from '@/api/mold'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchStatus = ref('')
const dialogVisible = ref(false)
const dialogTitle = ref('新增模具')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({ id: 0, code: '', name: '', productCode: '', cavityCount: 1, location: '', status: 'normal' })
const formRules: FormRules = {
  code: [{ required: true, message: '请输入模具编号', trigger: 'blur' }],
  name: [{ required: true, message: '请输入模具名称', trigger: 'blur' }],
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getMoldList({ page: pagination.page, pageSize: pagination.pageSize, status: searchStatus.value })
    tableData.value = res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch { /* */ } finally { loading.value = false }
}

function handleSearch() { pagination.page = 1; fetchData() }
function handleReset() { searchStatus.value = ''; pagination.page = 1; fetchData() }
function handleAdd() {
  dialogTitle.value = '新增模具'
  Object.assign(form, { id: 0, code: '', name: '', productCode: '', cavityCount: 1, location: '', status: 'normal' })
  dialogVisible.value = true
}
function handleEdit(row: any) { dialogTitle.value = '编辑模具'; Object.assign(form, row); dialogVisible.value = true }

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    if (form.id) { await updateMold(form.id, form); ElMessage.success('更新成功') }
    else { await createMold(form); ElMessage.success('创建成功') }
    dialogVisible.value = false; fetchData()
  } catch { /* */ }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm('确定删除该模具？', '提示', { type: 'warning' })
  try { await deleteMold(row.id); ElMessage.success('删除成功'); fetchData() } catch { /* */ }
}

onMounted(() => { fetchData() })
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
