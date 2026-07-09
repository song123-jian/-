<template>
  <div class="page-container abnormal-center-page" v-loading="loading">
    <PageHeader title="异常闭环中心" subtitle="聚合现场上报、系统预警、生产延期、质量不良和齐套失败，统一分派、处理和关闭。">
      <el-button plain @click="fetchData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
      <el-button type="primary" plain @click="goTo('/workbench/todos')">
        <el-icon><Memo /></el-icon>
        待办中心
      </el-button>
      <el-button type="warning" plain @click="goTo('/prod/warnings')">
        <el-icon><Bell /></el-icon>
        预警中心
      </el-button>
    </PageHeader>

    <MetricStrip :items="metricCards" testid="abnormal-center-metrics" />

    <el-alert
      v-if="errorMessage"
      class="page-alert"
      type="warning"
      :title="errorMessage"
      show-icon
      :closable="false"
    />

    <SearchBar :keyword="searchKeyword" @search="handleSearch" @reset="handleReset">
      <el-form-item label="来源">
        <el-select v-model="searchSource" placeholder="全部" clearable style="width: 150px">
          <el-option label="现场上报" value="andon" />
          <el-option label="系统预警" value="warning" />
          <el-option label="生产异常" value="production" />
          <el-option label="质量异常" value="qc" />
          <el-option label="齐套异常" value="readiness" />
        </el-select>
      </el-form-item>
      <el-form-item label="等级">
        <el-select v-model="searchLevel" placeholder="全部" clearable style="width: 130px">
          <el-option label="严重" value="CRITICAL" />
          <el-option label="警告" value="WARNING" />
          <el-option label="一般" value="INFO" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="searchStatus" placeholder="全部" clearable style="width: 140px">
          <el-option label="待分派" value="OPEN" />
          <el-option label="已分派" value="ASSIGNED" />
          <el-option label="处理中" value="PROCESSING" />
          <el-option label="已超时" value="OVERDUE" />
          <el-option label="已关闭" value="CLOSED" />
        </el-select>
      </el-form-item>
    </SearchBar>

    <el-card shadow="hover">
      <template #header>
        <div class="card-header">
          <div class="card-title">
            <strong>异常队列</strong>
            <span>优先展示超时和严重异常，关闭后仍保留处理记录</span>
          </div>
          <div class="toolbar">
            <el-input v-model="assignOwner" clearable class="owner-input" placeholder="分派负责人" />
            <el-input v-model="closeReason" clearable class="owner-input" placeholder="关闭说明" />
          </div>
        </div>
      </template>

      <el-table :data="filteredRows" stripe empty-text="暂无异常">
        <el-table-column prop="sourceText" label="来源" width="110">
          <template #default="{ row }">
            <el-tag :type="sourceTag(row.source)" effect="plain">{{ row.sourceText }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="levelText" label="等级" width="90">
          <template #default="{ row }">
            <el-tag :type="levelTag(row.level)" effect="plain">{{ row.levelText }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="statusText" label="闭环状态" width="105">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" effect="plain">{{ row.statusText }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="owner" label="负责人" width="120">
          <template #default="{ row }">{{ row.owner || '-' }}</template>
        </el-table-column>
        <el-table-column prop="title" label="异常事项" min-width="170" show-overflow-tooltip />
        <el-table-column prop="description" label="异常说明" min-width="280" show-overflow-tooltip />
        <el-table-column prop="dueAt" label="期限/时间" width="160">
          <template #default="{ row }">{{ row.dueAt || row.createdAt || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right" align="center">
          <template #default="{ row }">
            <RowActions :actions="rowActions(row)" :max-visible="2" @command="handleCommand(row, $event)" />
          </template>
        </el-table-column>
      </el-table>

      <section class="history-panel">
        <div class="history-header">
          <strong>处理记录</strong>
          <span>{{ selectedRow?.title || '选择异常查看处理记录' }}</span>
        </div>
        <el-empty v-if="!selectedRow" description="请选择异常查看记录" />
        <el-empty v-else-if="!selectedRow.history.length" description="暂无本地处理记录" />
        <el-timeline v-else>
          <el-timeline-item v-for="item in selectedRow.history" :key="`${item.action}-${item.at}`" :timestamp="item.at">
            <div class="history-item">
              <strong>{{ actionText(item.action) }} / {{ item.owner || '-' }}</strong>
              <span>{{ item.actor }}</span>
              <small>{{ item.note || '-' }}</small>
            </div>
          </el-timeline-item>
        </el-timeline>
      </section>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Bell, Memo, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import MetricStrip from '@/components/MetricStrip.vue'
import PageHeader from '@/components/PageHeader.vue'
import RowActions, { type RowActionItem } from '@/components/RowActions.vue'
import SearchBar from '@/components/SearchBar.vue'
import { getInjectionList, runInjectionAction } from '@/api/injection'
import { getProdOrderList } from '@/api/prodOrder'
import { getQcRecordList } from '@/api/qcRecord'
import { getWarningList } from '@/api/warning'
import {
  applyAbnormalCenterAction,
  buildAbnormalCenterItems,
  createAbnormalCenterState,
  summarizeAbnormalCenter,
  type AbnormalCenterActionType,
  type AbnormalCenterItem,
  type AbnormalCenterState,
  type AbnormalCenterStatus,
} from '@/utils/abnormal-center'

const router = useRouter()
const loading = ref(false)
const errorMessage = ref('')
const andonRows = ref<any[]>([])
const warningRows = ref<any[]>([])
const productionRows = ref<any[]>([])
const qcRows = ref<any[]>([])
const readinessRows = ref<any[]>([])
const states = ref<AbnormalCenterState[]>([])
const selectedId = ref('')
const searchKeyword = ref('')
const searchSource = ref('')
const searchLevel = ref('')
const searchStatus = ref('')
const assignOwner = ref('')
const closeReason = ref('')
const STORAGE_KEY = 'inject_erp_abnormal_center_states'

const rows = computed(() => buildAbnormalCenterItems({
  andonEvents: andonRows.value,
  warnings: warningRows.value,
  productionOrders: productionRows.value,
  qcRecords: qcRows.value,
  readinessChecks: readinessRows.value,
  states: states.value,
}))

const summary = computed(() => summarizeAbnormalCenter(rows.value))

const metricCards = computed(() => [
  { label: '异常总数', value: summary.value.total, meta: '五类来源统一聚合', tone: 'primary' as const },
  { label: '严重异常', value: summary.value.critical, meta: '需优先处理', tone: 'danger' as const },
  { label: '处理中', value: summary.value.processing, meta: '已开始闭环动作', tone: 'warning' as const },
  { label: '已超时', value: summary.value.overdue, meta: '超过计划期限', tone: 'danger' as const },
  { label: '已关闭', value: summary.value.closed, meta: '保留处理记录', tone: 'success' as const },
])

const filteredRows = computed(() => rows.value.filter((row) => {
  const keywordHit = !searchKeyword.value || [row.title, row.description, row.owner, row.sourceText]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(searchKeyword.value.toLowerCase())
  const sourceHit = !searchSource.value || row.source === searchSource.value
  const levelHit = !searchLevel.value || row.level === searchLevel.value
  const statusHit = !searchStatus.value || row.status === searchStatus.value
  return keywordHit && sourceHit && levelHit && statusHit
}))

const selectedRow = computed(() => rows.value.find((row) => row.id === selectedId.value))

function unwrapRecords(res: any) {
  const data = res?.data?.records || res?.data?.list || res?.data || []
  return Array.isArray(data) ? data : [data].filter(Boolean)
}

function failureText(error: any, fallback: string) {
  return error?.message || error?.data?.message || fallback
}

function loadStates() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    states.value = Array.isArray(parsed) ? parsed : []
  } catch {
    states.value = []
  }
}

function saveStates() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(states.value))
}

function upsertState(state: AbnormalCenterState) {
  const index = states.value.findIndex((item) => item.abnormalId === state.abnormalId)
  if (index >= 0) states.value.splice(index, 1, state)
  else states.value.push(state)
  saveStates()
}

function currentActor() {
  return window.localStorage.getItem('realName')
    || window.localStorage.getItem('userName')
    || window.localStorage.getItem('username')
    || '当前用户'
}

function sourceTag(source: string) {
  if (source === 'andon') return 'danger'
  if (source === 'warning') return 'warning'
  if (source === 'qc') return 'danger'
  if (source === 'readiness') return 'warning'
  return 'info'
}

function levelTag(level: string) {
  if (level === 'CRITICAL') return 'danger'
  if (level === 'WARNING') return 'warning'
  return 'info'
}

function statusTag(status: AbnormalCenterStatus) {
  if (status === 'CLOSED') return 'success'
  if (status === 'PROCESSING') return 'warning'
  if (status === 'OVERDUE') return 'danger'
  if (status === 'ASSIGNED') return 'primary'
  return 'info'
}

function actionText(action: AbnormalCenterActionType) {
  const labels: Record<AbnormalCenterActionType, string> = {
    assign: '分派',
    start: '开始处理',
    close: '关闭',
  }
  return labels[action]
}

function rowActions(row: AbnormalCenterItem): RowActionItem[] {
  const closed = row.status === 'CLOSED'
  return [
    { key: 'detail', label: '记录', type: 'info' },
    { key: 'business', label: '业务处理', type: 'primary', disabled: !row.route },
    { key: 'assign', label: '分派', type: 'warning', disabled: closed },
    { key: 'start', label: '开始', type: 'success', disabled: closed || row.status === 'PROCESSING' },
    { key: 'close', label: '关闭', type: 'danger', disabled: closed },
  ]
}

async function syncAndonAction(row: AbnormalCenterItem, action: AbnormalCenterActionType) {
  if (!row.canSyncAction || row.source !== 'andon') return
  const actionMap: Record<AbnormalCenterActionType, string> = {
    assign: 'assign',
    start: 'start',
    close: 'close',
  }
  await runInjectionAction('andon-events', Number(row.relatedId), actionMap[action])
}

async function runAction(row: AbnormalCenterItem, action: AbnormalCenterActionType) {
  const owner = action === 'assign' ? (assignOwner.value.trim() || currentActor()) : (row.owner || assignOwner.value.trim() || currentActor())
  const note = action === 'close' ? (closeReason.value.trim() || '异常已处理并关闭') : actionText(action)
  try {
    await syncAndonAction(row, action)
  } catch (error: any) {
    ElMessage.error(failureText(error, '现场异常状态同步失败'))
    return
  }
  const previous = states.value.find((item) => item.abnormalId === row.id) || createAbnormalCenterState(row)
  const next = applyAbnormalCenterAction(previous, { type: action, actor: currentActor(), owner, note })
  upsertState(next)
  selectedId.value = row.id
  ElMessage.success(`${actionText(action)}成功：${row.title}`)
  if (row.source === 'andon') fetchData()
}

function handleCommand(row: AbnormalCenterItem, command: string) {
  selectedId.value = row.id
  if (command === 'detail') return
  if (command === 'business') {
    goTo(row.route)
    return
  }
  if (command === 'assign' || command === 'start' || command === 'close') {
    runAction(row, command)
  }
}

function handleSearch(formData: { keyword: string }) {
  searchKeyword.value = formData.keyword || ''
}

function handleReset() {
  searchKeyword.value = ''
  searchSource.value = ''
  searchLevel.value = ''
  searchStatus.value = ''
}

function goTo(path?: string) {
  if (path) router.push(path)
}

async function fetchData() {
  loading.value = true
  errorMessage.value = ''
  const [andonRes, warningRes, productionRes, qcRes, readinessRes] = await Promise.allSettled([
    getInjectionList('andon-events', { page: 1, pageSize: 200 }),
    getWarningList(),
    getProdOrderList({ page: 1, pageSize: 200 }),
    getQcRecordList({ page: 1, pageSize: 200 }),
    getInjectionList('startup-checks', { page: 1, pageSize: 200 }),
  ])

  andonRows.value = andonRes.status === 'fulfilled' ? unwrapRecords(andonRes.value) : []
  warningRows.value = warningRes.status === 'fulfilled' ? unwrapRecords(warningRes.value) : []
  productionRows.value = productionRes.status === 'fulfilled' ? unwrapRecords(productionRes.value) : []
  qcRows.value = qcRes.status === 'fulfilled' ? unwrapRecords(qcRes.value) : []
  readinessRows.value = readinessRes.status === 'fulfilled' ? unwrapRecords(readinessRes.value) : []

  const failed = [andonRes, warningRes, productionRes, qcRes, readinessRes]
    .filter((item) => item.status === 'rejected') as PromiseRejectedResult[]
  if (failed.length) {
    errorMessage.value = `部分异常来源加载失败：${failureText(failed[0].reason, '请检查 Supabase 连接和业务表配置。')}`
    ElMessage.warning(errorMessage.value)
  }
  if (!selectedId.value && rows.value[0]) selectedId.value = rows.value[0].id
  loading.value = false
}

onMounted(() => {
  loadStates()
  fetchData()
})
</script>

<style scoped lang="scss">
.page-alert {
  margin-bottom: 12px;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.card-title {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.card-title strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-section-title);
}

.card-title span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-meta);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.owner-input {
  width: 180px;
}

.history-panel {
  margin-top: 16px;
  padding: 14px;
  border: 1px solid #e6e8eb;
  border-radius: 8px;
  background: #fafbfc;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.history-header span,
.history-item span,
.history-item small {
  color: #64748b;
}

.history-item {
  display: grid;
  gap: 4px;
}

@media (max-width: 768px) {
  .card-header,
  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .owner-input {
    width: 100%;
  }
}
</style>
