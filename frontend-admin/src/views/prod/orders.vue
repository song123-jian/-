<template>
  <div class="page-container">
    <PageHeader title="生产工单">
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>
        新增工单
      </el-button>
    </PageHeader>

    <SearchBar :keyword="searchKeyword" @search="handleSearch" @reset="handleReset">
      <el-form-item label="状态">
        <el-select v-model="searchStatus" placeholder="全部" clearable style="width: 160px">
          <el-option
            v-for="item in orderStatusOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
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
      <el-table :data="tableData" stripe v-loading="loading" empty-text="暂无生产工单">
        <el-table-column prop="id" label="编号" width="80" />
        <el-table-column prop="orderNo" label="工单编号" min-width="160" show-overflow-tooltip />
        <el-table-column label="产品" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            {{ productText(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="planQty" label="计划数量" width="110" />
        <el-table-column prop="completedQty" label="完成数量" width="110" />
        <el-table-column label="计划用料" width="110" align="right">
          <template #default="{ row }">
            {{ materialQtyText(plannedMaterialQty(row), row) }}
          </template>
        </el-table-column>
        <el-table-column label="已领料" width="110" align="right">
          <template #default="{ row }">
            {{ materialQtyText(pickedMaterialQty(row), row) }}
          </template>
        </el-table-column>
        <el-table-column label="领料金额" width="120" align="right">
          <template #default="{ row }">
            {{ moneyText(row.pickedMaterialAmount) }}
          </template>
        </el-table-column>
        <el-table-column label="领料状态" width="110">
          <template #default="{ row }">
            <el-tag :type="pickingStatusTag(row)" effect="plain">
              {{ pickingStatusText(row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="已入库" width="110" align="right">
          <template #default="{ row }">
            {{ finishedQtyText(inboundedProductionQty(row), row) }}
          </template>
        </el-table-column>
        <el-table-column label="入库金额" width="120" align="right">
          <template #default="{ row }">
            {{ moneyText(row.inboundedAmount) }}
          </template>
        </el-table-column>
        <el-table-column label="入库状态" width="110">
          <template #default="{ row }">
            <el-tag :type="inboundStatusTag(row)" effect="plain">
              {{ inboundStatusText(row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="进度" min-width="180">
          <template #default="{ row }">
            <div class="progress-cell">
              <el-progress :percentage="completionPercent(row)" :stroke-width="10" :show-text="false" />
              <span>{{ completionPercent(row) }}%</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="机台" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            {{ machineText(row) }}
          </template>
        </el-table-column>
        <el-table-column label="模具" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            {{ moldText(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" effect="plain">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="planStart" label="计划开始" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.planStart) }}
          </template>
        </el-table-column>
        <el-table-column prop="planEnd" label="计划结束" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.planEnd) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="300">
          <template #default="{ row }">
            <el-button type="info" link @click="handleReadiness(row)">齐套</el-button>
            <el-button type="primary" link @click="handleEdit(row)" :disabled="isClosed(row.status)">编辑</el-button>
            <el-button v-if="canDispatch(row)" type="success" link @click="handleStatusAction(row, 'dispatch')">
              派工
            </el-button>
            <el-button v-if="canStart(row)" type="success" link @click="handleStatusAction(row, 'start')">
              开工
            </el-button>
            <el-button v-if="canPause(row)" type="warning" link @click="handleStatusAction(row, 'pause')">
              暂停
            </el-button>
            <el-button v-if="canResume(row)" type="success" link @click="handleStatusAction(row, 'resume')">
              恢复
            </el-button>
            <el-button v-if="canFinish(row)" type="primary" link @click="handleStatusAction(row, 'finish')">
              完工
            </el-button>
            <el-button v-if="canCancel(row)" type="warning" link @click="handleStatusAction(row, 'cancel')">
              取消
            </el-button>
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="760px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="96px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="工单编号" prop="orderNo">
              <el-input v-model.trim="form.orderNo" placeholder="例如 PROD-20260703-001" :disabled="!!form.id" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="关联销售单" prop="saleOrderId">
              <el-select v-model="form.saleOrderId" filterable clearable placeholder="可选" style="width: 100%">
                <el-option
                  v-for="item in saleOrderOptions"
                  :key="item.id"
                  :label="saleOrderLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="产品" prop="productId">
              <el-select v-model="form.productId" filterable placeholder="请选择产品" style="width: 100%">
                <el-option
                  v-for="item in productOptions"
                  :key="item.id"
                  :label="productLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="计划数量" prop="planQty">
              <el-input-number v-model="form.planQty" :min="1" :precision="0" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="机台" prop="machineId">
              <el-select v-model="form.machineId" filterable clearable placeholder="派工前必填" style="width: 100%">
                <el-option
                  v-for="item in machineOptions"
                  :key="item.id"
                  :label="machineLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="模具" prop="moldId">
              <el-select v-model="form.moldId" filterable clearable placeholder="可选" style="width: 100%">
                <el-option
                  v-for="item in moldOptions"
                  :key="item.id"
                  :label="moldLabel(item)"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="计划开始" prop="planStart">
              <el-date-picker
                v-model="form.planStart"
                type="datetime"
                placeholder="选择开始时间"
                value-format="YYYY-MM-DD HH:mm:ss"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="计划结束" prop="planEnd">
              <el-date-picker
                v-model="form.planEnd"
                type="datetime"
                placeholder="选择结束时间"
                value-format="YYYY-MM-DD HH:mm:ss"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="优先级" prop="priority">
              <el-input-number v-model="form.priority" :min="1" :max="9" :precision="0" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="备注" prop="remark">
              <el-input v-model.trim="form.remark" placeholder="可选" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="readinessVisible" title="投产齐套检查" width="860px">
      <template v-if="readinessResult">
        <MetricStrip :items="readinessMetrics" testid="production-readiness-metrics" />
        <el-alert
          v-if="!readinessResult.canStart"
          class="readiness-alert"
          type="warning"
          show-icon
          :closable="false"
          :title="readinessResult.blockers.concat(readinessResult.warnings).join('；')"
        />
        <el-table :data="readinessResult.checks" stripe v-loading="readinessLoading" empty-text="暂无检查项">
          <el-table-column prop="label" label="检查项" width="120" />
          <el-table-column prop="severity" label="结果" width="100">
            <template #default="{ row }">
              <el-tag :type="readinessSeverityTag(row.severity)" effect="plain">
                {{ getProductionReadinessSeverityText(row.severity) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="message" label="结论" min-width="220" show-overflow-tooltip />
          <el-table-column prop="detail" label="依据" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.detail || '-' }}</template>
          </el-table-column>
        </el-table>
      </template>
      <el-empty v-else-if="!readinessLoading" description="请选择工单后查看齐套检查" />

      <template #footer>
        <el-button @click="readinessVisible = false">关闭</el-button>
        <el-button
          v-if="readinessResult && !readinessResult.canStart"
          type="warning"
          :loading="readinessAbnormalSaving"
          @click="createReadinessAbnormal"
        >
          生成异常
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import MetricStrip from '@/components/MetricStrip.vue'
import PageHeader from '@/components/PageHeader.vue'
import SearchBar from '@/components/SearchBar.vue'
import { formatDateTime, formatMoney } from '@/utils'
import { createInjectionRecord, getInjectionList } from '@/api/injection'
import { getMachineList } from '@/api/machine'
import { getMoldList } from '@/api/mold'
import { getProductList } from '@/api/product'
import {
  cancelProdOrder,
  createProdOrder,
  deleteProdOrder,
  dispatchProdOrder,
  finishProdOrder,
  getProdOrderList,
  pauseProdOrder,
  resumeProdOrder,
  startProdOrder,
  updateProdOrder,
} from '@/api/prodOrder'
import { getSaleOrderList } from '@/api/saleOrder'
import {
  getPickedMaterialQty,
  getPlannedMaterialQty,
  getRemainingMaterialQty,
  toPickingNumber,
} from '@/utils/production-picking'
import {
  getInboundedProductionQty,
  getProductionInboundStatus,
  toProductionNumber,
} from '@/utils/production-inbound'
import { getStockList } from '@/api/stock'
import {
  buildProductionReadinessFromLists,
  getProductionReadinessSeverityText,
  getProductionReadinessStatusText,
  type ProductionReadinessResult,
} from '@/utils/production-readiness'

type OptionItem = {
  id: number
  code?: string
  name?: string
  orderNo?: string
  shortName?: string
  productName?: string
  rawMaterialId?: number
  rawMaterialUsage?: number
  unit?: string
}

type OrderStatus = 'WAITING' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'FINISHED' | 'CANCELLED'
type StatusAction = 'dispatch' | 'start' | 'pause' | 'resume' | 'finish' | 'cancel'

const loading = ref(false)
const tableData = ref<any[]>([])
const searchKeyword = ref('')
const searchStatus = ref('')
const errorMessage = ref('')
const dialogVisible = ref(false)
const dialogTitle = ref('新增工单')
const formRef = ref<FormInstance>()
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const readinessVisible = ref(false)
const readinessLoading = ref(false)
const readinessAbnormalSaving = ref(false)
const readinessOrder = ref<any>(null)
const readinessResult = ref<ProductionReadinessResult | null>(null)

const saleOrderOptions = ref<OptionItem[]>([])
const productOptions = ref<OptionItem[]>([])
const machineOptions = ref<OptionItem[]>([])
const moldOptions = ref<OptionItem[]>([])

const orderStatusOptions: Array<{ label: string; value: OrderStatus }> = [
  { label: '待排产', value: 'WAITING' },
  { label: '已派工', value: 'SCHEDULED' },
  { label: '生产中', value: 'RUNNING' },
  { label: '已暂停', value: 'PAUSED' },
  { label: '已完工', value: 'FINISHED' },
  { label: '已取消', value: 'CANCELLED' },
]

const form = reactive({
  id: 0,
  orderNo: '',
  saleOrderId: null as number | null,
  productId: null as number | null,
  machineId: null as number | null,
  moldId: null as number | null,
  planQty: 1,
  planStart: '',
  planEnd: '',
  priority: 5,
  remark: '',
})

const formRules: FormRules = {
  orderNo: [
    { required: true, message: '请输入工单编号', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        const text = String(value || '').trim()
        if (!/^[A-Za-z0-9_-]+$/.test(text)) {
          callback(new Error('工单编号仅支持字母、数字、下划线和中横线'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
  productId: [{ required: true, message: '请选择产品', trigger: 'change' }],
  planQty: [
    { required: true, message: '请输入计划数量', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        const qty = Number(value)
        if (!Number.isInteger(qty) || qty <= 0) {
          callback(new Error('计划数量必须是大于 0 的整数'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
  planEnd: [
    {
      validator: (_rule, value, callback) => {
        if (!form.planStart || !value) {
          callback()
          return
        }
        const start = parseDateTime(form.planStart)
        const end = parseDateTime(value)
        if (start && end && end < start) {
          callback(new Error('计划结束不能早于计划开始'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
  priority: [
    {
      validator: (_rule, value, callback) => {
        const priority = Number(value)
        if (!Number.isInteger(priority) || priority < 1 || priority > 9) {
          callback(new Error('优先级必须是 1-9 的整数'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
}

const statusActionApi: Record<StatusAction, (id: number) => Promise<unknown>> = {
  dispatch: dispatchProdOrder,
  start: startProdOrder,
  pause: pauseProdOrder,
  resume: resumeProdOrder,
  finish: finishProdOrder,
  cancel: cancelProdOrder,
}

const statusActionText: Record<StatusAction, string> = {
  dispatch: '派工',
  start: '开工',
  pause: '暂停',
  resume: '恢复',
  finish: '完工',
  cancel: '取消',
}

const readinessMetrics = computed(() => {
  const result = readinessResult.value
  return [
    { label: '齐套结论', value: result ? result.statusText : '-', meta: result?.orderNo || '未选择工单', tone: result?.canStart ? 'success' as const : 'danger' as const },
    { label: '通过率', value: result?.score || 0, valueType: 'percent' as const, meta: '按检查项通过数计算', tone: 'primary' as const },
    { label: '阻断项', value: result?.blockers.length || 0, meta: '必须先处理', tone: 'danger' as const },
    { label: '待确认', value: result?.warnings.length || 0, meta: '建议开工前复核', tone: 'warning' as const },
  ]
})

function parseDateTime(value?: string) {
  const text = String(value || '').trim()
  if (!text) return null
  const date = new Date(text.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function createOrderNo() {
  const now = new Date()
  return `PROD-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function failureText(error: any, fallback: string) {
  return error?.message || error?.data?.message || fallback
}

function normalizeStatus(value?: string): OrderStatus {
  const status = String(value || '').toUpperCase()
  const legacyMap: Record<string, OrderStatus> = {
    PENDING: 'WAITING',
    PRODUCING: 'RUNNING',
    COMPLETED: 'FINISHED',
    CANCELLED: 'CANCELLED',
  }
  return legacyMap[status] || (orderStatusOptions.some((item) => item.value === status) ? (status as OrderStatus) : 'WAITING')
}

function normalizeOrder(row: any) {
  return {
    ...row,
    status: normalizeStatus(row.status),
    planQty: Number(row.planQty ?? row.quantity ?? 0),
    completedQty: Number(row.completedQty ?? 0),
    rawMaterialQty: Number(row.rawMaterialQty ?? 0),
    pickedMaterialQty: Number(row.pickedMaterialQty ?? 0),
    pickedMaterialAmount: Number(row.pickedMaterialAmount ?? 0),
    inboundedQty: Number(row.inboundedQty ?? 0),
    inboundedAmount: Number(row.inboundedAmount ?? 0),
    planStart: row.planStart || row.planDate || '',
    planEnd: row.planEnd || '',
  }
}

function statusLabel(value?: string) {
  const status = normalizeStatus(value)
  return orderStatusOptions.find((item) => item.value === status)?.label || status
}

function statusTag(value?: string) {
  const status = normalizeStatus(value)
  const map: Record<OrderStatus, string> = {
    WAITING: 'warning',
    SCHEDULED: 'primary',
    RUNNING: 'success',
    PAUSED: 'danger',
    FINISHED: 'info',
    CANCELLED: 'info',
  }
  return map[status]
}

function completionPercent(row: any) {
  const planQty = Number(row.planQty || 0)
  const completedQty = Number(row.completedQty || 0)
  if (planQty <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((completedQty / planQty) * 100)))
}

function optionText(options: OptionItem[], id?: number | string | null, fallback?: string) {
  const key = Number(id || 0)
  const item = options.find((option) => option.id === key)
  if (!item) return fallback || (key ? `#${key}` : '-')
  return [item.code || item.orderNo, item.name || item.shortName || item.productName].filter(Boolean).join(' - ') || `#${item.id}`
}

function saleOrderLabel(item: OptionItem) {
  return [item.orderNo, item.shortName].filter(Boolean).join(' - ') || `#${item.id}`
}

function productLabel(item: OptionItem) {
  return [item.code, item.name].filter(Boolean).join(' - ') || `#${item.id}`
}

function machineLabel(item: OptionItem) {
  return [item.code, item.name].filter(Boolean).join(' - ') || `#${item.id}`
}

function moldLabel(item: OptionItem) {
  return [item.code, item.name].filter(Boolean).join(' - ') || `#${item.id}`
}

function productText(row: any) {
  return row.productName || optionText(productOptions.value, row.productId)
}

function finishedProduct(row: any) {
  return productOptions.value.find((item) => Number(item.id) === Number(row.productId || 0))
}

function rawMaterialUnit(row: any) {
  const product = finishedProduct(row)
  const rawMaterial = productOptions.value.find((item) => Number(item.id) === Number(product?.rawMaterialId || 0))
  return rawMaterial?.unit || ''
}

function plannedMaterialQty(row: any) {
  return getPlannedMaterialQty(row, finishedProduct(row))
}

function pickedMaterialQty(row: any) {
  return getPickedMaterialQty(row)
}

function materialQtyText(value: any, row: any) {
  const qty = toPickingNumber(value)
  if (qty <= 0) return '-'
  return `${qty.toFixed(0)}${rawMaterialUnit(row)}`.trim()
}

function finishedQtyText(value: any, row: any) {
  const qty = toProductionNumber(value)
  if (qty <= 0) return '-'
  const product = finishedProduct(row)
  return `${qty.toFixed(0)}${product?.unit || ''}`.trim()
}

function moneyText(value: any) {
  return formatMoney(toPickingNumber(value))
}

function pickingStatus(row: any) {
  const plannedQty = plannedMaterialQty(row)
  if (plannedQty <= 0) return 'UNCONFIGURED'
  const pickedQty = pickedMaterialQty(row)
  if (pickedQty <= 0) return 'NONE'
  if (pickedQty >= plannedQty) return 'READY'
  return 'PARTIAL'
}

function pickingStatusTag(row: any) {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
    READY: 'success',
    PARTIAL: 'warning',
    NONE: 'danger',
    UNCONFIGURED: 'info',
  }
  return map[pickingStatus(row)] || 'info'
}

function pickingStatusText(row: any) {
  const map: Record<string, string> = {
    READY: '已领足',
    PARTIAL: '部分领料',
    NONE: '未领料',
    UNCONFIGURED: '未配置',
  }
  return map[pickingStatus(row)] || '-'
}

function inboundedProductionQty(row: any) {
  return getInboundedProductionQty(row)
}

function inboundStatus(row: any) {
  return getProductionInboundStatus(row)
}

function inboundStatusTag(row: any) {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
    DONE: 'success',
    PARTIAL: 'warning',
    NONE: 'danger',
    NO_OUTPUT: 'info',
  }
  return map[inboundStatus(row)] || 'info'
}

function inboundStatusText(row: any) {
  const map: Record<string, string> = {
    DONE: '已入库',
    PARTIAL: '部分入库',
    NONE: '未入库',
    NO_OUTPUT: '无合格产量',
  }
  return map[inboundStatus(row)] || '-'
}

function readinessSeverityTag(severity: string) {
  if (severity === 'passed') return 'success'
  if (severity === 'blocked') return 'danger'
  return 'warning'
}

function unwrapRecords(res: any) {
  const data = res?.data?.records || res?.data?.list || res?.data || []
  return Array.isArray(data) ? data : [data].filter(Boolean)
}

async function loadReadinessResult(row: any) {
  readinessLoading.value = true
  const order = normalizeOrder(row)
  readinessOrder.value = order
  try {
    const [processCardRes, firstArticleRes, startupRes, materialMixRes, stockRes] = await Promise.allSettled([
      getInjectionList('process-cards', { page: 1, pageSize: 300 }),
      getInjectionList('trial-mold-records', { page: 1, pageSize: 300 }),
      getInjectionList('startup-checks', { page: 1, pageSize: 300 }),
      getInjectionList('material-mix-orders', { page: 1, pageSize: 300 }),
      getStockList({ page: 1, pageSize: 500 }),
    ])
    readinessResult.value = buildProductionReadinessFromLists({
      order,
      products: productOptions.value,
      machines: machineOptions.value,
      molds: moldOptions.value,
      processCards: processCardRes.status === 'fulfilled' ? unwrapRecords(processCardRes.value) : [],
      firstArticles: firstArticleRes.status === 'fulfilled' ? unwrapRecords(firstArticleRes.value) : [],
      startupChecks: startupRes.status === 'fulfilled' ? unwrapRecords(startupRes.value) : [],
      materialMixOrders: materialMixRes.status === 'fulfilled' ? unwrapRecords(materialMixRes.value) : [],
      stockRows: stockRes.status === 'fulfilled' ? unwrapRecords(stockRes.value) : [],
    })
    const failed = [processCardRes, firstArticleRes, startupRes, materialMixRes, stockRes].some((item) => item.status === 'rejected')
    if (failed) {
      ElMessage.warning('部分齐套依据加载失败，当前结论已按已获取数据生成，请复核 Supabase 连接。')
    }
    return readinessResult.value
  } finally {
    readinessLoading.value = false
  }
}

async function handleReadiness(row: any) {
  readinessVisible.value = true
  readinessResult.value = null
  await loadReadinessResult(row)
}

function machineText(row: any) {
  return row.machineName || optionText(machineOptions.value, row.machineId)
}

function moldText(row: any) {
  return row.moldName || optionText(moldOptions.value, row.moldId)
}

function isClosed(status?: string) {
  return ['FINISHED', 'CANCELLED'].includes(normalizeStatus(status))
}

function canDispatch(row: any) {
  return normalizeStatus(row.status) === 'WAITING'
}

function canStart(row: any) {
  return normalizeStatus(row.status) === 'SCHEDULED'
}

function canPause(row: any) {
  return normalizeStatus(row.status) === 'RUNNING'
}

function canResume(row: any) {
  return normalizeStatus(row.status) === 'PAUSED'
}

function canFinish(row: any) {
  return ['RUNNING', 'PAUSED'].includes(normalizeStatus(row.status))
}

function canCancel(row: any) {
  return ['WAITING', 'SCHEDULED', 'PAUSED'].includes(normalizeStatus(row.status))
}

function canDelete(row: any) {
  return ['WAITING', 'CANCELLED'].includes(normalizeStatus(row.status))
}

function validateAction(row: any, action: StatusAction) {
  if (action === 'dispatch' && !row.machineId) {
    ElMessage.warning('派工前必须指定机台')
    return false
  }
  if (action === 'start' && !row.machineId) {
    ElMessage.warning('开工前必须指定机台')
    return false
  }
  if (action === 'finish' && Number(row.completedQty || 0) <= 0) {
    ElMessage.warning('没有报工产量，不能直接完工')
    return false
  }
  if (action === 'finish' && getRemainingMaterialQty(row, finishedProduct(row)) > 0) {
    ElMessage.warning('工单领料未完成，不能完工')
    return false
  }
  return true
}

async function loadOptions() {
  try {
    const [saleOrderRes, productRes, machineRes, moldRes] = await Promise.all([
      getSaleOrderList({ page: 1, pageSize: 200 }),
      getProductList({ page: 1, pageSize: 500 }),
      getMachineList({ page: 1, pageSize: 200 }),
      getMoldList({ page: 1, pageSize: 200 }),
    ])
    saleOrderOptions.value = saleOrderRes.data?.records || saleOrderRes.data?.list || []
    productOptions.value = productRes.data?.records || productRes.data?.list || []
    machineOptions.value = machineRes.data?.records || machineRes.data?.list || []
    moldOptions.value = moldRes.data?.records || moldRes.data?.list || []
  } catch (error: any) {
    saleOrderOptions.value = []
    productOptions.value = []
    machineOptions.value = []
    moldOptions.value = []
    ElMessage.error(failureText(error, '生产工单基础选项加载失败，请检查产品、机台、模具和销售订单资料。'))
  }
}

async function fetchData() {
  loading.value = true
  try {
    errorMessage.value = ''
    const res: any = await getProdOrderList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || undefined,
      status: searchStatus.value || undefined,
    })
    const rows = res.data?.list || res.data?.records || []
    tableData.value = rows.map(normalizeOrder)
    pagination.total = res.data?.total || rows.length
  } catch (error: any) {
    tableData.value = []
    pagination.total = 0
    errorMessage.value = failureText(error, '生产工单加载失败，请检查 Supabase 连接、生产工单表和基础资料配置。')
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
  searchStatus.value = ''
  pagination.page = 1
  fetchData()
}

function resetForm() {
  Object.assign(form, {
    id: 0,
    orderNo: createOrderNo(),
    saleOrderId: null,
    productId: null,
    machineId: null,
    moldId: null,
    planQty: 1,
    planStart: '',
    planEnd: '',
    priority: 5,
    remark: '',
  })
}

function handleAdd() {
  dialogTitle.value = '新增工单'
  resetForm()
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function handleEdit(row: any) {
  const normalized = normalizeOrder(row)
  dialogTitle.value = '编辑工单'
  Object.assign(form, {
    id: normalized.id || 0,
    orderNo: normalized.orderNo || '',
    saleOrderId: normalized.saleOrderId ?? null,
    productId: normalized.productId ?? null,
    machineId: normalized.machineId ?? null,
    moldId: normalized.moldId ?? null,
    planQty: normalized.planQty || 1,
    planStart: normalized.planStart || '',
    planEnd: normalized.planEnd || '',
    priority: normalized.priority || 5,
    remark: normalized.remark || '',
  })
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

function buildPayload() {
  return {
    orderNo: form.orderNo.trim(),
    saleOrderId: form.saleOrderId || undefined,
    productId: form.productId,
    machineId: form.machineId || undefined,
    moldId: form.moldId || undefined,
    planQty: form.planQty,
    planStart: form.planStart || undefined,
    planEnd: form.planEnd || undefined,
    priority: form.priority,
    remark: form.remark || undefined,
  }
}

async function ensureReadinessBeforeStart(row: any) {
  const result = await loadReadinessResult(row)
  if (!result.canStart) {
    readinessVisible.value = true
    ElMessage.warning(`工单${getProductionReadinessStatusText(result.status)}，请先处理齐套阻断项`)
    return false
  }
  return true
}

async function createReadinessAbnormal() {
  if (!readinessResult.value || !readinessOrder.value) return
  readinessAbnormalSaving.value = true
  try {
    const orderNo = readinessResult.value.orderNo
    const reasons = readinessResult.value.blockers.concat(readinessResult.value.warnings).join('；')
    await createInjectionRecord('andon-events', {
      sourceType: 'PRODUCTION_READINESS',
      sourceId: readinessResult.value.orderId,
      level: readinessResult.value.blockers.length ? 'CRITICAL' : 'WARNING',
      title: `投产齐套未通过：${orderNo}`,
      description: reasons || '投产齐套检查未通过',
      status: 'OPEN',
    })
    ElMessage.success('已生成现场异常，可在异常闭环中心继续处理')
  } catch (error: any) {
    ElMessage.error(failureText(error, '齐套异常生成失败'))
  } finally {
    readinessAbnormalSaving.value = false
  }
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    if (form.id) {
      await updateProdOrder(form.id, buildPayload())
      ElMessage.success('更新成功')
    } else {
      await createProdOrder(buildPayload())
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    fetchData()
  } catch (error: any) {
    ElMessage.error(failureText(error, form.id ? '生产工单更新失败' : '生产工单创建失败'))
  }
}

async function handleStatusAction(row: any, action: StatusAction) {
  if (!validateAction(row, action)) return
  if (action === 'start') {
    const readinessPassed = await ensureReadinessBeforeStart(row)
    if (!readinessPassed) return
  }
  const text = statusActionText[action]
  try {
    await ElMessageBox.confirm(`确定${text}工单 ${row.orderNo || row.id} 吗？`, '提示', { type: 'warning' })
  } catch {
    return
  }
  try {
    await statusActionApi[action](row.id)
    ElMessage.success(`${text}成功`)
    fetchData()
  } catch (error: any) {
    ElMessage.error(failureText(error, `生产工单${text}失败`))
  }
}

async function handleDelete(row: any) {
  try {
    await ElMessageBox.confirm(`确定删除工单 ${row.orderNo || row.id} 吗？`, '提示', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deleteProdOrder(row.id)
    ElMessage.success('删除成功')
    fetchData()
  } catch (error: any) {
    ElMessage.error(failureText(error, '生产工单删除失败'))
  }
}

watch(
  () => [form.planStart, form.planEnd],
  () => {
    formRef.value?.validateField('planEnd').catch(() => undefined)
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

.readiness-alert {
  margin: 12px 0;
}

.progress-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-cell :deep(.el-progress) {
  flex: 1;
  min-width: 0;
}

.progress-cell span {
  width: 42px;
  flex-shrink: 0;
  text-align: right;
  color: #606266;
  font-size: 12px;
}
</style>
