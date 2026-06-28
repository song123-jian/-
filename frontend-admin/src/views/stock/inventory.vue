<template>
  <div class="page-container">
    <PageHeader title="盘点单">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增盘点
      </el-button>
      <el-button plain @click="fetchData">
        <el-icon><Refresh /></el-icon>刷新
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="关键词">
        <el-input v-model="searchKeyword" placeholder="盘点单号或备注" clearable style="width: 220px" />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="searchStatus" placeholder="全部" clearable style="width: 140px">
          <el-option label="草稿" value="DRAFT" />
          <el-option label="盘点中" value="COUNTING" />
          <el-option label="待审批" value="PENDING_APPROVE" />
          <el-option label="已完成" value="FINISHED" />
          <el-option label="已取消" value="CANCELLED" />
        </el-select>
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="编号" width="80" />
        <el-table-column prop="inventoryNo" label="盘点单号" width="160" />
        <el-table-column prop="warehouseName" label="仓库" width="140" />
        <el-table-column prop="inventoryType" label="盘点类型" width="100">
          <template #default="{ row }">
            {{ inventoryTypeText(row.inventoryType) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="creatorName" label="创建人" width="100" />
        <el-table-column prop="remark" label="备注" min-width="200" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="260">
          <template #default="{ row }">
            <el-button v-if="row.status === 'DRAFT'" type="primary" link @click="handleStart(row)">开始盘点</el-button>
            <el-button v-if="row.status === 'COUNTING'" type="success" link @click="handleSubmitReview(row)">提交审核</el-button>
            <el-button v-if="row.status === 'PENDING_APPROVE'" type="success" link @click="handleApprove(row)">通过</el-button>
            <el-button v-if="row.status === 'PENDING_APPROVE'" type="warning" link @click="handleReject(row)">驳回</el-button>
            <el-button type="primary" link @click="handleView(row)">查看</el-button>
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
        <el-form-item label="仓库" prop="warehouseId">
          <el-input v-model="form.warehouseId" placeholder="请输入仓库编号" />
        </el-form-item>
        <el-form-item label="盘点类型" prop="inventoryType">
          <el-select v-model="form.inventoryType" placeholder="请选择盘点类型">
            <el-option label="全盘" value="FULL" />
            <el-option label="抽盘" value="PARTIAL" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" type="textarea" :rows="4" placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleCreateSubmit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" :title="detailTitle" width="860px">
      <el-table :data="detailItems" border max-height="480">
        <el-table-column prop="productName" label="产品" width="160" />
        <el-table-column prop="locationCode" label="库位" width="120" />
        <el-table-column prop="batchNo" label="批次" width="140" />
        <el-table-column prop="bookQty" label="账面数量" width="100" />
        <el-table-column prop="actualQty" label="实际数量" width="100" />
        <el-table-column prop="diffQty" label="差异数量" width="100" />
        <el-table-column prop="reason" label="原因" min-width="220" show-overflow-tooltip />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import {
  approveStockInventory,
  createStockInventory,
  getStockInventoryList,
  rejectStockInventory,
  startStockInventory,
  submitStockInventory,
} from '@/api/stock'
import { formatDateTime } from '@/utils'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchKeyword = ref('')
const searchStatus = ref('')
const dialogVisible = ref(false)
const dialogTitle = ref('新增盘点')
const detailVisible = ref(false)
const detailTitle = ref('盘点明细')
const detailItems = ref<any[]>([])
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({ id: 0, warehouseId: '', inventoryType: 'FULL', remark: '' })

const formRules: FormRules = {
  warehouseId: [{ required: true, message: '请输入仓库编号', trigger: 'blur' }],
  inventoryType: [{ required: true, message: '请选择盘点类型', trigger: 'change' }],
}

function statusText(value?: string) {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    COUNTING: '盘点中',
    PENDING_APPROVE: '待审批',
    FINISHED: '已完成',
    CANCELLED: '已取消',
  }
  return map[value || ''] || value || '-'
}

function statusTag(value?: string) {
  if (value === 'FINISHED') return 'success'
  if (value === 'PENDING_APPROVE') return 'warning'
  if (value === 'COUNTING') return 'primary'
  if (value === 'CANCELLED') return 'info'
  return ''
}

function inventoryTypeText(value?: string) {
  return value === 'PARTIAL' ? '抽盘' : '全盘'
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getStockInventoryList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || undefined,
      status: searchStatus.value || undefined,
    })
    tableData.value = res.data?.records || res.data?.list || []
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
  searchKeyword.value = ''
  searchStatus.value = ''
  pagination.page = 1
  fetchData()
}

function handleAdd() {
  dialogTitle.value = '新增盘点'
  Object.assign(form, { id: 0, warehouseId: '', inventoryType: 'FULL', remark: '' })
  dialogVisible.value = true
}

function handleView(row: any) {
  detailTitle.value = `${row.inventoryNo || '盘点单'} - 明细`
  detailItems.value = row.items || []
  detailVisible.value = true
}

async function handleCreateSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    await createStockInventory({
      warehouseId: Number(form.warehouseId),
      inventoryType: form.inventoryType,
      remark: form.remark,
    })
    ElMessage.success('创建成功')
    dialogVisible.value = false
    await fetchData()
  } catch {
    // 已由全局拦截器处理
  }
}

async function handleStart(row: any) {
  await ElMessageBox.confirm(`确定开始盘点 ${row.inventoryNo}？`, '提示', { type: 'warning' })
  try {
    await startStockInventory(row.id)
    ElMessage.success('已开始盘点')
    await fetchData()
  } catch {
    // 已由全局拦截器处理
  }
}

async function handleSubmitReview(row: any) {
  await ElMessageBox.confirm(`确定提交审核 ${row.inventoryNo}？`, '提示', { type: 'warning' })
  try {
    await submitStockInventory(row.id)
    ElMessage.success('已提交审核')
    await fetchData()
  } catch {
    // 已由全局拦截器处理
  }
}

async function handleApprove(row: any) {
  await ElMessageBox.confirm(`确定通过 ${row.inventoryNo}？`, '提示', { type: 'warning' })
  try {
    await approveStockInventory(row.id)
    ElMessage.success('审核通过')
    await fetchData()
  } catch {
    // 已由全局拦截器处理
  }
}

async function handleReject(row: any) {
  await ElMessageBox.confirm(`确定驳回 ${row.inventoryNo}？`, '提示', { type: 'warning' })
  try {
    await rejectStockInventory(row.id)
    ElMessage.success('已驳回')
    await fetchData()
  } catch {
    // 已由全局拦截器处理
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
