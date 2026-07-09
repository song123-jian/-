export type StockQueryRiskLevel = 'success' | 'warning' | 'danger'

export type StockQueryRowLike = {
  qty?: number | string | null
  lockedQty?: number | string | null
  locked_qty?: number | string | null
  availableQty?: number | string | null
  available_qty?: number | string | null
  safeStock?: number | string | null
  safe_stock?: number | string | null
  batchStatus?: string | null
  batch_status?: string | null
  batchExpiryDate?: string | Date | null
  batch_expiry_date?: string | Date | null
  inventoryAmount?: number | string | null
  inventory_amount?: number | string | null
}

export type StockQuerySummary = {
  recordCount: number
  totalQty: number
  lockedQty: number
  availableQty: number
  inventoryAmount: number
  dangerCount: number
  warningCount: number
  lowStockCount: number
  expiredCount: number
  lockedAnomalyCount: number
  noAvailableCount: number
}

export function toStockQueryNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function normalizeStockQueryStatus(value?: string | null) {
  return String(value || '').trim().toUpperCase()
}

export function normalizeStockQueryDateOnly(value?: string | Date | null) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${value.getFullYear()}-${month}-${day}`
  }
  const text = String(value || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  return Number.isNaN(new Date(`${text}T00:00:00`).getTime()) ? '' : text
}

export function getStockQueryQty(row?: StockQueryRowLike | null) {
  return toStockQueryNumber(row?.qty)
}

export function getStockQueryLockedQty(row?: StockQueryRowLike | null) {
  return toStockQueryNumber(row?.lockedQty ?? row?.locked_qty)
}

export function getStockQueryAvailableQty(row?: StockQueryRowLike | null) {
  const explicit = row?.availableQty ?? row?.available_qty
  if (explicit !== undefined && explicit !== null && explicit !== '') return toStockQueryNumber(explicit)
  return getStockQueryQty(row) - getStockQueryLockedQty(row)
}

export function getStockQuerySafeQty(row?: StockQueryRowLike | null) {
  return toStockQueryNumber(row?.safeStock ?? row?.safe_stock)
}

export function getStockQueryInventoryAmount(row?: StockQueryRowLike | null) {
  return toStockQueryNumber(row?.inventoryAmount ?? row?.inventory_amount)
}

export function getStockQueryRisk(row?: StockQueryRowLike | null, today = normalizeStockQueryDateOnly(new Date())) {
  const qty = getStockQueryQty(row)
  const lockedQty = getStockQueryLockedQty(row)
  const availableQty = getStockQueryAvailableQty(row)
  const safeStock = getStockQuerySafeQty(row)
  const batchStatus = normalizeStockQueryStatus(row?.batchStatus ?? row?.batch_status)
  const expiryDate = normalizeStockQueryDateOnly(row?.batchExpiryDate ?? row?.batch_expiry_date)

  if (lockedQty > qty) return { level: 'danger' as StockQueryRiskLevel, text: '锁定异常' }
  if (['LOCKED', 'DISABLED'].includes(batchStatus)) {
    return { level: 'danger' as StockQueryRiskLevel, text: '批次受限' }
  }
  if (['EXPIRED', 'DEPLETED'].includes(batchStatus)) {
    return { level: 'danger' as StockQueryRiskLevel, text: batchStatus === 'EXPIRED' ? '批次过期' : '批次耗尽' }
  }
  if (expiryDate && today && expiryDate < today) return { level: 'danger' as StockQueryRiskLevel, text: '批次过期' }
  if (availableQty <= 0) return { level: 'danger' as StockQueryRiskLevel, text: '无可用库存' }
  if (batchStatus === 'EXPIRING') return { level: 'warning' as StockQueryRiskLevel, text: '批次临期' }
  if (safeStock > 0 && availableQty < safeStock) {
    return { level: 'warning' as StockQueryRiskLevel, text: '低于安全库存' }
  }
  return { level: 'success' as StockQueryRiskLevel, text: '正常' }
}

export function getStockQueryRiskTag(level?: StockQueryRiskLevel | string | null) {
  if (level === 'danger') return 'danger'
  if (level === 'warning') return 'warning'
  return 'success'
}

function roundQty(value: number) {
  return Number(value.toFixed(2))
}

function roundMoney(value: number) {
  return Number(value.toFixed(2))
}

export function summarizeStockQueryRows(rows: StockQueryRowLike[] = [], today?: string | Date | null): StockQuerySummary {
  const normalizedToday = normalizeStockQueryDateOnly(today || new Date())
  return rows.reduce(
    (summary, row) => {
      const qty = getStockQueryQty(row)
      const lockedQty = getStockQueryLockedQty(row)
      const availableQty = getStockQueryAvailableQty(row)
      const safeStock = getStockQuerySafeQty(row)
      const risk = getStockQueryRisk(row, normalizedToday)
      const batchStatus = normalizeStockQueryStatus(row.batchStatus ?? row.batch_status)

      summary.recordCount += 1
      summary.totalQty = roundQty(summary.totalQty + qty)
      summary.lockedQty = roundQty(summary.lockedQty + lockedQty)
      summary.availableQty = roundQty(summary.availableQty + availableQty)
      summary.inventoryAmount = roundMoney(summary.inventoryAmount + getStockQueryInventoryAmount(row))
      if (risk.level === 'danger') summary.dangerCount += 1
      if (risk.level === 'warning') summary.warningCount += 1
      if (safeStock > 0 && availableQty < safeStock) summary.lowStockCount += 1
      if (risk.text === '批次过期' || batchStatus === 'EXPIRED') summary.expiredCount += 1
      if (lockedQty > qty) summary.lockedAnomalyCount += 1
      if (availableQty <= 0) summary.noAvailableCount += 1
      return summary
    },
    {
      recordCount: 0,
      totalQty: 0,
      lockedQty: 0,
      availableQty: 0,
      inventoryAmount: 0,
      dangerCount: 0,
      warningCount: 0,
      lowStockCount: 0,
      expiredCount: 0,
      lockedAnomalyCount: 0,
      noAvailableCount: 0,
    } as StockQuerySummary
  )
}
