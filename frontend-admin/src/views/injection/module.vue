<template>
  <div class="page-container injection-page">
    <PageHeader :title="module.title">
      <el-button plain @click="loadData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon>
        新增
      </el-button>
    </PageHeader>

    <el-alert
      v-if="errorMessage"
      class="page-alert"
      type="error"
      :title="errorMessage"
      show-icon
      :closable="false"
    />

    <div class="module-switcher">
      <button
        v-for="item in modules"
        :key="item.key"
        class="module-switcher__item"
        :class="{ active: item.key === module.key }"
        type="button"
        @click="router.push(`/injection/${item.key}`)"
      >
        <span>{{ item.order }}</span>
        {{ item.shortTitle }}
      </button>
    </div>

    <MetricStrip :items="metricCards" testid="injection-module-metrics" />

    <el-alert
      class="site-flow-alert"
      :type="moduleFlowAlert.type"
      :title="moduleFlowAlert.title"
      :description="moduleFlowAlert.description"
      show-icon
      :closable="false"
    />

    <el-card shadow="hover">
      <template #header>
        <div class="card-header">
          <div>
            <strong>{{ module.shortTitle }}</strong>
            <span>{{ module.description }}</span>
          </div>
          <el-input v-model.trim="keyword" clearable placeholder="搜索编号、名称、状态" class="search-input" @keyup.enter="loadData" />
        </div>
      </template>

      <el-table v-loading="loading" :data="rows" stripe row-key="id" empty-text="暂无数据">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column
          v-for="field in module.listFields"
          :key="field.prop"
          :prop="field.prop"
          :label="field.label"
          min-width="130"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <el-tag v-if="field.prop === 'status'" :type="statusTagType(row.status)" effect="plain">
              {{ injectionStatusText(row.status) }}
            </el-tag>
            <span v-else>{{ displayValue(row[field.prop]) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="170" show-overflow-tooltip />
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="openEdit(row)">编辑</el-button>
            <el-dropdown trigger="click" @command="(action: string) => runAction(row, action)">
              <el-button size="small" type="primary" link>流转</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="action in nextActions(row.status)" :key="action" :command="action">
                    {{ actionText(action) }}
                  </el-dropdown-item>
                  <el-dropdown-item v-if="!nextActions(row.status).length" disabled>暂无动作</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button size="small" type="danger" link @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        class="pagination"
        layout="total, sizes, prev, pager, next"
        :total="pagination.total"
        @size-change="loadData"
        @current-change="loadData"
      />
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="760px" destroy-on-close>
      <div v-if="purchaseRequisitionPrefillRows.length > 1" class="prefill-panel">
        <div class="prefill-panel__header">
          <strong>批量请购建议</strong>
          <span>待处理 {{ purchaseRequisitionPrefillRows.length }} 项，合计 {{ purchaseRequisitionPrefillTotal }}</span>
        </div>
        <el-table :data="purchaseRequisitionPrefillRows" size="small" border max-height="220">
          <el-table-column prop="materialName" label="物料" min-width="150" show-overflow-tooltip />
          <el-table-column prop="shortageQty" label="缺料量" width="95" align="right" />
          <el-table-column prop="requestedQty" label="请购量" width="95" align="right" />
          <el-table-column prop="sourceMrpNo" label="来源MRP" min-width="160" show-overflow-tooltip />
          <el-table-column label="重复风险" width="95" align="center">
            <template #default="{ row }">
              <el-tag v-if="duplicatePurchaseRequisitionText(row)" type="danger" effect="plain">已存在</el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="72" align="center">
            <template #default="{ row, $index }">
              <el-button size="small" type="primary" link @click="fillPurchaseRequisitionSuggestion(row, $index)">填入</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <el-alert
        v-if="activePurchaseRequisitionDuplicateText"
        class="prefill-duplicate-alert"
        type="warning"
        title="已存在未关闭请购"
        :description="activePurchaseRequisitionDuplicateText"
        show-icon
        :closable="false"
      />
      <el-form label-width="120px" :model="form">
        <el-row :gutter="12">
          <el-col v-for="field in module.formFields" :key="field.prop" :span="field.type === 'textarea' ? 24 : 12">
            <el-form-item :label="field.label" :required="field.required">
              <el-input-number
                v-if="field.type === 'number'"
                v-model="form[field.prop]"
                :min="field.min"
                :max="field.max"
                controls-position="right"
                class="full-input"
              />
              <el-select v-else-if="field.type === 'select'" v-model="form[field.prop]" clearable class="full-input">
                <el-option v-for="option in field.options || []" :key="String(option.value)" :label="option.label" :value="option.value" />
              </el-select>
              <el-date-picker
                v-else-if="field.type === 'date' || field.type === 'datetime'"
                v-model="form[field.prop]"
                :type="field.type"
                value-format="YYYY-MM-DD HH:mm:ss"
                class="full-input"
              />
              <el-switch v-else-if="field.type === 'boolean'" v-model="form[field.prop]" />
              <el-input v-else-if="field.type === 'textarea'" v-model="form[field.prop]" type="textarea" :rows="3" />
              <el-input v-else v-model="form[field.prop]" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-select v-model="form.status" class="full-input">
                <el-option v-for="option in module.statusOptions" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="closeDialog">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import MetricStrip from '@/components/MetricStrip.vue'
import PageHeader from '@/components/PageHeader.vue'
import {
  INJECTION_MODULES,
  buildAndonFromFailedStartup,
  buildAndonFromFirstArticleRejection,
  buildAndonFromMaterialMixRejection,
  buildInjectionRecordPayload,
  getInjectionModuleByKey,
  getInjectionNextActions,
  injectionStatusText,
  summarizeInjectionRecords,
  validateInjectionRecord,
  type InjectionAction,
  type InjectionModuleKey,
} from '@/utils/injection-professional'
import {
  createInjectionRecord,
  deleteInjectionRecord,
  getInjectionList,
  runInjectionAction,
  updateInjectionRecord,
} from '@/api/injection'

const route = useRoute()
const router = useRouter()
const modules = INJECTION_MODULES
const loading = ref(false)
const submitting = ref(false)
const errorMessage = ref('')
const rows = ref<any[]>([])
const keyword = ref('')
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const form = reactive<Record<string, any>>({})
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

type PurchaseRequisitionPrefillRow = {
  materialId?: number
  materialCode?: string
  materialName?: string
  unit?: string
  shortageQty?: number
  requestedQty?: number
  sourceMrpNo?: string
  expectedDate?: string
  remark?: string
  status?: string
}

const purchaseRequisitionPrefillRows = ref<PurchaseRequisitionPrefillRow[]>([])
const purchaseRequisitionDuplicateRows = ref<Record<string, any>[]>([])
const activePurchaseRequisitionPrefillIndex = ref(0)
const module = computed(() => getInjectionModuleByKey(String(route.path.split('/').filter(Boolean).pop() || 'process-card')))
const summary = computed(() => summarizeInjectionRecords(rows.value))
const purchaseRequisitionPrefillTotal = computed(() => Number(purchaseRequisitionPrefillRows.value.reduce((sum, row) => sum + Number(row.requestedQty || 0), 0).toFixed(2)))
const activePurchaseRequisitionDuplicate = computed(() => {
  if (module.value.key !== 'purchase-requisition' || editingId.value) return null
  return findDuplicatePurchaseRequisitionRecord(form)
})
const activePurchaseRequisitionDuplicateText = computed(() => duplicateRecordText(activePurchaseRequisitionDuplicate.value))
const metricCards = computed(() => [
  { label: '全部记录', value: summary.value.total, meta: `${module.value.shortTitle} 数据`, tone: 'primary' as const },
  { label: '待处理', value: summary.value.open, meta: '需分派、处理或审核', tone: 'warning' as const },
  { label: '已闭环', value: summary.value.closed, meta: '完成、关闭或通过', tone: 'success' as const },
  { label: '风险项', value: summary.value.risk, meta: '驳回、失败或严重异常', tone: 'danger' as const },
])
const dialogTitle = computed(() => `${editingId.value ? '编辑' : '新增'}${module.value.shortTitle}`)
const moduleFlowAlert = computed(() => {
  const alerts: Record<string, { type: 'info' | 'success' | 'warning' | 'error'; title: string; description: string }> = {
    'startup-check': {
      type: 'warning',
      title: '齐套检查是扫码报工前置门禁',
      description: '原料、模具、机台、工艺卡、首件和人员班次任一未通过时，系统会生成不通过项并尝试写入安灯异常。',
    },
    'trial-mold': {
      type: 'warning',
      title: '首件确认决定是否允许量产',
      description: '首件驳回后会阻断扫码报工，并尝试生成安灯异常，待责任人处理后再恢复现场作业。',
    },
    'material-mix': {
      type: 'warning',
      title: '配料烘料决定现场投产条件',
      description: '回料比例、烘料时间和原料批次必须有效；驳回或失败会进入安灯异常闭环。',
    },
    'label-template': {
      type: 'info',
      title: '包装标签承接批次和客户交付',
      description: '模板应包含产品、批次、客户、数量和日期字段，正式打印前需确认模板版本。',
    },
    'andon-event': {
      type: 'error',
      title: '安灯异常负责现场问题闭环',
      description: '现场门禁失败、首件驳回、配料异常和报工异常应在此完成分派、处理、关闭和超时追踪。',
    },
  }
  return alerts[module.value.key] || {
    type: 'info',
    title: `${module.value.shortTitle}现场记录`,
    description: module.value.description,
  }
})

function unwrapRecords(res: any) {
  const data = res?.data?.records || res?.data?.list || res?.data || []
  return Array.isArray(data) ? data : [data].filter(Boolean)
}

function failureText(error: any, fallback: string) {
  return error?.message || error?.response?.data?.message || fallback
}

function queryText(key: string) {
  const value = route.query[key]
  const first = Array.isArray(value) ? value[0] : value
  return String(first ?? '').trim()
}

function queryNumber(key: string) {
  const text = queryText(key)
  if (!text) return undefined
  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}

function purchaseRequisitionMaterialId(row: Record<string, any>) {
  return Number(row.materialId ?? row.material_id ?? 0)
}

function purchaseRequisitionSourceMrp(row: Record<string, any>) {
  return String(row.sourceMrpNo ?? row.source_mrp_no ?? '').trim()
}

function purchaseRequisitionStatus(row: Record<string, any>) {
  return String(row.status || '').trim().toUpperCase()
}

function purchaseRequisitionMrpTokens(row: Record<string, any>) {
  return purchaseRequisitionSourceMrp(row).split(/[、,;；\s]+/).map((item) => item.trim()).filter(Boolean)
}

function isOpenPurchaseRequisition(row: Record<string, any>) {
  return purchaseRequisitionStatus(row) !== 'CLOSED'
}

function duplicateRecordText(row: Record<string, any> | null | undefined) {
  if (!row) return ''
  const no = row.requisitionNo || row.requisition_no || `#${row.id || '-'}`
  const status = row.status || '-'
  return `同物料、同来源 MRP 已存在未关闭请购单 ${no}（状态：${injectionStatusText(status)}），请先处理原单或切换其他建议。`
}

function findDuplicatePurchaseRequisitionRecord(candidate: Record<string, any>) {
  const materialId = purchaseRequisitionMaterialId(candidate)
  const mrpTokens = new Set(purchaseRequisitionMrpTokens(candidate))
  if (!materialId || !mrpTokens.size) return null
  const scope = purchaseRequisitionDuplicateRows.value.length ? purchaseRequisitionDuplicateRows.value : rows.value
  return scope.find((row) => {
    if (!isOpenPurchaseRequisition(row)) return false
    if (purchaseRequisitionMaterialId(row) !== materialId) return false
    return purchaseRequisitionMrpTokens(row).some((token) => mrpTokens.has(token))
  }) || null
}

function duplicatePurchaseRequisitionText(row: Record<string, any>) {
  return duplicateRecordText(findDuplicatePurchaseRequisitionRecord(row))
}

function normalizePurchaseRequisitionPrefillRow(row: Record<string, any>, shared: Record<string, any> = {}): PurchaseRequisitionPrefillRow | null {
  const materialId = Number(row.materialId || 0)
  const requestedQty = Number(row.requestedQty || 0)
  if (!materialId && requestedQty <= 0) return null
  return {
    materialId,
    materialCode: String(row.materialCode || ''),
    materialName: String(row.materialName || row.materialCode || (materialId ? `物料#${materialId}` : '')),
    unit: String(row.unit || ''),
    shortageQty: Number(row.shortageQty || 0),
    requestedQty,
    sourceMrpNo: String(row.sourceMrpNo || ''),
    expectedDate: String(row.expectedDate || shared.expectedDate || ''),
    remark: String(row.remark || shared.remark || ''),
    status: String(row.status || shared.status || 'DRAFT'),
  }
}

function buildSinglePurchaseRequisitionRoutePrefill() {
  const source: Record<string, any> = { status: queryText('status') || 'DRAFT' }
  for (const key of ['materialId', 'shortageQty', 'requestedQty', 'supplierId']) {
    const value = queryNumber(key)
    if (value !== undefined) source[key] = value
  }
  for (const key of ['sourceMrpNo', 'expectedDate', 'remark']) {
    const value = queryText(key)
    if (value) source[key] = value
  }
  return normalizePurchaseRequisitionPrefillRow(source)
}

function buildPurchaseRequisitionRoutePrefill() {
  if (module.value.key !== 'purchase-requisition') return []
  if (queryText('action') !== 'create') return []

  const shared = {
    expectedDate: queryText('expectedDate'),
    remark: queryText('remark'),
    status: queryText('status') || 'DRAFT',
  }
  const itemsText = queryText('items')
  if (itemsText) {
    try {
      const parsed = JSON.parse(itemsText)
      if (Array.isArray(parsed)) {
        const rows = parsed
          .map((item) => normalizePurchaseRequisitionPrefillRow(item, shared))
          .filter((item): item is PurchaseRequisitionPrefillRow => Boolean(item))
        if (rows.length) return rows
      }
    } catch {
      // Fall through to the single-row query fields below.
    }
  }
  const single = buildSinglePurchaseRequisitionRoutePrefill()
  return single ? [single] : []
}

function fillPurchaseRequisitionSuggestion(row: PurchaseRequisitionPrefillRow, index = 0) {
  activePurchaseRequisitionPrefillIndex.value = index
  resetForm({
    materialId: row.materialId,
    shortageQty: row.shortageQty,
    requestedQty: row.requestedQty,
    sourceMrpNo: row.sourceMrpNo,
    expectedDate: row.expectedDate,
    remark: row.remark,
    status: row.status || 'DRAFT',
  })
}

function applyRoutePrefill() {
  const sourceRows = buildPurchaseRequisitionRoutePrefill()
  if (!sourceRows.length) return
  purchaseRequisitionPrefillRows.value = sourceRows
  editingId.value = null
  fillPurchaseRequisitionSuggestion(sourceRows[0], 0)
  dialogVisible.value = true
}

function resetPurchaseRequisitionRoutePrefill() {
  purchaseRequisitionPrefillRows.value = []
  activePurchaseRequisitionPrefillIndex.value = 0
}

function clearRoutePrefill() {
  resetPurchaseRequisitionRoutePrefill()
  if (module.value.key !== 'purchase-requisition' || queryText('action') !== 'create') return
  const query = { ...route.query }
  for (const key of ['action', 'open', 'batch', 'itemCount', 'items', 'materialId', 'shortageQty', 'requestedQty', 'totalRequestedQty', 'supplierId', 'sourceMrpNo', 'expectedDate', 'remark', 'status']) {
    delete query[key]
  }
  router.replace({ path: route.path, query }).catch(() => undefined)
}

function resetForm(source: Record<string, any> = {}) {
  Object.keys(form).forEach((key) => delete form[key])
  for (const field of module.value.formFields) {
    if (source[field.prop] !== undefined) form[field.prop] = source[field.prop]
    else if (field.type === 'boolean') form[field.prop] = true
    else form[field.prop] = field.type === 'number' ? undefined : ''
  }
  form.status = source.status || module.value.statusOptions[0]?.value || 'DRAFT'
}

async function loadData() {
  loading.value = true
  errorMessage.value = ''
  try {
    const res: any = await getInjectionList(module.value.resource, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: keyword.value,
    })
    rows.value = unwrapRecords(res)
    if (module.value.key === 'purchase-requisition') purchaseRequisitionDuplicateRows.value = rows.value
    pagination.total = Number(res?.data?.total || rows.value.length)
  } catch (error: any) {
    rows.value = []
    pagination.total = 0
    errorMessage.value = failureText(error, `${module.value.shortTitle}加载失败，请检查 Supabase 连接和业务表结构。`)
    ElMessage.error(errorMessage.value)
  } finally {
    loading.value = false
  }
}

async function refreshPurchaseRequisitionDuplicateScope() {
  if (module.value.key !== 'purchase-requisition') return
  try {
    const res: any = await getInjectionList(module.value.resource, { page: 1, pageSize: 1000 })
    purchaseRequisitionDuplicateRows.value = unwrapRecords(res)
  } catch {
    purchaseRequisitionDuplicateRows.value = rows.value
  }
}

function openCreate() {
  editingId.value = null
  resetPurchaseRequisitionRoutePrefill()
  resetForm()
  dialogVisible.value = true
}

function closeDialog() {
  dialogVisible.value = false
  clearRoutePrefill()
}

function openEdit(row: any) {
  editingId.value = Number(row.id)
  resetForm(row)
  dialogVisible.value = true
}

async function submitForm() {
  const moduleKey = module.value.key as InjectionModuleKey
  const message = validateInjectionRecord(moduleKey, form)
  if (message) {
    ElMessage.warning(message)
    return
  }
  const payload = buildInjectionRecordPayload(moduleKey, form)
  submitting.value = true
  try {
    if (!editingId.value && moduleKey === 'purchase-requisition') {
      await refreshPurchaseRequisitionDuplicateScope()
      const duplicate = findDuplicatePurchaseRequisitionRecord(form)
      if (duplicate) {
        ElMessage.warning(duplicateRecordText(duplicate))
        return
      }
    }
    let savedRecord: Record<string, any> = { ...payload, id: editingId.value || 0 }
    if (editingId.value) {
      await updateInjectionRecord(module.value.resource, editingId.value, payload)
    } else {
      const res: any = await createInjectionRecord(module.value.resource, payload)
      savedRecord = { ...payload, ...(res?.data || {}) }
    }
    await createDerivedAndon(moduleKey, savedRecord)
    ElMessage.success('保存成功')
    if (!editingId.value && moduleKey === 'purchase-requisition' && purchaseRequisitionPrefillRows.value.length > 1) {
      const nextRows = purchaseRequisitionPrefillRows.value.filter((_, index) => index !== activePurchaseRequisitionPrefillIndex.value)
      purchaseRequisitionPrefillRows.value = nextRows
      const nextIndex = Math.min(activePurchaseRequisitionPrefillIndex.value, nextRows.length - 1)
      fillPurchaseRequisitionSuggestion(nextRows[nextIndex], nextIndex)
      dialogVisible.value = true
      await loadData()
      return
    }
    dialogVisible.value = false
    clearRoutePrefill()
    await loadData()
  } catch (error: any) {
    ElMessage.error(failureText(error, `${module.value.shortTitle}保存失败，请检查必填字段和 Supabase 写入权限。`))
  } finally {
    submitting.value = false
  }
}

async function createDerivedAndon(moduleKey: InjectionModuleKey, record: Record<string, any>) {
  const builders: Partial<Record<InjectionModuleKey, (row: Record<string, any>) => Record<string, any> | null>> = {
    'startup-check': buildAndonFromFailedStartup,
    'trial-mold': buildAndonFromFirstArticleRejection,
    'material-mix': buildAndonFromMaterialMixRejection,
  }
  const andon = builders[moduleKey]?.(record)
  if (!andon) return
  try {
    await createInjectionRecord('andon-events', andon)
    ElMessage.warning(`已生成安灯异常：${andon.title}`)
  } catch (error: any) {
    ElMessage.warning(error?.message || '现场异常已识别，但安灯异常自动创建失败')
  }
}

async function removeRow(row: any) {
  try {
    await ElMessageBox.confirm(`确认删除 ${displayValue(row[module.value.codeField] || row.id)}？`, '提示', { type: 'warning' })
    await deleteInjectionRecord(module.value.resource, Number(row.id))
    ElMessage.success('删除成功')
    await loadData()
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(failureText(error, `${module.value.shortTitle}删除失败，请检查删除权限或关联数据。`))
  }
}

function nextActions(status: string) {
  return getInjectionNextActions(status)
}

async function runAction(row: any, action: string) {
  try {
    await runInjectionAction(module.value.resource, Number(row.id), action)
    ElMessage.success(`${actionText(action as InjectionAction)}成功`)
    await loadData()
  } catch (error: any) {
    ElMessage.error(failureText(error, `${module.value.shortTitle}${actionText(action as InjectionAction)}失败，请检查当前状态和流转权限。`))
  }
}

function displayValue(value: unknown) {
  if (value === true) return '是'
  if (value === false) return '否'
  return String(value ?? '') || '-'
}

function statusTagType(status?: string) {
  const value = String(status || '').toUpperCase()
  if (['FAILED', 'REJECTED', 'OPEN', 'REPORTED', 'OVERDUE'].includes(value)) return 'danger'
  if (['SUBMITTED', 'ASSIGNED', 'PROCESSING', 'WAIT_CONFIRM', 'TRIALING', 'WARNING'].includes(value)) return 'warning'
  if (['APPROVED', 'ACTIVE', 'PASSED', 'CLOSED', 'FINISHED', 'APPROVED_PRODUCTION', 'NORMAL', 'GENERATED'].includes(value)) return 'success'
  return 'info'
}

function actionText(action: InjectionAction | string) {
  const labels: Record<string, string> = {
    submit: '提交', approve: '审核', reject: '驳回', assign: '分派', start: '开始', finish: '完成', close: '关闭', print: '打印', generate: '生成',
  }
  return labels[action] || action
}

watch(() => route.path, () => {
  pagination.page = 1
  resetForm()
  loadData()
  applyRoutePrefill()
})

watch(() => route.query, () => {
  applyRoutePrefill()
})

onMounted(() => {
  resetForm()
  loadData()
  applyRoutePrefill()
})
</script>

<style scoped lang="scss">
.injection-page {
  .module-switcher {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    margin-bottom: 14px;
    padding-bottom: 4px;
  }

  .module-switcher__item {
    flex: 0 0 auto;
    border: 1px solid #dfe5ec;
    border-radius: 6px;
    background: #fff;
    color: #526071;
    cursor: pointer;
    padding: 8px 10px;
    font-size: 13px;

    span {
      margin-right: 4px;
      color: #0f766e;
      font-weight: 700;
    }

    &.active {
      border-color: #0f766e;
      background: #eef7f6;
      color: #0f3f3a;
      font-weight: 700;
    }
  }

  .site-flow-alert {
    margin-bottom: 14px;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;

    div {
      display: grid;
      gap: 4px;
    }

    span {
      color: #606266;
      font-size: 13px;
    }
  }

  .search-input {
    width: 260px;
  }

  .pagination {
    justify-content: flex-end;
    margin-top: 14px;
  }

  .prefill-panel {
    margin-bottom: 12px;
  }

  .prefill-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;

    span {
      color: #606266;
      font-size: 13px;
    }
  }

  .prefill-duplicate-alert {
    margin-bottom: 12px;
  }

  .full-input {
    width: 100%;
  }

  .page-alert {
    margin-bottom: 12px;
  }
}
</style>
