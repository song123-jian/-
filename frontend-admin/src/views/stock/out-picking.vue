<template>
  <div class="page-container">
    <PageHeader title="生产领料">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>
        新增领料
      </el-button>
    </PageHeader>

    <SearchBar :keyword="searchKeyword" @search="handleSearch" @reset="handleReset">
      <el-form-item label="仓库">
        <el-select v-model="searchWarehouseId" placeholder="全部" clearable filterable style="width: 180px">
          <el-option
            v-for="item in warehouseOptions"
            :key="item.id"
            :label="warehouseLabel(item)"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="物料">
        <el-select v-model="searchProductId" placeholder="全部" clearable filterable style="width: 200px">
          <el-option
            v-for="item in materialOptions"
            :key="item.id"
            :label="productLabel(item)"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="日期">
        <el-date-picker
          v-model="searchDate"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 260px"
        />
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading" empty-text="暂无生产领料记录">
        <el-table-column prop="moveNo" label="领料单号" min-width="170" show-overflow-tooltip />
        <el-table-column prop="prodOrderNo" label="生产工单" min-width="170" show-overflow-tooltip />
        <el-table-column label="物料" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">
            {{ materialText(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="qty" label="领料数量" width="110">
          <template #default="{ row }">
            {{ Number(row.qty || 0).toFixed(0) }}
          </template>
        </el-table-column>
        <el-table-column prop="productUnit" label="单位" width="80" show-overflow-tooltip />
        <el-table-column label="领料单价" width="120" align="right">
          <template #default="{ row }">
            {{ moneyText(row.stockUnitCost) }}
          </template>
        </el-table-column>
        <el-table-column label="领料金额" width="120" align="right">
          <template #default="{ row }">
            {{ moneyText(pickingRowAmount(row)) }}
          </template>
        </el-table-column>
        <el-table-column prop="warehouseName" label="仓库" min-width="140" show-overflow-tooltip />
        <el-table-column prop="batchNo" label="批次" min-width="150" show-overflow-tooltip />
        <el-table-column label="批次状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.batchStatus" :type="batchStatusTag(row.batchStatus)" effect="plain">
              {{ batchStatusText(row.batchStatus) }}
            </el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="operatorName" label="领料人" width="120" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="领料时间" width="170">
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

    <el-dialog v-model="dialogVisible" title="新增领料" width="860px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="108px">
        <el-form-item label="生产工单" prop="prodOrderId">
          <el-select v-model="form.prodOrderId" filterable placeholder="请选择已派工工单" style="width: 100%">
            <el-option
              v-for="item in activeProdOrderOptions"
              :key="item.id"
              :label="prodOrderLabel(item)"
              :value="item.id"
            />
          </el-select>
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="物料" prop="productId">
              <el-select v-model="form.productId" filterable placeholder="请选择领用物料" style="width: 100%">
                <el-option
                  v-for="item in materialOptions"
                  :key="item.id"
                  :label="productLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="仓库" prop="warehouseId">
              <el-select v-model="form.warehouseId" filterable placeholder="请选择出库仓库" style="width: 100%">
                <el-option
                  v-for="item in enabledWarehouseOptions"
                  :key="item.id"
                  :label="warehouseLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <div class="picking-summary">
          <div>
            <span>计划用料</span>
            <strong>{{ plannedMaterialText }}</strong>
          </div>
          <div>
            <span>已领数量</span>
            <strong>{{ pickedMaterialText }}</strong>
          </div>
          <div>
            <span>剩余可领</span>
            <strong>{{ remainingMaterialText }}</strong>
          </div>
          <div>
            <span>预计金额</span>
            <strong>{{ pickingAmountText }}</strong>
          </div>
        </div>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="领料数量" prop="qty">
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
            <el-form-item label="出库批次" prop="batchId">
              <el-select v-model="form.batchId" filterable clearable placeholder="按有效期优先" style="width: 100%">
                <el-option
                  v-for="item in batchOptions"
                  :key="batchOptionKey(item)"
                  :label="batchLabel(item)"
                  :value="batchOptionValue(item)"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预计批次">
              <el-input :model-value="expectedBatchText" disabled />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="物料单位">
              <el-input :model-value="selectedUnitText" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="领料单价">
              <el-input :model-value="unitCostText" disabled />
            </el-form-item>
          </el-col>
        </el-row>

        <el-table :data="batchPreviewRows" size="small" border class="batch-preview" empty-text="暂无可用批次">
          <el-table-column prop="batchNo" label="批次" min-width="150" show-overflow-tooltip />
          <el-table-column prop="availableQty" label="可用量" width="100" align="right">
            <template #default="{ row }">{{ qtyText(row.availableQty) }}</template>
          </el-table-column>
          <el-table-column prop="batchExpiryDate" label="有效期" width="120">
            <template #default="{ row }">{{ row.batchExpiryDate || '-' }}</template>
          </el-table-column>
          <el-table-column prop="supplierName" label="供应商" min-width="140" show-overflow-tooltip />
          <el-table-column prop="locationCode" label="库位" min-width="120" show-overflow-tooltip />
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
import { getProdOrderList } from '@/api/prodOrder'
import { getProductList } from '@/api/product'
import { getWarehouseList } from '@/api/warehouse'
import { getStockLedger, getStockList, stockOutPicking } from '@/api/stock'
import { formatDateTime, formatMoney } from '@/utils'
import {
  getMaxSingleBatchQty,
  getPickedMaterialAmount,
  getPickedMaterialQty,
  getPickingBatchCandidates,
  getPlannedMaterialQty,
  getRemainingMaterialQty,
  getSuggestedPickingBatch,
  toPickingNumber,
  type PickingStockRowLike,
} from '@/utils/production-picking'

type OptionItem = {
  id: number
  code?: string
  name?: string
  orderNo?: string
  productId?: number
  productName?: string
  planQty?: number
  completedQty?: number
  rawMaterialQty?: number
  pickedMaterialQty?: number
  pickedMaterialAmount?: number
  rawMaterialId?: number
  rawMaterialUsage?: number
  isEnabled?: number
  status?: string
  type?: string
  unit?: string
  piecePrice?: number
}

type PickingForm = {
  prodOrderId: number | null
  productId: number | null
  warehouseId: number | null
  batchId: number | null
  qty: number
  remark: string
}

type StockRow = PickingStockRowLike & {
  batchNo?: string
  batchStatus?: string
  batchProductionDate?: string
  batchExpiryDate?: string
  supplierName?: string
  locationCode?: string
  productUnit?: string
  unitCost?: number
  inventoryAmount?: number
}

const loading = ref(false)
const tableData = ref<any[]>([])
const searchKeyword = ref('')
const searchWarehouseId = ref<number | null>(null)
const searchProductId = ref<number | null>(null)
const searchDate = ref<string[]>([])
const dialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const prodOrderOptions = ref<OptionItem[]>([])
const productOptions = ref<OptionItem[]>([])
const warehouseOptions = ref<OptionItem[]>([])
const stockRows = ref<StockRow[]>([])

const form = reactive<PickingForm>({
  prodOrderId: null,
  productId: null,
  warehouseId: null,
  batchId: null,
  qty: 1,
  remark: '',
})

const enabledWarehouseOptions = computed(() =>
  warehouseOptions.value.filter((item) => item.isEnabled === undefined || Number(item.isEnabled) === 1)
)

const materialOptions = computed(() =>
  productOptions.value.filter((item) => !item.type || ['RAW', 'MATERIAL', 'SEMI'].includes(String(item.type).toUpperCase()))
)

const activeProdOrderOptions = computed(() =>
  prodOrderOptions.value.filter((item) => ['SCHEDULED', 'RUNNING', 'PAUSED'].includes(normalizeStatus(item.status)))
)

const selectedProdOrder = computed(() =>
  prodOrderOptions.value.find((item) => Number(item.id) === Number(form.prodOrderId || 0))
)

const selectedMaterial = computed(() =>
  productOptions.value.find((item) => Number(item.id) === Number(form.productId || 0))
)

const selectedFinishedProduct = computed(() =>
  productOptions.value.find((item) => Number(item.id) === Number(selectedProdOrder.value?.productId || 0))
)

const batchOptions = computed(() =>
  getPickingBatchCandidates(stockRows.value, form.productId, form.warehouseId) as StockRow[]
)

const selectedBatch = computed(() => {
  if (form.batchId === null || form.batchId === undefined) return undefined
  return batchOptions.value.find((item) => Number(item.batchId || 0) === Number(form.batchId))
})

const suggestedBatch = computed(() => getSuggestedPickingBatch(batchOptions.value, form.qty) as StockRow | null)

const batchPreviewRows = computed(() => batchOptions.value.slice(0, 5))

const availableQty = computed(() => {
  if (!form.productId || !form.warehouseId) return 0
  return batchOptions.value.reduce((sum, item) => sum + toPickingNumber(item.availableQty), 0)
})

const maxSingleBatchQty = computed(() => getMaxSingleBatchQty(batchOptions.value))

const plannedMaterialQty = computed(() => getPlannedMaterialQty(selectedProdOrder.value, selectedFinishedProduct.value))

const pickedMaterialQty = computed(() => getPickedMaterialQty(selectedProdOrder.value))

const pickedMaterialAmount = computed(() => getPickedMaterialAmount(selectedProdOrder.value))

const remainingMaterialQty = computed(() => getRemainingMaterialQty(selectedProdOrder.value, selectedFinishedProduct.value))

const selectedUnitText = computed(() => selectedMaterial.value?.unit || '-')

const selectedUnit = computed(() => selectedMaterial.value?.unit || '')

const unitCost = computed(() => {
  const batchUnitCost = toPickingNumber(selectedBatch.value?.unitCost ?? suggestedBatch.value?.unitCost)
  if (batchUnitCost > 0) return batchUnitCost
  return toPickingNumber(selectedMaterial.value?.piecePrice)
})

const pickingAmount = computed(() => Number((Number(form.qty || 0) * unitCost.value).toFixed(2)))

const availableQtyText = computed(() =>
  `${qtyText(availableQty.value)} ${selectedUnit.value}`.trim()
)

const plannedMaterialText = computed(() =>
  plannedMaterialQty.value > 0 ? `${qtyText(plannedMaterialQty.value)} ${selectedUnit.value}`.trim() : '-'
)

const pickedMaterialText = computed(() =>
  `${qtyText(pickedMaterialQty.value)} ${selectedUnit.value} / ${formatMoney(pickedMaterialAmount.value)}`.trim()
)

const remainingMaterialText = computed(() =>
  plannedMaterialQty.value > 0 ? `${qtyText(remainingMaterialQty.value)} ${selectedUnit.value}`.trim() : '-'
)

const pickingAmountText = computed(() => formatMoney(pickingAmount.value))

const unitCostText = computed(() => (unitCost.value > 0 ? formatMoney(unitCost.value) : '-'))

const expectedBatchText = computed(() => {
  const row = selectedBatch.value || suggestedBatch.value
  return row ? batchLabel(row) : '-'
})

const formRules: FormRules = {
  prodOrderId: [{ required: true, message: '请选择生产工单', trigger: 'change' }],
  productId: [{ required: true, message: '请选择物料', trigger: 'change' }],
  warehouseId: [{ required: true, message: '请选择仓库', trigger: 'change' }],
  qty: [
    { required: true, message: '请输入领料数量', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        const qty = Number(value)
        if (!Number.isInteger(qty) || qty <= 0) {
          callback(new Error('领料数量必须是大于 0 的整数'))
          return
        }
        if (plannedMaterialQty.value > 0 && qty > remainingMaterialQty.value) {
          callback(new Error('领料数量不能超过工单剩余可领数量'))
          return
        }
        if (selectedBatch.value && qty > toPickingNumber(selectedBatch.value.availableQty)) {
          callback(new Error('领料数量不能超过所选批次可用量'))
          return
        }
        if (form.productId && form.warehouseId && !selectedBatch.value && qty > maxSingleBatchQty.value) {
          callback(new Error('单批次可用库存不足，请选择批次拆分领料'))
          return
        }
        if (form.productId && form.warehouseId && qty > availableQty.value) {
          callback(new Error('领料数量不能超过可用库存'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
}

function normalizeStatus(value?: string) {
  return String(value || '').toUpperCase()
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function createPickingNo() {
  const now = new Date()
  return `LL-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${String(now.getMilliseconds()).padStart(3, '0')}`
}

function optionText(item?: OptionItem | null) {
  if (!item) return '-'
  return [item.code || item.orderNo, item.name || item.productName].filter(Boolean).join(' - ') || `#${item.id}`
}

function productLabel(item: OptionItem) {
  return optionText(item)
}

function warehouseLabel(item: OptionItem) {
  return optionText(item)
}

function statusLabel(value?: string) {
  const map: Record<string, string> = {
    SCHEDULED: '已派工',
    RUNNING: '生产中',
    PAUSED: '已暂停',
  }
  return map[normalizeStatus(value)] || normalizeStatus(value)
}

function prodOrderLabel(item: OptionItem) {
  return `${optionText(item)} / ${statusLabel(item.status)}`
}

function materialText(row: any) {
  return [row.productCode, row.productName].filter((item) => item && item !== '-').join(' - ') || '-'
}

function qtyText(value: any) {
  return toPickingNumber(value).toFixed(0)
}

function moneyText(value: any) {
  return formatMoney(toPickingNumber(value))
}

function pickingRowAmount(row: any) {
  const recorded = toPickingNumber(row.amount ?? row.stockAmount)
  if (recorded > 0) return recorded
  return toPickingNumber(row.qty) * toPickingNumber(row.stockUnitCost)
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

function batchOptionKey(item: StockRow) {
  return `${item.batchId || 'legacy'}-${item.locationId || 'default'}-${item.id || 'row'}`
}

function batchOptionValue(item: StockRow) {
  return Number(item.batchId || 0)
}

function batchLabel(item: StockRow) {
  const batchNo = item.batchNo && item.batchNo !== '-' ? item.batchNo : '未建批次'
  const expiry = item.batchExpiryDate ? ` / ${item.batchExpiryDate}` : ''
  return `${batchNo} / 可用 ${qtyText(item.availableQty)}${selectedUnit.value}${expiry}`.trim()
}

function resetForm() {
  Object.assign(form, {
    prodOrderId: null,
    productId: null,
    warehouseId: null,
    batchId: null,
    qty: 1,
    remark: '',
  })
}

async function loadOptions() {
  try {
    const [orderRes, productRes, warehouseRes, stockRes] = await Promise.all([
      getProdOrderList({ page: 1, pageSize: 300 }),
      getProductList({ page: 1, pageSize: 500 }),
      getWarehouseList({ page: 1, pageSize: 200 }),
      getStockList({ page: 1, pageSize: 1000 }),
    ])
    prodOrderOptions.value = orderRes.data?.records || orderRes.data?.list || []
    productOptions.value = productRes.data?.records || productRes.data?.list || []
    warehouseOptions.value = warehouseRes.data?.records || warehouseRes.data?.list || []
    stockRows.value = stockRes.data?.records || stockRes.data?.list || []
  } catch {
    prodOrderOptions.value = []
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
      moveType: 'OUT',
      moveReason: 'OUT_PICKING',
      relatedOrderType: 'PROD_ORDER',
      warehouseId: searchWarehouseId.value || undefined,
      productId: searchProductId.value || undefined,
      startDate: searchDate.value?.[0] || undefined,
      endDate: searchDate.value?.[1] || undefined,
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
  searchProductId.value = null
  searchDate.value = []
  pagination.page = 1
  fetchData()
}

function handleAdd() {
  resetForm()
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function buildPayload() {
  return {
    moveNo: createPickingNo(),
    productId: form.productId,
    warehouseId: form.warehouseId,
    qty: form.qty,
    relatedOrderId: form.prodOrderId,
    relatedOrderType: 'PROD_ORDER',
    batchId: form.batchId || suggestedBatch.value?.batchId || undefined,
    locationId: selectedBatch.value?.locationId || suggestedBatch.value?.locationId || undefined,
    unitCost: unitCost.value > 0 ? unitCost.value : undefined,
    amount: unitCost.value > 0 ? pickingAmount.value : undefined,
    remark: form.remark || undefined,
  }
}

async function handleSubmit() {
  if (submitting.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    await stockOutPicking(buildPayload())
    ElMessage.success('领料出库成功')
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
  () => form.prodOrderId,
  () => {
    const order = selectedProdOrder.value
    const finishedProduct = productOptions.value.find((item) => Number(item.id) === Number(order?.productId || 0))
    if (finishedProduct?.rawMaterialId) {
      form.productId = Number(finishedProduct.rawMaterialId)
    }
    form.batchId = null
    nextTick(() => formRef.value?.validateField('qty').catch(() => undefined))
  }
)

watch(
  () => [form.productId, form.warehouseId],
  () => {
    if (form.batchId && !selectedBatch.value) {
      form.batchId = null
    }
    nextTick(() => formRef.value?.validateField('qty').catch(() => undefined))
  }
)

watch(
  () => form.batchId,
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

.picking-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 0 0 18px;
}

.picking-summary > div {
  min-width: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px 12px;
  background: var(--el-fill-color-lighter);
}

.picking-summary span {
  display: block;
  margin-bottom: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.picking-summary strong {
  display: block;
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-preview {
  margin: 4px 0 18px;
}

@media (max-width: 900px) {
  .picking-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
