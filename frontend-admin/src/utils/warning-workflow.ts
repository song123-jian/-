import type { BusinessWarningItem } from './business-warning'

export type WarningWorkflowStatus = 'open' | 'assigned' | 'processing' | 'closed'

export type WarningWorkflowState = {
  warningId: string
  status?: WarningWorkflowStatus | null
  assignee?: string | null
  handler?: string | null
  closeReason?: string | null
  updatedAt?: string | null
}

export type WarningWorkflowItem = BusinessWarningItem & {
  workflowStatus: WarningWorkflowStatus
  assignee: string
  closeReason: string
  updatedAt: string
  nextAction: string
}

const STATUS_TEXT: Record<WarningWorkflowStatus, string> = {
  open: '待分派',
  assigned: '已分派',
  processing: '处理中',
  closed: '已关闭',
}

function normalizeStatus(value?: string | null): WarningWorkflowStatus {
  const status = String(value || '').trim().toLowerCase()
  if (status === 'assigned' || status === 'processing' || status === 'closed') return status
  return 'open'
}

function workflowNextAction(status: WarningWorkflowStatus) {
  if (status === 'open') return '分派'
  if (status === 'assigned') return '处理'
  if (status === 'processing') return '关闭'
  return '追踪'
}

export function buildWarningWorkflowItems(
  warnings: BusinessWarningItem[] = [],
  states: WarningWorkflowState[] = [],
): WarningWorkflowItem[] {
  const stateMap = new Map(states.map((state) => [state.warningId, state]))
  return warnings.map((warning) => {
    const state = stateMap.get(warning.id)
    const workflowStatus = normalizeStatus(state?.status)
    return {
      ...warning,
      workflowStatus,
      assignee: String(state?.assignee || state?.handler || '').trim() || '未分派',
      closeReason: String(state?.closeReason || '').trim(),
      updatedAt: String(state?.updatedAt || '').trim(),
      nextAction: workflowNextAction(workflowStatus),
    }
  })
}

export function summarizeWarningWorkflow(rows: WarningWorkflowItem[]) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1
      summary[row.workflowStatus] += 1
      if (row.level === 'ERROR' && row.workflowStatus !== 'closed') summary.unclosedError += 1
      return summary
    },
    { total: 0, open: 0, assigned: 0, processing: 0, closed: 0, unclosedError: 0 },
  )
}

export function getWarningWorkflowStatusText(value?: string | null) {
  return STATUS_TEXT[normalizeStatus(value)]
}

export function createWarningWorkflowState(
  warningId: string,
  status: WarningWorkflowStatus,
  assignee = '',
  closeReason = '',
  updatedAt = new Date().toISOString(),
): WarningWorkflowState {
  return {
    warningId,
    status,
    assignee: assignee.trim() || undefined,
    closeReason: closeReason.trim() || undefined,
    updatedAt,
  }
}
