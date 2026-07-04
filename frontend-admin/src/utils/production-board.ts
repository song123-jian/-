export type ProductionBoardTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral'

export type ProductionBoardMachineStatus = {
  machineId?: number | string | null
  machineName?: string | null
  status?: string | null
  orderNo?: string | null
  productName?: string | null
}

export type ProductionBoardOrderProgress = {
  orderId?: number | string | null
  orderNo?: string | null
  productName?: string | null
  planQty?: number | string | null
  completedQty?: number | string | null
  completionRate?: number | string | null
  status?: string | null
  planEnd?: string | null
  overdue?: boolean | null
}

export type ProductionBoardShiftOutput = {
  shift?: string | null
  qty?: number | string | null
  goodQty?: number | string | null
  badQty?: number | string | null
  reportCount?: number | string | null
  workMinutes?: number | string | null
}

export type ProductionBoardDefect = {
  defectType?: string | null
  qty?: number | string | null
}

export type ProductionBoardRiskItem = {
  type: string
  level: 'error' | 'warning' | 'info'
  title: string
  description: string
}

export type ProductionBoardSummary = {
  periodMode?: string
  months?: number | string | null
  startDate?: string | null
  endDate?: string | null
  totalQty?: number | string | null
  goodQty?: number | string | null
  badQty?: number | string | null
  badRate?: number | string | null
  reportCount?: number | string | null
  shiftCount?: number | string | null
  machineCount?: number | string | null
  runningMachineCount?: number | string | null
  utilizationRate?: number | string | null
  orderCount?: number | string | null
  runningOrderCount?: number | string | null
  completedOrderCount?: number | string | null
  overdueOrderCount?: number | string | null
  totalPlanQty?: number | string | null
  totalCompletedQty?: number | string | null
  completionRate?: number | string | null
  defectQty?: number | string | null
  machineStatuses?: ProductionBoardMachineStatus[] | null
  orderProgresses?: ProductionBoardOrderProgress[] | null
  shiftOutputs?: ProductionBoardShiftOutput[] | null
  topDefects?: ProductionBoardDefect[] | null
  riskItems?: ProductionBoardRiskItem[] | null
}

export type NormalizedProductionBoardSummary = {
  periodMode: string
  months: number
  startDate: string
  endDate: string
  totalQty: number
  goodQty: number
  badQty: number
  badRate: number
  reportCount: number
  shiftCount: number
  machineCount: number
  runningMachineCount: number
  utilizationRate: number
  orderCount: number
  runningOrderCount: number
  completedOrderCount: number
  overdueOrderCount: number
  totalPlanQty: number
  totalCompletedQty: number
  completionRate: number
  defectQty: number
  machineStatuses: ProductionBoardMachineStatus[]
  orderProgresses: ProductionBoardOrderProgress[]
  shiftOutputs: ProductionBoardShiftOutput[]
  topDefects: ProductionBoardDefect[]
  riskItems: ProductionBoardRiskItem[]
}

export type ProductionBoardCard = {
  label: string
  value: number
  valueType: 'number' | 'percent'
  meta: string
  tone: ProductionBoardTone
  icon: string
}

export type ProductionBoardShiftChartRow = {
  label: string
  qty: number
  goodQty: number
  badQty: number
  badRate: number
}

export type ProductionBoardChartRow = {
  label: string
  value: number
  tone: ProductionBoardTone
}

const ACTIVE_ORDER_STATUSES = new Set(['RUNNING', 'PAUSED', 'SCHEDULED', 'WAITING'])
const DONE_ORDER_STATUSES = new Set(['COMPLETED', 'DONE', 'FINISHED', 'CLOSED'])

export function toProductionNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function roundProductionQty(value: unknown) {
  return Number(toProductionNumber(value).toFixed(2))
}

export function roundProductionRate(value: unknown) {
  return Number(toProductionNumber(value).toFixed(1))
}

export function productionRatioPercent(numerator: unknown, denominator: unknown) {
  const base = toProductionNumber(denominator)
  if (base <= 0) return toProductionNumber(numerator) > 0 ? 100 : 0
  return roundProductionRate((toProductionNumber(numerator) / base) * 100)
}

export function clampProductionPercent(value: unknown) {
  return Math.min(Math.max(roundProductionRate(value), 0), 100)
}

export function normalizeProductionStatus(value?: string | null) {
  return String(value || '').trim().toUpperCase()
}

export function isActiveProductionOrderStatus(value?: string | null) {
  return ACTIVE_ORDER_STATUSES.has(normalizeProductionStatus(value))
}

export function isDoneProductionOrderStatus(value?: string | null) {
  return DONE_ORDER_STATUSES.has(normalizeProductionStatus(value))
}

export function getProductionStatusText(value?: string | null) {
  const status = normalizeProductionStatus(value)
  const labels: Record<string, string> = {
    RUNNING: '运行中',
    PAUSED: '暂停',
    SCHEDULED: '已排产',
    WAITING: '待生产',
    COMPLETED: '已完成',
    DONE: '已完成',
    FINISHED: '已完工',
    CLOSED: '已关闭',
    CANCELLED: '已取消',
    IDLE: '空闲',
    MAINTENANCE: '维护中',
    STOPPED: '停机',
  }
  return labels[status] || value || '-'
}

export function getProductionStatusTagType(value?: string | null) {
  const status = normalizeProductionStatus(value)
  if (status === 'RUNNING' || DONE_ORDER_STATUSES.has(status)) return 'success'
  if (status === 'PAUSED' || status === 'SCHEDULED' || status === 'WAITING' || status === 'IDLE') return 'warning'
  if (status === 'MAINTENANCE' || status === 'STOPPED' || status === 'CANCELLED') return 'danger'
  return 'info'
}

function asArray<T>(value?: T[] | null) {
  return Array.isArray(value) ? value : []
}

function normalizeCounter(value: unknown) {
  return Math.max(Math.trunc(toProductionNumber(value)), 0)
}

function normalizeShiftOutput(item: ProductionBoardShiftOutput): ProductionBoardShiftOutput {
  const qty = roundProductionQty(item.qty)
  const badQty = roundProductionQty(item.badQty)
  return {
    shift: item.shift || '未分班',
    qty,
    badQty,
    goodQty: item.goodQty === undefined || item.goodQty === null ? Math.max(qty - badQty, 0) : roundProductionQty(item.goodQty),
    reportCount: normalizeCounter(item.reportCount),
    workMinutes: normalizeCounter(item.workMinutes),
  }
}

function normalizeOrder(item: ProductionBoardOrderProgress): ProductionBoardOrderProgress {
  const planQty = roundProductionQty(item.planQty)
  const completedQty = roundProductionQty(item.completedQty)
  return {
    ...item,
    planQty,
    completedQty,
    completionRate:
      item.completionRate === undefined || item.completionRate === null
        ? productionRatioPercent(completedQty, planQty)
        : roundProductionRate(item.completionRate),
  }
}

export function normalizeProductionBoardSummary(input?: ProductionBoardSummary | null): NormalizedProductionBoardSummary {
  const data = input || {}
  const shiftOutputs = asArray(data.shiftOutputs).map(normalizeShiftOutput)
  const machineStatuses = asArray(data.machineStatuses)
  const orderProgresses = asArray(data.orderProgresses).map(normalizeOrder)
  const topDefects = asArray(data.topDefects).map((item) => ({
    defectType: item.defectType || '未分类',
    qty: roundProductionQty(item.qty),
  }))

  const totalQty = roundProductionQty(data.totalQty ?? shiftOutputs.reduce((sum, item) => sum + toProductionNumber(item.qty), 0))
  const badQty = roundProductionQty(data.badQty ?? shiftOutputs.reduce((sum, item) => sum + toProductionNumber(item.badQty), 0))
  const goodQty = roundProductionQty(data.goodQty ?? Math.max(totalQty - badQty, 0))
  const machineCount = normalizeCounter(data.machineCount ?? machineStatuses.length)
  const runningMachineCount = normalizeCounter(
    data.runningMachineCount ?? machineStatuses.filter((item) => normalizeProductionStatus(item.status) === 'RUNNING').length,
  )
  const totalPlanQty = roundProductionQty(data.totalPlanQty ?? orderProgresses.reduce((sum, item) => sum + toProductionNumber(item.planQty), 0))
  const totalCompletedQty = roundProductionQty(
    data.totalCompletedQty ?? orderProgresses.reduce((sum, item) => sum + toProductionNumber(item.completedQty), 0),
  )

  return {
    periodMode: data.periodMode || '',
    months: normalizeCounter(data.months),
    startDate: data.startDate || '',
    endDate: data.endDate || '',
    totalQty,
    goodQty,
    badQty,
    badRate: roundProductionRate(data.badRate ?? productionRatioPercent(badQty, totalQty)),
    reportCount: normalizeCounter(data.reportCount ?? shiftOutputs.reduce((sum, item) => sum + toProductionNumber(item.reportCount), 0)),
    shiftCount: normalizeCounter(data.shiftCount ?? shiftOutputs.length),
    machineCount,
    runningMachineCount,
    utilizationRate: roundProductionRate(data.utilizationRate ?? productionRatioPercent(runningMachineCount, machineCount)),
    orderCount: normalizeCounter(data.orderCount ?? orderProgresses.length),
    runningOrderCount: normalizeCounter(
      data.runningOrderCount ?? orderProgresses.filter((item) => isActiveProductionOrderStatus(item.status)).length,
    ),
    completedOrderCount: normalizeCounter(
      data.completedOrderCount ?? orderProgresses.filter((item) => isDoneProductionOrderStatus(item.status)).length,
    ),
    overdueOrderCount: normalizeCounter(data.overdueOrderCount ?? orderProgresses.filter((item) => item.overdue).length),
    totalPlanQty,
    totalCompletedQty,
    completionRate: roundProductionRate(data.completionRate ?? productionRatioPercent(totalCompletedQty, totalPlanQty)),
    defectQty: roundProductionQty(data.defectQty ?? topDefects.reduce((sum, item) => sum + toProductionNumber(item.qty), 0)),
    machineStatuses,
    orderProgresses,
    shiftOutputs,
    topDefects,
    riskItems: asArray(data.riskItems),
  }
}

export function buildProductionBoardSummary(input?: ProductionBoardSummary | null) {
  return normalizeProductionBoardSummary(input)
}

export function buildProductionBoardCards(input?: ProductionBoardSummary | null): ProductionBoardCard[] {
  const data = normalizeProductionBoardSummary(input)
  return [
    {
      label: '本期总产量',
      value: data.totalQty,
      valueType: 'number',
      meta: `${data.reportCount} 条报工`,
      tone: data.totalQty > 0 ? 'primary' : 'neutral',
      icon: 'Goods',
    },
    {
      label: '良品数量',
      value: data.goodQty,
      valueType: 'number',
      meta: `良品率 ${productionRatioPercent(data.goodQty, data.totalQty).toFixed(1)}%`,
      tone: data.totalQty > 0 && data.badRate <= 3 ? 'success' : 'warning',
      icon: 'CircleCheck',
    },
    {
      label: '不良率',
      value: data.badRate,
      valueType: 'percent',
      meta: `不良 ${data.badQty}`,
      tone: data.badRate > 5 ? 'danger' : data.badRate > 3 ? 'warning' : 'success',
      icon: 'WarningFilled',
    },
    {
      label: '运行机台',
      value: data.runningMachineCount,
      valueType: 'number',
      meta: `${data.runningMachineCount}/${data.machineCount} 台，稼动 ${data.utilizationRate.toFixed(1)}%`,
      tone: data.machineCount > 0 && data.runningMachineCount === 0 ? 'danger' : 'success',
      icon: 'Monitor',
    },
    {
      label: '工单达成',
      value: data.completionRate,
      valueType: 'percent',
      meta: `${data.totalCompletedQty}/${data.totalPlanQty}`,
      tone: data.totalPlanQty > 0 && data.completionRate < 80 ? 'warning' : 'success',
      icon: 'Odometer',
    },
    {
      label: '在制工单',
      value: data.runningOrderCount,
      valueType: 'number',
      meta: `总工单 ${data.orderCount}`,
      tone: data.runningOrderCount > 0 ? 'primary' : 'neutral',
      icon: 'Operation',
    },
    {
      label: '逾期工单',
      value: data.overdueOrderCount,
      valueType: 'number',
      meta: data.overdueOrderCount > 0 ? '需复核排产' : '交期正常',
      tone: data.overdueOrderCount > 0 ? 'danger' : 'success',
      icon: 'Timer',
    },
    {
      label: '不良数量',
      value: data.defectQty,
      valueType: 'number',
      meta: `${data.topDefects.length} 类不良`,
      tone: data.defectQty > 0 ? 'warning' : 'success',
      icon: 'DataAnalysis',
    },
  ]
}

export function buildProductionShiftChartRows(input?: ProductionBoardSummary | null): ProductionBoardShiftChartRow[] {
  return normalizeProductionBoardSummary(input).shiftOutputs.map((item) => {
    const qty = toProductionNumber(item.qty)
    const badQty = toProductionNumber(item.badQty)
    const goodQty = toProductionNumber(item.goodQty)
    return {
      label: item.shift || '未分班',
      qty,
      goodQty,
      badQty,
      badRate: productionRatioPercent(badQty, qty),
    }
  })
}

export function buildProductionMachineChartRows(input?: ProductionBoardSummary | null): ProductionBoardChartRow[] {
  const statusMap = new Map<string, number>()
  for (const item of normalizeProductionBoardSummary(input).machineStatuses) {
    const label = getProductionStatusText(item.status)
    statusMap.set(label, (statusMap.get(label) || 0) + 1)
  }
  return Array.from(statusMap.entries()).map(([label, value]) => ({
    label,
    value,
    tone: label === '运行中' ? 'success' : label === '停机' || label === '维护中' ? 'danger' : 'warning',
  }))
}

export function buildProductionBoardRiskItems(input?: ProductionBoardSummary | null): ProductionBoardRiskItem[] {
  const data = normalizeProductionBoardSummary(input)
  const risks: ProductionBoardRiskItem[] = [...data.riskItems]

  if (data.runningOrderCount > 0 && data.totalQty <= 0) {
    risks.push({
      type: 'NO_OUTPUT_WITH_ACTIVE_ORDER',
      level: 'warning',
      title: '在制工单无报工产量',
      description: `当前有 ${data.runningOrderCount} 张在制工单，但期间产量为 0，需检查报工、设备或移动端同步。`,
    })
  }

  if (data.badRate > 5) {
    risks.push({
      type: 'HIGH_BAD_RATE',
      level: 'error',
      title: '不良率超过控制线',
      description: `本期不良率 ${data.badRate.toFixed(1)}%，不良数量 ${data.badQty}，需联动品质和生产处理。`,
    })
  } else if (data.badRate > 3) {
    risks.push({
      type: 'BAD_RATE_WARNING',
      level: 'warning',
      title: '不良率接近预警线',
      description: `本期不良率 ${data.badRate.toFixed(1)}%，建议复核主要不良类型和班次。`,
    })
  }

  if (data.machineCount > 0 && data.runningMachineCount === 0 && data.runningOrderCount > 0) {
    risks.push({
      type: 'NO_RUNNING_MACHINE',
      level: 'error',
      title: '有在制工单但无运行机台',
      description: '生产订单和设备状态不一致，需检查机台状态维护或排产执行情况。',
    })
  }

  if (data.totalPlanQty > 0 && data.completionRate < 80) {
    risks.push({
      type: 'LOW_COMPLETION_RATE',
      level: 'warning',
      title: '工单达成率偏低',
      description: `本期工单达成率 ${data.completionRate.toFixed(1)}%，计划 ${data.totalPlanQty}，完成 ${data.totalCompletedQty}。`,
    })
  }

  if (data.overdueOrderCount > 0) {
    risks.push({
      type: 'OVERDUE_ORDER',
      level: 'warning',
      title: '存在逾期生产工单',
      description: `${data.overdueOrderCount} 张工单超过计划完工日期，需同步销售交期和生产排程。`,
    })
  }

  return risks.slice(0, 12)
}
