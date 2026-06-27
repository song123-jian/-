<template>
  <div class="page-container">
    <PageHeader title="仓库管理">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增仓库
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="类型">
        <el-select v-model="searchType" placeholder="全部" clearable style="width: 140px">
          <el-option label="原料仓" value="RAW" />
          <el-option label="半成品仓" value="SEMI" />
          <el-option label="成品仓" value="FINISH" />
          <el-option label="不良品仓" value="DEFECT" />
          <el-option label="报废仓" value="SCRAP" />
        </el-select>
      </el-form-item>
      <el-form-item label="车间">
        <el-input v-model="searchWorkshop" placeholder="请输入车间" clearable />
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="code" label="仓库编号" width="120" />
        <el-table-column prop="name" label="仓库名称" width="150" />
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column prop="address" label="地址" min-width="180" show-overflow-tooltip />
        <el-table-column prop="factoryCode" label="工厂" width="120" />
        <el-table-column prop="workshop" label="车间" width="120" />
        <el-table-column prop="managerName" label="负责人" width="120" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === '启用' ? 'success' : 'danger'">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="520px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <el-form-item label="仓库编号" prop="code">
          <el-input v-model="form.code" placeholder="请输入仓库编号" />
        </el-form-item>
        <el-form-item label="仓库名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入仓库名称" />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="form.type" placeholder="请选择类型">
            <el-option label="原料仓" value="RAW" />
            <el-option label="半成品仓" value="SEMI" />
            <el-option label="成品仓" value="FINISH" />
            <el-option label="不良品仓" value="DEFECT" />
            <el-option label="报废仓" value="SCRAP" />
          </el-select>
        </el-form-item>
        <el-form-item label="地址" prop="address">
          <el-input v-model="form.address" placeholder="请输入地址" />
        </el-form-item>
        <el-form-item label="工厂编码" prop="factoryCode">
          <el-input v-model="form.factoryCode" placeholder="请输入工厂编码" />
        </el-form-item>
        <el-form-item label="车间" prop="workshop">
          <el-input v-model="form.workshop" placeholder="请输入车间" />
        </el-form-item>
        <el-form-item label="负责人ID" prop="managerId">
          <el-input v-model="form.managerId" placeholder="请输入负责人ID" />
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
import { onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getWarehouseList, createWarehouse, updateWarehouse, deleteWarehouse } from '@/api/warehouse'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchType = ref('')
const searchWorkshop = ref('')
const searchKeyword = ref('')
const dialogVisible = ref(false)
const dialogTitle = ref('新增仓库')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({ id: 0, code: '', name: '', type: '', address: '', factoryCode: '', workshop: '', managerId: '' })

const formRules: FormRules = {
  code: [{ required: true, message: '请输入仓库编号', trigger: 'blur' }],
  name: [{ required: true, message: '请输入仓库名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getWarehouseList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || searchWorkshop.value || searchType.value || undefined,
      type: searchType.value || undefined,
      workshop: searchWorkshop.value || undefined,
    })
    tableData.value = res.data?.list || []
    pagination.total = res.data?.total || 0
  } catch {
    tableData.value = []
    pagination.total = 0
  } finally {
    loading.value = false
  }
}

function handleSearch(formData: { keyword: string }) {
  searchKeyword.value = formData.keyword || ''
  pagination.page = 1
  fetchData()
}

function handleReset() {
  searchType.value = ''
  searchWorkshop.value = ''
  pagination.page = 1
  fetchData()
}

function handleAdd() {
  dialogTitle.value = '新增仓库'
  Object.assign(form, { id: 0, code: '', name: '', type: '', address: '', factoryCode: '', workshop: '', managerId: '' })
  dialogVisible.value = true
}

function handleEdit(row: any) {
  dialogTitle.value = '编辑仓库'
  Object.assign(form, row)
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    const payload = { ...form }
    if (form.id) {
      await updateWarehouse(form.id, payload)
      ElMessage.success('更新成功')
    } else {
      await createWarehouse(payload)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch {
    // 已由拦截器提示
  }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm('确定删除该仓库？', '提示', { type: 'warning' })
  try {
    await deleteWarehouse(row.id)
    ElMessage.success('删除成功')
    fetchData()
  } catch {
    // 已由拦截器提示
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped lang="scss">
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
