import {
  getWorkflowDefinition,
  getWorkflowTaskPriorityStatus,
  getWorkflowTaskStatusText,
  type WorkflowTaskRow,
} from './workflow-center.ts'

export type WorkbenchTodoStatus = 'URGENT' | 'PROCESSING' | 'PENDING'

export type WorkbenchTodoLifecycleStatus = 'OPEN' | 'CLAIMED' | 'ASSIGNED' | 'PROCESSING' | 'CLOSED' | 'OVERDUE'

export type WorkbenchTodoSource =
  | 'dashboard'
  | 'workflow'
  | 'warning'
  | 'andon'
  | 'production'
  | 'qc'
  | 'inventory'
  | 'transfer'

export type WorkbenchTodoItem = {
  id: string
  source: WorkbenchTodoSource
  type: string
  title: string
  description: string
  priority: number
  status: WorkbenchTodoStatus
  owner: string
  dueAt: string
  route: string
  relatedId: string | number
  createdAt: string
}

export type WorkbenchTodoLifecycleActionType = 'claim' | 'assign' | 'start' | 'close'

export type WorkbenchTodoLifecycleAction = {
  type: WorkbenchTodoLifecycleActionType
  actor?: string
  owner?: string
  note?: string
  at?: string | Date
}

export type WorkbenchTodoHistoryItem = {
  action: WorkbenchTodoLifecycleActionType
  status: WorkbenchTodoLifecycleStatus
  actor: string
  owner: string
  note: string
  at: string
}

export type WorkbenchTodoLifecycleState = {
  todoId: string
  source: WorkbenchTodoSource
  relatedId: string | number
  status: WorkbenchTodoLifecycleStatus
  owner: string
  claimedAt: string
  assignedAt: string
  startedAt: string
  closedAt: string
  updatedAt: string
  history: WorkbenchTodoHistoryItem[]
}

export type WorkbenchTodoWithLifecycle = WorkbenchTodoItem & {
  lifecycleStatus: WorkbenchTodoLifecycleStatus
  lifecycleStatusText: string
  isOverdue: boolean
  history: WorkbenchTodoHistoryItem[]
}

export type WorkbenchTodoInput = {
  dashboardTodos?: any[]
  warnings?: any[]
  andonEvents?: any[]
  productionOrders?: any[]
  qcRecords?: any[]
  inventoryDocs?: any[]
  transferDocs?: any[]
  workflowTasks?: WorkflowTaskRow[]
  today?: string
}

const ACTIVE_PRODUCTION_STATUSES = new Set(['WAITING', 'SCHEDULED', 'RUNNING', 'PAUSED'])
const CLOSED_ANDON_STATUSES = new Set(['CLOSED', 'FINISHED', 'DONE', 'RESOLVED'])
const FAILED_QC_RESULTS = new Set(['FAIL', 'FAILED', 'NG', 'REJECTED', 'UNQUALIFIED', '不合格'])
const INVENTORY_TODO_STATUSES = new Set(['PENDING_APPROVE', 'SUBMITTED', 'COUNTING', 'REJECTED'])
const TRANSFER_TODO_STATUSES = new Set(['SHIPPED', 'REJECTED', 'CANCELLED'])
const WORKBENCH_TODO_SOURCES = new Set<WorkbenchTodoSource>(['dashboard', 'workflow', 'warning', 'andon', 'production', 'qc', 'inventory', 'transfer'])

function normalizeArray(value: unknown): any[] {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

function normalizeText(value: unknown, fallback = '-') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizeStatus(value: unknown) {
  return String(value ?? '').trim().toUpperCase()
}

function normalizeTodoStatus(value: unknown): WorkbenchTodoStatus {
  const status = normalizeStatus(value)
  if (status === 'URGENT' || status === 'PROCESSING' || status === 'PENDING') return status
  if (status === '紧急') return 'URGENT'
  if (status === '处理中') return 'PROCESSING'
  return 'PENDING'
}

function normalizeDateOnly(value: unknown) {
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const text = String(value ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function normalizeDateTime(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeActionTime(value?: string | Date) {
  if (value instanceof Date) return value.toISOString()
  const text = normalizeDateTime(value)
  return text || new Date().toISOString()
}

function isWorkbenchTodoSource(value: unknown): value is WorkbenchTodoSource {
  return WORKBENCH_TODO_SOURCES.has(value as WorkbenchTodoSource)
}

function isUnifiedTodoRow(row: any) {
  return row?.id && isWorkbenchTodoSource(row.source)
}

function todo(
  item: Omit<WorkbenchTodoItem, 'owner' | 'dueAt' | 'route' | 'relatedId' | 'createdAt'> &
    Partial<Pick<WorkbenchTodoItem, 'owner' | 'dueAt' | 'route' | 'relatedId' | 'createdAt'>>,
): WorkbenchTodoItem {
  return {
    owner: '',
    dueAt: '',
    route: '',
    relatedId: '',
    createdAt: '',
    ...item,
    title: normalizeText(item.title, '待办事项'),
    description: normalizeText(item.description, '-'),
  }
}

function buildDashboardTodos(rows: any[]): WorkbenchTodoItem[] {
  return normalizeArray(rows).map((row, index) => {
    if (isUnifiedTodoRow(row)) {
      return todo({
        id: normalizeText(row.id, `dashboard-${index}`),
        source: row.source,
        type: normalizeText(row.type, getWorkbenchTodoSourceText(row.source)),
        title: normalizeText(row.title || row.type, '工作台待办'),
        description: normalizeText(row.description || row.content),
        priority: Number(row.priority || 90),
        status: normalizeTodoStatus(row.status),
        owner: normalizeText(row.owner, ''),
        dueAt: normalizeDateTime(row.dueAt || row.time),
        route: normalizeDateTime(row.route || row.path),
        relatedId: row.relatedId || '',
        createdAt: normalizeDateTime(row.createdAt || row.time),
      })
    }

    return todo({
      id: `dashboard-${normalizeText(row.id || row.relatedId || index)}`,
      source: 'dashboard',
      type: normalizeText(row.type, '工作台'),
      title: normalizeText(row.title || row.type, '工作台待办'),
      description: normalizeText(row.description || row.content),
      priority: row.status === '紧急' || row.status === 'URGENT' ? 25 : 90,
      status: normalizeTodoStatus(row.status),
      dueAt: normalizeDateTime(row.dueAt || row.time),
      route: normalizeText(row.route || row.path, '/dashboard'),
      relatedId: row.relatedId || '',
      createdAt: normalizeDateTime(row.createdAt || row.time),
    })
  })
}

function buildWarningTodos(rows: any[]): WorkbenchTodoItem[] {
  return normalizeArray(rows).slice(0, 30).map((row) => {
    const isUrgent = normalizeStatus(row.level) === 'ERROR'
    const relatedId = normalizeText(row.id || row.warningId || row.targetName || row.message)
    return todo({
      id: `warning-${relatedId}`,
      source: 'warning',
      type: normalizeText(row.category, '系统预警'),
      title: normalizeText(row.title || row.type || row.targetName, '业务预警'),
      description: [row.category, row.targetName, row.message].filter(Boolean).join(' / '),
      priority: isUrgent ? 20 : 65,
      status: isUrgent ? 'URGENT' : 'PENDING',
      route: '/prod/warnings',
      relatedId,
      createdAt: normalizeDateTime(row.createdAt || row.time),
    })
  })
}

function buildAndonTodos(rows: any[]): WorkbenchTodoItem[] {
  return normalizeArray(rows)
    .filter((row) => !CLOSED_ANDON_STATUSES.has(normalizeStatus(row.status)))
    .slice(0, 30)
    .map((row) => {
      const status = normalizeStatus(row.status)
      const relatedId = row.id || row.eventNo || row.event_no || row.title
      return todo({
        id: `andon-${normalizeText(relatedId)}`,
        source: 'andon',
        type: '现场异常',
        title: normalizeText(row.title || row.eventNo || row.event_no, '安灯异常'),
        description: normalizeText(row.description || row.sourceType || row.source_type, '现场异常未闭环'),
        priority: status === 'PROCESSING' ? 35 : 10,
        status: status === 'PROCESSING' ? 'PROCESSING' : 'URGENT',
        owner: normalizeText(row.assigneeName || row.assignee_name || row.assigneeId || row.assignee_id, ''),
        route: '/injection/andon-event',
        relatedId: relatedId || '',
        createdAt: normalizeDateTime(row.createdAt || row.created_at),
      })
    })
}

function buildProductionTodos(rows: any[], today: string): WorkbenchTodoItem[] {
  return normalizeArray(rows)
    .filter((row) => {
      const status = normalizeStatus(row.status)
      const planEnd = normalizeDateOnly(row.planEnd || row.plan_end)
      return status === 'PAUSED' || (ACTIVE_PRODUCTION_STATUSES.has(status) && planEnd && today && planEnd < today)
    })
    .slice(0, 30)
    .map((row) => {
      const status = normalizeStatus(row.status)
      const relatedId = row.id || row.orderNo || row.order_no
      const planEnd = normalizeDateOnly(row.planEnd || row.plan_end)
      const overdue = planEnd && today && planEnd < today
      return todo({
        id: `production-${normalizeText(relatedId)}-${status === 'PAUSED' ? 'paused' : 'overdue'}`,
        source: 'production',
        type: '生产异常',
        title: normalizeText(row.orderNo || row.order_no, status === 'PAUSED' ? '暂停工单' : '延期工单'),
        description: status === 'PAUSED' ? '工单已暂停，需要确认恢复或调整计划' : `计划完成日 ${planEnd || '-'}，当前仍未闭环`,
        priority: status === 'PAUSED' ? 30 : overdue ? 32 : 75,
        status: 'URGENT',
        dueAt: planEnd,
        route: '/prod/orders',
        relatedId: relatedId || '',
        createdAt: normalizeDateTime(row.createdAt || row.created_at),
      })
    })
}

function buildQcTodos(rows: any[]): WorkbenchTodoItem[] {
  return normalizeArray(rows)
    .filter((row) => FAILED_QC_RESULTS.has(normalizeStatus(row.checkResult || row.check_result)))
    .slice(0, 30)
    .map((row) => {
      const relatedId = row.id || row.prodOrderId || row.prod_order_id
      return todo({
        id: `qc-${normalizeText(relatedId)}`,
        source: 'qc',
        type: '质检待处理',
        title: normalizeText(row.defectType || row.defect_type || row.productName || row.product_name, '不良记录待处理'),
        description: normalizeText(row.defectDesc || row.defect_desc || row.remark, '质检异常需要复核或处置'),
        priority: 40,
        status: 'URGENT',
        route: '/qc/records',
        relatedId: relatedId || '',
        createdAt: normalizeDateTime(row.checkTime || row.check_time || row.createdAt || row.created_at),
      })
    })
}

function buildInventoryTodos(rows: any[]): WorkbenchTodoItem[] {
  return normalizeArray(rows)
    .filter((row) => INVENTORY_TODO_STATUSES.has(normalizeStatus(row.status)))
    .slice(0, 30)
    .map((row) => {
      const status = normalizeStatus(row.status)
      const relatedId = row.id || row.inventoryNo || row.inventory_no
      return todo({
        id: `inventory-${normalizeText(relatedId)}`,
        source: 'inventory',
        type: '库存异常',
        title: normalizeText(row.inventoryNo || row.inventory_no, '盘点单待处理'),
        description: status === 'REJECTED' ? '盘点单已驳回，需要重新处理' : '盘点单处于待盘点或待审批状态',
        priority: status === 'REJECTED' ? 45 : 70,
        status: status === 'COUNTING' ? 'PROCESSING' : status === 'REJECTED' ? 'URGENT' : 'PENDING',
        route: '/stock/inventory',
        relatedId: relatedId || '',
        createdAt: normalizeDateTime(row.createdAt || row.created_at),
      })
    })
}

function buildTransferTodos(rows: any[]): WorkbenchTodoItem[] {
  return normalizeArray(rows)
    .filter((row) => TRANSFER_TODO_STATUSES.has(normalizeStatus(row.status)))
    .slice(0, 30)
    .map((row) => {
      const status = normalizeStatus(row.status)
      const relatedId = row.id || row.transferNo || row.transfer_no
      return todo({
        id: `transfer-${normalizeText(relatedId)}`,
        source: 'transfer',
        type: '调拨异常',
        title: normalizeText(row.transferNo || row.transfer_no, '调拨单待处理'),
        description: status === 'SHIPPED' ? '调拨单已发出，等待接收确认' : '调拨单状态异常，需要复核',
        priority: status === 'SHIPPED' ? 75 : 45,
        status: status === 'SHIPPED' ? 'PENDING' : 'URGENT',
        dueAt: normalizeDateTime(row.receiveTime || row.receive_time),
        route: '/stock/transfer',
        relatedId: relatedId || '',
        createdAt: normalizeDateTime(row.createdAt || row.created_at),
      })
    })
}

function buildWorkflowTodos(rows: WorkflowTaskRow[]): WorkbenchTodoItem[] {
  return normalizeArray(rows)
    .filter((row) => {
      const status = normalizeStatus(row.status)
      return !['DONE', 'CANCELLED', 'CLOSED'].includes(status)
    })
    .slice(0, 50)
    .map((row) => {
      const businessType = normalizeText(row.businessType, '')
      const definition = getWorkflowDefinition(businessType)
      const relatedId = row.id || row.businessId || ''
      const taskStatus = normalizeStatus(row.status)
      return todo({
        id: `workflow-${normalizeText(relatedId)}`,
        source: 'workflow',
        type: definition?.name || '流程待办',
        title: normalizeText(row.title || row.businessCode, definition?.name || '流程待办'),
        description: [
          row.businessCode,
          row.description || getWorkflowTaskStatusText(taskStatus),
        ].filter(Boolean).join(' / '),
        priority: Number(row.priority || 60),
        status: getWorkflowTaskPriorityStatus(row) as WorkbenchTodoStatus,
        owner: normalizeText(row.assigneeName || row.assigneeId, ''),
        dueAt: normalizeDateTime(row.dueAt),
        route: normalizeText(row.sourceRoute, definition?.route || ''),
        relatedId,
        createdAt: normalizeDateTime(row.createdAt),
      })
    })
}

export function sortWorkbenchTodos(rows: WorkbenchTodoItem[]) {
  return [...rows].sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority
    const leftTime = left.dueAt || left.createdAt
    const rightTime = right.dueAt || right.createdAt
    if (leftTime !== rightTime) return leftTime.localeCompare(rightTime)
    return left.title.localeCompare(right.title, 'zh-CN')
  })
}

export function buildWorkbenchTodoItems(input: WorkbenchTodoInput = {}): WorkbenchTodoItem[] {
  const today = normalizeDateOnly(input.today || new Date())
  const rows = [
    ...buildAndonTodos(input.andonEvents || []),
    ...buildWarningTodos(input.warnings || []),
    ...buildProductionTodos(input.productionOrders || [], today),
    ...buildQcTodos(input.qcRecords || []),
    ...buildInventoryTodos(input.inventoryDocs || []),
    ...buildTransferTodos(input.transferDocs || []),
    ...buildWorkflowTodos(input.workflowTasks || []),
    ...buildDashboardTodos(input.dashboardTodos || []),
  ]
  return sortWorkbenchTodos(rows).slice(0, 50)
}

export function summarizeWorkbenchTodos(rows: WorkbenchTodoItem[]) {
  return rows.reduce(
    (summary, row) => {
      const lifecycleStatus = (row as WorkbenchTodoWithLifecycle).lifecycleStatus
      const isClosed = lifecycleStatus === 'CLOSED'
      const isProcessingLifecycle = lifecycleStatus === 'CLAIMED' || lifecycleStatus === 'ASSIGNED' || lifecycleStatus === 'PROCESSING'
      summary.total += 1
      if (!isClosed && (row.status === 'URGENT' || lifecycleStatus === 'OVERDUE')) summary.urgent += 1
      if (!isClosed && (row.status === 'PROCESSING' || isProcessingLifecycle)) summary.processing += 1
      if (!isClosed && row.route) summary.actionable += 1
      summary.sources[row.source] = (summary.sources[row.source] || 0) + 1
      return summary
    },
    {
      total: 0,
      urgent: 0,
      processing: 0,
      actionable: 0,
      sources: {} as Record<WorkbenchTodoSource, number>,
    },
  )
}

export function getWorkbenchTodoSourceText(source: WorkbenchTodoSource | string) {
  const labels: Record<WorkbenchTodoSource, string> = {
    dashboard: '工作台',
    workflow: '流程待办',
    warning: '系统预警',
    andon: '现场异常',
    production: '生产异常',
    qc: '质检待处理',
    inventory: '库存异常',
    transfer: '调拨异常',
  }
  return labels[source as WorkbenchTodoSource] || String(source || '待办')
}

export function getWorkbenchTodoStatusText(status: WorkbenchTodoStatus | string) {
  if (status === 'URGENT') return '紧急'
  if (status === 'PROCESSING') return '处理中'
  if (status === 'PENDING') return '一般'
  return String(status || '待办')
}

export function getWorkbenchTodoLifecycleStatusText(status: WorkbenchTodoLifecycleStatus | string) {
  const labels: Record<WorkbenchTodoLifecycleStatus, string> = {
    OPEN: '待认领',
    CLAIMED: '已认领',
    ASSIGNED: '已分派',
    PROCESSING: '处理中',
    CLOSED: '已关闭',
    OVERDUE: '已超时',
  }
  return labels[status as WorkbenchTodoLifecycleStatus] || String(status || '待处理')
}

export function createWorkbenchTodoLifecycleState(
  todoItem: WorkbenchTodoItem,
  now: string | Date = new Date(),
): WorkbenchTodoLifecycleState {
  const at = normalizeActionTime(now)
  return {
    todoId: todoItem.id,
    source: todoItem.source,
    relatedId: todoItem.relatedId,
    status: 'OPEN',
    owner: normalizeText(todoItem.owner, ''),
    claimedAt: '',
    assignedAt: '',
    startedAt: '',
    closedAt: '',
    updatedAt: at,
    history: [],
  }
}

export function applyWorkbenchTodoAction(
  state: WorkbenchTodoLifecycleState,
  action: WorkbenchTodoLifecycleAction,
): WorkbenchTodoLifecycleState {
  const at = normalizeActionTime(action.at)
  const actor = normalizeText(action.actor, '当前用户')
  const owner = normalizeText(action.owner || state.owner || actor, '')
  const next: WorkbenchTodoLifecycleState = {
    ...state,
    owner,
    updatedAt: at,
    history: [...(state.history || [])],
  }

  if (action.type === 'claim') {
    next.status = 'CLAIMED'
    next.claimedAt = next.claimedAt || at
  } else if (action.type === 'assign') {
    next.status = 'ASSIGNED'
    next.assignedAt = at
  } else if (action.type === 'start') {
    next.status = 'PROCESSING'
    next.startedAt = next.startedAt || at
  } else if (action.type === 'close') {
    next.status = 'CLOSED'
    next.closedAt = at
  }

  next.history.push({
    action: action.type,
    status: next.status,
    actor,
    owner: next.owner,
    note: normalizeText(action.note, ''),
    at,
  })

  return next
}

export function isWorkbenchTodoOverdue(todoItem: Pick<WorkbenchTodoItem, 'dueAt'>, now: string | Date = new Date()) {
  const dueAt = normalizeDateTime(todoItem.dueAt)
  if (!dueAt) return false

  const today = normalizeDateOnly(now)
  const dueDate = normalizeDateOnly(dueAt)
  if (dueAt.length === 10 && today && dueDate) return dueDate < today

  const dueTime = new Date(dueAt).getTime()
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (Number.isNaN(dueTime) || Number.isNaN(nowTime)) return false
  return dueTime < nowTime
}

export function mergeWorkbenchTodoLifecycle(
  todoItem: WorkbenchTodoItem,
  state?: WorkbenchTodoLifecycleState | null,
  now: string | Date = new Date(),
): WorkbenchTodoWithLifecycle {
  const lifecycle = state || createWorkbenchTodoLifecycleState(todoItem, now)
  const isOverdue = lifecycle.status !== 'CLOSED' && isWorkbenchTodoOverdue(todoItem, now)
  const lifecycleStatus = isOverdue ? 'OVERDUE' : lifecycle.status
  return {
    ...todoItem,
    owner: lifecycle.owner || todoItem.owner,
    lifecycleStatus,
    lifecycleStatusText: getWorkbenchTodoLifecycleStatusText(lifecycleStatus),
    isOverdue,
    history: lifecycle.history || [],
  }
}
