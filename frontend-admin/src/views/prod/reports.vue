<template>
  <div class="page-container">
    <PageHeader title="报工记录">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增报工
      </el-button>
    </PageHeader>

    <SearchBar @search="handleSearch" @reset="handleReset">
      <el-form-item label="报工类型">
        <el-select v-model="searchReportType" placeholder="全部" clearable style="width: 160px">
          <el-option
            v-for="item in reportTypeOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="班次">
        <el-select v-model="searchShift" placeholder="全部" clearable style="width: 140px">
          <el-option
            v-for="item in shiftOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="日期范围">
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
      <el-table :data="tableData" stripe v-loading="loading">
        <el-table-column prop="id" label="编号" width="80" />
        <el-table-column prop="orderNo" label="工单编号" width="150" />
        <el-table-column prop="machineName" label="机台" width="140" show-overflow-tooltip />
        <el-table-column prop="moldName" label="模具" width="140" show-overflow-tooltip />
        <el-table-column prop="reportType" label="类型" width="110">
          <template #default="{ row }">
            <el-tag :type="reportTypeTag(row.reportType)">
              {{ reportTypeLabel(row.reportType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="shift" label="班次" width="100">
          <template #default="{ row }">
            {{ shiftLabel(row.shift) }}
          </template>
        </el-table-column>
        <el-table-column prop="qty" label="产量" width="100" />
        <el-table-column prop="badQty" label="不良" width="100" />
        <el-table-column prop="shots" label="模次" width="100" />
        <el-table-column prop="reporterName" label="报工人" width="120" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="820px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="96px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="工单" prop="prodOrderId">
              <el-select
                v-model="form.prodOrderId"
                filterable
                placeholder="请选择工单"
                style="width: 100%"
                @change="handleOrderChange"
              >
                <el-option
                  v-for="item in prodOrderOptions"
                  :key="item.id"
                  :label="orderLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="机台" prop="machineId">
              <el-select
                v-model="form.machineId"
                filterable
                placeholder="请选择机台"
                style="width: 100%"
              >
                <el-option
                  v-for="item in machineOptions"
                  :key="item.id"
                  :label="machineLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="模具" prop="moldId">
              <el-select
                v-model="form.moldId"
                filterable
                clearable
                placeholder="可选"
                style="width: 100%"
              >
                <el-option
                  v-for="item in moldOptions"
                  :key="item.id"
                  :label="moldLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="报工类型" prop="reportType">
              <el-select v-model="form.reportType" placeholder="请选择类型" style="width: 100%">
                <el-option
                  v-for="item in reportTypeOptions"
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
            <el-form-item label="班次" prop="shift">
              <el-select v-model="form.shift" placeholder="请选择班次" style="width: 100%">
                <el-option
                  v-for="item in shiftOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="产量" prop="qty">
              <el-input-number v-model="form.qty" :min="0" :precision="0" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="不良数量" prop="badQty">
              <el-input-number v-model="form.badQty" :min="0" :precision="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="模次" prop="shots">
              <el-input-number v-model="form.shots" :min="0" :precision="0" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="开始时间" prop="startTime">
              <el-date-picker
                v-model="form.startTime"
                type="datetime"
                placeholder="选择开始时间"
                value-format="YYYY-MM-DD HH:mm:ss"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结束时间" prop="endTime">
              <el-date-picker
                v-model="form.endTime"
                type="datetime"
                placeholder="选择结束时间"
                value-format="YYYY-MM-DD HH:mm:ss"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { formatDateTime } from '@/utils'
import { getMachineList } from '@/api/machine'
import { getMoldList } from '@/api/mold'
import { getProdOrderList } from '@/api/prodOrder'
import { createProdReport, deleteProdReport, getProdReportList, updateProdReport } from '@/api/prodReport'

type OptionItem = {
  id: number
  code?: string
  name?: string
  orderNo?: string
  productName?: string
  machineName?: string
  machineId?: number
  moldId?: number
}

const loading = ref(false)
const tableData = ref<any[]>([])
const searchKeyword = ref('')
const searchReportType = ref('')
const searchShift = ref('')
const searchDate = ref<string[]>([])
const dialogVisible = ref(false)
const dialogTitle = ref('新增报工')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const prodOrderOptions = ref<OptionItem[]>([])
const machineOptions = ref<OptionItem[]>([])
const moldOptions = ref<OptionItem[]>([])

const reportTypeOptions = [
  { label: '开工', value: 'START' },
  { label: '产量', value: 'OUTPUT' },
  { label: '完工', value: 'END' },
]

const shiftOptions = [
  { label: '白班', value: 'DAY' },
  { label: '夜班', value: 'NIGHT' },
]

const form = reactive({
  id: 0,
  prodOrderId: null as number | null,
  machineId: null as number | null,
  moldId: null as number | null,
  reportType: 'OUTPUT',
  shift: 'DAY',
  qty: 0,
  badQty: 0,
  shots: 0,
  startTime: '',
  endTime: '',
})

const formRules: FormRules = {
  prodOrderId: [{ required: true, message: '请选择工单', trigger: 'change' }],
  machineId: [{ required: true, message: '请选择机台', trigger: 'change' }],
  reportType: [{ required: true, message: '请选择报工类型', trigger: 'change' }],
  shift: [{ required: true, message: '请选择班次', trigger: 'change' }],
  qty: [{ required: true, message: '请输入产量', trigger: 'blur' }],
}

function reportTypeLabel(value?: string) {
  return reportTypeOptions.find((item) => item.value === value)?.label || value || '-'
}

function reportTypeTag(value?: string) {
  if (value === 'OUTPUT') return 'success'
  if (value === 'START') return 'warning'
  if (value === 'END') return 'info'
  return 'info'
}

function shiftLabel(value?: string) {
  return shiftOptions.find((item) => item.value === value)?.label || value || '-'
}

function orderLabel(item: OptionItem) {
  return [item.orderNo, item.productName].filter(Boolean).join(' - ') || item.orderNo || `#${item.id}`
}

function machineLabel(item: OptionItem) {
  return [item.code, item.name].filter(Boolean).join(' - ') || item.name || `#${item.id}`
}

function moldLabel(item: OptionItem) {
  return [item.code, item.name].filter(Boolean).join(' - ') || item.name || `#${item.id}`
}

async function loadOptions() {
  try {
    const [orderRes, machineRes, moldRes] = await Promise.all([
      getProdOrderList({ page: 1, pageSize: 200 }),
      getMachineList({ page: 1, pageSize: 200 }),
      getMoldList({ page: 1, pageSize: 200 }),
    ])
    prodOrderOptions.value = orderRes.data?.records || []
    machineOptions.value = machineRes.data?.records || []
    moldOptions.value = moldRes.data?.records || []
  } catch {
    prodOrderOptions.value = []
    machineOptions.value = []
    moldOptions.value = []
  }
}

async function fetchData() {
  loading.value = true
  try {
    const params: Record<string, any> = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || undefined,
      reportType: searchReportType.value || undefined,
      shift: searchShift.value || undefined,
    }
    if (searchDate.value.length === 2) {
      params.startDate = searchDate.value[0]
      params.endDate = searchDate.value[1]
    }
    const res: any = await getProdReportList(params)
    tableData.value = res.data?.list || []
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
  searchReportType.value = ''
  searchShift.value = ''
  searchDate.value = []
  pagination.page = 1
  fetchData()
}

function resetForm() {
  Object.assign(form, {
    id: 0,
    prodOrderId: null,
    machineId: null,
    moldId: null,
    reportType: 'OUTPUT',
    shift: 'DAY',
    qty: 0,
    badQty: 0,
    shots: 0,
    startTime: '',
    endTime: '',
  })
}

function handleAdd() {
  dialogTitle.value = '新增报工'
  resetForm()
  dialogVisible.value = true
}

function handleOrderChange(orderId: number | null) {
  const order = prodOrderOptions.value.find((item) => item.id === orderId)
  if (!order) {
    return
  }
  if (order.machineId) {
    form.machineId = order.machineId
  }
  if (order.moldId) {
    form.moldId = order.moldId
  }
}

function handleEdit(row: any) {
  dialogTitle.value = '编辑报工'
  Object.assign(form, {
    id: row.id || 0,
    prodOrderId: row.prodOrderId ?? null,
    machineId: row.machineId ?? null,
    moldId: row.moldId ?? null,
    reportType: row.reportType || 'OUTPUT',
    shift: row.shift || 'DAY',
    qty: row.qty ?? 0,
    badQty: row.badQty ?? 0,
    shots: row.shots ?? 0,
    startTime: row.startTime || '',
    endTime: row.endTime || '',
  })
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) {
    return
  }

  const payload = {
    prodOrderId: form.prodOrderId,
    machineId: form.machineId,
    moldId: form.moldId || undefined,
    reportType: form.reportType,
    shift: form.shift,
    qty: form.qty,
    badQty: form.badQty,
    shots: form.shots,
    startTime: form.startTime || undefined,
    endTime: form.endTime || undefined,
  }

  try {
    if (form.id) {
      await updateProdReport(form.id, payload)
      ElMessage.success('更新成功')
    } else {
      await createProdReport(payload)
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch {
    // 交给全局拦截器提示
  }
}

async function handleDelete(row: any) {
  await ElMessageBox.confirm('确定删除这条报工记录吗？', '提示', { type: 'warning' })
  try {
    await deleteProdReport(row.id)
    ElMessage.success('删除成功')
    fetchData()
  } catch {
    // 交给全局拦截器提示
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
</style>
