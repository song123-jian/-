export const NOTIFICATION_TYPES = ['ERROR', 'WARNING', 'INFO'] as const
export const NOTIFICATION_READ_STATES = ['0', '1'] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]
export type NotificationReadState = (typeof NOTIFICATION_READ_STATES)[number] | ''

export type NotificationRecord = {
  id: number
  title: string
  content: string
  type: NotificationType
  isRead: boolean
  createdAt: string
}

export type NotificationQuery = {
  page: number
  pageSize: number
  keyword?: string
  isRead?: 0 | 1
}

export type NotificationSummary = {
  total: number
  unread: number
  read: number
  error: number
  warning: number
  info: number
}

function trimText(value: unknown) {
  return String(value ?? '').trim()
}

function toInteger(value: unknown, fallback = 0) {
  const num = Number(value)
  return Number.isInteger(num) ? num : fallback
}

export function normalizeNotificationType(value: unknown): NotificationType {
  const type = trimText(value).toUpperCase()
  return NOTIFICATION_TYPES.includes(type as NotificationType) ? type as NotificationType : 'INFO'
}

export function toNotificationReadBoolean(value: unknown) {
  if (value === true || value === 1) return true
  if (value === false || value === 0) return false
  const text = trimText(value).toLowerCase()
  if (['true', '1', 'yes', 'read', '已读'].includes(text)) return true
  if (['false', '0', 'no', 'unread', '未读'].includes(text)) return false
  return false
}

export function normalizeNotification(row: Record<string, unknown> = {}): NotificationRecord {
  return {
    id: Math.max(0, toInteger(row.id)),
    title: trimText(row.title) || '未命名消息',
    content: trimText(row.content) || '-',
    type: normalizeNotificationType(row.type),
    isRead: toNotificationReadBoolean(row.isRead ?? row.is_read),
    createdAt: trimText(row.createdAt ?? row.created_at),
  }
}

export function normalizeNotificationList(rows: Array<Record<string, unknown>> = []) {
  return rows.map((row) => normalizeNotification(row))
}

export function normalizeNotificationReadState(value: unknown): NotificationReadState {
  const text = trimText(value)
  return NOTIFICATION_READ_STATES.includes(text as '0' | '1') ? text as '0' | '1' : ''
}

export function buildNotificationQuery(input: Record<string, unknown> = {}): NotificationQuery {
  const page = Math.max(1, toInteger(input.page, 1))
  const pageSize = Math.min(Math.max(1, toInteger(input.pageSize, 20)), 200)
  const keyword = trimText(input.keyword)
  const readState = normalizeNotificationReadState(input.readState ?? input.isRead)
  return {
    page,
    pageSize,
    ...(keyword ? { keyword } : {}),
    ...(readState !== '' ? { isRead: Number(readState) as 0 | 1 } : {}),
  }
}

export function buildNotificationSummary(rows: NotificationRecord[]): NotificationSummary {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1
      if (row.isRead) summary.read += 1
      else summary.unread += 1
      if (row.type === 'ERROR') summary.error += 1
      else if (row.type === 'WARNING') summary.warning += 1
      else summary.info += 1
      return summary
    },
    { total: 0, unread: 0, read: 0, error: 0, warning: 0, info: 0 } as NotificationSummary,
  )
}

export function collectUnreadNotificationIds(rows: NotificationRecord[]) {
  return Array.from(new Set(rows.filter((row) => !row.isRead && row.id > 0).map((row) => row.id)))
}

export function notificationTypeText(value: unknown) {
  const map: Record<NotificationType, string> = {
    ERROR: '严重',
    WARNING: '警告',
    INFO: '消息',
  }
  return map[normalizeNotificationType(value)]
}

export function notificationTypeTag(value: unknown) {
  const type = normalizeNotificationType(value)
  if (type === 'ERROR') return 'danger'
  if (type === 'WARNING') return 'warning'
  return 'info'
}

export function buildBatchReadSummary(total: number, success: number) {
  const failed = Math.max(0, total - success)
  if (total <= 0) return { success, failed, state: 'info' as const, message: '当前没有未读消息' }
  if (failed === 0) return { success, failed, state: 'success' as const, message: `已标记 ${success} 条消息为已读` }
  if (success === 0) return { success, failed, state: 'error' as const, message: `${failed} 条消息标记失败` }
  return { success, failed, state: 'warning' as const, message: `已标记 ${success} 条，${failed} 条失败` }
}

export function normalizeUnreadNotificationCount(input: unknown) {
  if (typeof input === 'number') return Math.max(0, Math.trunc(input))
  if (typeof input === 'string') return Math.max(0, toInteger(input))
  if (input && typeof input === 'object') {
    const data = input as Record<string, unknown>
    return Math.max(0, toInteger(data.unreadCount ?? data.count ?? data.total))
  }
  return 0
}
