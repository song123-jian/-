<template>
  <div class="page-container">
    <PageHeader title="仓库调拨">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>
        新增调拨
      </el-button>
    </PageHeader>

    <SearchBar :keyword="searchKeyword" @search="handleSearch" @reset="handleReset">
      <el-form-item label="调出仓库">
        <el-select v-model="searchWarehouseId" placeholder="全部" clearable filterable style="width: 180px">
          <el-option
            v-for="item in enabledWarehouseOptions"
            :key="item.id"
            :label="warehouseLabel(item)"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="调入仓库">
        <el-select v-model="searchToWarehouseId" placeholder="全部" clearable filterable style="width: 180px">
          <el-option
            v-for="item in enabledWarehouseOptions"
            :key="item.id"
            :label="warehouseLabel(item)"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="产品">
        <el-select v-model="searchProductId" placeholder="全部" clearable filterable style="width: 200px">
          <el-option
            v-for="item in transferProductOptions"
            :key="item.id"
            :label="productLabel(item)"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading" empty-text="暂无仓库调拨记录">
        <el-table-column prop="moveNo" label="调拨单号" min-width="170" show-overflow-tooltip />
        <el-table-column label="产品" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">
            {{ productText(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="qty" label="调拨数量" width="110">
          <template #default="{ row }">
            {{ Number(row.qty || 0).toFixed(0) }}
          </template>
        </el-table-column>
        <el-table-column prop="warehouseName" label="调出仓库" min-width="140" show-overflow-tooltip />
        <el-table-column prop="toWarehouseName" label="调入仓库" min-width="140" show-overflow-tooltip />
        <el-table-column prop="operatorName" label="操作人" width="120" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="调拨时间" width="170">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column label="状态" fixed="right" width="100">
          <template #default>
            <el-tag type="success" effect="plain">已记账</el-tag>
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

    <el-dialog v-model="dialogVisible" title="新增仓库调拨" width="720px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="108px">
        <el-form-item label="产品" prop="productId">
          <el-select v-model="form.productId" filterable placeholder="请选择调拨产品" style="width: 100%">
            <el-option
              v-for="item in transferProductOptions"
              :key="item.id"
              :label="productLabel(item)"
              :value="item.id"
            />
          </el-select>
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="调出仓库" prop="warehouseId">
              <el-select v-model="form.warehouseId" filterable placeholder="请选择调出仓库" style="width: 100%">
                <el-option
                  v-for="item in enabledWarehouseOptions"
                  :key="item.id"
                  :label="warehouseLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="调入仓库" prop="toWarehouseId">
              <el-select v-model="form.toWarehouseId" filterable placeholder="请选择调入仓库" style="width: 100%">
                <el-option
                  v-for="item in toWarehouseOptions"
                  :key="item.id"
                  :label="warehouseLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="调拨数量" prop="qty">
              <el-input-number v-model="form.qty" :min="1" :precision="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="可用库存">
              <el-input :model-value="availableQtyText" disabled />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="源批次/库位">
              <el-select
                v-model="form.sourceStockId"
                filterable
                clearable
                placeholder="自动选择可用批次"
                :disabled="!sourceStockOptions.length"
                style="width: 100%"
              >
                <el-option
                  v-for="item in sourceStockOptions"
                  :key="stockOptionKey(item)"
                  :label="stockSourceLabel(item)"
                  :value="stockOptionValue(item)"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="调拨金额">
              <el-input :model-value="transferAmountText" disabled />
            </el-form-item>
          </el-col>
        </el-row>

        <el-table :data="stockPreviewRows" size="small" border class="stock-preview" empty-text="暂无可用库存">
          <el-table-column prop="batchNo" label="批次" min-width="150" show-overflow-tooltip />
          <el-table-column prop="locationCode" label="库位" min-width="120" show-overflow-tooltip />
          <el-table-column prop="availableQty" label="可用量" width="100" align="right">
            <template #default="{ row }">{{ qtyText(transferStockAvailableQty(row)) }}</template>
          </el-table-column>
          <el-table-column prop="batchExpiryDate" label="有效期" width="120">
            <template #default="{ row }">{{ row.batchExpiryDate || '-' }}</template>
          </el-table-column>
          <el-table-column label="库存单价" width="120" align="right">
            <template #default="{ row }">{{ moneyText(transferStockUnitCost(row)) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="batchStatusTag(row.batchStatus)" effect="plain">
                {{ batchStatusText(row.batchStatus) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>

        <el-form-item label="备注" prop="remark">
          <el-input v-model.trim="form.remark" type="textarea" :rows="3" placeholder="可选" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getProductList } from '@/api/product'
import { getWarehouseList } from '@/api/warehouse'
import { getStockLedger, getStockList, stockTransfer } from '@/api/stock'
import { formatDateTime, formatMoney } from '@/utils'
import {
  buildStockTransferPayload,
  getSuggestedTransferStock,
  getTransferAmount,
  getTransferAvailableQty,
  getTransferStockAvailableQty,
  getTransferStockCandidates,
  getTransferStockUnitCost,
  isTransferProductEnabled,
  isTransferWarehouseEnabled,
  toStockTransferNumber,
  validateStockTransferInput,
  type StockTransferStockRowLike,
} from '@/utils/stock-transfer'

type OptionItem = {
  id: number
  code?: string
  name?: string
  isEnabled?: number
  status?: string | number
  type?: string
  unit?: string
}

type StockRow = StockTransferStockRowLike & {
  id?: number
  productUnit?: string
  locationCode?: string
}

type TransferForm = {
  productId: number | null
  warehouseId: number | null
  toWarehouseId: number | null
  sourceStockId: string
  qty: number | null
  remark: string
}

const loading = ref(false)
const tableData = ref<any[]>([])
const searchKeyword = ref('')
const searchWarehouseId = ref<number | null>(null)
const searchToWarehouseId = ref<number | null>(null)
const searchProductId = ref<number | null>(null)
const dialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const productOptions = ref<OptionItem[]>([])
const warehouseOptions = ref<OptionItem[]>([])
const stockRows = ref<StockRow[]>([])

const form = reactive<TransferForm>({
  productId: null,
  warehouseId: null,
  toWarehouseId: null,
  sourceStockId: '',
  qty: null,
  remark: '',
})

const enabledWarehouseOptions = computed(() =>
  warehouseOptions.value.filter((item) => isTransferWarehouseEnabled(item))
)

const transferProductOptions = computed(() =>
  productOptions.value.filter((item) => isTransferProductEnabled(item))
)

const toWarehouseOptions = computed(() =>
  enabledWarehouseOptions.value.filter((item) => Number(item.id) !== Number(form.warehouseId || 0))
)

const selectedProduct = computed(() =>
  productOptions.value.find((item) => Number(item.id) === Number(form.productId || 0))
)

const sourceStockOptions = computed(() =>
  getTransferStockCandidates(stockRows.value, form.productId, form.warehouseId) as StockRow[]
)

const selectedSourceStock = computed(() =>
  sourceStockOptions.value.find((item) => stockOptionValue(item) === form.sourceStockId)
)

const suggestedSourceStock = computed(() =>
  getSuggestedTransferStock(sourceStockOptions.value, form.qty) as StockRow | null
)

const sourceStock = computed(() => selectedSourceStock.value || suggestedSourceStock.value || null)

const stockPreviewRows = computed(() => sourceStockOptions.value.slice(0, 5))

const availableQty = computed(() => getTransferAvailableQty(sourceStockOptions.value))

const unitCost = computed(() => getTransferStockUnitCost(sourceStock.value))

const transferAmount = computed(() => getTransferAmount(form.qty || 0, unitCost.value))

const availableQtyText = computed(() => `${availableQty.value.toFixed(0)} ${selectedProduct.value?.unit || ''}`.trim())

const transferAmountText = computed(() => (unitCost.value > 0 ? formatMoney(transferAmount.value) : '-'))

const formRules: FormRules = {
  productId: [{ required: true, message: '请选择产品', trigger: 'change' }],
  warehouseId: [{ required: true, message: '请选择调出仓库', trigger: 'change' }],
  toWarehouseId: [
    { required: true, message: '请选择调入仓库', trigger: 'change' },
    {
      validator: (_rule, value, callback) => {
        if (value && Number(value) === Number(form.warehouseId)) {
          callback(new Error('调入仓库不能与调出仓库相同'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
  qty: [
    {
      validator: (_rule, value, callback) => {
        const message = validateStockTransferInput(
          { ...form, sourceStock: sourceStock.value },
          form.productId && form.warehouseId ? sourceStockOptions.value : undefined,
        )
        if (message) {
          callback(new Error(message === '请选择产品' || message === '请选择调出仓库' || message === '请选择调入仓库' ? '请输入调拨数量' : message))
          return
        }
        callback()
      },
      trigger: ['blur', 'change'],
    },
  ],
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function createTransferNo() {
  const now = new Date()
  return `DB-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function optionText(item?: OptionItem | null) {
  if (!item) return '-'
  return [item.code, item.name].filter(Boolean).join(' - ') || `#${item.id}`
}

function productLabel(item: OptionItem) {
  return optionText(item)
}

function warehouseLabel(item: OptionItem) {
  return optionText(item)
}

function productText(row: any) {
  return [row.productCode, row.productName].filter((item) => item && item !== '-').join(' - ') || '-'
}

function qtyText(value: any) {
  return toStockTransferNumber(value).toFixed(0)
}

function moneyText(value: any) {
  return toStockTransferNumber(value) > 0 ? formatMoney(toStockTransferNumber(value)) : '-'
}

function transferStockAvailableQty(row: StockRow) {
  return getTransferStockAvailableQty(row)
}

function transferStockUnitCost(row: StockRow) {
  return getTransferStockUnitCost(row)
}

function batchStatusTag(value?: string) {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
    NORMAL: 'success',
    EXPIRING: 'warning',
    EXPIRED: 'danger',
    DEPLETED: 'info',
  }
  return map[String(value || '').toUpperCase()] || 'info'
}

function batchStatusText(value?: string) {
  const map: Record<string, string> = {
    NORMAL: '正常',
    EXPIRING: '临期',
    EXPIRED: '已过期',
    DEPLETED: '已用尽',
  }
  return map[String(value || '').toUpperCase()] || '未记录'
}

function stockOptionValue(item: StockRow) {
  return `${item.id || 0}-${item.batchId || 0}-${item.locationId || 0}`
}

function stockOptionKey(item: StockRow) {
  return stockOptionValue(item)
}

function stockSourceLabel(item: StockRow) {
  const batch = item.batchNo && item.batchNo !== '-' ? item.batchNo : '未建批次'
  const location = item.locationCode && item.locationCode !== '-' ? item.locationCode : '默认库位'
  const expiry = item.batchExpiryDate ? ` / ${item.batchExpiryDate}` : ''
  return `${batch} / ${location} / 可用 ${qtyText(transferStockAvailableQty(item))}${selectedProduct.value?.unit || ''}${expiry}`.trim()
}

function resetForm() {
  Object.assign(form, {
    productId: null,
    warehouseId: null,
    toWarehouseId: null,
    sourceStockId: '',
    qty: null,
    remark: '',
  })
}

async function loadOptions() {
  try {
    const [productRes, warehouseRes, stockRes] = await Promise.all([
      getProductList({ page: 1, pageSize: 500 }),
      getWarehouseList({ page: 1, pageSize: 200 }),
      getStockList({ page: 1, pageSize: 1000 }),
    ])
    productOptions.value = productRes.data?.records || productRes.data?.list || []
    warehouseOptions.value = warehouseRes.data?.records || warehouseRes.data?.list || []
    stockRows.value = stockRes.data?.records || stockRes.data?.list || []
  } catch {
    productOptions.value = []
    warehouseOptions.value = []
    stockRows.value = []
  }
}

async function refreshStockRows() {
  try {
    const res: any = await getStockList({ page: 1, pageSize: 1000 })
    stockRows.value = res.data?.records || res.data?.list || []
  } catch {
    stockRows.value = []
  }
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getStockLedger({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || undefined,
      moveType: 'TRANSFER',
      moveReason: 'TRANSFER',
      warehouseId: searchWarehouseId.value || undefined,
      toWarehouseId: searchToWarehouseId.value || undefined,
      productId: searchProductId.value || undefined,
    })
    const rows = res.data?.records || res.data?.list || []
    tableData.value = rows
    pagination.total = res.data?.total || rows.length
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
  searchWarehouseId.value = null
  searchToWarehouseId.value = null
  searchProductId.value = null
  pagination.page = 1
  fetchData()
}

function handleAdd() {
  resetForm()
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function buildPayload() {
  return buildStockTransferPayload(
    {
      ...form,
      moveNo: createTransferNo(),
      sourceStock: sourceStock.value,
      unitCost: unitCost.value,
      amount: transferAmount.value,
    },
    sourceStockOptions.value,
  )
}

async function handleSubmit() {
  if (submitting.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    await stockTransfer(buildPayload())
    ElMessage.success('仓库调拨成功')
    dialogVisible.value = false
    await refreshStockRows()
    fetchData()
  } catch {
    // 交给全局拦截器提示
  } finally {
    submitting.value = false
  }
}

watch(
  () => form.warehouseId,
  () => {
    if (form.toWarehouseId && Number(form.toWarehouseId) === Number(form.warehouseId)) {
      form.toWarehouseId = null
    }
    nextTick(() => {
      formRef.value?.validateField('toWarehouseId').catch(() => undefined)
      formRef.value?.validateField('qty').catch(() => undefined)
    })
  }
)

watch(
  () => [form.productId, form.warehouseId],
  () => {
    if (form.sourceStockId && !selectedSourceStock.value) {
      form.sourceStockId = ''
    }
    if (form.productId && form.warehouseId && !form.qty && availableQty.value > 0) {
      form.qty = 1
    }
    nextTick(() => formRef.value?.validateField('qty').catch(() => undefined))
  }
)

watch(
  () => [form.qty, form.sourceStockId],
  () => {
    nextTick(() => formRef.value?.validateField('qty').catch(() => undefined))
  }
)

onMounted(async () => {
  await loadOptions()
  fetchData()
})
</script>

<style scoped lang="scss">
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.stock-preview {
  margin: 4px 0 18px;
}
</style>
