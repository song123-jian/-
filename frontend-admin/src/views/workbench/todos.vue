<template>
  <div class="page-container todo-center-page" v-loading="loading">
    <PageHeader title="我的待办中心" subtitle="集中处理工作台、预警、现场异常和流程任务，保留认领、分派、处理和关闭记录。">
      <el-button plain @click="fetchData">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
      <el-button type="warning" plain @click="goTo('/prod/warnings')">
        <el-icon><Bell /></el-icon>
        系统预警
      </el-button>
      <el-button type="danger" plain @click="goTo('/workbench/abnormal-center')">
        <el-icon><WarningFilled /></el-icon>
        异常闭环
      </el-button>
    </PageHeader>

    <MetricStrip :items="metricCards" testid="workbench-todo-metrics" />

    <el-card shadow="hover">
      <template #header>
        <div class="card-header">
          <div class="card-title">
            <strong>待办队列</strong>
            <span>按紧急程度和流程状态快速收敛待处理事项</span>
          </div>
          <div class="todo-toolbar">
            <el-input v-model="assignOwner" class="assign-input" clearable placeholder="分派负责人" />
            <el-segmented v-model="filterLevel" :options="levelOptions" />
          </div>
        </div>
      </template>

      <el-table :data="filteredTodos" stripe empty-text="暂无待办">
        <el-table-column prop="source" label="来源" width="110">
          <template #default="{ row }">
            <el-tag :type="sourceTag(row.source)" effect="plain">{{ todoSourceText(row.source) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="等级" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" effect="plain">{{ todoStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="owner" label="负责人" width="120">
          <template #default="{ row }">{{ row.owner || '-' }}</template>
        </el-table-column>
        <el-table-column prop="lifecycleStatus" label="流程状态" width="110">
          <template #default="{ row }">
            <el-tag :type="lifecycleTag(row.lifecycleStatus)" effect="plain">{{ row.lifecycleStatusText }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="超时" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.isOverdue" type="danger" effect="plain">超时</el-tag>
            <span v-else class="muted-text">正常</span>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="事项" min-width="180" show-overflow-tooltip />
        <el-table-column prop="description" label="说明" min-width="260" show-overflow-tooltip />
        <el-table-column prop="dueAt" label="时间" width="170">
          <template #default="{ row }">{{ row.dueAt || row.createdAt || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right" align="center">
          <template #default="{ row }">
            <RowActions :actions="todoRowActions(row)" @command="handleTodoCommand(row, $event)" />
          </template>
        </el-table-column>
      </el-table>

      <section class="history-panel">
        <div class="history-header">
          <strong>处理记录</strong>
          <span>{{ selectedTodo?.title || '选择待办查看记录' }}</span>
        </div>
        <el-empty v-if="!selectedTodo" description="请选择待办查看处理记录" />
        <el-empty v-else-if="!selectedTodo.history.length" description="暂无处理记录" />
        <el-timeline v-else>
          <el-timeline-item
            v-for="item in selectedTodo.history"
            :key="`${item.action}-${item.at}`"
            :timestamp="item.at"
          >
            <div class="history-item">
              <strong>{{ historyActionText(item.action) }}</strong>
              <span>{{ item.actor }} / {{ item.owner || '-' }}</span>
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
import { Bell, Refresh, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import MetricStrip from '@/components/MetricStrip.vue'
import PageHeader from '@/components/PageHeader.vue'
import RowActions, { type RowActionItem } from '@/components/RowActions.vue'
import { getDashboardData } from '@/api/dashboard'
import { getInjectionList } from '@/api/injection'
import { getWarningList } from '@/api/warning'
import { getWorkflowTodos, runWorkflowTaskAction } from '@/api/workflow'
import {
  applyWorkbenchTodoAction,
  buildWorkbenchTodoItems,
  createWorkbenchTodoLifecycleState,
  getWorkbenchTodoLifecycleStatusText,
  getWorkbenchTodoSourceText,
  getWorkbenchTodoStatusText,
  mergeWorkbenchTodoLifecycle,
  summarizeWorkbenchTodos,
  type WorkbenchTodoLifecycleActionType,
  type WorkbenchTodoLifecycleState,
  type WorkbenchTodoItem,
  type WorkbenchTodoStatus,
  type WorkbenchTodoWithLifecycle,
} from '@/utils/workbench-todo'

const router = useRouter()
const loading = ref(false)
const rows = ref<WorkbenchTodoItem[]>([])
const lifecycleStates = ref<Record<string, WorkbenchTodoLifecycleState>>({})
const filterLevel = ref('全部')
const assignOwner = ref('')
const selectedTodoId = ref('')
const levelOptions = ['全部', '紧急', '一般', '处理中']
const LIFECYCLE_STORAGE_KEY = 'workbench-todo-lifecycle-states'

const filteredTodos = computed(() =>
  filterLevel.value === '全部' ? displayTodos.value : displayTodos.value.filter((item) => rowLevelText(item) === filterLevel.value)
)

const displayTodos = computed(() =>
  rows.value.map((item) => mergeWorkbenchTodoLifecycle(item, lifecycleStates.value[item.id]))
)

const selectedTodo = computed(() => displayTodos.value.find((item) => item.id === selectedTodoId.value))

const summary = computed(() => summarizeWorkbenchTodos(displayTodos.value))

const metricCards = computed(() => [
  { label: '全部待办', value: summary.value.total, meta: '来自工作台、预警和现场异常', tone: 'primary' as const },
  { label: '紧急事项', value: summary.value.urgent, meta: '严重预警、安灯异常和失败任务', tone: 'danger' as const },
  { label: '处理中', value: summary.value.processing, meta: '已分派或处理中事项', tone: 'warning' as const },
  { label: '可直接处理', value: summary.value.actionable, meta: '带有业务入口的待办', tone: 'success' as const },
])

function normalizeDashboardTodos(data: any): WorkbenchTodoItem[] {
  return buildWorkbenchTodoItems({ dashboardTodos: data?.todoList || [] })
}

function fallbackTodos(warnings: any[], andonEvents: any[], workflowTasks: any[]) {
  return buildWorkbenchTodoItems({
    warnings,
    andonEvents,
    workflowTasks,
  })
}

function todoSourceText(source: string) {
  return getWorkbenchTodoSourceText(source)
}

function todoStatusText(status: WorkbenchTodoStatus | string) {
  return getWorkbenchTodoStatusText(status)
}

function rowLevelText(row: WorkbenchTodoWithLifecycle) {
  if (['CLAIMED', 'ASSIGNED', 'PROCESSING'].includes(row.lifecycleStatus)) return '处理中'
  return todoStatusText(row.status)
}

function loadLifecycleStates() {
  if (typeof window === 'undefined') return
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LIFECYCLE_STORAGE_KEY) || '{}')
    lifecycleStates.value = parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    lifecycleStates.value = {}
  }
}

function saveLifecycleStates() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LIFECYCLE_STORAGE_KEY, JSON.stringify(lifecycleStates.value))
}

function currentActor() {
  if (typeof window === 'undefined') return '当前用户'
  return window.localStorage.getItem('userName')
    || window.localStorage.getItem('username')
    || window.localStorage.getItem('realName')
    || window.localStorage.getItem('role')
    || '当前用户'
}

function actionNote(type: WorkbenchTodoLifecycleActionType, owner: string) {
  if (type === 'claim') return '认领待办'
  if (type === 'assign') return `分派给 ${owner}`
  if (type === 'start') return '开始处理'
  return '关闭待办'
}

async function runLifecycleAction(row: WorkbenchTodoWithLifecycle, type: WorkbenchTodoLifecycleActionType) {
  const owner = type === 'assign' ? (assignOwner.value.trim() || currentActor()) : undefined
  if (row.source === 'workflow') {
    try {
      await runWorkflowTaskAction(row.relatedId, type, {
        owner,
        note: actionNote(type, owner || row.owner || currentActor()),
      })
    } catch {
      return
    }
  }
  const previous = lifecycleStates.value[row.id] || createWorkbenchTodoLifecycleState(row)
  const next = applyWorkbenchTodoAction(previous, {
    type,
    actor: currentActor(),
    owner,
    note: actionNote(type, owner || previous.owner || currentActor()),
  })
  lifecycleStates.value = { ...lifecycleStates.value, [row.id]: next }
  selectedTodoId.value = row.id
  saveLifecycleStates()
  ElMessage.success(`${getWorkbenchTodoLifecycleStatusText(next.status)}：${row.title}`)
}

function isClosed(row: WorkbenchTodoWithLifecycle) {
  return row.lifecycleStatus === 'CLOSED'
}

function canClaim(row: WorkbenchTodoWithLifecycle) {
  return !isClosed(row) && !row.owner && ['OPEN', 'OVERDUE'].includes(row.lifecycleStatus)
}

function canStart(row: WorkbenchTodoWithLifecycle) {
  return !isClosed(row) && row.lifecycleStatus !== 'PROCESSING'
}

function todoRowActions(row: WorkbenchTodoWithLifecycle): RowActionItem[] {
  return [
    { key: 'record', label: '记录', type: 'info' },
    { key: 'business', label: '业务处理', type: 'primary', disabled: !row.route },
    { key: 'claim', label: '认领', type: 'primary', disabled: !canClaim(row) },
    { key: 'assign', label: '分派', type: 'warning', disabled: isClosed(row) },
    { key: 'start', label: '开始处理', type: 'success', disabled: !canStart(row) },
    { key: 'close', label: '关闭', type: 'danger', disabled: isClosed(row) },
  ]
}

function handleTodoCommand(row: WorkbenchTodoWithLifecycle, command: string) {
  if (command === 'record') selectTodo(row)
  if (command === 'business') goTo(row.route)
  if (command === 'claim') runLifecycleAction(row, 'claim')
  if (command === 'assign') runLifecycleAction(row, 'assign')
  if (command === 'start') runLifecycleAction(row, 'start')
  if (command === 'close') runLifecycleAction(row, 'close')
}

function selectTodo(row: WorkbenchTodoWithLifecycle) {
  selectedTodoId.value = row.id
}

async function fetchData() {
  loading.value = true
  try {
    const [dashboardRes, warningRes, andonRes, workflowRes] = await Promise.allSettled([
      getDashboardData(),
      getWarningList(),
      getInjectionList('andon-events', { page: 1, pageSize: 50 }),
      getWorkflowTodos({ page: 1, pageSize: 80 }),
    ])
    const dashboardRows = dashboardRes.status === 'fulfilled' ? normalizeDashboardTodos(dashboardRes.value.data || {}) : []
    const warningRows = warningRes.status === 'fulfilled' ? warningRes.value.data?.records || warningRes.value.data || [] : []
    const andonRows = andonRes.status === 'fulfilled' ? andonRes.value.data?.records || andonRes.value.data || [] : []
    const workflowRows = workflowRes.status === 'fulfilled' ? workflowRes.value.data?.records || workflowRes.value.data?.list || [] : []
    rows.value = dashboardRows.length ? dashboardRows : fallbackTodos(warningRows, andonRows, workflowRows)
    if (!selectedTodoId.value && rows.value[0]) selectedTodoId.value = rows.value[0].id
  } finally {
    loading.value = false
  }
}

function sourceTag(source: string) {
  if (source === 'andon') return 'danger'
  if (source === 'warning') return 'warning'
  return 'info'
}

function statusTag(status: string) {
  if (status === 'URGENT') return 'danger'
  if (status === 'PROCESSING') return 'warning'
  return 'info'
}

function lifecycleTag(status: string) {
  if (status === 'OVERDUE') return 'danger'
  if (status === 'PROCESSING') return 'warning'
  if (status === 'CLOSED') return 'success'
  if (status === 'ASSIGNED' || status === 'CLAIMED') return 'primary'
  return 'info'
}

function historyActionText(action: WorkbenchTodoLifecycleActionType) {
  const labels: Record<WorkbenchTodoLifecycleActionType, string> = {
    claim: '认领',
    assign: '分派',
    start: '开始处理',
    close: '关闭',
  }
  return labels[action]
}

function goTo(path?: string) {
  if (path) router.push(path)
}

onMounted(() => {
  loadLifecycleStates()
  fetchData()
})
</script>

<style scoped lang="scss">
.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.card-title {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.card-title strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-section-title);
  line-height: var(--ui-line-height-body);
}

.card-title span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-meta);
  line-height: var(--ui-line-height-meta);
}

.todo-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.assign-input {
  width: 180px;
}

.muted-text {
  color: #94a3b8;
  font-size: 12px;
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

.history-header span {
  color: #64748b;
  font-size: 13px;
}

.history-item {
  display: grid;
  gap: 4px;
}

.history-item span,
.history-item small {
  color: #64748b;
}

@media (max-width: 768px) {
  .card-header,
  .todo-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .assign-input {
    width: 100%;
  }
}
</style>
