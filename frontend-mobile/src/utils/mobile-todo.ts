import type { MobileOfflineTask } from './offline-task-center'

export type MobileTodoType = 'report' | 'qc' | 'inventory' | 'transfer' | 'offline' | 'injection'

export type MobileTodoItem = {
  id: string
  type: MobileTodoType
  title: string
  description: string
  route: string
  priority: number
}

function normalizeArray(value: unknown): any[] {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

function normalizeText(value: unknown, fallback = '-') {
  const text = String(value ?? '').trim()
  return text || fallback
}

export function buildMobileTodoItems(input: {
  reportTasks?: any[]
  qcOrders?: any[]
  inventoryTasks?: any[]
  transferTasks?: any[]
  offlineTasks?: MobileOfflineTask[]
  injectionTasks?: any[]
} = {}): MobileTodoItem[] {
  const rows: MobileTodoItem[] = []

  for (const task of normalizeArray(input.reportTasks)) {
    rows.push({
      id: `report-${normalizeText(task.workOrderId || task.id || task.workOrderNo)}`,
      type: 'report',
      title: normalizeText(task.productName, '待报工'),
      description: `${normalizeText(task.workOrderNo)} / ${normalizeText(task.machineCode || task.machineName, '未指定机台')}`,
      route: '/m/report',
      priority: 20,
    })
  }

  for (const order of normalizeArray(input.qcOrders)) {
    rows.push({
      id: `qc-${normalizeText(order.workOrderId || order.id || order.workOrderNo)}`,
      type: 'qc',
      title: normalizeText(order.productName, '待质检'),
      description: normalizeText(order.workOrderNo),
      route: '/m/qc',
      priority: 30,
    })
  }

  for (const item of normalizeArray(input.inventoryTasks)) {
    rows.push({
      id: `inventory-${normalizeText(item.id || item.productCode || item.productId)}`,
      type: 'inventory',
      title: normalizeText(item.productName || item.productCode, '待盘点'),
      description: normalizeText(item.locationCode || item.warehouseName, '待确认库位'),
      route: '/m/inventory',
      priority: 40,
    })
  }

  for (const item of normalizeArray(input.transferTasks)) {
    rows.push({
      id: `transfer-${normalizeText(item.id || item.transferNo)}`,
      type: 'transfer',
      title: normalizeText(item.transferNo, '待接收调拨'),
      description: `${normalizeText(item.fromWarehouseName)} → ${normalizeText(item.toWarehouseName)}`,
      route: '/m/transfer',
      priority: 50,
    })
  }

  for (const task of normalizeArray(input.offlineTasks)) {
    if (!task.canRetry) continue
    rows.push({
      id: `offline-${task.id}`,
      type: 'offline',
      title: task.title,
      description: task.description,
      route: '/m/offline-tasks',
      priority: 10,
    })
  }

  for (const task of normalizeArray(input.injectionTasks)) {
    rows.push({
      id: `injection-${normalizeText(task.id || task.moduleKey || task.title)}`,
      type: 'injection',
      title: normalizeText(task.title, '注塑专业待办'),
      description: `${normalizeText(task.moduleTitle, '注塑专业')} / ${normalizeText(task.description)}`,
      route: normalizeText(task.route, '/m/injection'),
      priority: 25,
    })
  }

  return rows.sort((left, right) => left.priority - right.priority || left.title.localeCompare(right.title))
}

export function summarizeMobileTodos(rows: MobileTodoItem[]) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1
      summary[row.type] += 1
      return summary
    },
    { total: 0, report: 0, qc: 0, inventory: 0, transfer: 0, offline: 0, injection: 0 },
  )
}
