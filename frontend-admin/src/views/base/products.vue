<template>
  <div class="page-container">
    <PageHeader title="产品管理">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增产品
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="类型">
        <el-select v-model="searchType" placeholder="请选择" clearable>
          <el-option label="原料" value="RAW" />
          <el-option label="半成品" value="SEMI" />
          <el-option label="成品" value="FINISH" />
        </el-select>
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="code" label="产品编号" width="120" />
        <el-table-column prop="name" label="产品名称" width="150" />
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column prop="spec" label="规格" width="120" />
        <el-table-column prop="unit" label="单位" width="80" />
        <el-table-column prop="piecePrice" label="单价" width="100" />
        <el-table-column prop="customerId" label="客户ID" width="100" />
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
        <el-form-item label="产品编号" prop="code">
          <el-input v-model="form.code" placeholder="请输入产品编号" />
        </el-form-item>
        <el-form-item label="产品名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入产品名称" />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="form.type" placeholder="请选择类型">
            <el-option label="原料" value="RAW" />
            <el-option label="半成品" value="SEMI" />
            <el-option label="成品" value="FINISH" />
          </el-select>
        </el-form-item>
        <el-form-item label="规格" prop="spec">
          <el-input v-model="form.spec" placeholder="请输入规格" />
        </el-form-item>
        <el-form-item label="单位" prop="unit">
          <el-input v-model="form.unit" placeholder="请输入单位" />
        </el-form-item>
        <el-form-item label="单价" prop="piecePrice">
          <el-input-number v-model="form.piecePrice" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="客户ID" prop="customerId">
          <el-input-number v-model="form.customerId" :min="1" />
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
import { getProductList, createProduct, updateProduct, deleteProduct } from '@/api/product'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchType = ref('')
const searchKeyword = ref('')
const dialogVisible = ref(false)
const dialogTitle = ref('新增产品')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({ id: 0, code: '', name: '', type: '', spec: '', unit: '个', piecePrice: 0, customerId: null as number | null })
const formRules: FormRules = {
  code: [{ required: true, message: '请输入产品编号', trigger: 'blur' }],
  name: [{ required: true, message: '请输入产品名称', trigger: 'blur' }],
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getProductList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || undefined,
      type: searchType.value || undefined,
    })
    tableData.value = res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch { /* */ } finally { loading.value = false }
}

function handleSearch(formData: { keyword: string }) { searchKeyword.value = formData.keyword || ''; pagination.page = 1; fetchData() }
function handleReset() { searchType.value = ''; pagination.page = 1; fetchData() }
function handleAdd() {
  dialogTitle.value = '新增产品'
  Object.assign(form, { id: 0, code: '', name: '', type: '', spec: '', unit: '个', piecePrice: 0, customerId: null })
  dialogVisible.value = true
}
function handleEdit(row: any) { dialogTitle.value = '编辑产品'; Object.assign(form, row); dialogVisible.value = true }

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    if (form.id) { await updateProduct(form.id, form); ElMessage.success('更新成功') }
    else { await createProduct(form); ElMessage.success('创建成功') }
    dialogVisible.value = false; fetchData()
  } catch { /* */ }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm('确定删除该产品？', '提示', { type: 'warning' })
  try { await deleteProduct(row.id); ElMessage.success('删除成功'); fetchData() } catch { /* */ }
}

onMounted(() => { fetchData() })
</script>

<style scoped lang="scss">
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
