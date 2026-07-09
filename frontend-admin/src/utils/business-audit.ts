export type BusinessAuditAction = 'EXPORT' | 'PRINT' | 'IMPORT' | 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT'

export type BusinessAuditInput = {
  module: string
  action: BusinessAuditAction
  targetType?: string
  targetId?: string | number
  summary?: string
  count?: number
  scope?: string
  filename?: string
  detail?: Record<string, unknown>
}

export type BusinessAuditLogPayload = {
  userId?: number
  username: string
  module: string
  action: BusinessAuditAction
  targetType: string
  targetId: string
  oldValue: string
  newValue: string
  ip: string
  createdAt: string
}

const LOCAL_AUDIT_QUEUE_KEY = 'inject_erp_business_audit_queue'

function browserStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return null
  return window.localStorage
}

function text(value: unknown, fallback = '-') {
  const next = String(value ?? '').trim()
  return next || fallback
}

function readCurrentUser() {
  const storage = browserStorage()
  if (!storage) return { username: '系统' }
  const userId = Number(storage.getItem('userId') || 0)
  const username = storage.getItem('realName')
    || storage.getItem('userName')
    || storage.getItem('username')
    || storage.getItem('role')
    || '系统'
  return {
    userId: Number.isFinite(userId) && userId > 0 ? userId : undefined,
    username,
  }
}

function stableJson(value: Record<string, unknown>) {
  return JSON.stringify(Object.keys(value)
    .sort()
    .reduce((result: Record<string, unknown>, key) => {
      result[key] = value[key]
      return result
    }, {}))
}

export function buildBusinessAuditLog(input: BusinessAuditInput, createdAt = new Date().toISOString()): BusinessAuditLogPayload {
  const currentUser = readCurrentUser()
  const detail = {
    summary: text(input.summary, ''),
    count: input.count ?? undefined,
    scope: text(input.scope, ''),
    filename: text(input.filename, ''),
    ...(input.detail || {}),
  }
  return {
    userId: currentUser.userId,
    username: text(currentUser.username, '系统'),
    module: text(input.module),
    action: input.action,
    targetType: text(input.targetType, input.module),
    targetId: text(input.targetId),
    oldValue: '',
    newValue: stableJson(detail),
    ip: 'client',
    createdAt,
  }
}

export function appendLocalBusinessAuditLog(payload: BusinessAuditLogPayload, errorMessage = '') {
  const storage = browserStorage()
  if (!storage) return false
  try {
    const rows = JSON.parse(storage.getItem(LOCAL_AUDIT_QUEUE_KEY) || '[]')
    const nextRows = Array.isArray(rows) ? rows : []
    nextRows.unshift({ ...payload, persisted: false, errorMessage })
    storage.setItem(LOCAL_AUDIT_QUEUE_KEY, JSON.stringify(nextRows.slice(0, 100)))
    return true
  } catch {
    return false
  }
}

export async function recordBusinessAudit(input: BusinessAuditInput) {
  const payload = buildBusinessAuditLog(input)
  try {
    const { createOperationLog } = await import('../api/system')
    await createOperationLog(payload)
    return { persisted: true, payload }
  } catch (error: any) {
    appendLocalBusinessAuditLog(payload, error?.message || '日志写入失败')
    return { persisted: false, payload }
  }
}
