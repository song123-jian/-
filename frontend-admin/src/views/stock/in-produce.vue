<template>
  <div class="page-container">
    <PageHeader title="成品入库">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>
        新增入库
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
      <el-form-item label="产品">
        <el-select v-model="searchProductId" placeholder="全部" clearable filterable style="width: 200px">
          <el-option
            v-for="item in finishedProductOptions"
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

    <el-alert
      v-if="errorMessage"
      class="page-alert"
      type="error"
      :title="errorMessage"
      show-icon
      :closable="false"
    />

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading" empty-text="暂无成品入库记录">
        <el-table-column prop="moveNo" label="入库单号" min-width="170" show-overflow-tooltip />
        <el-table-column prop="prodOrderNo" label="生产工单" min-width="170" show-overflow-tooltip />
        <el-table-column label="产品" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">
            {{ productText(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="qty" label="入库数量" width="110">
          <template #default="{ row }">
            {{ Number(row.qty || 0).toFixed(0) }}
          </template>
        </el-table-column>
        <el-table-column prop="productUnit" label="单位" width="80" show-overflow-tooltip />
        <el-table-column label="入库单价" width="120" align="right">
          <template #default="{ row }">
            {{ moneyText(row.stockUnitCost) }}
          </template>
        </el-table-column>
        <el-table-column label="入库金额" width="120" align="right">
          <template #default="{ row }">
            {{ moneyText(row.stockAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="warehouseName" label="仓库" min-width="140" show-overflow-tooltip />
        <el-table-column prop="operatorName" label="操作人" width="120" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="入库时间" width="170">
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

    <el-dialog v-model="dialogVisible" title="新增成品入库" width="820px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="108px">
        <el-form-item label="生产工单" prop="prodOrderId">
          <el-select v-model="form.prodOrderId" filterable placeholder="请选择有合格产量的工单" style="width: 100%">
            <el-option
              v-for="item in inboundableProdOrderOptions"
              :key="item.id"
              :label="prodOrderLabel(item)"
              :value="item.id"
            />
          </el-select>
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="产品" prop="productId">
              <el-select v-model="form.productId" disabled placeholder="选择工单后自动带出" style="width: 100%">
                <el-option
                  v-for="item in finishedProductOptions"
                  :key="item.id"
                  :label="productLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="入库仓库" prop="warehouseId">
              <el-select v-model="form.warehouseId" filterable placeholder="请选择成品仓" style="width: 100%">
                <el-option
                  v-for="item in finishWarehouseOptions"
                  :key="item.id"
                  :label="warehouseLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <div class="inbound-summary">
          <div>
            <span>合格产量</span>
            <strong>{{ qualifiedQtyText }}</strong>
          </div>
          <div>
            <span>已入库</span>
            <strong>{{ inboundedQtyText }}</strong>
          </div>
          <div>
            <span>可入库</span>
            <strong>{{ remainingInboundQtyText }}</strong>
          </div>
          <div>
            <span>预计金额</span>
            <strong>{{ inboundAmountText }}</strong>
          </div>
        </div>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="入库数量" prop="qty">
              <el-input-number v-model="form.qty" :min="1" :precision="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="入库单价">
              <el-input :model-value="unitCostText" disabled />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="备注" prop="remark">
              <el-input v-model.trim="form.remark" placeholder="可选" />
            </el-form-item>
          </el-col>
        </el-row>
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
import { getStockLedger, stockInProduce } from '@/api/stock'
import { formatDateTime, formatMoney } from '@/utils'
import {
  getInboundedProductionAmount,
  getInboundedProductionQty,
  getProductionInboundAmount,
  getProductionInboundUnitCost,
  getQualifiedProductionQty,
  getRemainingProductionInboundQty,
  isProductionInboundOrderStatus,
  toProductionNumber,
} from '@/utils/production-inbound'

type OptionItem = {
  id: number
  code?: string
  name?: string
  orderNo?: string
  productId?: number
  productName?: string
  planQty?: number
  completedQty?: number
  qualifiedQty?: number
  badQty?: number
  pickedMaterialQty?: number
  pickedMaterialAmount?: number
  inboundedQty?: number
  inboundedAmount?: number
  isEnabled?: number
  status?: string
  type?: string
  unit?: string
  piecePrice?: number
  rawMaterialUsage?: number
}

type InProduceForm = {
  prodOrderId: number | null
  productId: number | null
  warehouseId: number | null
  qty: number
  remark: string
}

const loading = ref(false)
const tableData = ref<any[]>([])
const searchKeyword = ref('')
const searchWarehouseId = ref<number | null>(null)
const searchProductId = ref<number | null>(null)
const searchDate = ref<string[]>([])
const errorMessage = ref('')
const dialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const prodOrderOptions = ref<OptionItem[]>([])
const productOptions = ref<OptionItem[]>([])
const warehouseOptions = ref<OptionItem[]>([])
const inboundRows = ref<any[]>([])

const form = reactive<InProduceForm>({
  prodOrderId: null,
  productId: null,
  warehouseId: null,
  qty: 1,
  remark: '',
})

const enabledWarehouseOptions = computed(() =>
  warehouseOptions.value.filter((item) => item.isEnabled === undefined || Number(item.isEnabled) === 1)
)

const finishWarehouseOptions = computed(() => {
  const finishWarehouses = enabledWarehouseOptions.value.filter((item) => String(item.type || '').toUpperCase() === 'FINISH')
  return finishWarehouses.length ? finishWarehouses : enabledWarehouseOptions.value
})

const finishedProductOptions = computed(() =>
  productOptions.value.filter((item) => !['RAW', 'MATERIAL'].includes(String(item.type || '').toUpperCase()))
)

const selectedProdOrder = computed(() =>
  prodOrderOptions.value.find((item) => Number(item.id) === Number(form.prodOrderId || 0))
)

const selectedProduct = computed(() =>
  productOptions.value.find((item) => Number(item.id) === Number(form.productId || 0))
)

const inboundedQtyByOrder = computed(() => {
  return inboundRows.value.reduce((map, row) => {
    const key = Number(row.relatedOrderId || 0)
    if (key) {
      map.set(key, (map.get(key) || 0) + Number(row.qty || 0))
    }
    return map
  }, new Map<number, number>())
})

const inboundableProdOrderOptions = computed(() =>
  prodOrderOptions.value.filter((item) => isProductionInboundOrderStatus(item.status) && remainingQtyOf(item) > 0)
)

const qualifiedQty = computed(() => qualifiedQtyOf(selectedProdOrder.value))
const inboundedQty = computed(() => inboundedQtyOf(selectedProdOrder.value))
const inboundedAmount = computed(() => inboundedAmountOf(selectedProdOrder.value))
const remainingInboundQty = computed(() => Math.max(qualifiedQty.value - inboundedQty.value, 0))
const qualifiedQtyText = computed(() => `${qualifiedQty.value.toFixed(0)} ${selectedProduct.value?.unit || ''}`.trim())
const inboundedQtyText = computed(() => `${inboundedQty.value.toFixed(0)} ${selectedProduct.value?.unit || ''} / ${formatMoney(inboundedAmount.value)}`.trim())
const remainingInboundQtyText = computed(() => `${remainingInboundQty.value.toFixed(0)} ${selectedProduct.value?.unit || ''}`.trim())
const unitCost = computed(() => getProductionInboundUnitCost(selectedProdOrder.value, selectedProduct.value))
const inboundAmount = computed(() => getProductionInboundAmount(form.qty, selectedProdOrder.value, selectedProduct.value))
const unitCostText = computed(() => (unitCost.value > 0 ? formatMoney(unitCost.value) : '-'))
const inboundAmountText = computed(() => formatMoney(inboundAmount.value))

const formRules: FormRules = {
  prodOrderId: [{ required: true, message: '请选择生产工单', trigger: 'change' }],
  productId: [{ required: true, message: '请选择产品', trigger: 'change' }],
  warehouseId: [{ required: true, message: '请选择入库仓库', trigger: 'change' }],
  qty: [
    { required: true, message: '请输入入库数量', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        const qty = Number(value)
        if (!Number.isInteger(qty) || qty <= 0) {
          callback(new Error('入库数量必须是大于 0 的整数'))
          return
        }
        if (form.prodOrderId && qty > remainingInboundQty.value) {
          callback(new Error('入库数量不能超过可入库数量'))
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

function createInboundNo() {
  const now = new Date()
  return `RK-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${String(now.getMilliseconds()).padStart(3, '0')}`
}

function failureText(error: any, fallback: string) {
  return error?.message || error?.data?.message || fallback
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
    RUNNING: '生产中',
    PAUSED: '已暂停',
    FINISHED: '已完工',
  }
  return map[normalizeStatus(value)] || normalizeStatus(value)
}

function qualifiedQtyOf(order?: OptionItem | null) {
  return getQualifiedProductionQty(order)
}

function inboundedQtyOf(order?: OptionItem | null) {
  if (!order) return 0
  const recordedQty = getInboundedProductionQty(order)
  if (recordedQty > 0) return recordedQty
  return inboundedQtyByOrder.value.get(Number(order.id)) || 0
}

function inboundedAmountOf(order?: OptionItem | null) {
  if (!order) return 0
  const recordedAmount = getInboundedProductionAmount(order)
  if (recordedAmount > 0) return recordedAmount
  return inboundRows.value
    .filter((row) => Number(row.relatedOrderId || 0) === Number(order.id))
    .reduce((sum, row) => sum + toProductionNumber(row.stockAmount ?? row.amount), 0)
}

function remainingQtyOf(order: OptionItem) {
  const recordedRemainingQty = getRemainingProductionInboundQty(order)
  if (getInboundedProductionQty(order) > 0 || recordedRemainingQty < qualifiedQtyOf(order)) return recordedRemainingQty
  return Math.max(qualifiedQtyOf(order) - (inboundedQtyByOrder.value.get(Number(order.id)) || 0), 0)
}

function prodOrderLabel(item: OptionItem) {
  const product = productOptions.value.find((option) => Number(option.id) === Number(item.productId || 0))
  return `${optionText(item)} / ${product?.name || '未匹配产品'} / 可入库 ${remainingQtyOf(item).toFixed(0)} / ${statusLabel(item.status)}`
}

function productText(row: any) {
  return [row.productCode, row.productName].filter((item) => item && item !== '-').join(' - ') || '-'
}

function moneyText(value: any) {
  return formatMoney(toProductionNumber(value))
}

function resetForm() {
  Object.assign(form, {
    prodOrderId: null,
    productId: null,
    warehouseId: null,
    qty: 1,
    remark: '',
  })
}

async function loadOptions() {
  try {
    const [orderRes, productRes, warehouseRes, inboundRes] = await Promise.all([
      getProdOrderList({ page: 1, pageSize: 300 }),
      getProductList({ page: 1, pageSize: 500 }),
      getWarehouseList({ page: 1, pageSize: 200 }),
      getStockLedger({
        page: 1,
        pageSize: 1000,
        moveType: 'IN',
        moveReason: 'IN_PRODUCE',
        relatedOrderType: 'PROD_ORDER',
      }),
    ])
    prodOrderOptions.value = orderRes.data?.records || orderRes.data?.list || []
    productOptions.value = productRes.data?.records || productRes.data?.list || []
    warehouseOptions.value = warehouseRes.data?.records || warehouseRes.data?.list || []
    inboundRows.value = inboundRes.data?.records || inboundRes.data?.list || []
  } catch (error: any) {
    prodOrderOptions.value = []
    productOptions.value = []
    warehouseOptions.value = []
    inboundRows.value = []
    ElMessage.error(failureText(error, '成品入库基础选项加载失败，请检查生产工单、产品、仓库和入库记录。'))
  }
}

async function refreshInboundRows() {
  try {
    const res: any = await getStockLedger({
      page: 1,
      pageSize: 1000,
      moveType: 'IN',
      moveReason: 'IN_PRODUCE',
      relatedOrderType: 'PROD_ORDER',
    })
    inboundRows.value = res.data?.records || res.data?.list || []
  } catch (error: any) {
    inboundRows.value = []
    ElMessage.error(failureText(error, '成品入库记录刷新失败，请检查库存台账。'))
  }
}

async function fetchData() {
  loading.value = true
  try {
    errorMessage.value = ''
    const res: any = await getStockLedger({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || undefined,
      moveType: 'IN',
      moveReason: 'IN_PRODUCE',
      relatedOrderType: 'PROD_ORDER',
      warehouseId: searchWarehouseId.value || undefined,
      productId: searchProductId.value || undefined,
      startDate: searchDate.value?.[0] || undefined,
      endDate: searchDate.value?.[1] || undefined,
    })
    const rows = res.data?.records || res.data?.list || []
    tableData.value = rows
    pagination.total = res.data?.total || rows.length
  } catch (error: any) {
    tableData.value = []
    pagination.total = 0
    errorMessage.value = failureText(error, '成品入库记录加载失败，请检查 Supabase 连接、库存台账和成品入库配置。')
    ElMessage.error(errorMessage.value)
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
    moveNo: createInboundNo(),
    productId: form.productId,
    warehouseId: form.warehouseId,
    qty: form.qty,
    unitCost: unitCost.value > 0 ? unitCost.value : undefined,
    amount: unitCost.value > 0 ? inboundAmount.value : undefined,
    relatedOrderId: form.prodOrderId,
    relatedOrderType: 'PROD_ORDER',
    remark: form.remark || undefined,
  }
}

async function handleSubmit() {
  if (submitting.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    await stockInProduce(buildPayload())
    ElMessage.success('成品入库成功')
    dialogVisible.value = false
    await refreshInboundRows()
    fetchData()
  } catch (error: any) {
    ElMessage.error(failureText(error, '成品入库提交失败，请检查工单状态、合格产量、领料数量和入库数量。'))
  } finally {
    submitting.value = false
  }
}

watch(
  () => form.prodOrderId,
  () => {
    const order = selectedProdOrder.value
    form.productId = order?.productId ? Number(order.productId) : null
    form.qty = remainingInboundQty.value > 0 ? Math.max(1, remainingInboundQty.value) : 1
    nextTick(() => {
      formRef.value?.validateField('productId').catch(() => undefined)
      formRef.value?.validateField('qty').catch(() => undefined)
    })
  }
)

watch(
  () => [form.prodOrderId, form.warehouseId],
  () => {
    formRef.value?.validateField('qty').catch(() => undefined)
  }
)

watch(
  () => form.qty,
  () => {
    formRef.value?.validateField('qty').catch(() => undefined)
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

.page-alert {
  margin-bottom: 12px;
}

.inbound-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 0 0 18px;
}

.inbound-summary > div {
  min-width: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px 12px;
  background: var(--el-fill-color-lighter);
}

.inbound-summary span {
  display: block;
  margin-bottom: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.inbound-summary strong {
  display: block;
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .inbound-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
