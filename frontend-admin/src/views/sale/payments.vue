<template>
  <div class="page-container">
    <PageHeader title="回款登记">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>
        新增回款
      </el-button>
    </PageHeader>

    <SearchBar :keyword="searchKeyword" @search="handleSearch" @reset="handleReset">
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
      <el-form-item label="销售订单">
        <el-select v-model="searchSaleOrderId" placeholder="全部" clearable filterable style="width: 220px">
          <el-option
            v-for="item in saleOrderOptions"
            :key="item.id"
            :label="saleOrderLabel(item)"
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
      <el-table :data="tableData" stripe v-loading="loading" empty-text="暂无回款记录">
        <el-table-column prop="paymentNo" label="回款单号" min-width="170" show-overflow-tooltip />
        <el-table-column prop="orderNo" label="销售订单" min-width="170" show-overflow-tooltip />
        <el-table-column prop="customerName" label="客户" min-width="150" show-overflow-tooltip />
        <el-table-column prop="amount" label="回款金额" width="120" align="right">
          <template #default="{ row }">{{ moneyText(row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="totalAmount" label="订单金额" width="120" align="right">
          <template #default="{ row }">{{ moneyText(row.totalAmount) }}</template>
        </el-table-column>
        <el-table-column prop="receivedAmount" label="已回款" width="120" align="right">
          <template #default="{ row }">{{ moneyText(row.receivedAmount) }}</template>
        </el-table-column>
        <el-table-column prop="receivableAmount" label="未收余额" width="120" align="right">
          <template #default="{ row }">{{ moneyText(row.receivableAmount) }}</template>
        </el-table-column>
        <el-table-column prop="paymentDate" label="回款日期" width="120" />
        <el-table-column prop="paymentMethod" label="付款方式" width="120">
          <template #default="{ row }">{{ methodLabel(row.paymentMethod) }}</template>
        </el-table-column>
        <el-table-column prop="invoiceNo" label="发票号" min-width="140" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="创建时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="min(720px, 96vw)" class="payment-dialog">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="96px">
        <el-form-item label="销售订单" prop="saleOrderId">
          <el-select
            v-model="form.saleOrderId"
            filterable
            placeholder="请选择销售订单"
            style="width: 100%"
            @change="handleOrderChange"
          >
            <el-option
              v-for="item in collectableOrderOptions"
              :key="item.id"
              :label="saleOrderLabel(item)"
              :value="item.id"
            />
          </el-select>
        </el-form-item>

        <el-row :gutter="16">
          <el-col :xs="24" :sm="8">
            <el-form-item label="订单金额">
              <el-input :model-value="moneyText(selectedOrder?.totalAmount)" disabled />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="8">
            <el-form-item label="已回款">
              <el-input :model-value="moneyText(selectedOrder?.receivedAmount)" disabled />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="8">
            <el-form-item label="可回款">
              <el-input :model-value="moneyText(maxReceivableAmount)" disabled />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item label="回款金额" prop="amount">
              <el-input-number v-model="form.amount" :min="0.01" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-form-item label="回款日期" prop="paymentDate">
              <el-date-picker v-model="form.paymentDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item label="付款方式" prop="paymentMethod">
              <el-select v-model="form.paymentMethod" placeholder="请选择" style="width: 100%">
                <el-option v-for="item in paymentMethodOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-form-item label="发票号" prop="invoiceNo">
              <el-input v-model.trim="form.invoiceNo" placeholder="可选" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注" prop="remark">
          <el-input v-model.trim="form.remark" type="textarea" :rows="3" placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getCustomerList } from '@/api/customer'
import { createPayment, deletePayment, getPaymentList, updatePayment } from '@/api/payment'
import { getSaleOrderList } from '@/api/saleOrder'
import { formatDate, formatDateTime, formatMoney } from '@/utils'
import {
  SALE_PAYMENT_METHOD_OPTIONS,
  buildSalePaymentPayload,
  getEditablePaymentLimit,
  getPaymentMethodLabel,
  isSaleOrderCollectableForPayment,
  validatePaymentAmount,
} from '@/utils/sale-payment'

type OptionItem = {
  id: number
  code?: string
  name?: string
  shortName?: string
  orderNo?: string
  customerName?: string
  customerId?: number
  totalAmount?: number
  receivedAmount?: number
  receivableAmount?: number
  status?: string
}

type PaymentForm = {
  id: number
  saleOrderId: number | null
  originalSaleOrderId: number | null
  originalAmount: number
  amount: number
  paymentDate: string
  paymentMethod: string
  invoiceNo: string
  remark: string
}

const loading = ref(false)
const tableData = ref<any[]>([])
const customerOptions = ref<OptionItem[]>([])
const saleOrderOptions = ref<OptionItem[]>([])
const searchKeyword = ref('')
const searchCustomerId = ref<number | null>(null)
const searchSaleOrderId = ref<number | null>(null)
const searchDate = ref<string[]>([])
const dialogVisible = ref(false)
const dialogTitle = ref('新增回款')
const formRef = ref<FormInstance>()
const submitLoading = ref(false)
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const route = useRoute()

const paymentMethodOptions = SALE_PAYMENT_METHOD_OPTIONS

const form = reactive<PaymentForm>(createFormState())

const selectedOrder = computed(() =>
  saleOrderOptions.value.find((item) => Number(item.id) === Number(form.saleOrderId || 0))
)

const editingRecord = computed(() =>
  form.id
    ? {
        id: form.id,
        saleOrderId: form.originalSaleOrderId,
        payAmount: form.originalAmount,
      }
    : null
)

const maxReceivableAmount = computed(() => {
  const order = selectedOrder.value
  if (!order) return 0
  return getEditablePaymentLimit(order, null, editingRecord.value)
})

const collectableOrderOptions = computed(() =>
  saleOrderOptions.value.filter((item) => {
    if (form.id && Number(item.id) === Number(form.saleOrderId || 0)) return true
    if (!isSaleOrderCollectableForPayment(item.status)) return false
    return Number(item.receivableAmount ?? 0) > 0
  })
)

const formRules: FormRules = {
  saleOrderId: [{ required: true, message: '请选择销售订单', trigger: 'change' }],
  amount: [
    {
      validator: (_rule, value, callback) => {
        const message = validatePaymentAmount(value, maxReceivableAmount.value)
        if (message) {
          callback(new Error(message))
          return
        }
        callback()
      },
      trigger: ['blur', 'change'],
    },
  ],
  paymentDate: [{ required: true, message: '请选择回款日期', trigger: 'change' }],
  paymentMethod: [{ required: true, message: '请选择付款方式', trigger: 'change' }],
}

function createFormState(): PaymentForm {
  return {
    id: 0,
    saleOrderId: null,
    originalSaleOrderId: null,
    originalAmount: 0,
    amount: 0,
    paymentDate: formatDate(new Date()),
    paymentMethod: 'BANK_TRANSFER',
    invoiceNo: '',
    remark: '',
  }
}

function customerLabel(item: OptionItem) {
  return [item.code, item.shortName || item.name].filter(Boolean).join(' - ') || `#${item.id}`
}

function saleOrderLabel(item: OptionItem) {
  return [item.orderNo || `#${item.id}`, item.customerName, `未收 ${moneyText(item.receivableAmount)}`].filter(Boolean).join(' / ')
}

function moneyText(value: any) {
  return formatMoney(Number(value || 0))
}

function methodLabel(value?: string) {
  return getPaymentMethodLabel(value)
}

function resetForm(next?: Partial<PaymentForm>) {
  Object.assign(form, createFormState(), next || {})
}

function buildPayload() {
  return buildSalePaymentPayload({
    saleOrderId: form.saleOrderId || undefined,
    amount: Number(form.amount || 0),
    paymentDate: form.paymentDate,
    paymentMethod: form.paymentMethod,
    invoiceNo: form.invoiceNo,
    remark: form.remark,
  }, maxReceivableAmount.value)
}

async function loadOptions() {
  try {
    const [customerRes, saleOrderRes] = await Promise.all([
      getCustomerList({ page: 1, pageSize: 500 }),
      getSaleOrderList({ page: 1, pageSize: 500 }),
    ])
    customerOptions.value = customerRes.data?.records || customerRes.data?.list || []
    saleOrderOptions.value = saleOrderRes.data?.records || saleOrderRes.data?.list || []
  } catch {
    customerOptions.value = []
    saleOrderOptions.value = []
  }
}

async function refreshSaleOrders() {
  try {
    const res = await getSaleOrderList({ page: 1, pageSize: 500 })
    saleOrderOptions.value = res.data?.records || res.data?.list || []
  } catch {
    saleOrderOptions.value = []
  }
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getPaymentList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || undefined,
      customerId: searchCustomerId.value || undefined,
      saleOrderId: searchSaleOrderId.value || undefined,
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
  searchCustomerId.value = null
  searchSaleOrderId.value = null
  searchDate.value = []
  pagination.page = 1
  fetchData()
}

function handleAdd() {
  dialogTitle.value = '新增回款'
  resetForm()
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function handleEdit(row: any) {
  dialogTitle.value = '编辑回款'
  resetForm({
    id: Number(row.id || 0),
    saleOrderId: Number(row.saleOrderId || 0) || null,
    originalSaleOrderId: Number(row.saleOrderId || 0) || null,
    originalAmount: Number(row.amount || row.payAmount || 0),
    amount: Number(row.amount || row.payAmount || 0),
    paymentDate: row.paymentDate || row.payDate || formatDate(new Date()),
    paymentMethod: row.paymentMethod || row.payMethod || 'BANK_TRANSFER',
    invoiceNo: row.invoiceNo || '',
    remark: row.remark || '',
  })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function handleOrderChange() {
  const order = selectedOrder.value
  if (!order) return
  if (!form.id) {
    form.amount = Number(order.receivableAmount || 0)
  } else if (Number(form.originalSaleOrderId) !== Number(order.id)) {
    form.amount = Number(order.receivableAmount || 0)
  }
  nextTick(() => formRef.value?.validateField('amount').catch(() => undefined))
}

function applyRoutePrefill() {
  const saleOrderId = Number(route.query.saleOrderId || route.query.orderId || 0)
  if (!saleOrderId) return

  searchSaleOrderId.value = saleOrderId
  const shouldOpen = ['1', 'true', 'yes'].includes(String(route.query.open || '').toLowerCase())
  if (!shouldOpen) return

  handleAdd()
  form.saleOrderId = saleOrderId
  handleOrderChange()
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  if (submitLoading.value) return
  submitLoading.value = true
  try {
    if (form.id) {
      await updatePayment(form.id, buildPayload())
      ElMessage.success('更新成功')
    } else {
      await createPayment(buildPayload())
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    await refreshSaleOrders()
    fetchData()
  } catch {
    // 交给全局拦截器提示
  } finally {
    submitLoading.value = false
  }
}

async function handleDelete(row: any) {
  try {
    await ElMessageBox.confirm('确定删除该回款记录？', '提示', { type: 'warning' })
    await deletePayment(row.id)
    ElMessage.success('删除成功')
    await refreshSaleOrders()
    fetchData()
  } catch {
    // 用户取消或请求失败时不继续
  }
}

onMounted(async () => {
  await loadOptions()
  applyRoutePrefill()
  fetchData()
})
</script>

<style scoped lang="scss">
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.payment-dialog {
  :deep(.el-dialog__body) {
    max-height: 72vh;
    overflow: auto;
  }
}
</style>
