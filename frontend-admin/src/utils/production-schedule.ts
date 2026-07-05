export type ScheduleConflictType = 'MACHINE_OVERLAP' | 'MOLD_OVERLAP' | 'DUE_DATE_RISK' | 'INVALID_TIME'
export type ScheduleConflictLevel = 'warning' | 'danger'

export type ProductionScheduleJob = {
  id?: number | string | null
  orderNo?: string | null
  productName?: string | null
  machineId?: number | string | null
  machineName?: string | null
  moldId?: number | string | null
  moldCode?: string | null
  startTime?: string | Date | null
  endTime?: string | Date | null
  dueTime?: string | Date | null
  dueDate?: string | Date | null
  status?: string | null
}

export type NormalizedScheduleJob = {
  id: string
  orderNo: string
  productName: string
  machineId: string
  machineName: string
  moldId: string
  moldCode: string
  startTime: string
  endTime: string
  dueTime: string
  durationHours: number
  overdue: boolean
  invalidTime: boolean
  conflictCount: number
}

export type ScheduleConflict = {
  type: ScheduleConflictType
  level: ScheduleConflictLevel
  resourceName: string
  title: string
  description: string
  orderNos: string[]
}

export type ProductionScheduleBoard = {
  rows: NormalizedScheduleJob[]
  conflicts: ScheduleConflict[]
  summary: {
    jobCount: number
    machineCount: number
    moldCount: number
    conflictCount: number
    overdueCount: number
    invalidCount: number
  }
}

function normalizeId(value: unknown) {
  const text = String(value ?? '').trim()
  return text || '-'
}

function normalizeText(value: unknown, fallback = '-') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function parseScheduleTime(value?: string | Date | null) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  const text = String(value || '').trim()
  if (!text) return null
  const normalized = text.includes('T') ? text : text.replace(' ', 'T')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatScheduleTime(value?: string | Date | null) {
  const date = parseScheduleTime(value)
  if (!date) return ''
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function roundHours(ms: number) {
  return Number((ms / 3600000).toFixed(1))
}

function overlaps(left: NormalizedScheduleJob, right: NormalizedScheduleJob) {
  const leftStart = parseScheduleTime(left.startTime)
  const leftEnd = parseScheduleTime(left.endTime)
  const rightStart = parseScheduleTime(right.startTime)
  const rightEnd = parseScheduleTime(right.endTime)
  if (!leftStart || !leftEnd || !rightStart || !rightEnd) return false
  return leftStart < rightEnd && rightStart < leftEnd
}

function addConflict(
  conflicts: ScheduleConflict[],
  rows: NormalizedScheduleJob[],
  conflict: ScheduleConflict,
) {
  conflicts.push(conflict)
  for (const row of rows) {
    if (conflict.orderNos.includes(row.orderNo)) {
      row.conflictCount += 1
    }
  }
}

function normalizeScheduleJob(row: ProductionScheduleJob, index: number): NormalizedScheduleJob {
  const start = parseScheduleTime(row.startTime)
  const end = parseScheduleTime(row.endTime)
  const due = parseScheduleTime(row.dueTime || row.dueDate)
  const invalidTime = !start || !end || start >= end
  return {
    id: normalizeId(row.id ?? index + 1),
    orderNo: normalizeText(row.orderNo, `WO-${index + 1}`),
    productName: normalizeText(row.productName),
    machineId: normalizeId(row.machineId),
    machineName: normalizeText(row.machineName || row.machineId, '未指定机台'),
    moldId: normalizeId(row.moldId),
    moldCode: normalizeText(row.moldCode || row.moldId, '未指定模具'),
    startTime: formatScheduleTime(row.startTime),
    endTime: formatScheduleTime(row.endTime),
    dueTime: formatScheduleTime(row.dueTime || row.dueDate),
    durationHours: !invalidTime && start && end ? roundHours(end.getTime() - start.getTime()) : 0,
    overdue: Boolean(end && due && end > due),
    invalidTime,
    conflictCount: 0,
  }
}

function detectResourceOverlaps(
  rows: NormalizedScheduleJob[],
  resourceKey: 'machineId' | 'moldId',
  resourceName: 'machineName' | 'moldCode',
  type: Extract<ScheduleConflictType, 'MACHINE_OVERLAP' | 'MOLD_OVERLAP'>,
  label: string,
  conflicts: ScheduleConflict[],
) {
  const buckets = new Map<string, NormalizedScheduleJob[]>()
  for (const row of rows.filter((item) => !item.invalidTime && item[resourceKey] !== '-')) {
    const key = row[resourceKey]
    buckets.set(key, [...(buckets.get(key) || []), row])
  }

  for (const bucket of buckets.values()) {
    const sorted = bucket.sort((left, right) => left.startTime.localeCompare(right.startTime))
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        if (!overlaps(sorted[i], sorted[j])) continue
        addConflict(conflicts, rows, {
          type,
          level: 'danger',
          resourceName: sorted[i][resourceName],
          title: `${label}时间冲突`,
          description: `${sorted[i][resourceName]} 同时排入 ${sorted[i].orderNo} 与 ${sorted[j].orderNo}，需调整开始/结束时间。`,
          orderNos: [sorted[i].orderNo, sorted[j].orderNo],
        })
      }
    }
  }
}

export function buildProductionScheduleBoard(jobs: ProductionScheduleJob[] = []): ProductionScheduleBoard {
  const rows = jobs
    .map(normalizeScheduleJob)
    .sort((left, right) => left.startTime.localeCompare(right.startTime) || left.orderNo.localeCompare(right.orderNo))
  const conflicts: ScheduleConflict[] = []

  for (const row of rows) {
    if (row.invalidTime) {
      addConflict(conflicts, rows, {
        type: 'INVALID_TIME',
        level: 'danger',
        resourceName: row.machineName,
        title: '排程时间无效',
        description: `${row.orderNo} 的开始时间或结束时间缺失/倒置，不能进入执行排程。`,
        orderNos: [row.orderNo],
      })
    }
    if (row.overdue) {
      addConflict(conflicts, rows, {
        type: 'DUE_DATE_RISK',
        level: 'warning',
        resourceName: row.machineName,
        title: '交期风险',
        description: `${row.orderNo} 计划完工 ${row.endTime} 晚于交期 ${row.dueTime}。`,
        orderNos: [row.orderNo],
      })
    }
  }

  detectResourceOverlaps(rows, 'machineId', 'machineName', 'MACHINE_OVERLAP', '机台', conflicts)
  detectResourceOverlaps(rows, 'moldId', 'moldCode', 'MOLD_OVERLAP', '模具', conflicts)

  return {
    rows,
    conflicts,
    summary: {
      jobCount: rows.length,
      machineCount: new Set(rows.filter((row) => row.machineId !== '-').map((row) => row.machineId)).size,
      moldCount: new Set(rows.filter((row) => row.moldId !== '-').map((row) => row.moldId)).size,
      conflictCount: conflicts.length,
      overdueCount: rows.filter((row) => row.overdue).length,
      invalidCount: rows.filter((row) => row.invalidTime).length,
    },
  }
}
