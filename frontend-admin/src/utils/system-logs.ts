export const SYSTEM_LOG_ACTION_FILTER_OPTIONS = [
  { label: '新增', value: 'CREATE' },
  { label: '修改', value: 'UPDATE' },
  { label: '删除', value: 'DELETE' },
  { label: '登录', value: 'LOGIN' },
  { label: '登出', value: 'LOGOUT' },
  { label: '导入', value: 'IMPORT' },
  { label: '导出', value: 'EXPORT' },
  { label: '审批', value: 'APPROVE' },
  { label: '驳回', value: 'REJECT' },
] as const

export type SystemLogRisk = 'normal' | 'warning' | 'danger'

export type SystemLogRecord = {
  id: number
  username: string
  module: string
  action: string
  actionText: string
  actionRisk: SystemLogRisk
  actionTag: 'success' | 'warning' | 'danger' | 'info'
  targetType: string
  targetId: string
  oldValueText: string
  newValueText: string
  changeSummary: string
  ip: string
  createdAt: string
}

export type SystemLogQuery = {
  page: number
  pageSize: number
  keyword?: string
  action?: string
  targetType?: string
  startDate?: string
  endDate?: string
}

export type SystemLogSummary = {
  total: number
  danger: number
  warning: number
  changed: number
  actorCount: number
  moduleCount: number
}

const ACTION_ALIASES: Record<string, string> = {
  ADD: 'CREATE',
  CREATE: 'CREATE',
  INSERT: 'CREATE',
  新增: 'CREATE',
  添加: 'CREATE',
  UPDATE: 'UPDATE',
  EDIT: 'UPDATE',
  MODIFY: 'UPDATE',
  修改: 'UPDATE',
  更新: 'UPDATE',
  编辑: 'UPDATE',
  DELETE: 'DELETE',
  REMOVE: 'DELETE',
  删除: 'DELETE',
  LOGIN: 'LOGIN',
  SIGN_IN: 'LOGIN',
  登录: 'LOGIN',
  LOGOUT: 'LOGOUT',
  SIGN_OUT: 'LOGOUT',
  登出: 'LOGOUT',
  退出: 'LOGOUT',
  IMPORT: 'IMPORT',
  导入: 'IMPORT',
  EXPORT: 'EXPORT',
  导出: 'EXPORT',
  APPROVE: 'APPROVE',
  AUDIT_PASS: 'APPROVE',
  审批: 'APPROVE',
  审核: 'APPROVE',
  REJECT: 'REJECT',
  AUDIT_REJECT: 'REJECT',
  驳回: 'REJECT',
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: '新增',
  UPDATE: '修改',
  DELETE: '删除',
  LOGIN: '登录',
  LOGOUT: '登出',
  IMPORT: '导入',
  EXPORT: '导出',
  APPROVE: '审批',
  REJECT: '驳回',
}

const SENSITIVE_KEY_PATTERN = /(password|passwd|pwd|token|secret|api[_-]?key|anon[_-]?key|access[_-]?key|authorization|credential|密钥|密码|令牌)/i

function trimText(value: unknown) {
  return String(value ?? '').trim()
}

function toInteger(value: unknown, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? Math.trunc(num) : fallback
}

function truncateText(value: string, maxLength = 500) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`
}

function normalizeFilterValue(value: unknown, maxLength = 80) {
  return trimText(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, maxLength)
    .trim()
}

export function normalizeSystemLogKeyword(value: unknown) {
  return normalizeFilterValue(value)
    .replace(/\\[nrt]/gi, ' ')
    .replace(/[,%()'"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeDateOnly(value: unknown) {
  const text = trimText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

export function normalizeSystemLogAction(value: unknown) {
  const text = trimText(value)
  if (!text) return 'OTHER'
  const normalized = text.toUpperCase().replace(/[\s-]+/g, '_')
  return ACTION_ALIASES[text] || ACTION_ALIASES[normalized] || normalized
}

export function systemLogActionText(value: unknown) {
  const action = normalizeSystemLogAction(value)
  return ACTION_LABELS[action] || action
}

export function systemLogActionRisk(value: unknown): SystemLogRisk {
  const action = normalizeSystemLogAction(value)
  if (['DELETE', 'REJECT'].includes(action)) return 'danger'
  if (['UPDATE', 'IMPORT', 'EXPORT', 'APPROVE'].includes(action)) return 'warning'
  return 'normal'
}

export function systemLogActionTag(value: unknown) {
  const action = normalizeSystemLogAction(value)
  if (action === 'CREATE' || action === 'LOGIN') return 'success' as const
  if (systemLogActionRisk(action) === 'danger') return 'danger' as const
  if (systemLogActionRisk(action) === 'warning') return 'warning' as const
  return 'info' as const
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

function parseStructuredValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!/^[{[]/.test(text)) return value
  try {
    return JSON.parse(text)
  } catch {
    return value
  }
}

function redactSensitiveValue(value: unknown, key = ''): unknown {
  if (key && SENSITIVE_KEY_PATTERN.test(key)) return '***'
  if (Array.isArray(value)) return value.map((item) => redactSensitiveValue(item))
  if (isPlainObject(value)) {
    return Object.keys(value)
      .sort()
      .reduce((result: Record<string, unknown>, itemKey) => {
        result[itemKey] = redactSensitiveValue(value[itemKey], itemKey)
        return result
      }, {})
  }
  return value
}

function stableValueText(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  if (isPlainObject(value) || Array.isArray(value)) {
    return JSON.stringify(redactSensitiveValue(value))
  }
  return trimText(value)
}

function comparableValueText(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  if (isPlainObject(value) || Array.isArray(value)) return JSON.stringify(value)
  return trimText(value)
}

export function formatSystemLogValue(value: unknown) {
  const parsed = parseStructuredValue(value)
  if (parsed === undefined || parsed === null || parsed === '') return '-'
  if (isPlainObject(parsed) || Array.isArray(parsed)) return truncateText(stableValueText(parsed))
  const text = trimText(parsed)
  return text ? truncateText(text) : '-'
}

function isEmptyLogValue(value: unknown) {
  return formatSystemLogValue(value) === '-'
}

function displayChangeKey(key: string) {
  return SENSITIVE_KEY_PATTERN.test(key) ? '敏感字段' : key
}

function changedObjectKeys(oldValue: Record<string, unknown>, newValue: Record<string, unknown>) {
  const keys = Array.from(new Set([...Object.keys(oldValue), ...Object.keys(newValue)]))
  return Array.from(new Set(keys
    .filter((key) => comparableValueText(oldValue[key]) !== comparableValueText(newValue[key]))
    .map(displayChangeKey)))
}

export function buildSystemLogChangeSummary(oldValue: unknown, newValue: unknown) {
  const oldParsed = parseStructuredValue(oldValue)
  const newParsed = parseStructuredValue(newValue)
  const oldEmpty = isEmptyLogValue(oldParsed)
  const newEmpty = isEmptyLogValue(newParsed)
  if (oldEmpty && newEmpty) return '未记录变更'
  if (oldEmpty && !newEmpty) return '新增记录'
  if (!oldEmpty && newEmpty) return '删除/清空记录'
  if (isPlainObject(oldParsed) && isPlainObject(newParsed)) {
    const keys = changedObjectKeys(oldParsed, newParsed)
    if (!keys.length) return '无字段差异'
    const visible = keys.slice(0, 4).join('、')
    return keys.length > 4 ? `${keys.length} 个字段变更：${visible} 等` : `${keys.length} 个字段变更：${visible}`
  }
  return formatSystemLogValue(oldParsed) === formatSystemLogValue(newParsed) ? '无差异' : '已记录变更'
}

export function normalizeSystemLog(row: Record<string, unknown> = {}): SystemLogRecord {
  const action = normalizeSystemLogAction(row.action)
  const oldValue = row.oldValue ?? row.old_value
  const newValue = row.newValue ?? row.new_value
  return {
    id: Math.max(0, toInteger(row.id)),
    username: normalizeFilterValue(row.username || row.realName || row.real_name, 40) || '系统',
    module: normalizeFilterValue(row.module, 60) || '-',
    action,
    actionText: systemLogActionText(action),
    actionRisk: systemLogActionRisk(action),
    actionTag: systemLogActionTag(action),
    targetType: normalizeFilterValue(row.targetType ?? row.target_type, 60) || '-',
    targetId: normalizeFilterValue(row.targetId ?? row.target_id, 80) || '-',
    oldValueText: formatSystemLogValue(oldValue),
    newValueText: formatSystemLogValue(newValue),
    changeSummary: buildSystemLogChangeSummary(oldValue, newValue),
    ip: normalizeFilterValue(row.ip, 60) || '-',
    createdAt: trimText(row.createdAt ?? row.created_at),
  }
}

export function normalizeSystemLogList(rows: Array<Record<string, unknown>> = []) {
  return rows.map((row) => normalizeSystemLog(row))
}

export function buildSystemLogQuery(input: Record<string, unknown> = {}): SystemLogQuery {
  const page = Math.max(1, toInteger(input.page, 1))
  const pageSize = Math.min(Math.max(1, toInteger(input.pageSize, 20)), 200)
  const keyword = normalizeSystemLogKeyword(input.keyword)
  const action = normalizeFilterValue(input.action, 40)
  const targetType = normalizeFilterValue(input.targetType, 60)
  const startDate = normalizeDateOnly(input.startDate)
  const endDate = normalizeDateOnly(input.endDate)
  return {
    page,
    pageSize,
    ...(keyword ? { keyword } : {}),
    ...(action ? { action } : {}),
    ...(targetType ? { targetType } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  }
}

export function buildSystemLogSummary(rows: SystemLogRecord[]): SystemLogSummary {
  const actors = new Set<string>()
  const modules = new Set<string>()
  return rows.reduce(
    (summary, row) => {
      summary.total += 1
      if (row.actionRisk === 'danger') summary.danger += 1
      if (row.actionRisk === 'warning') summary.warning += 1
      if (!['未记录变更', '无差异', '无字段差异'].includes(row.changeSummary)) summary.changed += 1
      if (row.username && row.username !== '-') actors.add(row.username)
      if (row.module && row.module !== '-') modules.add(row.module)
      summary.actorCount = actors.size
      summary.moduleCount = modules.size
      return summary
    },
    { total: 0, danger: 0, warning: 0, changed: 0, actorCount: 0, moduleCount: 0 } as SystemLogSummary,
  )
}

export function buildSystemLogExportPackage(rows: SystemLogRecord[], generatedAt = new Date().toISOString()) {
  return {
    generatedAt,
    summary: buildSystemLogSummary(rows),
    records: rows.map((row) => ({
      id: row.id,
      username: row.username,
      module: row.module,
      action: row.actionText,
      risk: row.actionRisk,
      target: `${row.targetType}#${row.targetId}`,
      changeSummary: row.changeSummary,
      oldValue: row.oldValueText,
      newValue: row.newValueText,
      ip: row.ip,
      createdAt: row.createdAt,
    })),
  }
}
