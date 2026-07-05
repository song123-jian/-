import type { OfflineActionTask, OfflineReport, SyncStatus } from './offline'

export type MobileOfflineTaskSource = 'report' | 'qc' | 'inventory' | 'transfer'

export type MobileOfflineTask = {
  id: string
  source: MobileOfflineTaskSource
  title: string
  description: string
  syncStatus: SyncStatus
  retryCount: number
  createdAt: string
  canRetry: boolean
  payload: Record<string, unknown>
}

const SOURCE_TEXT: Record<MobileOfflineTaskSource, string> = {
  report: '报工',
  qc: '质检',
  inventory: '盘点',
  transfer: '调拨',
}

function normalizeNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function normalizeText(value: unknown, fallback = '-') {
  const text = String(value ?? '').trim()
  return text || fallback
}

export function normalizeOfflineReportTask(report: OfflineReport): MobileOfflineTask {
  const id = normalizeNumber(report.id)
  const qty = normalizeNumber(report.quantity)
  const defectCount = normalizeNumber(report.defectCount)
  return {
    id: `report-${id || report.created_at}`,
    source: 'report',
    title: `报工 ${report.processName || '注塑'} · ${qty}`,
    description: `工单#${report.workOrderId} / 机台#${report.machineId} / 不良 ${defectCount}`,
    syncStatus: report.sync_status,
    retryCount: normalizeNumber(report.retry_count),
    createdAt: normalizeText(report.created_at, ''),
    canRetry: report.sync_status === 'pending' || report.sync_status === 'failed',
    payload: { ...report },
  }
}

export function normalizeOfflineActionTask(task: OfflineActionTask): MobileOfflineTask {
  return {
    id: task.id,
    source: task.source,
    title: task.title,
    description: task.last_error ? `${task.description} / ${task.last_error}` : task.description,
    syncStatus: task.sync_status,
    retryCount: normalizeNumber(task.retry_count),
    createdAt: normalizeText(task.created_at, ''),
    canRetry: task.sync_status === 'pending' || task.sync_status === 'failed',
    payload: { ...task.payload, id: task.id },
  }
}

export function buildOfflineTaskCenter(reports: OfflineReport[] = [], actionTasks: OfflineActionTask[] = []) {
  const tasks = reports
    .map(normalizeOfflineReportTask)
    .concat(actionTasks.map(normalizeOfflineActionTask))
    .sort((left, right) => {
      const statusRank: Record<SyncStatus, number> = { failed: 0, pending: 1, syncing: 2, synced: 3 }
      return statusRank[left.syncStatus] - statusRank[right.syncStatus] || right.createdAt.localeCompare(left.createdAt)
    })
  const summary = tasks.reduce(
    (result, task) => {
      result.total += 1
      result[task.syncStatus] += 1
      if (task.canRetry) result.retryable += 1
      return result
    },
    { total: 0, pending: 0, syncing: 0, synced: 0, failed: 0, retryable: 0 },
  )
  return { tasks, summary }
}

export function getOfflineTaskSourceText(value: MobileOfflineTaskSource) {
  return SOURCE_TEXT[value] || value
}

export function getOfflineTaskStatusText(value: SyncStatus) {
  const labels: Record<SyncStatus, string> = {
    pending: '待同步',
    syncing: '同步中',
    synced: '已同步',
    failed: '同步失败',
  }
  return labels[value] || value
}
