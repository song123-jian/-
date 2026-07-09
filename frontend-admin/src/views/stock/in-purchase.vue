<template>
  <div class="page-container">
    <PageHeader title="采购入库">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>
        新增入库
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
      <el-form-item label="供应商">
        <el-select v-model="searchSupplierId" placeholder="全部" clearable filterable style="width: 180px">
          <el-option
            v-for="item in enabledSupplierOptions"
            :key="item.id"
            :label="supplierLabel(item)"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
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
      <el-table :data="tableData" stripe v-loading="loading" empty-text="暂无采购入库记录">
        <el-table-column prop="moveNo" label="入库单号" min-width="170" show-overflow-tooltip />
        <el-table-column prop="supplierName" label="供应商" min-width="150" show-overflow-tooltip />
        <el-table-column label="物料" min-width="190" show-overflow-tooltip>
          <template #default="{ row }">
            {{ materialText(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="qty" label="入库数量" width="110">
          <template #default="{ row }">
            {{ Number(row.qty || 0).toFixed(0) }}
          </template>
        </el-table-column>
        <el-table-column prop="productUnit" label="单位" width="80" show-overflow-tooltip />
        <el-table-column label="采购单价" width="120" align="right">
          <template #default="{ row }">
            {{ moneyText(row.purchaseUnitCost) }}
          </template>
        </el-table-column>
        <el-table-column label="采购金额" width="120" align="right">
          <template #default="{ row }">
            {{ moneyText(row.purchaseAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="batchNo" label="批次" min-width="150" show-overflow-tooltip />
        <el-table-column label="批次状态" width="110">
          <template #default="{ row }">
            <el-tag :type="batchStatusTag(row.batchStatus)" effect="plain">
              {{ batchStatusText(row.batchStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="batchExpiryDate" label="有效期至" width="120">
          <template #default="{ row }">
            {{ row.batchExpiryDate || '-' }}
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

    <el-dialog v-model="dialogVisible" title="新增采购入库" width="720px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="108px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="供应商" prop="supplierId">
              <el-select v-model="form.supplierId" filterable placeholder="请选择供应商" style="width: 100%">
                <el-option
                  v-for="item in enabledSupplierOptions"
                  :key="item.id"
                  :label="supplierLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="物料" prop="productId">
              <el-select v-model="form.productId" filterable placeholder="请选择入库物料" style="width: 100%">
                <el-option
                  v-for="item in materialOptions"
                  :key="item.id"
                  :label="productLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="入库仓库" prop="warehouseId">
              <el-select v-model="form.warehouseId" filterable placeholder="请选择入库仓库" style="width: 100%">
                <el-option
                  v-for="item in enabledWarehouseOptions"
                  :key="item.id"
                  :label="warehouseLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="入库数量" prop="qty">
              <el-input-number v-model="form.qty" :min="1" :precision="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="采购单价" prop="unitCost">
              <el-input-number v-model="form.unitCost" :min="0.0001" :precision="4" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="采购金额">
              <el-input :model-value="purchaseAmountText" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="物料单位">
              <el-input :model-value="selectedUnitText" disabled />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="入库日期" prop="inDate">
              <el-date-picker v-model="form.inDate" type="date" value-format="YYYY-MM-DD" placeholder="请选择入库日期" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="批次号" prop="batchNo">
              <el-input v-model.trim="form.batchNo" placeholder="留空自动生成" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="生产日期" prop="productionDate">
              <el-date-picker v-model="form.productionDate" type="date" value-format="YYYY-MM-DD" placeholder="可选" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="有效期至" prop="expiryDate">
              <el-date-picker v-model="form.expiryDate" type="date" value-format="YYYY-MM-DD" placeholder="可选" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

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
import { getStockLedger, stockInPurchase } from '@/api/stock'
import { getSupplierList } from '@/api/supplier'
import { getWarehouseList } from '@/api/warehouse'
import { formatDateTime, formatMoney } from '@/utils'
import {
  buildPurchaseInboundPayload,
  getPurchaseInboundAmount,
  isPurchaseInboundMaterial,
  isPurchaseInboundSupplierEnabled,
  isPurchaseInboundWarehouseEnabled,
  todayPurchaseDate,
  validatePurchaseInboundInput,
} from '@/utils/purchase-inbound'

type OptionItem = {
  id: number
  code?: string
  name?: string
  shortName?: string
  isEnabled?: number
  status?: number
  type?: string
  unit?: string
  piecePrice?: number
}

type PurchaseInForm = {
  supplierId: number | null
  productId: number | null
  warehouseId: number | null
  qty: number | null
  unitCost: number | null
  inDate: string
  batchNo: string
  productionDate: string
  expiryDate: string
  remark: string
}

const loading = ref(false)
const tableData = ref<any[]>([])
const errorMessage = ref('')
const searchKeyword = ref('')
const searchSupplierId = ref<number | null>(null)
const searchWarehouseId = ref<number | null>(null)
const searchProductId = ref<number | null>(null)
const searchDate = ref<string[]>([])
const dialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

const supplierOptions = ref<OptionItem[]>([])
const productOptions = ref<OptionItem[]>([])
const warehouseOptions = ref<OptionItem[]>([])

const form = reactive<PurchaseInForm>({
  supplierId: null,
  productId: null,
  warehouseId: null,
  qty: null,
  unitCost: null,
  inDate: todayPurchaseDate(),
  batchNo: '',
  productionDate: '',
  expiryDate: '',
  remark: '',
})

const enabledSupplierOptions = computed(() =>
  supplierOptions.value.filter((item) => isPurchaseInboundSupplierEnabled(item))
)

const enabledWarehouseOptions = computed(() =>
  warehouseOptions.value.filter((item) => isPurchaseInboundWarehouseEnabled(item))
)

const materialOptions = computed(() => {
  const rows = productOptions.value.filter((item) => isPurchaseInboundMaterial(item))
  return rows.length ? rows : productOptions.value
})

const selectedMaterial = computed(() =>
  productOptions.value.find((item) => Number(item.id) === Number(form.productId || 0))
)

const selectedUnitText = computed(() => selectedMaterial.value?.unit || '-')

const purchaseAmount = computed(() => getPurchaseInboundAmount(form))

const purchaseAmountText = computed(() => formatMoney(purchaseAmount.value))

const formRules: FormRules = {
  supplierId: [{ required: true, message: '请选择供应商', trigger: 'change' }],
  productId: [{ required: true, message: '请选择物料', trigger: 'change' }],
  warehouseId: [{ required: true, message: '请选择入库仓库', trigger: 'change' }],
  inDate: [
    { required: true, message: '请选择入库日期', trigger: 'change' },
    {
      validator: (_rule, value, callback) => {
        if (value && String(value) > todayPurchaseDate()) {
          callback(new Error('入库日期不能晚于今天'))
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
          callback(new Error('请输入入库数量'))
          return
        }
        const qty = Number(value)
        if (!Number.isInteger(qty) || qty <= 0) {
          callback(new Error('入库数量必须是大于 0 的整数'))
          return
        }
        callback()
      },
      trigger: ['blur', 'change'],
    },
  ],
  unitCost: [
    {
      validator: (_rule, value, callback) => {
        if (value === null || value === undefined || value === '') {
          callback(new Error('请输入采购单价'))
          return
        }
        const unitCost = Number(value)
        if (!Number.isFinite(unitCost) || unitCost <= 0) {
          callback(new Error('采购单价必须大于 0'))
          return
        }
        callback()
      },
      trigger: ['blur', 'change'],
    },
  ],
  productionDate: [
    {
      validator: (_rule, value, callback) => {
        if (value && form.inDate && String(value) > form.inDate) {
          callback(new Error('生产日期不能晚于入库日期'))
          return
        }
        if (value && form.expiryDate && String(value) > form.expiryDate) {
          callback(new Error('生产日期不能晚于有效期'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
  expiryDate: [
    {
      validator: (_rule, value, callback) => {
        if (value && form.inDate && String(value) < form.inDate) {
          callback(new Error('有效期不能早于入库日期'))
          return
        }
        if (value && form.productionDate && String(value) < form.productionDate) {
          callback(new Error('有效期不能早于生产日期'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function createPurchaseNo() {
  const now = new Date()
  return `CGRK-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${String(now.getMilliseconds()).padStart(3, '0')}`
}

function optionText(item?: OptionItem | null) {
  if (!item) return '-'
  return [item.code, item.name || item.shortName].filter(Boolean).join(' - ') || `#${item.id}`
}

function supplierLabel(item: OptionItem) {
  return optionText(item)
}

function productLabel(item: OptionItem) {
  return optionText(item)
}

function warehouseLabel(item: OptionItem) {
  return optionText(item)
}

function materialText(row: any) {
  return [row.productCode, row.productName].filter((item) => item && item !== '-').join(' - ') || '-'
}

function moneyText(value: any) {
  return formatMoney(Number(value || 0))
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

function resetForm() {
  Object.assign(form, {
    supplierId: null,
    productId: null,
    warehouseId: null,
    qty: null,
    unitCost: null,
    inDate: todayPurchaseDate(),
    batchNo: '',
    productionDate: '',
    expiryDate: '',
    remark: '',
  })
}

async function loadOptions() {
  try {
    const [supplierRes, productRes, warehouseRes] = await Promise.all([
      getSupplierList({ page: 1, pageSize: 500 }),
      getProductList({ page: 1, pageSize: 500 }),
      getWarehouseList({ page: 1, pageSize: 200 }),
    ])
    supplierOptions.value = supplierRes.data?.records || supplierRes.data?.list || []
    productOptions.value = productRes.data?.records || productRes.data?.list || []
    warehouseOptions.value = warehouseRes.data?.records || warehouseRes.data?.list || []
  } catch (error: any) {
    errorMessage.value = failureText(error, '采购入库基础选项加载失败，请检查供应商、物料和仓库配置。')
    ElMessage.error(errorMessage.value)
    supplierOptions.value = []
    productOptions.value = []
    warehouseOptions.value = []
  }
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getStockLedger({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || undefined,
      moveType: 'IN',
      moveReason: 'IN_PURCHASE',
      supplierId: searchSupplierId.value || undefined,
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
    errorMessage.value = failureText(error, '采购入库记录加载失败，请检查库存台账、供应商和采购入库配置。')
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
  searchSupplierId.value = null
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
  const payload = buildPurchaseInboundPayload(form)
  return {
    moveNo: createPurchaseNo(),
    ...payload,
  }
}

async function handleSubmit() {
  if (submitting.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  const message = validatePurchaseInboundInput(form)
  if (message) {
    ElMessage.warning(message)
    return
  }
  submitting.value = true
  try {
    await stockInPurchase(buildPayload())
    ElMessage.success('采购入库成功')
    dialogVisible.value = false
    fetchData()
  } catch (error: any) {
    errorMessage.value = failureText(error, '采购入库提交失败，请检查供应商、批次日期、入库数量和采购单价。')
    ElMessage.error(errorMessage.value)
  } finally {
    submitting.value = false
  }
}

watch(
  () => form.productId,
  () => {
    const unitCost = Number(selectedMaterial.value?.piecePrice || 0)
    form.unitCost = unitCost > 0 ? unitCost : form.unitCost
    nextTick(() => formRef.value?.validateField('unitCost').catch(() => undefined))
  }
)

watch(
  () => [form.inDate, form.productionDate, form.expiryDate],
  () => {
    nextTick(() => {
      formRef.value?.validateField('productionDate').catch(() => undefined)
      formRef.value?.validateField('expiryDate').catch(() => undefined)
    })
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
</style>
