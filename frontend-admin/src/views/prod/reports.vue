<template>
  <div class="page-container">
    <PageHeader title="报工记录">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>新增报工
      </el-button>
    </PageHeader>

    <SearchBar :keyword="searchKeyword" @search="handleSearch" @reset="handleReset">
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
      <el-form-item label="工序">
        <el-input v-model.trim="searchProcessName" clearable placeholder="工序名称" style="width: 140px" />
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

    <el-alert
      v-if="errorMessage"
      class="page-alert"
      type="error"
      :title="errorMessage"
      show-icon
      :closable="false"
    />

    <section class="site-workbench">
      <div class="scan-panel">
        <div>
          <strong>扫码报工入口</strong>
          <span>扫描或输入工单号/工单 ID，自动带出机台和模具并执行现场门禁校验。</span>
        </div>
        <div class="scan-actions">
          <el-input
            v-model.trim="scanCode"
            clearable
            placeholder="扫描工单号或输入工单 ID"
            @keyup.enter="handleScanReport"
          />
          <el-button type="primary" @click="handleScanReport">扫码报工</el-button>
        </div>
      </div>

      <div class="gate-panel">
        <div class="gate-panel__header">
          <div>
            <strong>现场门禁</strong>
            <span>{{ selectedOrderGateTitle }}</span>
          </div>
          <el-tag :type="selectedOrderGateTag" effect="plain">{{ selectedOrderGateStatus }}</el-tag>
        </div>
        <div class="gate-list">
          <div v-for="item in selectedGateSummary.checks" :key="item.key" class="gate-item">
            <span>{{ item.label }}</span>
            <el-tag :type="gateTagType(item.state)" effect="plain">{{ gateText(item) }}</el-tag>
          </div>
        </div>
        <el-alert
          v-if="selectedOrderGateMessage"
          class="gate-alert"
          :type="selectedOrderGateAlertType"
          :title="selectedOrderGateMessage"
          show-icon
          :closable="false"
        />
      </div>
    </section>

    <el-card shadow="hover">
      <el-table :data="tableData" stripe v-loading="loading" empty-text="暂无报工记录">
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
        <el-table-column prop="processName" label="工序" width="120" show-overflow-tooltip />
        <el-table-column prop="shift" label="班次" width="100">
          <template #default="{ row }">
            {{ shiftLabel(row.shift) }}
          </template>
        </el-table-column>
        <el-table-column prop="qty" label="产量" width="100" />
        <el-table-column prop="badQty" label="不良" width="100" />
        <el-table-column label="合格" width="100">
          <template #default="{ row }">
            {{ qtyText(goodQty(row)) }}
          </template>
        </el-table-column>
        <el-table-column label="不良率" width="100">
          <template #default="{ row }">
            {{ badRateText(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="shots" label="模次" width="100" />
        <el-table-column label="工时" width="100">
          <template #default="{ row }">
            {{ workMinutesText(row.workMinutes) }}
          </template>
        </el-table-column>
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
                  v-for="item in reportableProdOrderOptions"
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

        <div class="report-summary">
          <div>
            <span>合格数量</span>
            <strong>{{ goodQtyText }}</strong>
          </div>
          <div>
            <span>不良率</span>
            <strong>{{ badRateFormText }}</strong>
          </div>
          <div>
            <span>工时分钟</span>
            <strong>{{ workMinutesFormText }}</strong>
          </div>
          <div>
            <span>工单范围</span>
            <strong>已派工/生产中/暂停</strong>
          </div>
          <div>
            <span>现场门禁</span>
            <strong>{{ selectedOrderGateStatus }}</strong>
          </div>
        </div>

        <el-alert
          v-if="selectedOrderGateMessage"
          class="gate-alert"
          :type="selectedOrderGateAlertType"
          :title="selectedOrderGateMessage"
          show-icon
          :closable="false"
        />

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
          <el-col :span="12">
            <el-form-item label="工序" prop="processName">
              <el-input v-model.trim="form.processName" maxlength="50" show-word-limit placeholder="请输入工序名称" />
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
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { formatDateTime } from '@/utils'
import { getMachineList } from '@/api/machine'
import { getMoldList } from '@/api/mold'
import { getProdOrderList } from '@/api/prodOrder'
import { createProdReport, deleteProdReport, getProdReportList, updateProdReport } from '@/api/prodReport'
import { summarizeSiteExecutionGate, type SiteExecutionGateCheck } from '@/utils/injection-professional'
import {
  getProdReportBadRate,
  getProdReportGoodQty,
  isProdReportOrderStatus,
  normalizeProdReportProcessFilter,
  normalizeProdReportProcessName,
  normalizeProdReportStatus,
  toProdReportNumber,
  validateProdReportProcessName,
} from '@/utils/production-report'

type OptionItem = {
  id: number
  code?: string
  name?: string
  orderNo?: string
  productName?: string
  machineName?: string
  machineId?: number
  moldId?: number
  status?: string
  processCardStatus?: string
  firstArticleStatus?: string
  startupStatus?: string
  materialMixStatus?: string
}

const loading = ref(false)
const tableData = ref<any[]>([])
const scanCode = ref('')
const searchKeyword = ref('')
const searchReportType = ref('')
const searchProcessName = ref('')
const searchShift = ref('')
const searchDate = ref<string[]>([])
const errorMessage = ref('')
const dialogVisible = ref(false)
const dialogTitle = ref('新增报工')
const submitting = ref(false)
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
  processName: '注塑',
  shift: 'DAY',
  qty: 0,
  badQty: 0,
  shots: 0,
  startTime: '',
  endTime: '',
})

const reportableProdOrderOptions = computed(() =>
  prodOrderOptions.value.filter((item) => isProdReportOrderStatus(item.status))
)

const goodQtyValue = computed(() => Math.max(Number(form.qty || 0) - Number(form.badQty || 0), 0))
const badRateValue = computed(() => getProdReportBadRate({ qty: form.qty, badQty: form.badQty }))
const workMinutesValue = computed(() => calculateWorkMinutes(form.startTime, form.endTime))
const goodQtyText = computed(() => qtyText(goodQtyValue.value))
const badRateFormText = computed(() => `${badRateValue.value.toFixed(1)}%`)
const workMinutesFormText = computed(() => workMinutesText(workMinutesValue.value))
const selectedOrder = computed(() => prodOrderOptions.value.find((item) => item.id === form.prodOrderId))
const selectedGateSummary = computed(() => summarizeSiteExecutionGate(orderGateInput(selectedOrder.value)))
const selectedOrderHasGateFields = computed(() => hasGateFields(selectedOrder.value))
const selectedOrderGateStatus = computed(() => {
  if (!selectedOrder.value) return '未选择工单'
  if (!selectedOrderHasGateFields.value) return '兼容放行'
  return selectedGateSummary.value.allowed ? '允许报工' : '禁止报工'
})
const selectedOrderGateTitle = computed(() => {
  if (!selectedOrder.value) return '选择工单后显示工艺卡、首件确认、齐套检查和配料烘料状态。'
  return orderLabel(selectedOrder.value)
})
const selectedOrderGateMessage = computed(() => {
  if (!selectedOrder.value) return ''
  if (!selectedOrderHasGateFields.value) return '当前工单未返回现场门禁字段，按兼容模式允许报工；正式环境应补齐工艺卡、首件确认、齐套检查和配料烘料状态。'
  if (selectedGateSummary.value.allowed) return '现场门禁已通过，可以扫码报工。'
  return `现场门禁未通过：${selectedGateSummary.value.blockers.join('、')}`
})
const selectedOrderGateTag = computed(() => {
  if (!selectedOrder.value) return 'info'
  if (!selectedOrderHasGateFields.value) return 'warning'
  return selectedGateSummary.value.allowed ? 'success' : 'danger'
})
const selectedOrderGateAlertType = computed(() => {
  if (!selectedOrder.value) return 'info'
  if (!selectedOrderHasGateFields.value) return 'warning'
  return selectedGateSummary.value.allowed ? 'success' : 'error'
})

const formRules: FormRules = {
  prodOrderId: [{ required: true, message: '请选择工单', trigger: 'change' }],
  machineId: [{ required: true, message: '请选择机台', trigger: 'change' }],
  reportType: [{ required: true, message: '请选择报工类型', trigger: 'change' }],
  processName: [
    {
      validator: (_rule, value, callback) => {
        const message = validateProdReportProcessName(value)
        if (message) {
          callback(new Error(message))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
  shift: [{ required: true, message: '请选择班次', trigger: 'change' }],
  qty: [
    { required: true, message: '请输入产量', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        const qty = Number(value)
        if (!Number.isInteger(qty) || qty < 0) {
          callback(new Error('产量必须是非负整数'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
  badQty: [
    {
      validator: (_rule, value, callback) => {
        const badQty = Number(value || 0)
        const qty = Number(form.qty || 0)
        if (!Number.isInteger(badQty) || badQty < 0) {
          callback(new Error('不良数量必须是非负整数'))
          return
        }
        if (badQty > qty) {
          callback(new Error('不良数量不能超过产量'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
  shots: [
    {
      validator: (_rule, value, callback) => {
        const shots = Number(value || 0)
        if (!Number.isFinite(shots) || shots < 0 || !Number.isInteger(shots)) {
          callback(new Error('模次必须是非负整数'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
  startTime: [
    {
      validator: (_rule, value, callback) => {
        if (!value || !form.endTime) {
          callback()
          return
        }
        const start = parseDateTime(value)
        const end = parseDateTime(form.endTime)
        if (start && end && end < start) {
          callback(new Error('结束时间不能早于开始时间'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
  endTime: [
    {
      validator: (_rule, value, callback) => {
        if (!value || !form.startTime) {
          callback()
          return
        }
        const start = parseDateTime(form.startTime)
        const end = parseDateTime(value)
        if (start && end && end < start) {
          callback(new Error('结束时间不能早于开始时间'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
}

function parseDateTime(value?: string) {
  const text = String(value || '').trim()
  if (!text) {
    return null
  }
  const date = new Date(text.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

function failureText(error: any, fallback: string) {
  return error?.message || error?.data?.message || fallback
}

function calculateWorkMinutes(startValue?: string, endValue?: string) {
  const start = parseDateTime(startValue)
  const end = parseDateTime(endValue)
  if (!start || !end || end < start) return 0
  return Math.round((end.getTime() - start.getTime()) / 60000)
}

function qtyText(value: any) {
  return toProdReportNumber(value).toFixed(0)
}

function goodQty(row: any) {
  return getProdReportGoodQty(row)
}

function badRateText(row: any) {
  return `${getProdReportBadRate(row).toFixed(1)}%`
}

function workMinutesText(value: any) {
  const minutes = toProdReportNumber(value)
  return minutes > 0 ? `${minutes.toFixed(0)} 分钟` : '-'
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

function hasGateFields(order?: OptionItem) {
  if (!order) return false
  return ['processCardStatus', 'firstArticleStatus', 'startupStatus', 'materialMixStatus'].some((key) =>
    Object.prototype.hasOwnProperty.call(order, key)
  )
}

function orderGateInput(order?: OptionItem) {
  return {
    prodOrderId: order?.id,
    processCardStatus: order?.processCardStatus,
    firstArticleStatus: order?.firstArticleStatus,
    startupStatus: order?.startupStatus,
    materialMixStatus: order?.materialMixStatus,
  }
}

function gateTagType(state: SiteExecutionGateCheck['state']) {
  if (state === 'passed') return 'success'
  if (state === 'blocked') return 'danger'
  return 'warning'
}

function gateText(item: SiteExecutionGateCheck) {
  return item.passed ? '已通过' : item.message
}

function shiftLabel(value?: string) {
  return shiftOptions.find((item) => item.value === value)?.label || value || '-'
}

function statusLabel(value?: string) {
  const map: Record<string, string> = {
    SCHEDULED: '已派工',
    RUNNING: '生产中',
    PAUSED: '已暂停',
  }
  return map[normalizeProdReportStatus(value)] || normalizeProdReportStatus(value)
}

function orderLabel(item: OptionItem) {
  const base = [item.orderNo, item.productName].filter(Boolean).join(' - ') || item.orderNo || `#${item.id}`
  return `${base} / ${statusLabel(item.status)}`
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
    prodOrderOptions.value = orderRes.data?.records || orderRes.data?.list || []
    machineOptions.value = machineRes.data?.records || machineRes.data?.list || []
    moldOptions.value = moldRes.data?.records || moldRes.data?.list || []
  } catch (error: any) {
    prodOrderOptions.value = []
    machineOptions.value = []
    moldOptions.value = []
    ElMessage.error(failureText(error, '报工基础选项加载失败，请检查生产工单、机台和模具资料。'))
  }
}

async function fetchData() {
  loading.value = true
  try {
    errorMessage.value = ''
    const params: Record<string, any> = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || undefined,
      reportType: searchReportType.value || undefined,
      processName: normalizeProdReportProcessFilter(searchProcessName.value) || undefined,
      shift: searchShift.value || undefined,
    }
    if (searchDate.value.length === 2) {
      params.startDate = searchDate.value[0]
      params.endDate = searchDate.value[1]
    }
    const res: any = await getProdReportList(params)
    const rows = res.data?.list || res.data?.records || []
    tableData.value = rows
    pagination.total = res.data?.total || rows.length
  } catch (error: any) {
    tableData.value = []
    pagination.total = 0
    errorMessage.value = failureText(error, '报工记录加载失败，请检查 Supabase 连接、报工表和生产工单配置。')
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
  searchReportType.value = ''
  searchProcessName.value = ''
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
    processName: '注塑',
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
  nextTick(() => formRef.value?.clearValidate())
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

function handleScanReport() {
  const code = scanCode.value.trim()
  if (!code) {
    ElMessage.warning('请先扫描或输入工单号')
    return
  }
  const normalized = code.toLowerCase()
  const order = prodOrderOptions.value.find((item) =>
    String(item.id) === code || String(item.orderNo || '').toLowerCase() === normalized
  )
  if (!order) {
    ElMessage.warning('未找到可报工工单')
    return
  }
  handleAdd()
  form.prodOrderId = order.id
  handleOrderChange(order.id)
}

function handleEdit(row: any) {
  dialogTitle.value = '编辑报工'
  Object.assign(form, {
    id: row.id || 0,
    prodOrderId: row.prodOrderId ?? null,
    machineId: row.machineId ?? null,
    moldId: row.moldId ?? null,
    reportType: row.reportType || 'OUTPUT',
    processName: normalizeProdReportProcessName(row.processName),
    shift: row.shift || 'DAY',
    qty: row.qty ?? 0,
    badQty: row.badQty ?? 0,
    shots: row.shots ?? 0,
    startTime: row.startTime || '',
    endTime: row.endTime || '',
  })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function handleSubmit() {
  if (submitting.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) {
    return
  }
  const order = selectedOrder.value
  if (order && hasGateFields(order)) {
    const gate = summarizeSiteExecutionGate(orderGateInput(order))
    if (!gate.allowed) {
      ElMessage.error(`现场门禁未通过：${gate.blockers.join('、')}`)
      return
    }
  }

  const payload = {
    prodOrderId: form.prodOrderId,
    machineId: form.machineId,
    moldId: form.moldId || undefined,
    reportType: form.reportType,
    processName: normalizeProdReportProcessName(form.processName),
    shift: form.shift,
    qty: form.qty,
    badQty: form.badQty,
    shots: form.shots,
    startTime: form.startTime || undefined,
    endTime: form.endTime || undefined,
    workMinutes: workMinutesValue.value,
  }

  submitting.value = true
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
  } catch (error: any) {
    ElMessage.error(failureText(error, form.id ? '报工记录更新失败' : '报工记录创建失败'))
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: any) {
  try {
    await ElMessageBox.confirm('确定删除这条报工记录吗？', '提示', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deleteProdReport(row.id)
    ElMessage.success('删除成功')
    fetchData()
  } catch (error: any) {
    ElMessage.error(failureText(error, '报工记录删除失败'))
  }
}

watch(
  () => form.qty,
  () => {
    if (form.badQty > form.qty) {
      formRef.value?.validateField('badQty').catch(() => undefined)
    }
  }
)

watch(
  () => [form.startTime, form.endTime],
  () => {
    formRef.value?.validateField('startTime').catch(() => undefined)
    formRef.value?.validateField('endTime').catch(() => undefined)
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

.site-workbench {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(340px, 1.2fr);
  gap: 12px;
  margin-bottom: 14px;
}

.scan-panel,
.gate-panel {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: #fff;
  padding: 14px;
}

.scan-panel {
  display: grid;
  gap: 12px;
}

.scan-panel strong,
.gate-panel strong {
  display: block;
  margin-bottom: 4px;
  color: var(--el-text-color-primary);
  font-size: 15px;
}

.scan-panel span,
.gate-panel span {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.scan-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.gate-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.gate-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.gate-item {
  min-width: 0;
  display: grid;
  gap: 6px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 8px;
  background: var(--el-fill-color-lighter);
}

.gate-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gate-alert {
  margin: 12px 0;
}

.report-summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin: 0 0 18px;
}

.report-summary > div {
  min-width: 0;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px 12px;
  background: var(--el-fill-color-lighter);
}

.report-summary span {
  display: block;
  margin-bottom: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.report-summary strong {
  display: block;
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .site-workbench {
    grid-template-columns: 1fr;
  }

  .gate-list,
  .report-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .scan-actions {
    grid-template-columns: 1fr;
  }
}
</style>
