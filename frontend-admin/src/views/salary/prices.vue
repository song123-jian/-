<template>
  <div class="page-container">
    <PageHeader title="计件单价">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增单价
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="产品">
        <el-select v-model="searchProductId" filterable placeholder="全部" clearable style="width: 220px">
          <el-option v-for="item in productOptions" :key="item.id" :label="productLabel(item)" :value="item.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="工序">
        <el-input v-model="searchProcessName" clearable placeholder="工序名称" style="width: 140px" />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="searchStatus" placeholder="全部" clearable style="width: 120px">
          <el-option label="生效中" value="ACTIVE" />
          <el-option label="待生效" value="FUTURE" />
          <el-option label="已失效" value="EXPIRED" />
        </el-select>
      </el-form-item>
      <el-form-item label="适用日期">
        <el-date-picker
          v-model="searchPriceDate"
          type="date"
          placeholder="选择日期"
          value-format="YYYY-MM-DD"
          style="width: 150px"
        />
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading" empty-text="暂无计件单价">
        <el-table-column prop="id" label="编号" width="80" />
        <el-table-column prop="productName" label="产品" fixed min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.productName }}</span>
            <span v-if="row.productCode" class="muted"> / {{ row.productCode }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="processName" label="工序" min-width="120" show-overflow-tooltip />
        <el-table-column prop="price" label="计件单价" min-width="120" align="right">
          <template #default="{ row }">¥{{ unitPriceText(row.price) }}</template>
        </el-table-column>
        <el-table-column prop="amountPreview" label="千件金额" min-width="120" align="right">
          <template #default="{ row }">¥{{ moneyText(row.amountPreview) }}</template>
        </el-table-column>
        <el-table-column prop="effectiveDate" label="生效日期" width="120" />
        <el-table-column prop="expireDate" label="失效日期" width="120">
          <template #default="{ row }">{{ row.expireDate || '长期' }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="105" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" effect="plain">
              {{ getSalaryPriceStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="170">
          <template #default="{ row }">{{ row.createdAt ? formatDateTime(row.createdAt) : '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="150" align="center">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
            <el-button type="danger" link :disabled="row.status === 'ACTIVE'" @click="handleDelete(row)">删除</el-button>
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="620px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="96px">
        <el-form-item label="产品" prop="productId">
          <el-select v-model="form.productId" filterable placeholder="请选择产品" style="width: 100%">
            <el-option v-for="item in productOptions" :key="item.id" :label="productLabel(item)" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="工序" prop="processName">
          <el-input v-model="form.processName" maxlength="50" show-word-limit placeholder="请输入工序名称" />
        </el-form-item>
        <el-form-item label="计件单价" prop="price">
          <el-input-number v-model="form.price" :min="0.0001" :precision="4" :step="0.01" style="width: 180px" />
        </el-form-item>
        <el-form-item label="生效日期" prop="effectiveDate">
          <el-date-picker v-model="form.effectiveDate" type="date" value-format="YYYY-MM-DD" placeholder="选择生效日期" />
        </el-form-item>
        <el-form-item label="失效日期" prop="expireDate">
          <el-date-picker
            v-model="form.expireDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="长期有效可不填"
            clearable
          />
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
import { ref, reactive, onMounted } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getProductList } from '@/api/product'
import { getSalaryPriceList, createSalaryPrice, updateSalaryPrice, deleteSalaryPrice } from '@/api/salary'
import { formatDateTime, formatMoney } from '@/utils'
import { getSalaryPriceStatusText, validateSalaryPriceInput } from '@/utils/salary-price'

type ProductOption = { id: number; code?: string; name?: string; spec?: string }

const loading = ref(false)
const submitting = ref(false)
const tableData = ref<any[]>([])
const productOptions = ref<ProductOption[]>([])
const searchKeyword = ref('')
const searchProductId = ref<number | null>(null)
const searchProcessName = ref('')
const searchStatus = ref('')
const searchPriceDate = ref('')
const dialogVisible = ref(false)
const dialogTitle = ref('新增计件单价')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({
  id: 0,
  productId: null as number | null,
  processName: '注塑',
  price: 0,
  effectiveDate: todayDate(),
  expireDate: '',
})

const formRules: FormRules = {
  productId: [{ required: true, message: '请选择产品', trigger: 'change' }],
  processName: [
    { required: true, message: '请输入工序名称', trigger: 'blur' },
    { max: 50, message: '工序名称不能超过 50 个字符', trigger: 'blur' },
  ],
  price: [
    { required: true, message: '请输入计件单价', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        Number(value) > 0 ? callback() : callback(new Error('计件单价必须大于 0'))
      },
      trigger: 'blur',
    },
  ],
  effectiveDate: [{ required: true, message: '请选择生效日期', trigger: 'change' }],
  expireDate: [
    {
      validator: (_rule, value, callback) => {
        if (value && form.effectiveDate && value < form.effectiveDate) {
          callback(new Error('失效日期不能早于生效日期'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
}

function todayDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function productLabel(item: ProductOption) {
  return [item.code, item.name, item.spec].filter(Boolean).join(' - ') || `产品${item.id}`
}

function unitPriceText(value: unknown) {
  const price = Number(value || 0)
  return Number.isFinite(price) ? price.toFixed(4) : '0.0000'
}

function moneyText(value: unknown) {
  return formatMoney(Number(value || 0))
}

function statusTag(status: string) {
  if (status === 'ACTIVE') return 'success'
  if (status === 'FUTURE') return 'warning'
  return 'info'
}

async function loadOptions() {
  try {
    const res: any = await getProductList({ page: 1, pageSize: 500 })
    productOptions.value = res.data?.records || res.data?.list || []
  } catch {
    productOptions.value = []
  }
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await getSalaryPriceList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || undefined,
      productId: searchProductId.value || undefined,
      processName: searchProcessName.value || undefined,
      status: searchStatus.value || undefined,
      priceDate: searchPriceDate.value || undefined,
    })
    tableData.value = res.data?.list || res.data?.records || []
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
  searchProductId.value = null
  searchProcessName.value = ''
  searchStatus.value = ''
  searchPriceDate.value = ''
  pagination.page = 1
  fetchData()
}

function handleAdd() {
  dialogTitle.value = '新增计件单价'
  Object.assign(form, { id: 0, productId: null, processName: '注塑', price: 0, effectiveDate: todayDate(), expireDate: '' })
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

function handleEdit(row: any) {
  dialogTitle.value = '编辑计件单价'
  Object.assign(form, {
    id: row.id || 0,
    productId: Number(row.productId || 0) || null,
    processName: row.processName || '注塑',
    price: Number(row.price || row.unitPrice || 0),
    effectiveDate: row.effectiveDate || todayDate(),
    expireDate: row.expireDate || '',
  })
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  const inputError = validateSalaryPriceInput(form)
  if (inputError) {
    ElMessage.warning(inputError)
    return
  }
  submitting.value = true
  try {
    if (form.id) {
      await updateSalaryPrice(form.id, form)
      ElMessage.success('更新成功')
    } else {
      await createSalaryPrice(form)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch {
    // 全局请求拦截器已提示
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: any) {
  if (row.status === 'ACTIVE') {
    ElMessage.warning('生效中的计件单价不能删除，请先设置失效日期')
    return
  }
  try {
    await ElMessageBox.confirm(`确定删除 ${row.productName || ''} / ${row.processName || ''} 的计件单价？`, '删除计件单价', { type: 'warning' })
    await deleteSalaryPrice(row.id)
    ElMessage.success('删除成功')
    fetchData()
  } catch {
    // 用户取消或全局请求拦截器已提示
  }
}

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

.muted {
  color: var(--el-text-color-secondary);
}
</style>
