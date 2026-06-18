<template>
  <div class="page-container">
    <PageHeader title="供应商管理">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增供应商
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset" />

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="code" label="供应商编号" width="120" />
        <el-table-column prop="name" label="供应商名称" width="150" />
        <el-table-column prop="contact" label="联系人" width="100" />
        <el-table-column prop="phone" label="联系电话" width="140" />
        <el-table-column prop="material" label="供应物料" width="150" />
        <el-table-column prop="address" label="地址" min-width="200" show-overflow-tooltip />
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
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <el-form-item label="供应商编号" prop="code">
          <el-input v-model="form.code" placeholder="请输入供应商编号" />
        </el-form-item>
        <el-form-item label="供应商名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入供应商名称" />
        </el-form-item>
        <el-form-item label="联系人" prop="contact">
          <el-input v-model="form.contact" placeholder="请输入联系人" />
        </el-form-item>
        <el-form-item label="联系电话" prop="phone">
          <el-input v-model="form.phone" placeholder="请输入联系电话" />
        </el-form-item>
        <el-form-item label="供应物料" prop="material">
          <el-input v-model="form.material" placeholder="请输入供应物料" />
        </el-form-item>
        <el-form-item label="地址" prop="address">
          <el-input v-model="form.address" type="textarea" placeholder="请输入地址" />
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
import { getSupplierList, createSupplier, updateSupplier, deleteSupplier } from '@/api/supplier'

const loading = ref(false)
const tableData = ref<any[]>([])
const dialogVisible = ref(false)
const dialogTitle = ref('新增供应商')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({ id: 0, code: '', name: '', contact: '', phone: '', material: '', address: '' })
const formRules: FormRules = {
  code: [{ required: true, message: '请输入供应商编号', trigger: 'blur' }],
  name: [{ required: true, message: '请输入供应商名称', trigger: 'blur' }],
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getSupplierList({ page: pagination.page, pageSize: pagination.pageSize })
    tableData.value = res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch { /* */ } finally { loading.value = false }
}

function handleSearch() { pagination.page = 1; fetchData() }
function handleReset() { pagination.page = 1; fetchData() }
function handleAdd() {
  dialogTitle.value = '新增供应商'
  Object.assign(form, { id: 0, code: '', name: '', contact: '', phone: '', material: '', address: '' })
  dialogVisible.value = true
}
function handleEdit(row: any) { dialogTitle.value = '编辑供应商'; Object.assign(form, row); dialogVisible.value = true }

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    if (form.id) { await updateSupplier(form.id, form); ElMessage.success('更新成功') }
    else { await createSupplier(form); ElMessage.success('创建成功') }
    dialogVisible.value = false; fetchData()
  } catch { /* */ }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm('确定删除该供应商？', '提示', { type: 'warning' })
  try { await deleteSupplier(row.id); ElMessage.success('删除成功'); fetchData() } catch { /* */ }
}

onMounted(() => { fetchData() })
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
