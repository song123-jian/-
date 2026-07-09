<template>
  <div class="page-container">
    <PageHeader title="盘点单">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>
        新增盘点
      </el-button>
      <el-button plain @click="fetchData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </PageHeader>

    <el-alert
      v-if="errorMessage"
      class="page-alert"
      type="error"
      show-icon
      closable
      :title="errorMessage"
      @close="errorMessage = ''"
    />

    <SearchBar :keyword="searchKeyword" @search="handleSearch" @reset="handleReset">
      <el-form-item label="仓库">
        <el-select v-model="searchWarehouseId" placeholder="全部" clearable filterable style="width: 180px">
          <el-option
            v-for="item in enabledWarehouseOptions"
            :key="item.id"
            :label="warehouseLabel(item)"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="searchStatus" placeholder="全部" clearable style="width: 140px">
          <el-option label="草稿" value="DRAFT" />
          <el-option label="盘点中" value="COUNTING" />
          <el-option label="已提交" value="SUBMITTED" />
          <el-option label="待审批" value="PENDING_APPROVE" />
          <el-option label="已完成" value="FINISHED" />
          <el-option label="已取消" value="CANCELLED" />
        </el-select>
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading" empty-text="暂无盘点单记录">
        <el-table-column prop="inventoryNo" label="盘点单号" min-width="170" show-overflow-tooltip />
        <el-table-column prop="warehouseName" label="仓库" min-width="140" show-overflow-tooltip />
        <el-table-column prop="inventoryType" label="盘点类型" width="100">
          <template #default="{ row }">
            {{ inventoryTypeText(row.inventoryType) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="itemCount" label="明细项" width="90" />
        <el-table-column prop="diffItemCount" label="差异项" width="90" />
        <el-table-column prop="diffQty" label="差异数量" width="100">
          <template #default="{ row }">
            {{ formatQty(row.diffQty) }}
          </template>
        </el-table-column>
        <el-table-column prop="creatorName" label="创建人" width="110" show-overflow-tooltip />
        <el-table-column prop="approverName" label="审核人" width="110" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="创建时间" width="170">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column label="操作" fixed="right" width="300">
          <template #default="{ row }">
            <el-button v-if="row.status === 'DRAFT'" type="primary" link @click="handleStart(row)">开始盘点</el-button>
            <el-button v-if="row.status === 'COUNTING'" type="primary" link @click="handleView(row, true)">录入实盘</el-button>
            <el-button v-if="row.status === 'COUNTING'" type="success" link @click="handleSubmitReview(row)">提交审核</el-button>
            <el-button v-if="isApprovalStatus(row.status)" type="success" link @click="handleApprove(row)">通过</el-button>
            <el-button v-if="isApprovalStatus(row.status)" type="warning" link @click="handleReject(row)">驳回</el-button>
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

    <el-dialog v-model="dialogVisible" title="新增盘点" width="640px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="96px">
        <el-form-item label="仓库" prop="warehouseId">
          <el-select v-model="form.warehouseId" filterable placeholder="请选择盘点仓库" style="width: 100%">
            <el-option
              v-for="item in enabledWarehouseOptions"
              :key="item.id"
              :label="warehouseLabel(item)"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="盘点类型" prop="inventoryType">
          <el-select v-model="form.inventoryType" placeholder="请选择盘点类型" style="width: 100%">
            <el-option label="全盘" value="FULL" />
            <el-option label="抽盘" value="PARTIAL" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.inventoryType === 'PARTIAL'" label="抽盘产品" prop="productIds">
          <el-select v-model="form.productIds" multiple filterable placeholder="请选择抽盘产品" style="width: 100%">
            <el-option
              v-for="item in productOptions"
              :key="item.id"
              :label="productLabel(item)"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input v-model.trim="form.remark" type="textarea" :rows="3" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleCreateSubmit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" :title="detailTitle" width="980px">
      <el-alert
        class="detail-alert"
        :type="detailValidationMessage ? 'warning' : 'info'"
        :closable="false"
        show-icon
        :title="detailValidationMessage || detailSummaryText"
      />
      <el-table :data="detailItems" border max-height="500" empty-text="暂无盘点明细">
        <el-table-column label="产品" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">
            {{ productText(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="locationCode" label="库位" width="120" show-overflow-tooltip />
        <el-table-column prop="batchNo" label="批次" width="140" show-overflow-tooltip />
        <el-table-column label="供应商" min-width="170" show-overflow-tooltip>
          <template #default="{ row }">
            {{ supplierText(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="bookQty" label="账面数量" width="100">
          <template #default="{ row }">
            {{ formatQty(row.bookQty) }}
          </template>
        </el-table-column>
        <el-table-column prop="actualQty" label="实盘数量" width="150">
          <template #default="{ row }">
            <el-input-number
              v-if="detailEditMode"
              v-model="row.actualQty"
              :min="0"
              :precision="0"
              style="width: 120px"
              @change="recalculateDetail(row)"
            />
            <span v-else>{{ formatQty(row.actualQty) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="diffQty" label="差异数量" width="100">
          <template #default="{ row }">
            <el-tag :type="Number(row.diffQty || 0) === 0 ? 'success' : 'warning'" effect="plain">
              {{ formatQty(row.diffQty) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" min-width="180">
          <template #default="{ row }">
            <el-input
              v-if="detailEditMode"
              v-model.trim="row.reason"
              :placeholder="Number(row.diffQty || 0) === 0 ? '可选' : '差异必填'"
            />
            <span v-else>{{ row.reason || '-' }}</span>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <div class="detail-footer">
          <span>共 {{ detailItems.length }} 项，差异 {{ detailDiffItemCount }} 项，差异数量 {{ formatQty(detailDiffQty) }}</span>
          <span>
            <el-button @click="detailVisible = false">关闭</el-button>
            <el-button
              plain
              :disabled="!detailItems.length"
              @click="handleExportDetail"
            >
              导出明细
            </el-button>
            <el-button
              v-if="detailEditMode"
              type="primary"
              :disabled="Boolean(detailValidationMessage)"
              @click="handleSaveCount"
            >
              保存实盘
            </el-button>
          </span>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getProductList } from '@/api/product'
import {
  approveStockInventory,
  countStockInventory,
  createStockInventory,
  getStockInventoryList,
  rejectStockInventory,
  startStockInventory,
  submitStockInventory,
} from '@/api/stock'
import { getWarehouseList } from '@/api/warehouse'
import { formatDateTime } from '@/utils'
import {
  buildInventoryApprovalSummary,
  buildStockInventoryDetailCsv,
  getInventoryDiffQty,
  inventorySupplierText,
  validateInventoryCountItems,
} from '@/utils/stock-inventory'

type OptionItem = {
  id: number
  code?: string
  name?: string
  isEnabled?: number
}

type InventoryForm = {
  warehouseId: number | null
  inventoryType: 'FULL' | 'PARTIAL'
  productIds: number[]
  remark: string
}

const loading = ref(false)
const tableData = ref<any[]>([])
const errorMessage = ref('')
const searchKeyword = ref('')
const searchWarehouseId = ref<number | null>(null)
const searchStatus = ref('')
const dialogVisible = ref(false)
const detailVisible = ref(false)
const detailEditMode = ref(false)
const detailTitle = ref('盘点明细')
const detailItems = ref<any[]>([])
const selectedInventory = ref<any | null>(null)
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const warehouseOptions = ref<OptionItem[]>([])
const productOptions = ref<OptionItem[]>([])

const form = reactive<InventoryForm>({
  warehouseId: null,
  inventoryType: 'FULL',
  productIds: [],
  remark: '',
})

const enabledWarehouseOptions = computed(() =>
  warehouseOptions.value.filter((item) => item.isEnabled === undefined || Number(item.isEnabled) === 1)
)

const detailDiffItemCount = computed(() =>
  detailItems.value.filter((item) => Number(item.diffQty || 0) !== 0).length
)

const detailDiffQty = computed(() =>
  detailItems.value.reduce((sum, item) => sum + Number(item.diffQty || 0), 0)
)
const detailSummaryText = computed(() => buildInventoryApprovalSummary(detailItems.value))
const detailValidationMessage = computed(() =>
  detailEditMode.value ? validateInventoryCountItems(detailItems.value) : ''
)

const formRules: FormRules = {
  warehouseId: [{ required: true, message: '请选择盘点仓库', trigger: 'change' }],
  inventoryType: [{ required: true, message: '请选择盘点类型', trigger: 'change' }],
  productIds: [
    {
      validator: (_rule, value, callback) => {
        if (form.inventoryType === 'PARTIAL' && (!Array.isArray(value) || !value.length)) {
          callback(new Error('请选择抽盘产品'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
}

function statusText(value?: string) {
  const map: Record<string, string> = {
    DRAFT: '草稿',
    COUNTING: '盘点中',
    SUBMITTED: '已提交',
    PENDING_APPROVE: '待审批',
    FINISHED: '已完成',
    CANCELLED: '已取消',
  }
  return map[value || ''] || value || '-'
}

function statusTag(value?: string) {
  if (value === 'FINISHED') return 'success'
  if (value === 'PENDING_APPROVE' || value === 'SUBMITTED') return 'warning'
  if (value === 'COUNTING') return 'primary'
  if (value === 'CANCELLED') return 'info'
  return ''
}

function isApprovalStatus(value?: string) {
  return ['PENDING_APPROVE', 'SUBMITTED'].includes(String(value || '').toUpperCase())
}

function inventoryTypeText(value?: string) {
  if (value === 'MOBILE_CHECK') return '移动盘点'
  return value === 'PARTIAL' ? '抽盘' : '全盘'
}

function optionText(item?: OptionItem | null) {
  if (!item) return '-'
  return [item.code, item.name].filter(Boolean).join(' - ') || `#${item.id}`
}

function warehouseLabel(item: OptionItem) {
  return optionText(item)
}

function productLabel(item: OptionItem) {
  return optionText(item)
}

function productText(row: any) {
  return [row.productCode, row.productName].filter((item) => item && item !== '-').join(' - ') || '-'
}

function supplierText(row: any) {
  return inventorySupplierText(row)
}

function formatQty(value: any) {
  return Number(value || 0).toFixed(0)
}

function failureText(error: any, fallback: string) {
  return String(error?.message || '').trim() || fallback
}

function resetForm() {
  Object.assign(form, {
    warehouseId: null,
    inventoryType: 'FULL',
    productIds: [],
    remark: '',
  })
}

async function loadOptions() {
  try {
    const [warehouseRes, productRes] = await Promise.all([
      getWarehouseList({ page: 1, pageSize: 200 }),
      getProductList({ page: 1, pageSize: 500 }),
    ])
    warehouseOptions.value = warehouseRes.data?.records || warehouseRes.data?.list || []
    productOptions.value = productRes.data?.records || productRes.data?.list || []
  } catch (error: any) {
    errorMessage.value = failureText(error, '盘点基础选项加载失败，请检查仓库和产品配置。')
    ElMessage.error(errorMessage.value)
    warehouseOptions.value = []
    productOptions.value = []
  }
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getStockInventoryList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || undefined,
      warehouseId: searchWarehouseId.value || undefined,
      status: searchStatus.value || undefined,
    })
    const rows = res.data?.records || res.data?.list || []
    tableData.value = rows
    pagination.total = res.data?.total || rows.length
    errorMessage.value = ''
  } catch (error: any) {
    errorMessage.value = failureText(error, '盘点单加载失败，请检查 Supabase 连接、盘点单和库存明细。')
    ElMessage.error(errorMessage.value)
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
  searchWarehouseId.value = null
  searchStatus.value = ''
  pagination.page = 1
  fetchData()
}

function handleAdd() {
  resetForm()
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function handleView(row: any, editMode = false) {
  selectedInventory.value = row
  detailTitle.value = `${row.inventoryNo || '盘点单'} - 明细`
  detailEditMode.value = Boolean(editMode && row.status === 'COUNTING')
  detailItems.value = (row.items || []).map((item: any) => ({ ...item }))
  detailVisible.value = true
}

function recalculateDetail(row: any) {
  row.diffQty = getInventoryDiffQty({ ...row, diffQty: undefined })
}

async function confirmAction(message: string) {
  return ElMessageBox.confirm(message, '提示', { type: 'warning' })
    .then(() => true)
    .catch(() => false)
}

async function handleCreateSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    await createStockInventory({
      warehouseId: form.warehouseId,
      inventoryType: form.inventoryType,
      productIds: form.inventoryType === 'PARTIAL' ? form.productIds : undefined,
      remark: form.remark || undefined,
    })
    ElMessage.success('创建成功')
    dialogVisible.value = false
    await fetchData()
  } catch (error: any) {
    errorMessage.value = failureText(error, '盘点单创建失败，请检查盘点仓库、盘点类型和抽盘产品。')
    ElMessage.error(errorMessage.value)
  }
}

async function handleSaveCount() {
  if (detailValidationMessage.value) {
    ElMessage.error(detailValidationMessage.value)
    return
  }
  try {
    await countStockInventory(Number(selectedInventory.value?.id), {
      items: detailItems.value.map((item) => ({
        id: item.id,
        actualQty: Number(item.actualQty),
        reason: item.reason || '',
      })),
    })
    ElMessage.success('实盘已保存')
    detailVisible.value = false
    await fetchData()
  } catch (error: any) {
    errorMessage.value = failureText(error, '实盘保存失败，请检查实盘数量、差异原因和盘点状态。')
    ElMessage.error(errorMessage.value)
  }
}

function handleExportDetail() {
  if (!detailItems.value.length) {
    ElMessage.warning('暂无可导出的盘点明细')
    return
  }
  const csv = buildStockInventoryDetailCsv(selectedInventory.value || {}, detailItems.value)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
  link.href = url
  link.download = `盘点明细_${selectedInventory.value?.inventoryNo || timestamp}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

async function handleStart(row: any) {
  if (!(await confirmAction(`确定开始盘点 ${row.inventoryNo}？`))) return
  try {
    await startStockInventory(row.id)
    ElMessage.success('已开始盘点')
    await fetchData()
  } catch (error: any) {
    errorMessage.value = failureText(error, '开始盘点失败，请检查盘点单状态。')
    ElMessage.error(errorMessage.value)
  }
}

async function handleSubmitReview(row: any) {
  const message = `${row.inventoryNo}：${buildInventoryApprovalSummary(row.items || [])}。确定提交审核？`
  if (!(await confirmAction(message))) return
  try {
    await submitStockInventory(row.id)
    ElMessage.success('已提交审核')
    await fetchData()
  } catch (error: any) {
    errorMessage.value = failureText(error, '提交盘点审核失败，请检查盘点明细是否完整。')
    ElMessage.error(errorMessage.value)
  }
}

async function handleApprove(row: any) {
  const validationMessage = validateInventoryCountItems(row.items || [])
  if (validationMessage) {
    ElMessage.error(validationMessage)
    return
  }
  const message = `${row.inventoryNo}：${buildInventoryApprovalSummary(row.items || [])}。审核通过后库存将按盘点差异调整。`
  if (!(await confirmAction(message))) return
  try {
    await approveStockInventory(row.id)
    ElMessage.success('审核通过')
    await fetchData()
  } catch (error: any) {
    errorMessage.value = failureText(error, '盘点审核通过失败，请检查盘亏后库存、锁定量和审批状态。')
    ElMessage.error(errorMessage.value)
  }
}

async function handleReject(row: any) {
  if (!(await confirmAction(`确定驳回 ${row.inventoryNo}？`))) return
  try {
    await rejectStockInventory(row.id)
    ElMessage.success('已驳回')
    await fetchData()
  } catch (error: any) {
    errorMessage.value = failureText(error, '盘点驳回失败，请检查盘点单状态。')
    ElMessage.error(errorMessage.value)
  }
}

watch(
  () => form.inventoryType,
  () => {
    if (form.inventoryType === 'FULL') {
      form.productIds = []
    }
    nextTick(() => formRef.value?.validateField('productIds').catch(() => undefined))
  }
)

onMounted(async () => {
  await loadOptions()
  fetchData()
})
</script>

<style scoped lang="scss">
.page-alert {
  margin-bottom: 12px;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.detail-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.detail-alert {
  margin-bottom: 12px;
}
</style>
