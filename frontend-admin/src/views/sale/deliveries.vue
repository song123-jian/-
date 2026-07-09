<template>
  <div class="page-container">
    <PageHeader title="发货管理" subtitle="跟踪销售出库后的发货单、物流状态、签收进度和导出留档。">
      <el-button plain :loading="exporting" @click="handleExport">
        <el-icon><Download /></el-icon>
        导出Excel
      </el-button>
      <el-button type="primary" @click="goStockOut">
        <el-icon><TopRight /></el-icon>
        销售出库
      </el-button>
    </PageHeader>

    <SearchBar
      :keyword="searchKeyword"
      title="筛选发货记录"
      description="按客户、仓库、产品、状态和日期筛选发货单，便于物流跟踪。"
      keyword-placeholder="发货单、销售订单、运单号"
      @search="handleSearch"
      @reset="handleReset"
    >
      <el-form-item label="客户">
        <el-select v-model="searchCustomerId" placeholder="全部" clearable filterable style="width: 190px">
          <el-option
            v-for="item in customerOptions"
            :key="item.id"
            :label="customerLabel(item)"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="仓库">
        <el-select v-model="searchWarehouseId" placeholder="全部" clearable filterable style="width: 180px">
          <el-option
            v-for="item in warehouseOptions"
            :key="item.id"
            :label="optionLabel(item)"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="产品">
        <el-select v-model="searchProductId" placeholder="全部" clearable filterable style="width: 200px">
          <el-option
            v-for="item in sellableProductOptions"
            :key="item.id"
            :label="productLabel(item)"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="searchStatus" placeholder="全部" clearable style="width: 140px">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
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

    <SalesMetricStrip :metrics="metricCards" />

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading" empty-text="暂无发货记录">
        <el-table-column type="expand" width="44">
          <template #default="{ row }">
            <el-table :data="row.items || []" size="small" border class="detail-table" empty-text="暂无发货明细">
              <el-table-column prop="productCode" label="产品编码" min-width="130" show-overflow-tooltip />
              <el-table-column prop="productName" label="产品名称" min-width="170" show-overflow-tooltip />
              <el-table-column prop="qty" label="发货数量" width="110" align="right">
                <template #default="{ row: item }">{{ qtyText(item.qty) }} {{ item.productUnit || '' }}</template>
              </el-table-column>
              <el-table-column prop="warehouseName" label="出库仓库" min-width="140" show-overflow-tooltip />
              <el-table-column prop="moveNo" label="出库流水" min-width="160" show-overflow-tooltip />
            </el-table>
          </template>
        </el-table-column>
        <el-table-column prop="deliveryNo" label="发货单号" min-width="170" fixed="left" show-overflow-tooltip />
        <el-table-column prop="saleOrderNo" label="销售订单" min-width="170" fixed="left" show-overflow-tooltip />
        <el-table-column prop="customerName" label="客户" min-width="150" show-overflow-tooltip />
        <el-table-column prop="productName" label="产品" min-width="190" show-overflow-tooltip />
        <el-table-column prop="totalQty" label="发货数量" width="110" align="right">
          <template #default="{ row }">{{ qtyText(row.totalQty) }}</template>
        </el-table-column>
        <el-table-column prop="warehouseName" label="出库仓库" min-width="140" show-overflow-tooltip />
        <el-table-column prop="logisticsCompany" label="物流公司" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.logisticsCompany || '-' }}</template>
        </el-table-column>
        <el-table-column prop="trackingNo" label="运单号" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ row.trackingNo || '-' }}</template>
        </el-table-column>
        <el-table-column prop="deliveryDate" label="发货日期" width="120" />
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="getSaleDeliveryStatusTag(row.status)" effect="plain">
              {{ getSaleDeliveryStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="operatorName" label="操作人" width="120" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="创建时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column label="操作" fixed="right" width="140" align="center">
          <template #default="{ row }">
            <RowActions :actions="deliveryRowActions(row)" @command="handleDeliveryCommand(row, $event)" />
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

    <el-dialog v-model="dialogVisible" title="维护物流" width="min(640px, 96vw)" class="delivery-dialog">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="96px">
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item label="发货日期" prop="deliveryDate">
              <el-date-picker v-model="form.deliveryDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-form-item label="状态" prop="status">
              <el-select v-model="form.status" style="width: 100%">
                <el-option v-for="item in editableStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item label="物流公司" prop="logisticsCompany">
              <el-input v-model.trim="form.logisticsCompany" placeholder="可选" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-form-item label="运单号" prop="trackingNo">
              <el-input v-model.trim="form.trackingNo" placeholder="可选" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注" prop="remark">
          <el-input v-model.trim="form.remark" type="textarea" :rows="3" placeholder="请输入备注" />
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
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { Download, TopRight } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import RowActions, { type RowActionItem } from '@/components/RowActions.vue'
import SearchBar from '@/components/SearchBar.vue'
import SalesMetricStrip from '@/components/SalesMetricStrip.vue'
import { getCustomerList } from '@/api/customer'
import { getDeliveryList, updateDelivery } from '@/api/delivery'
import { getProductList } from '@/api/product'
import { getWarehouseList } from '@/api/warehouse'
import { formatDate, formatDateTime } from '@/utils'
import { recordBusinessAudit } from '@/utils/business-audit'
import { printBusinessDocument } from '@/utils/business-print'
import { exportExcelFile, type ExcelColumn } from '@/utils/export-excel'
import { buildSaleDeliveryMetricCards } from '@/utils/sale-management'
import {
  getSaleDeliveryStatusTag,
  getSaleDeliveryStatusText,
  isSaleDeliveryStatus,
} from '@/utils/sale-delivery'

type OptionItem = {
  id: number
  code?: string
  name?: string
  shortName?: string
  type?: string
  spec?: string
}

type DeliveryForm = {
  id: number
  deliveryDate: string
  logisticsCompany: string
  trackingNo: string
  status: string
  remark: string
}

const router = useRouter()
const loading = ref(false)
const exporting = ref(false)
const submitting = ref(false)
const tableData = ref<any[]>([])
const customerOptions = ref<OptionItem[]>([])
const productOptions = ref<OptionItem[]>([])
const warehouseOptions = ref<OptionItem[]>([])
const searchKeyword = ref('')
const searchCustomerId = ref<number | null>(null)
const searchWarehouseId = ref<number | null>(null)
const searchProductId = ref<number | null>(null)
const searchStatus = ref('')
const searchDate = ref<string[]>([])
const dialogVisible = ref(false)
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const statusOptions = [
  { label: '已发货', value: 'SHIPPED' },
  { label: '运输中', value: 'IN_TRANSIT' },
  { label: '已签收', value: 'RECEIVED' },
  { label: '待发货', value: 'PENDING' },
  { label: '已取消', value: 'CANCELLED' },
]
const editableStatusOptions = statusOptions.filter((item) => !['PENDING', 'CANCELLED'].includes(item.value))

const form = reactive<DeliveryForm>(createFormState())

const deliveryExportColumns: ExcelColumn<any>[] = [
  { label: '发货单号', prop: 'deliveryNo' },
  { label: '销售订单', prop: 'saleOrderNo' },
  { label: '客户', prop: 'customerName' },
  { label: '产品', prop: 'productName' },
  { label: '发货数量', value: (row) => qtyText(row.totalQty) },
  { label: '出库仓库', prop: 'warehouseName' },
  { label: '物流公司', prop: 'logisticsCompany' },
  { label: '运单号', prop: 'trackingNo' },
  { label: '发货日期', prop: 'deliveryDate' },
  { label: '状态', value: (row) => getSaleDeliveryStatusText(row.status) },
  { label: '操作人', prop: 'operatorName' },
  { label: '创建时间', value: (row) => formatDateTime(row.createdAt) },
  { label: '备注', prop: 'remark' },
]

const sellableProductOptions = computed(() =>
  productOptions.value.filter((item) => !['RAW', 'MATERIAL'].includes(String(item.type || '').toUpperCase()))
)
const metricCards = computed(() => buildSaleDeliveryMetricCards(tableData.value))

const formRules: FormRules = {
  deliveryDate: [{ required: true, message: '请选择发货日期', trigger: 'change' }],
  status: [
    {
      validator: (_rule, value, callback) => {
        if (!isSaleDeliveryStatus(value)) {
          callback(new Error('请选择正确的发货状态'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
}

function createFormState(): DeliveryForm {
  return {
    id: 0,
    deliveryDate: formatDate(new Date()),
    logisticsCompany: '',
    trackingNo: '',
    status: 'SHIPPED',
    remark: '',
  }
}

function optionLabel(item: OptionItem) {
  return [item.code, item.name || item.shortName].filter(Boolean).join(' - ') || `#${item.id}`
}

function customerLabel(item: OptionItem) {
  return [item.code, item.shortName || item.name].filter(Boolean).join(' - ') || `#${item.id}`
}

function productLabel(item: OptionItem) {
  return [optionLabel(item), item.spec].filter(Boolean).join(' / ')
}

function qtyText(value: any) {
  return Number(value || 0).toFixed(0)
}

function resetForm(next?: Partial<DeliveryForm>) {
  Object.assign(form, createFormState(), next || {})
}

function normalizeStatus(value?: string) {
  return String(value || '').toUpperCase()
}

function getEditableStatus(value?: string) {
  const status = normalizeStatus(value)
  return editableStatusOptions.some((item) => item.value === status) ? status : 'SHIPPED'
}

function isDeliveryUpdateDisabled(row: any) {
  return normalizeStatus(row?.status) === 'CANCELLED'
}

function deliveryRowActions(row: any): RowActionItem[] {
  return [
    { key: 'print', label: '打印', type: 'primary' },
    { key: 'edit', label: '物流', type: 'primary', disabled: isDeliveryUpdateDisabled(row) },
  ]
}

function handleDeliveryCommand(row: any, command: string) {
  if (command === 'print') handlePrint(row)
  if (command === 'edit') handleEdit(row)
}

async function loadOptions() {
  try {
    const [customerRes, productRes, warehouseRes] = await Promise.all([
      getCustomerList({ page: 1, pageSize: 500 }),
      getProductList({ page: 1, pageSize: 500 }),
      getWarehouseList({ page: 1, pageSize: 200 }),
    ])
    customerOptions.value = customerRes.data?.records || customerRes.data?.list || []
    productOptions.value = productRes.data?.records || productRes.data?.list || []
    warehouseOptions.value = warehouseRes.data?.records || warehouseRes.data?.list || []
  } catch {
    customerOptions.value = []
    productOptions.value = []
    warehouseOptions.value = []
  }
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getDeliveryList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || undefined,
      customerId: searchCustomerId.value || undefined,
      warehouseId: searchWarehouseId.value || undefined,
      productId: searchProductId.value || undefined,
      status: searchStatus.value || undefined,
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

async function handleExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    const res: any = await getDeliveryList({
      page: 1,
      pageSize: 10000,
      keyword: searchKeyword.value || undefined,
      customerId: searchCustomerId.value || undefined,
      warehouseId: searchWarehouseId.value || undefined,
      productId: searchProductId.value || undefined,
      status: searchStatus.value || undefined,
      startDate: searchDate.value?.[0] || undefined,
      endDate: searchDate.value?.[1] || undefined,
    })
    const rows = res.data?.records || res.data?.list || []
    const filename = `发货管理导出_${Date.now()}.xls`
    exportExcelFile({
      filename,
      sheetName: '发货管理',
      columns: deliveryExportColumns,
      rows,
    })
    await recordBusinessAudit({
      module: '发货管理',
      action: 'EXPORT',
      targetType: 'delivery_order',
      targetId: 'filtered',
      count: rows.length,
      scope: '当前筛选',
      filename,
      detail: {
        keyword: searchKeyword.value,
        customerId: searchCustomerId.value,
        warehouseId: searchWarehouseId.value,
        productId: searchProductId.value,
        status: searchStatus.value,
        startDate: searchDate.value?.[0] || '',
        endDate: searchDate.value?.[1] || '',
      },
    })
    ElMessage.success(`已导出 ${rows.length} 条发货记录`)
  } catch {
    ElMessage.error('导出失败')
  } finally {
    exporting.value = false
  }
}

function deliveryPrintRows(row: any) {
  const items = Array.isArray(row.items) && row.items.length
    ? row.items
    : [{ productName: row.productName, qty: row.totalQty, warehouseName: row.warehouseName, moveNo: row.moveNo }]
  return items.map((item: any) => ({
    productCode: item.productCode || '-',
    productName: item.productName || row.productName || '-',
    qty: `${qtyText(item.qty || row.totalQty)} ${item.productUnit || ''}`.trim(),
    warehouseName: item.warehouseName || row.warehouseName || '-',
    moveNo: item.moveNo || '-',
  }))
}

async function handlePrint(row: any) {
  const opened = printBusinessDocument({
    title: '发货单',
    subtitle: row.deliveryNo || `#${row.id || ''}`,
    sections: [
      { label: '客户', value: row.customerName || '-' },
      { label: '销售订单', value: row.saleOrderNo || '-' },
      { label: '发货日期', value: row.deliveryDate || '-' },
      { label: '状态', value: getSaleDeliveryStatusText(row.status) },
      { label: '物流公司', value: row.logisticsCompany || '-' },
      { label: '运单号', value: row.trackingNo || '-' },
      { label: '操作人', value: row.operatorName || '-' },
      { label: '创建时间', value: formatDateTime(row.createdAt) },
    ],
    columns: [
      { label: '产品编码', prop: 'productCode' },
      { label: '产品名称', prop: 'productName' },
      { label: '发货数量', prop: 'qty', align: 'right' },
      { label: '出库仓库', prop: 'warehouseName' },
      { label: '出库流水', prop: 'moveNo' },
    ],
    rows: deliveryPrintRows(row),
    totals: [{ label: '发货总数', value: qtyText(row.totalQty) }],
    remark: row.remark,
  })
  if (!opened) {
    ElMessage.error('打印窗口被浏览器拦截')
    return
  }
  await recordBusinessAudit({
    module: '发货管理',
    action: 'PRINT',
    targetType: 'delivery_order',
    targetId: row.id || row.deliveryNo,
    summary: `打印发货单 ${row.deliveryNo || ''}`,
    detail: { deliveryNo: row.deliveryNo, saleOrderNo: row.saleOrderNo, customerName: row.customerName },
  })
}

function handleSearch(formData: { keyword: string }) {
  searchKeyword.value = formData.keyword || ''
  pagination.page = 1
  fetchData()
}

function handleReset() {
  searchKeyword.value = ''
  searchCustomerId.value = null
  searchWarehouseId.value = null
  searchProductId.value = null
  searchStatus.value = ''
  searchDate.value = []
  pagination.page = 1
  fetchData()
}

function handleEdit(row: any) {
  resetForm({
    id: Number(row.id || 0),
    deliveryDate: row.deliveryDate || formatDate(new Date()),
    logisticsCompany: row.logisticsCompany || '',
    trackingNo: row.trackingNo || '',
    status: getEditableStatus(row.status),
    remark: row.remark || '',
  })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function handleSubmit() {
  if (submitting.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || !form.id) return
  submitting.value = true
  try {
    await updateDelivery(form.id, {
      deliveryDate: form.deliveryDate,
      logisticsCompany: form.logisticsCompany || undefined,
      trackingNo: form.trackingNo || undefined,
      status: form.status,
      remark: form.remark || undefined,
    })
    ElMessage.success('物流信息已更新')
    dialogVisible.value = false
    fetchData()
  } catch {
    // 交给全局拦截器提示
  } finally {
    submitting.value = false
  }
}

function goStockOut() {
  router.push('/stock/out-sale')
}

onMounted(() => {
  loadOptions()
  fetchData()
})
</script>

<style scoped lang="scss">
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.sales-metric-strip {
  margin: 12px 0;
}

.detail-table {
  margin: 8px 0;
}

.delivery-dialog {
  :deep(.el-dialog__body) {
    max-height: 72vh;
    overflow: auto;
  }
}
</style>
