<template>
  <div class="page-container">
    <PageHeader title="销售出库">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>
        新增出库
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

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading" empty-text="暂无销售出库记录">
        <el-table-column prop="moveNo" label="出库单号" min-width="170" show-overflow-tooltip />
        <el-table-column prop="saleOrderNo" label="销售订单" min-width="170" show-overflow-tooltip />
        <el-table-column prop="customerName" label="客户" min-width="150" show-overflow-tooltip />
        <el-table-column label="产品" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">
            {{ productText(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="qty" label="出库数量" width="110">
          <template #default="{ row }">
            {{ Number(row.qty || 0).toFixed(0) }}
          </template>
        </el-table-column>
        <el-table-column prop="productUnit" label="单位" width="80" show-overflow-tooltip />
        <el-table-column label="销售金额" width="120" align="right">
          <template #default="{ row }">{{ moneyText(row.saleAmount) }}</template>
        </el-table-column>
        <el-table-column label="出库成本" width="120" align="right">
          <template #default="{ row }">{{ moneyText(row.materialCost) }}</template>
        </el-table-column>
        <el-table-column label="出库毛利" width="120" align="right">
          <template #default="{ row }">
            <span :class="{ negative: Number(row.grossProfit || 0) < 0 }">{{ moneyText(row.grossProfit) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="成本状态" width="110">
          <template #default="{ row }">
            <el-tag :type="costStatusTag(row.costStatus)" effect="plain">
              {{ costStatusText(row.costStatus, row.costGapReason) }}
            </el-tag>
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
        <el-table-column prop="operatorName" label="操作人" width="120" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="出库时间" width="170">
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

    <el-dialog v-model="dialogVisible" title="新增销售出库" width="860px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="108px">
        <el-form-item label="销售订单" prop="saleOrderId">
          <el-select v-model="form.saleOrderId" filterable placeholder="请选择已审核销售订单" style="width: 100%">
            <el-option
              v-for="item in shippableSaleOrderOptions"
              :key="item.id"
              :label="saleOrderLabel(item)"
              :value="item.id"
            />
          </el-select>
        </el-form-item>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="订单产品" prop="saleOrderItemId">
              <el-select
                v-model="form.saleOrderItemId"
                :disabled="!form.saleOrderId"
                filterable
                placeholder="请选择订单产品"
                style="width: 100%"
              >
                <el-option
                  v-for="item in selectableOrderItems"
                  :key="item.id"
                  :label="saleOrderItemLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="出库仓库" prop="warehouseId">
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

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="产品" prop="productId">
              <el-select v-model="form.productId" disabled placeholder="选择订单产品后自动带出" style="width: 100%">
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
            <el-form-item label="可用库存">
              <el-input :model-value="availableQtyText" disabled />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="订单数量">
              <el-input :model-value="orderQtyText" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="已出库">
              <el-input :model-value="shippedQtyText" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="可出库">
              <el-input :model-value="maxShipQtyText" disabled />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="出库数量" prop="qty">
              <el-input-number v-model="form.qty" :min="1" :precision="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="出库批次/库位" prop="sourceStockId">
              <el-select
                v-model="form.sourceStockId"
                filterable
                clearable
                placeholder="按有效期优先"
                :disabled="!batchOptions.length"
                style="width: 100%"
              >
                <el-option
                  v-for="item in batchOptions"
                  :key="batchOptionKey(item)"
                  :label="batchLabel(item)"
                  :value="batchOptionValue(item)"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="发货日期" prop="deliveryDate">
              <el-date-picker v-model="form.deliveryDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="发货状态" prop="deliveryStatus">
              <el-select v-model="form.deliveryStatus" style="width: 100%">
                <el-option
                  v-for="item in deliveryStatusOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="物流公司" prop="logisticsCompany">
              <el-input v-model.trim="form.logisticsCompany" placeholder="可选" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="运单号" prop="trackingNo">
              <el-input v-model.trim="form.trackingNo" placeholder="可选" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="shipment-summary">
          <div>
            <span>预计批次</span>
            <strong>{{ expectedBatchText }}</strong>
          </div>
          <div>
            <span>销售金额</span>
            <strong>{{ saleAmountText }}</strong>
          </div>
          <div>
            <span>出库成本</span>
            <strong>{{ costAmountText }}</strong>
          </div>
          <div>
            <span>预计毛利</span>
            <strong>{{ grossProfitText }}</strong>
          </div>
        </div>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="出库单价">
              <el-input :model-value="unitCostText" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="备注" prop="remark">
              <el-input v-model.trim="form.remark" placeholder="可选" />
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
          <el-table-column prop="locationCode" label="库位" min-width="120" show-overflow-tooltip />
          <el-table-column label="成本单价" width="110" align="right">
            <template #default="{ row }">{{ moneyText(batchUnitCost(row)) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="batchStatusTag(row.batchStatus)" effect="plain">{{ batchStatusText(row.batchStatus) }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
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
import { getCustomerList } from '@/api/customer'
import { getProductList } from '@/api/product'
import { getSaleOrderItemList, getSaleOrderList } from '@/api/saleOrder'
import { getWarehouseList } from '@/api/warehouse'
import { getStockLedger, getStockList, stockOutSale } from '@/api/stock'
import { formatDate, formatDateTime, formatMoney } from '@/utils'
import { getSaleDeliveryStatusText } from '@/utils/sale-delivery'
import {
  buildSaleShipmentPayload,
  getDeliveredSaleQty,
  getMaxSingleSaleShipmentBatchQty,
  getSaleShipmentBatchCandidates,
  getSaleShipmentCostAmount,
  getSaleShipmentSaleAmount,
  getSaleShipmentStockAvailableQty,
  getSaleShipmentStockOptionValue,
  getSaleShipmentUnitCost,
  getSelectedSaleShipmentBatch,
  getSuggestedSaleShipmentBatch,
  isSaleOrderShippable,
  toSaleNumber,
} from '@/utils/sale-shipment'

type OptionItem = {
  id: number
  code?: string
  name?: string
  shortName?: string
  orderNo?: string
  customerId?: number
  saleOrderId?: number
  productId?: number
  qty?: number
  deliveredQty?: number
  isEnabled?: number
  status?: string
  type?: string
  unit?: string
  piecePrice?: number
  unitPrice?: number
}

type StockRow = {
  id?: number
  productId?: number
  warehouseId?: number
  locationId?: number
  batchId?: number
  qty?: number
  lockedQty?: number
  batchNo?: string
  batchStatus?: string
  batchProductionDate?: string
  batchExpiryDate?: string
  locationCode?: string
  availableQty?: number
  unitCost?: number
  stockUnitCost?: number
  inventoryAmount?: number
  stockAmount?: number
  updateTime?: string
}

type SaleOutForm = {
  saleOrderId: number | null
  saleOrderItemId: number | null
  productId: number | null
  warehouseId: number | null
  sourceStockId: string
  qty: number | null
  deliveryDate: string
  deliveryStatus: string
  logisticsCompany: string
  trackingNo: string
  remark: string
}

const loading = ref(false)
const tableData = ref<any[]>([])
const errorMessage = ref('')
const searchKeyword = ref('')
const searchWarehouseId = ref<number | null>(null)
const searchProductId = ref<number | null>(null)
const searchDate = ref<string[]>([])
const dialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const saleOrderOptions = ref<OptionItem[]>([])
const saleOrderItemOptions = ref<OptionItem[]>([])
const customerOptions = ref<OptionItem[]>([])
const productOptions = ref<OptionItem[]>([])
const warehouseOptions = ref<OptionItem[]>([])
const stockRows = ref<any[]>([])
const outboundRows = ref<any[]>([])
const creatableDeliveryStatuses = ['SHIPPED', 'IN_TRANSIT', 'RECEIVED'] as const

const form = reactive<SaleOutForm>({
  saleOrderId: null,
  saleOrderItemId: null,
  productId: null,
  warehouseId: null,
  sourceStockId: '',
  qty: null,
  deliveryDate: formatDate(new Date()),
  deliveryStatus: 'SHIPPED',
  logisticsCompany: '',
  trackingNo: '',
  remark: '',
})

const customerMap = computed(() => new Map(customerOptions.value.map((item) => [Number(item.id), item])))

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

const shippableSaleOrderOptions = computed(() =>
  saleOrderOptions.value.filter((item) => isSaleOrderShippable(item.status) && hasRemainingItems(item.id))
)

const selectableOrderItems = computed(() =>
  saleOrderItemOptions.value.filter((item) => Number(item.saleOrderId) === Number(form.saleOrderId || 0) && remainingOrderQtyOf(item) > 0)
)

const selectedSaleOrderItem = computed(() =>
  saleOrderItemOptions.value.find((item) => Number(item.id) === Number(form.saleOrderItemId || 0))
)

const selectedProduct = computed(() =>
  productOptions.value.find((item) => Number(item.id) === Number(form.productId || 0))
)

const batchOptions = computed(() =>
  getSaleShipmentBatchCandidates(stockRows.value, form.productId, form.warehouseId) as StockRow[]
)

const selectedBatch = computed(() => getSelectedSaleShipmentBatch(batchOptions.value, form.sourceStockId) as StockRow | null)

const suggestedBatch = computed(() => getSuggestedSaleShipmentBatch(batchOptions.value, form.qty) as StockRow | null)

const sourceBatch = computed(() => selectedBatch.value || suggestedBatch.value || null)

const batchPreviewRows = computed(() => batchOptions.value.slice(0, 5))

const orderQty = computed(() => Number(selectedSaleOrderItem.value?.qty || 0))
const shippedQty = computed(() => (selectedSaleOrderItem.value ? shippedQtyOf(selectedSaleOrderItem.value) : 0))
const remainingOrderQty = computed(() => Math.max(orderQty.value - shippedQty.value, 0))
const availableQty = computed(() => {
  if (!form.productId || !form.warehouseId) return 0
  return batchOptions.value.reduce((sum, item) => sum + getSaleShipmentStockAvailableQty(item), 0)
})
const maxSingleBatchQty = computed(() => getMaxSingleSaleShipmentBatchQty(batchOptions.value))
const maxShipQty = computed(() => Math.min(remainingOrderQty.value, availableQty.value))
const unitText = computed(() => selectedProduct.value?.unit || '')
const orderQtyText = computed(() => `${orderQty.value.toFixed(0)} ${unitText.value}`.trim())
const shippedQtyText = computed(() => `${shippedQty.value.toFixed(0)} ${unitText.value}`.trim())
const availableQtyText = computed(() => `${availableQty.value.toFixed(0)} ${unitText.value}`.trim())
const maxShipQtyText = computed(() => `${maxShipQty.value.toFixed(0)} ${unitText.value}`.trim())
const unitCost = computed(() => getSaleShipmentUnitCost(sourceBatch.value, selectedProduct.value))
const saleAmount = computed(() => getSaleShipmentSaleAmount(form.qty || 0, selectedSaleOrderItem.value))
const costAmount = computed(() => getSaleShipmentCostAmount(form.qty || 0, unitCost.value))
const grossProfit = computed(() => Number((saleAmount.value - costAmount.value).toFixed(2)))
const saleAmountText = computed(() => moneyText(saleAmount.value))
const costAmountText = computed(() => moneyText(costAmount.value))
const grossProfitText = computed(() => moneyText(grossProfit.value))
const unitCostText = computed(() => (unitCost.value > 0 ? moneyText(unitCost.value) : '-'))
const expectedBatchText = computed(() => {
  const row = sourceBatch.value
  return row ? batchLabel(row) : '-'
})
const deliveryStatusOptions = creatableDeliveryStatuses.map((value) => ({
  value,
  label: getSaleDeliveryStatusText(value),
}))

const formRules: FormRules = {
  saleOrderId: [{ required: true, message: '请选择销售订单', trigger: 'change' }],
  saleOrderItemId: [{ required: true, message: '请选择订单产品', trigger: 'change' }],
  productId: [{ required: true, message: '请选择产品', trigger: 'change' }],
  warehouseId: [{ required: true, message: '请选择出库仓库', trigger: 'change' }],
  deliveryDate: [{ required: true, message: '请选择发货日期', trigger: 'change' }],
  deliveryStatus: [
    {
      validator: (_rule, value, callback) => {
        if (!creatableDeliveryStatuses.includes(String(value || '').toUpperCase() as (typeof creatableDeliveryStatuses)[number])) {
          callback(new Error('请选择正确的发货状态'))
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
        if (value === null || value === undefined || value === '') {
          callback(new Error('请输入出库数量'))
          return
        }
        const qty = Number(value)
        if (!Number.isInteger(qty) || qty <= 0) {
          callback(new Error('出库数量必须是大于 0 的整数'))
          return
        }
        if (form.saleOrderItemId && qty > remainingOrderQty.value) {
          callback(new Error('出库数量不能超过订单可出库数量'))
          return
        }
        if (form.productId && form.warehouseId && qty > availableQty.value) {
          callback(new Error('出库数量不能超过可用库存'))
          return
        }
        if (form.productId && form.warehouseId && qty > maxSingleBatchQty.value) {
          callback(new Error('单批次或库位可用库存不足，请拆分出库'))
          return
        }
        if (form.productId && form.warehouseId && sourceBatch.value && qty > getSaleShipmentStockAvailableQty(sourceBatch.value)) {
          callback(new Error('所选批次/库位可用库存不足，请重新选择或拆分出库'))
          return
        }
        callback()
      },
      trigger: ['blur', 'change'],
    },
  ],
}

function normalizeStatus(value?: string) {
  return String(value || '').toUpperCase()
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function createOutNo() {
  const now = new Date()
  return `CK-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function optionText(item?: OptionItem | null) {
  if (!item) return '-'
  return [item.code || item.orderNo, item.name || item.shortName].filter(Boolean).join(' - ') || `#${item.id}`
}

function productLabel(item: OptionItem) {
  return optionText(item)
}

function warehouseLabel(item: OptionItem) {
  return optionText(item)
}

function customerName(customerId?: number) {
  const item = customerMap.value.get(Number(customerId || 0))
  return item?.shortName || item?.name || '-'
}

function statusLabel(value?: string) {
  const map: Record<string, string> = {
    APPROVED: '已审核',
    CONFIRMED: '已确认',
    PARTIAL: '部分出库',
    SHIPPED: '已出库',
  }
  return map[normalizeStatus(value)] || normalizeStatus(value)
}

function saleOrderLabel(item: OptionItem) {
  return `${optionText(item)} / ${customerName(item.customerId)} / ${statusLabel(item.status)}`
}

function shippedQtyOf(item: OptionItem) {
  const itemId = Number(item.id || 0)
  const shippedByItemLedger = outboundRows.value
    .filter((row) => Number(row.saleOrderItemId || 0) === itemId)
    .reduce((sum, row) => sum + toSaleNumber(row.qty), 0)
  const shippedByProductLedger = outboundRows.value
    .filter((row) => !row.saleOrderItemId && Number(row.relatedOrderId) === Number(item.saleOrderId) && Number(row.productId) === Number(item.productId))
    .reduce((sum, row) => sum + toSaleNumber(row.qty), 0)
  return Math.max(getDeliveredSaleQty(item), shippedByItemLedger + shippedByProductLedger)
}

function remainingOrderQtyOf(item: OptionItem) {
  return Math.max(Number(item.qty || 0) - shippedQtyOf(item), 0)
}

function hasRemainingItems(saleOrderId?: number) {
  return saleOrderItemOptions.value.some((item) => Number(item.saleOrderId) === Number(saleOrderId || 0) && remainingOrderQtyOf(item) > 0)
}

function saleOrderItemLabel(item: OptionItem) {
  const product = productOptions.value.find((option) => Number(option.id) === Number(item.productId || 0))
  return `${productLabel(product || { id: Number(item.productId || 0) })} / 订单 ${Number(item.qty || 0).toFixed(0)} / 可出库 ${remainingOrderQtyOf(item).toFixed(0)}`
}

function productText(row: any) {
  return [row.productCode, row.productName].filter((item) => item && item !== '-').join(' - ') || '-'
}

function moneyText(value: any) {
  return formatMoney(Number(value || 0))
}

function qtyText(value: any) {
  return toSaleNumber(value).toFixed(0)
}

function costStatusTag(value?: string) {
  return value === 'GAP' ? 'warning' : 'success'
}

function costStatusText(value?: string, reason?: string) {
  if (value === 'GAP') return reason || '缺成本'
  if (value === 'ACTUAL') return '已结转'
  if (value === 'ESTIMATED') return '已估算'
  return '-'
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

function failureText(error: any, fallback: string) {
  return String(error?.message || '').trim() || fallback
}

function batchOptionKey(item: StockRow) {
  return getSaleShipmentStockOptionValue(item)
}

function batchOptionValue(item: StockRow) {
  return getSaleShipmentStockOptionValue(item)
}

function batchUnitCost(item: StockRow) {
  return getSaleShipmentUnitCost(item, selectedProduct.value)
}

function batchLabel(item: StockRow) {
  const batchNo = item.batchNo && item.batchNo !== '-' ? item.batchNo : '未建批次'
  const location = item.locationCode && item.locationCode !== '-' ? item.locationCode : '默认库位'
  const expiry = item.batchExpiryDate ? ` / ${item.batchExpiryDate}` : ''
  return `${batchNo} / ${location} / 可用 ${qtyText(getSaleShipmentStockAvailableQty(item))}${unitText.value}${expiry}`.trim()
}

function resetForm() {
  Object.assign(form, {
    saleOrderId: null,
    saleOrderItemId: null,
    productId: null,
    warehouseId: null,
    sourceStockId: '',
    qty: null,
    deliveryDate: formatDate(new Date()),
    deliveryStatus: 'SHIPPED',
    logisticsCompany: '',
    trackingNo: '',
    remark: '',
  })
}

async function loadOptions() {
  try {
    const [orderRes, itemRes, customerRes, productRes, warehouseRes, stockRes, outboundRes] = await Promise.all([
      getSaleOrderList({ page: 1, pageSize: 300 }),
      getSaleOrderItemList({ page: 1, pageSize: 1000 }),
      getCustomerList({ page: 1, pageSize: 500 }),
      getProductList({ page: 1, pageSize: 500 }),
      getWarehouseList({ page: 1, pageSize: 200 }),
      getStockList({ page: 1, pageSize: 1000 }),
      getStockLedger({
        page: 1,
        pageSize: 1000,
        moveType: 'OUT',
        moveReason: 'OUT_SALE',
        relatedOrderType: 'SALE_ORDER',
      }),
    ])
    saleOrderOptions.value = orderRes.data?.records || orderRes.data?.list || []
    saleOrderItemOptions.value = itemRes.data?.records || itemRes.data?.list || []
    customerOptions.value = customerRes.data?.records || customerRes.data?.list || []
    productOptions.value = productRes.data?.records || productRes.data?.list || []
    warehouseOptions.value = warehouseRes.data?.records || warehouseRes.data?.list || []
    stockRows.value = stockRes.data?.records || stockRes.data?.list || []
    outboundRows.value = outboundRes.data?.records || outboundRes.data?.list || []
  } catch (error: any) {
    errorMessage.value = failureText(error, '销售出库基础选项加载失败，请检查销售订单、客户、产品、仓库和库存配置。')
    ElMessage.error(errorMessage.value)
    saleOrderOptions.value = []
    saleOrderItemOptions.value = []
    customerOptions.value = []
    productOptions.value = []
    warehouseOptions.value = []
    stockRows.value = []
    outboundRows.value = []
  }
}

async function refreshAfterSubmit() {
  try {
    const [orderRes, itemRes, stockRes, outboundRes] = await Promise.all([
      getSaleOrderList({ page: 1, pageSize: 300 }),
      getSaleOrderItemList({ page: 1, pageSize: 1000 }),
      getStockList({ page: 1, pageSize: 1000 }),
      getStockLedger({
        page: 1,
        pageSize: 1000,
        moveType: 'OUT',
        moveReason: 'OUT_SALE',
        relatedOrderType: 'SALE_ORDER',
      }),
    ])
    saleOrderOptions.value = orderRes.data?.records || orderRes.data?.list || []
    saleOrderItemOptions.value = itemRes.data?.records || itemRes.data?.list || []
    stockRows.value = stockRes.data?.records || stockRes.data?.list || []
    outboundRows.value = outboundRes.data?.records || outboundRes.data?.list || []
  } catch {
    // 列表刷新失败不阻断已完成的出库提交
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
      moveReason: 'OUT_SALE',
      relatedOrderType: 'SALE_ORDER',
      warehouseId: searchWarehouseId.value || undefined,
      productId: searchProductId.value || undefined,
      startDate: searchDate.value?.[0] || undefined,
      endDate: searchDate.value?.[1] || undefined,
    })
    const rows = res.data?.records || res.data?.list || []
    tableData.value = rows
    pagination.total = res.data?.total || rows.length
    errorMessage.value = ''
  } catch (error: any) {
    errorMessage.value = failureText(error, '销售出库记录加载失败，请检查库存台账、销售订单和成本字段。')
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
  return buildSaleShipmentPayload({
    moveNo: createOutNo(),
    saleOrderItemId: form.saleOrderItemId,
    productId: form.productId,
    warehouseId: form.warehouseId,
    qty: Number(form.qty),
    saleOrderId: form.saleOrderId,
    sourceStock: sourceBatch.value,
    unitCost: unitCost.value > 0 ? unitCost.value : undefined,
    amount: unitCost.value > 0 ? costAmount.value : undefined,
    deliveryDate: form.deliveryDate,
    deliveryStatus: form.deliveryStatus,
    logisticsCompany: form.logisticsCompany || undefined,
    trackingNo: form.trackingNo || undefined,
    remark: form.remark || undefined,
  }, batchOptions.value)
}

async function handleSubmit() {
  if (submitting.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    await stockOutSale(buildPayload())
    ElMessage.success('销售出库成功')
    dialogVisible.value = false
    await refreshAfterSubmit()
    fetchData()
  } catch (error: any) {
    errorMessage.value = failureText(error, '销售出库失败，请检查订单可出库数量、批次库存和物流信息。')
    ElMessage.error(errorMessage.value)
  } finally {
    submitting.value = false
  }
}

watch(
  () => form.saleOrderId,
  () => {
    const items = selectableOrderItems.value
    form.saleOrderItemId = items.length === 1 ? Number(items[0].id) : null
    form.productId = form.saleOrderItemId ? Number(items[0].productId || 0) || null : null
    form.sourceStockId = ''
    form.qty = form.saleOrderItemId ? 1 : null
    nextTick(() => {
      formRef.value?.validateField('saleOrderItemId').catch(() => undefined)
      formRef.value?.validateField('productId').catch(() => undefined)
      formRef.value?.validateField('qty').catch(() => undefined)
    })
  }
)

watch(
  () => form.saleOrderItemId,
  () => {
    const item = selectedSaleOrderItem.value
    form.productId = item?.productId ? Number(item.productId) : null
    form.sourceStockId = ''
    if (!item) {
      form.qty = null
      return
    }
    const nextQty = Math.min(remainingOrderQty.value, availableQty.value || remainingOrderQty.value)
    form.qty = nextQty > 0 ? Math.max(1, nextQty) : 1
    nextTick(() => {
      formRef.value?.validateField('productId').catch(() => undefined)
      formRef.value?.validateField('qty').catch(() => undefined)
    })
  }
)

watch(
  () => [form.productId, form.warehouseId],
  () => {
    if (form.sourceStockId && !selectedBatch.value) {
      form.sourceStockId = ''
    }
    formRef.value?.validateField('qty').catch(() => undefined)
  }
)

watch(
  () => form.sourceStockId,
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
.page-alert {
  margin-bottom: 12px;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.negative {
  color: #f56c6c;
  font-weight: 600;
}

.shipment-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 4px 0 18px;
}

.shipment-summary > div {
  min-height: 68px;
  padding: 12px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  background: #f8fafc;
}

.shipment-summary span {
  display: block;
  margin-bottom: 8px;
  color: #909399;
  font-size: 12px;
}

.shipment-summary strong {
  display: block;
  color: #303133;
  font-size: 15px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.batch-preview {
  margin-bottom: 4px;
}

@media (max-width: 768px) {
  .shipment-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
