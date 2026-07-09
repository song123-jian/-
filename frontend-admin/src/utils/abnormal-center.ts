export type AbnormalCenterSource = 'andon' | 'warning' | 'production' | 'qc' | 'readiness'
export type AbnormalCenterLevel = 'INFO' | 'WARNING' | 'CRITICAL'
export type AbnormalCenterStatus = 'OPEN' | 'ASSIGNED' | 'PROCESSING' | 'CLOSED' | 'OVERDUE'
export type AbnormalCenterActionType = 'assign' | 'start' | 'close'

export type AbnormalCenterHistoryItem = {
  action: AbnormalCenterActionType
  status: AbnormalCenterStatus
  actor: string
  owner: string
  note: string
  at: string
}

export type AbnormalCenterState = {
  abnormalId: string
  source: AbnormalCenterSource
  relatedId: string | number
  status: AbnormalCenterStatus
  owner: string
  closedReason: string
  updatedAt: string
  history: AbnormalCenterHistoryItem[]
}

export type AbnormalCenterItem = {
  id: string
  source: AbnormalCenterSource
  sourceText: string
  level: AbnormalCenterLevel
  levelText: string
  status: AbnormalCenterStatus
  statusText: string
  rawStatus: string
  title: string
  description: string
  owner: string
  route: string
  relatedId: string | number
  dueAt: string
  createdAt: string
  isOverdue: boolean
  canSyncAction: boolean
  history: AbnormalCenterHistoryItem[]
}

export type AbnormalCenterInput = {
  andonEvents?: any[]
  warnings?: any[]
  productionOrders?: any[]
  qcRecords?: any[]
  readinessChecks?: any[]
  states?: AbnormalCenterState[]
  now?: string | Date
}

const CLOSED_STATUSES = new Set(['CLOSED', 'FINISHED', 'DONE', 'RESOLVED', 'CANCELLED'])
const PROCESSING_STATUSES = new Set(['PROCESSING', 'RUNNING', 'STARTED'])
const ASSIGNED_STATUSES = new Set(['ASSIGNED', 'CLAIMED', 'DISPATCHED'])
const ACTIVE_PRODUCTION_STATUSES = new Set(['WAITING', 'SCHEDULED', 'RUNNING', 'PAUSED'])
const FAILED_QC_RESULTS = new Set(['FAIL', 'FAILED', 'NG', 'REJECTED', 'UNQUALIFIED', '不合格'])

function normalizeArray(value: unknown): any[] {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

function normalizeText(value: unknown, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizeStatus(value: unknown) {
  return normalizeText(value).toUpperCase()
}

function normalizeDateTime(value: unknown) {
  return normalizeText(value)
}

function normalizeDateOnly(value?: string | Date) {
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const text = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function toNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function levelFrom(value: unknown): AbnormalCenterLevel {
  const level = normalizeStatus(value)
  if (level === 'ERROR' || level === 'CRITICAL' || level === 'DANGER') return 'CRITICAL'
  if (level === 'WARNING' || level === 'WARN') return 'WARNING'
  return 'INFO'
}

function statusFrom(value: unknown): AbnormalCenterStatus {
  const status = normalizeStatus(value)
  if (CLOSED_STATUSES.has(status)) return 'CLOSED'
  if (PROCESSING_STATUSES.has(status)) return 'PROCESSING'
  if (ASSIGNED_STATUSES.has(status)) return 'ASSIGNED'
  return 'OPEN'
}

function sourceText(source: AbnormalCenterSource) {
  const labels: Record<AbnormalCenterSource, string> = {
    andon: '现场上报',
    warning: '系统预警',
    production: '生产异常',
    qc: '质量异常',
    readiness: '齐套异常',
  }
  return labels[source]
}

function levelText(level: AbnormalCenterLevel) {
  if (level === 'CRITICAL') return '严重'
  if (level === 'WARNING') return '警告'
  return '一般'
}

export function getAbnormalCenterStatusText(status: AbnormalCenterStatus | string) {
  if (status === 'OPEN') return '待分派'
  if (status === 'ASSIGNED') return '已分派'
  if (status === 'PROCESSING') return '处理中'
  if (status === 'CLOSED') return '已关闭'
  if (status === 'OVERDUE') return '已超时'
  return String(status || '-')
}

function isOverdue(dueAt: string, now: string | Date = new Date()) {
  if (!dueAt) return false
  const dueDate = normalizeDateOnly(dueAt)
  const today = normalizeDateOnly(now)
  if (dueAt.length <= 10 && dueDate && today) return dueDate < today
  const dueTime = new Date(dueAt).getTime()
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime()
  return Number.isFinite(dueTime) && Number.isFinite(nowTime) && dueTime < nowTime
}

function baseItem(item: Omit<AbnormalCenterItem, 'sourceText' | 'levelText' | 'statusText' | 'isOverdue' | 'history'>): AbnormalCenterItem {
  const overdue = item.status !== 'CLOSED' && isOverdue(item.dueAt)
  const status = overdue ? 'OVERDUE' : item.status
  return {
    ...item,
    sourceText: sourceText(item.source),
    levelText: levelText(item.level),
    status,
    statusText: getAbnormalCenterStatusText(status),
    isOverdue: overdue,
    history: [],
  }
}

function buildAndonItems(rows: any[]): AbnormalCenterItem[] {
  return normalizeArray(rows).map((row) => {
    const relatedId = row.id || row.eventNo || row.event_no || row.title
    return baseItem({
      id: `andon-${relatedId}`,
      source: 'andon',
      level: levelFrom(row.level),
      status: statusFrom(row.status),
      rawStatus: normalizeStatus(row.status),
      title: normalizeText(row.title || row.eventNo || row.event_no, '现场异常'),
      description: normalizeText(row.description || row.remark || row.sourceType || row.source_type, '现场异常待闭环'),
      owner: normalizeText(row.assigneeName || row.assignee_name || row.assigneeId || row.assignee_id),
      route: '/injection/andon-event',
      relatedId,
      dueAt: normalizeDateTime(row.dueAt || row.due_at),
      createdAt: normalizeDateTime(row.createdAt || row.created_at),
      canSyncAction: Boolean(toNumber(row.id)),
    })
  })
}

function buildWarningItems(rows: any[]): AbnormalCenterItem[] {
  return normalizeArray(rows).map((row) => {
    const relatedId = row.id || row.warningId || row.targetName || row.message
    const level = levelFrom(row.level)
    return baseItem({
      id: `warning-${relatedId}`,
      source: 'warning',
      level,
      status: 'OPEN',
      rawStatus: normalizeStatus(row.level),
      title: normalizeText(row.title || row.type || row.targetName, '系统预警'),
      description: [row.category, row.targetName, row.message].filter(Boolean).join(' / '),
      owner: '',
      route: row.actionPath || '/prod/warnings',
      relatedId,
      dueAt: '',
      createdAt: normalizeDateTime(row.createdAt || row.time),
      canSyncAction: false,
    })
  })
}

function buildProductionItems(rows: any[], now: string | Date): AbnormalCenterItem[] {
  const today = normalizeDateOnly(now)
  return normalizeArray(rows)
    .filter((row) => {
      const status = normalizeStatus(row.status)
      const planEnd = normalizeDateOnly(row.planEnd || row.plan_end)
      return status === 'PAUSED' || (ACTIVE_PRODUCTION_STATUSES.has(status) && planEnd && today && planEnd < today)
    })
    .map((row) => {
      const status = normalizeStatus(row.status)
      const planEnd = normalizeDateOnly(row.planEnd || row.plan_end)
      const relatedId = row.id || row.orderNo || row.order_no
      const paused = status === 'PAUSED'
      return baseItem({
        id: `production-${relatedId}-${paused ? 'paused' : 'overdue'}`,
        source: 'production',
        level: paused ? 'WARNING' : 'CRITICAL',
        status: paused ? 'PROCESSING' : 'OPEN',
        rawStatus: status,
        title: normalizeText(row.orderNo || row.order_no, paused ? '暂停工单' : '延期工单'),
        description: paused ? '工单已暂停，需要确认恢复、改机或取消' : `计划完成日 ${planEnd || '-'}，当前仍未闭环`,
        owner: normalizeText(row.ownerName || row.assigneeName || row.createdBy),
        route: '/prod/orders',
        relatedId,
        dueAt: planEnd,
        createdAt: normalizeDateTime(row.createdAt || row.created_at),
        canSyncAction: false,
      })
    })
}

function buildQcItems(rows: any[]): AbnormalCenterItem[] {
  return normalizeArray(rows)
    .filter((row) => FAILED_QC_RESULTS.has(normalizeStatus(row.checkResult || row.check_result)))
    .map((row) => {
      const relatedId = row.id || row.prodOrderId || row.prod_order_id
      return baseItem({
        id: `qc-${relatedId}`,
        source: 'qc',
        level: 'CRITICAL',
        status: statusFrom(row.disposalStatus || row.disposal_status || 'OPEN'),
        rawStatus: normalizeStatus(row.disposalStatus || row.disposal_status || row.checkResult || row.check_result),
        title: normalizeText(row.defectType || row.defect_type || row.productName || row.product_name, '不良记录待处理'),
        description: normalizeText(row.defectDesc || row.defect_desc || row.remark, '质检异常需要复核或处置'),
        owner: normalizeText(row.disposalAssignee || row.disposal_assignee),
        route: '/qc/defect-disposal',
        relatedId,
        dueAt: normalizeDateTime(row.dueAt || row.due_at),
        createdAt: normalizeDateTime(row.checkTime || row.check_time || row.createdAt || row.created_at),
        canSyncAction: false,
      })
    })
}

function buildReadinessItems(rows: any[]): AbnormalCenterItem[] {
  return normalizeArray(rows)
    .filter((row) => ['FAILED', 'REJECTED'].includes(normalizeStatus(row.status)))
    .map((row) => {
      const relatedId = row.id || row.checkNo || row.check_no || row.prodOrderId || row.prod_order_id
      return baseItem({
        id: `readiness-${relatedId}`,
        source: 'readiness',
        level: 'CRITICAL',
        status: 'OPEN',
        rawStatus: normalizeStatus(row.status),
        title: normalizeText(row.checkNo || row.check_no, '开工齐套检查未通过'),
        description: normalizeText(row.failedItemsText || row.failed_items_text || row.remark, '投产前置项未满足'),
        owner: '',
        route: '/injection/startup-check',
        relatedId,
        dueAt: '',
        createdAt: normalizeDateTime(row.createdAt || row.created_at),
        canSyncAction: false,
      })
    })
}

function mergeState(item: AbnormalCenterItem, state?: AbnormalCenterState, now: string | Date = new Date()): AbnormalCenterItem {
  if (!state) return {
    ...item,
    isOverdue: item.status !== 'CLOSED' && isOverdue(item.dueAt, now),
    status: item.status !== 'CLOSED' && isOverdue(item.dueAt, now) ? 'OVERDUE' : item.status,
    statusText: getAbnormalCenterStatusText(item.status !== 'CLOSED' && isOverdue(item.dueAt, now) ? 'OVERDUE' : item.status),
  }
  const baseStatus = state.status === 'CLOSED' ? 'CLOSED' : state.status
  const overdue = baseStatus !== 'CLOSED' && isOverdue(item.dueAt, now)
  const status = overdue ? 'OVERDUE' : baseStatus
  return {
    ...item,
    status,
    statusText: getAbnormalCenterStatusText(status),
    owner: state.owner || item.owner,
    isOverdue: overdue,
    history: state.history || [],
  }
}

export function createAbnormalCenterState(
  item: Pick<AbnormalCenterItem, 'id' | 'source' | 'relatedId' | 'owner'>,
  now: string | Date = new Date(),
): AbnormalCenterState {
  const at = now instanceof Date ? now.toISOString() : normalizeText(now, new Date().toISOString())
  return {
    abnormalId: item.id,
    source: item.source,
    relatedId: item.relatedId,
    status: 'OPEN',
    owner: normalizeText(item.owner),
    closedReason: '',
    updatedAt: at,
    history: [],
  }
}

export function applyAbnormalCenterAction(
  state: AbnormalCenterState,
  action: { type: AbnormalCenterActionType; actor?: string; owner?: string; note?: string; at?: string | Date },
): AbnormalCenterState {
  const at = action.at instanceof Date ? action.at.toISOString() : normalizeText(action.at, new Date().toISOString())
  const actor = normalizeText(action.actor, '当前用户')
  const owner = normalizeText(action.owner || state.owner || actor)
  const status: AbnormalCenterStatus = action.type === 'assign' ? 'ASSIGNED' : action.type === 'start' ? 'PROCESSING' : 'CLOSED'
  const note = normalizeText(action.note)
  return {
    ...state,
    status,
    owner,
    closedReason: action.type === 'close' ? note : state.closedReason,
    updatedAt: at,
    history: [
      ...(state.history || []),
      { action: action.type, status, actor, owner, note, at },
    ],
  }
}

export function buildAbnormalCenterItems(input: AbnormalCenterInput = {}) {
  const now = input.now || new Date()
  const stateMap = new Map((input.states || []).map((state) => [state.abnormalId, state]))
  const rows = [
    ...buildAndonItems(input.andonEvents || []),
    ...buildWarningItems(input.warnings || []),
    ...buildProductionItems(input.productionOrders || [], now),
    ...buildQcItems(input.qcRecords || []),
    ...buildReadinessItems(input.readinessChecks || []),
  ]
  return rows
    .map((item) => mergeState(item, stateMap.get(item.id), now))
    .sort((left, right) => {
      const statusRank: Record<AbnormalCenterStatus, number> = { OVERDUE: 0, OPEN: 1, ASSIGNED: 2, PROCESSING: 3, CLOSED: 4 }
      const levelRank: Record<AbnormalCenterLevel, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 }
      return statusRank[left.status] - statusRank[right.status]
        || levelRank[left.level] - levelRank[right.level]
        || (left.dueAt || left.createdAt).localeCompare(right.dueAt || right.createdAt)
        || left.title.localeCompare(right.title, 'zh-CN')
    })
}

export function summarizeAbnormalCenter(rows: AbnormalCenterItem[]) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1
      if (row.level === 'CRITICAL') summary.critical += 1
      if (row.status === 'OPEN' || row.status === 'ASSIGNED') summary.open += 1
      if (row.status === 'PROCESSING') summary.processing += 1
      if (row.status === 'OVERDUE') summary.overdue += 1
      if (row.status === 'CLOSED') summary.closed += 1
      summary.sources[row.source] = (summary.sources[row.source] || 0) + 1
      return summary
    },
    {
      total: 0,
      critical: 0,
      open: 0,
      processing: 0,
      overdue: 0,
      closed: 0,
      sources: {} as Record<AbnormalCenterSource, number>,
    },
  )
}

