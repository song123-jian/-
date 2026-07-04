<template>
  <div class="page-container">
    <PageHeader title="销售订单">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>
        新增订单
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
      <el-form-item label="状态">
        <el-select v-model="searchStatus" placeholder="全部" clearable style="width: 150px">
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

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading" empty-text="暂无销售订单">
        <el-table-column prop="orderNo" label="订单编号" min-width="170" show-overflow-tooltip />
        <el-table-column prop="customerName" label="客户" min-width="150" show-overflow-tooltip />
        <el-table-column prop="productName" label="产品" min-width="190" show-overflow-tooltip />
        <el-table-column label="数量" width="120">
          <template #default="{ row }">
            {{ Number(row.deliveredQty || 0).toFixed(0) }} / {{ Number(row.quantity || row.qty || 0).toFixed(0) }}
          </template>
        </el-table-column>
        <el-table-column prop="totalAmount" label="订单金额" width="120" align="right">
          <template #default="{ row }">{{ moneyText(row.totalAmount) }}</template>
        </el-table-column>
        <el-table-column prop="receivedAmount" label="已回款" width="120" align="right">
          <template #default="{ row }">{{ moneyText(row.receivedAmount) }}</template>
        </el-table-column>
        <el-table-column prop="deliveryDate" label="交货日期" width="120" />
        <el-table-column prop="status" label="订单状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusMeta(row.status).type" effect="plain">{{ statusMeta(row.status).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="paymentStatus" label="收款状态" width="110">
          <template #default="{ row }">
            <el-tag :type="paymentMeta(row.paymentStatus).type" effect="plain">{{ paymentMeta(row.paymentStatus).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="210">
          <template #default="{ row }">
            <el-button v-if="canEdit(row)" type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button v-if="canApprove(row)" type="success" link @click="handleApprove(row)">审核</el-button>
            <el-button v-if="canDelete(row)" type="danger" link @click="handleDelete(row)">删除</el-button>
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="860px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="96px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="客户" prop="customerId">
              <el-select v-model="form.customerId" filterable placeholder="请选择客户" style="width: 100%">
                <el-option
                  v-for="item in enabledCustomerOptions"
                  :key="item.id"
                  :label="customerLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="订单日期" prop="orderDate">
              <el-date-picker v-model="form.orderDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="交货日期" prop="deliveryDate">
              <el-date-picker v-model="form.deliveryDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="订单金额">
              <el-input :model-value="moneyText(formTotalAmount)" disabled />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="订单明细" prop="items">
          <div class="order-items">
            <el-table :data="form.items" border size="small">
              <el-table-column label="产品" min-width="220">
                <template #default="{ row }">
                  <el-select
                    v-model="row.productId"
                    filterable
                    placeholder="请选择产品"
                    style="width: 100%"
                    @change="handleProductChange(row)"
                  >
                    <el-option
                      v-for="item in sellableProductOptions"
                      :key="item.id"
                      :label="productLabel(item)"
                      :value="item.id"
                    />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="数量" width="130">
                <template #default="{ row }">
                  <el-input-number v-model="row.qty" :min="1" :precision="0" style="width: 100%" />
                </template>
              </el-table-column>
              <el-table-column label="单价" width="150">
                <template #default="{ row }">
                  <el-input-number v-model="row.unitPrice" :min="0" :precision="2" style="width: 100%" />
                </template>
              </el-table-column>
              <el-table-column label="金额" width="120" align="right">
                <template #default="{ row }">{{ moneyText(itemAmount(row)) }}</template>
              </el-table-column>
              <el-table-column label="备注" min-width="150">
                <template #default="{ row }">
                  <el-input v-model.trim="row.remark" placeholder="可选" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="80" align="center">
                <template #default="{ $index }">
                  <el-button :icon="Delete" link type="danger" @click="removeItem($index)" />
                </template>
              </el-table-column>
            </el-table>
            <el-button class="add-item-button" :icon="Plus" @click="addItem">添加明细</el-button>
          </div>
        </el-form-item>

        <el-form-item label="备注" prop="remark">
          <el-input v-model.trim="form.remark" type="textarea" :rows="3" placeholder="请输入备注" />
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
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Plus } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getCustomerList } from '@/api/customer'
import { getProductList } from '@/api/product'
import { approveSaleOrder, createSaleOrder, deleteSaleOrder, getSaleOrderList, updateSaleOrder } from '@/api/saleOrder'
import { formatDate, formatDateTime, formatMoney } from '@/utils'
import {
  buildSaleOrderPayload,
  canApproveSaleOrder,
  canDeleteSaleOrder,
  canEditSaleOrder,
  getSaleOrderItemAmount,
  getSaleOrderPaymentStatusMeta,
  getSaleOrderStatusMeta,
  getSaleOrderTotalAmount,
  validateSaleOrderInput,
} from '@/utils/sale-order'

type OptionItem = {
  id: number
  code?: string
  name?: string
  shortName?: string
  status?: string | number
  type?: string
  spec?: string
  unit?: string
  piecePrice?: number
}

type OrderItemForm = {
  productId: number | null
  qty: number
  unitPrice: number
  remark: string
}

type OrderForm = {
  id: number
  customerId: number | null
  orderDate: string
  deliveryDate: string
  remark: string
  items: OrderItemForm[]
}

const loading = ref(false)
const tableData = ref<any[]>([])
const customerOptions = ref<OptionItem[]>([])
const productOptions = ref<OptionItem[]>([])
const searchKeyword = ref('')
const searchCustomerId = ref<number | null>(null)
const searchStatus = ref('')
const searchDate = ref<string[]>([])
const dialogVisible = ref(false)
const dialogTitle = ref('新增订单')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const statusOptions = [
  { label: '草稿', value: 'DRAFT' },
  { label: '已审核', value: 'APPROVED' },
  { label: '部分出库', value: 'PARTIAL' },
  { label: '已出库', value: 'SHIPPED' },
  { label: '已取消', value: 'CANCELLED' },
]

const form = reactive<OrderForm>(createFormState())

const enabledCustomerOptions = computed(() =>
  customerOptions.value.filter((item) => item.status === undefined || String(item.status) === '1')
)

const sellableProductOptions = computed(() =>
  productOptions.value.filter((item) => !['RAW', 'MATERIAL'].includes(String(item.type || '').toUpperCase()))
)

const formTotalAmount = computed(() => getSaleOrderTotalAmount(form.items))

const formRules: FormRules = {
  customerId: [{ required: true, message: '请选择客户', trigger: 'change' }],
  orderDate: [{ required: true, message: '请选择订单日期', trigger: 'change' }],
}

function createFormState(): OrderForm {
  return {
    id: 0,
    customerId: null,
    orderDate: formatDate(new Date()),
    deliveryDate: '',
    remark: '',
    items: [createItem()],
  }
}

function createItem(source?: Partial<OrderItemForm>): OrderItemForm {
  return {
    productId: source?.productId ?? null,
    qty: Number(source?.qty || 1),
    unitPrice: Number(source?.unitPrice || 0),
    remark: source?.remark || '',
  }
}

function statusMeta(value?: string) {
  return getSaleOrderStatusMeta(value)
}

function paymentMeta(value?: string) {
  return getSaleOrderPaymentStatusMeta(value)
}

function optionText(item?: OptionItem | null) {
  if (!item) return '-'
  return [item.code, item.name || item.shortName].filter(Boolean).join(' - ') || `#${item.id}`
}

function customerLabel(item: OptionItem) {
  return [item.code, item.shortName || item.name].filter(Boolean).join(' - ') || `#${item.id}`
}

function productLabel(item: OptionItem) {
  return [optionText(item), item.spec].filter(Boolean).join(' / ')
}

function moneyText(value: any) {
  return formatMoney(Number(value || 0))
}

function itemAmount(item: OrderItemForm) {
  return getSaleOrderItemAmount(item)
}

function canEdit(row: any) {
  return canEditSaleOrder(row)
}

function canApprove(row: any) {
  return canApproveSaleOrder(row)
}

function canDelete(row: any) {
  return canDeleteSaleOrder(row)
}

function resetForm(next?: Partial<OrderForm>) {
  Object.assign(form, createFormState(), next || {})
}

function addItem() {
  form.items.push(createItem())
}

function removeItem(index: number) {
  if (form.items.length <= 1) {
    form.items.splice(0, 1, createItem())
    return
  }
  form.items.splice(index, 1)
}

function handleProductChange(row: OrderItemForm) {
  const product = productOptions.value.find((item) => Number(item.id) === Number(row.productId || 0))
  if (product && !Number(row.unitPrice || 0)) {
    row.unitPrice = Number(product.piecePrice || 0)
  }
}

function validateItems() {
  const message = validateSaleOrderInput(form)
  if (message) {
    ElMessage.warning(message)
    return false
  }
  return true
}

function buildPayload() {
  return buildSaleOrderPayload(form)
}

async function loadOptions() {
  try {
    const [customerRes, productRes] = await Promise.all([
      getCustomerList({ page: 1, pageSize: 500 }),
      getProductList({ page: 1, pageSize: 500 }),
    ])
    customerOptions.value = customerRes.data?.records || customerRes.data?.list || []
    productOptions.value = productRes.data?.records || productRes.data?.list || []
  } catch {
    customerOptions.value = []
    productOptions.value = []
  }
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getSaleOrderList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || undefined,
      customerId: searchCustomerId.value || undefined,
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

function handleSearch(formData: { keyword: string }) {
  searchKeyword.value = formData.keyword || ''
  pagination.page = 1
  fetchData()
}

function handleReset() {
  searchKeyword.value = ''
  searchCustomerId.value = null
  searchStatus.value = ''
  searchDate.value = []
  pagination.page = 1
  fetchData()
}

function handleAdd() {
  dialogTitle.value = '新增订单'
  resetForm()
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function handleEdit(row: any) {
  dialogTitle.value = '编辑订单'
  resetForm({
    id: Number(row.id || 0),
    customerId: Number(row.customerId || 0) || null,
    orderDate: row.orderDate || formatDate(new Date()),
    deliveryDate: row.deliveryDate || '',
    remark: row.remark || '',
    items: (row.items || []).map((item: any) =>
      createItem({
        productId: Number(item.productId || 0) || null,
        qty: Number(item.qty || 1),
        unitPrice: Number(item.unitPrice || 0),
        remark: item.remark || '',
      })
    ),
  })
  if (!form.items.length) form.items = [createItem()]
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || !validateItems()) return
  try {
    if (form.id) {
      await updateSaleOrder(form.id, buildPayload())
      ElMessage.success('更新成功')
    } else {
      await createSaleOrder(buildPayload())
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch {
    // 交给全局拦截器提示
  }
}

async function handleApprove(row: any) {
  try {
    await ElMessageBox.confirm('确定审核通过该订单？', '提示', { type: 'warning' })
    await approveSaleOrder(row.id)
    ElMessage.success('审核成功')
    fetchData()
  } catch {
    // 用户取消或请求失败时不继续
  }
}

async function handleDelete(row: any) {
  try {
    await ElMessageBox.confirm('确定删除该订单？', '提示', { type: 'warning' })
    await deleteSaleOrder(row.id)
    ElMessage.success('删除成功')
    fetchData()
  } catch {
    // 用户取消或请求失败时不继续
  }
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

.order-items {
  width: 100%;
}

.add-item-button {
  margin-top: 10px;
}
</style>
