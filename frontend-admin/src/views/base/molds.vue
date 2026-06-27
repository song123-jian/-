<template>
  <div class="page-container">
    <PageHeader title="模具管理">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增模具
      </el-button>
      <el-button type="success" plain @click="goMaintenanceRecords">
        <el-icon><Notebook /></el-icon>保养记录
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="状态">
        <el-select v-model="searchStatus" placeholder="全部" clearable style="width: 160px">
          <el-option label="正常" value="NORMAL" />
          <el-option label="维修中" value="REPAIR" />
          <el-option label="报废" value="SCRAP" />
        </el-select>
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="code" label="模具编号" width="130" />
        <el-table-column prop="name" label="模具名称" width="150" />
        <el-table-column prop="productName" label="关联产品" width="150" />
        <el-table-column prop="cavities" label="穴数" width="80" />
        <el-table-column prop="usedShots" label="累计模次" width="100" />
        <el-table-column prop="shotsSinceMaintenance" label="保养后模次" width="110" />
        <el-table-column prop="lifetime" label="寿命" width="100" />
        <el-table-column prop="maintenanceCycle" label="保养周期" width="100" />
        <el-table-column prop="remainingToMaintenance" label="距保养" width="100">
          <template #default="{ row }">
            <el-progress
              :percentage="row.maintenanceRate || 0"
              :status="row.maintenanceRate >= 80 ? 'exception' : undefined"
            />
          </template>
        </el-table-column>
        <el-table-column prop="remainingShots" label="余寿命" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="lastMaintenanceAt" label="上次保养" width="180">
          <template #default="{ row }">
            {{ row.lastMaintenanceAt ? formatDateTime(row.lastMaintenanceAt) : '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ row.createdAt ? formatDateTime(row.createdAt) : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="220">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleStats(row)">统计</el-button>
            <el-button type="success" link @click="handleMaintain(row)">保养</el-button>
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="680px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="模具编号" prop="code">
              <el-input v-model="form.code" placeholder="请输入模具编号" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="模具名称" prop="name">
              <el-input v-model="form.name" placeholder="请输入模具名称" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="关联产品" prop="productId">
              <el-select v-model="form.productId" filterable placeholder="请选择产品" style="width: 100%">
                <el-option
                  v-for="item in productOptions"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="穴数" prop="cavities">
              <el-input-number v-model="form.cavities" :min="1" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="寿命模次" prop="lifetime">
              <el-input-number v-model="form.lifetime" :min="1" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="保养周期" prop="maintenanceCycle">
              <el-input-number v-model="form.maintenanceCycle" :min="1" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="状态" prop="status">
              <el-select v-model="form.status" placeholder="请选择状态" style="width: 100%">
                <el-option label="正常" value="NORMAL" />
                <el-option label="维修中" value="REPAIR" />
                <el-option label="报废" value="SCRAP" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="请输入备注" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="statsVisible" title="模具统计" width="560px">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="模具编号">{{ stats.moldCode || '-' }}</el-descriptions-item>
        <el-descriptions-item label="模具名称">{{ stats.moldName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="累计模次">{{ stats.usedShots ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="保养后模次">{{ stats.shotsSinceMaintenance ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="寿命">{{ stats.lifetime ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="保养周期">{{ stats.maintenanceCycle ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="剩余寿命">{{ stats.remainingShots ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="距下次保养">{{ stats.remainingToMaintenance ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="保养次数">{{ stats.maintenanceCount ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="使用率">{{ stats.usageRate ?? 0 }}%</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { formatDateTime } from '@/utils'
import { getProductList } from '@/api/product'
import { getMoldList, getMoldShotsStats, createMold, updateMold, deleteMold, maintainMold } from '@/api/mold'

type ProductOption = { id: number; name?: string }

const loading = ref(false)
const router = useRouter()
const tableData = ref<any[]>([])
const searchKeyword = ref('')
const searchStatus = ref('')
const dialogVisible = ref(false)
const dialogTitle = ref('新增模具')
const statsVisible = ref(false)
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const productOptions = ref<ProductOption[]>([])
const stats = reactive<any>({})
const form = reactive({
  id: 0,
  code: '',
  name: '',
  productId: null as number | null,
  cavities: 1,
  lifetime: 500000,
  maintenanceCycle: 50000,
  status: 'NORMAL',
  remark: '',
})

const formRules: FormRules = {
  code: [{ required: true, message: '请输入模具编号', trigger: 'blur' }],
  name: [{ required: true, message: '请输入模具名称', trigger: 'blur' }],
  productId: [{ required: true, message: '请选择关联产品', trigger: 'change' }],
  cavities: [{ required: true, message: '请输入穴数', trigger: 'blur' }],
}

function statusText(value?: string) {
  const map: Record<string, string> = {
    NORMAL: '正常',
    REPAIR: '维修中',
    SCRAP: '报废',
  }
  return map[value || ''] || value || '-'
}

function statusTagType(value?: string) {
  if (value === 'NORMAL') return 'success'
  if (value === 'REPAIR') return 'warning'
  if (value === 'SCRAP') return 'danger'
  return 'info'
}

async function loadProducts() {
  try {
    const res: any = await getProductList({ page: 1, pageSize: 200 })
    productOptions.value = res.data?.records || []
  } catch {
    productOptions.value = []
  }
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getMoldList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value,
      status: searchStatus.value,
    })
    tableData.value = res.data?.records || []
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

function goMaintenanceRecords() {
  router.push('/prod/mold-maintenance-records')
}

function handleReset() {
  searchKeyword.value = ''
  searchStatus.value = ''
  pagination.page = 1
  fetchData()
}

function resetForm() {
  Object.assign(form, {
    id: 0,
    code: '',
    name: '',
    productId: null,
    cavities: 1,
    lifetime: 500000,
    maintenanceCycle: 50000,
    status: 'NORMAL',
    remark: '',
  })
}

function handleAdd() {
  dialogTitle.value = '新增模具'
  resetForm()
  dialogVisible.value = true
}

function handleEdit(row: any) {
  dialogTitle.value = '编辑模具'
  Object.assign(form, {
    id: row.id || 0,
    code: row.code || '',
    name: row.name || '',
    productId: row.productId ?? null,
    cavities: row.cavities ?? 1,
    lifetime: row.lifetime ?? 500000,
    maintenanceCycle: row.maintenanceCycle ?? 50000,
    status: row.status || 'NORMAL',
    remark: row.remark || '',
  })
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  try {
    const createPayload = {
      code: form.code,
      name: form.name,
      productId: form.productId,
      cavities: form.cavities,
      lifetime: form.lifetime,
      maintenanceCycle: form.maintenanceCycle,
      remark: form.remark,
    }
    const updatePayload = {
      name: form.name,
      productId: form.productId,
      cavities: form.cavities,
      lifetime: form.lifetime,
      maintenanceCycle: form.maintenanceCycle,
      status: form.status,
      remark: form.remark,
    }

    if (form.id) {
      await updateMold(form.id, updatePayload)
      ElMessage.success('更新成功')
    } else {
      await createMold(createPayload)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch {
    // 交给全局提示
  }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm('确定删除该模具？', '提示', { type: 'warning' })
  try {
    await deleteMold(row.id)
    ElMessage.success('删除成功')
    fetchData()
  } catch {
    // 交给全局提示
  }
}

async function handleMaintain(row: any) {
  await ElMessageBox.confirm(`确认对模具 ${row.code} 执行保养？`, '提示', { type: 'warning' })
  try {
    await maintainMold(row.id)
    ElMessage.success('保养完成')
    fetchData()
  } catch {
    // 交给全局提示
  }
}

async function handleStats(row: any) {
  try {
    const res: any = await getMoldShotsStats(row.id)
    Object.assign(stats, res.data || {})
    statsVisible.value = true
  } catch {
    // 交给全局提示
  }
}

onMounted(async () => {
  await loadProducts()
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
