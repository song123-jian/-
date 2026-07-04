export type MobileStockRowLike = {
  qty?: number | string | null
  lockedQty?: number | string | null
  locked_qty?: number | string | null
  availableQty?: number | string | null
  available_qty?: number | string | null
  safeStock?: number | string | null
  safe_stock?: number | string | null
  batchStatus?: string | null
  batch_status?: string | null
  batchExpiryDate?: string | null
  batch_expiry_date?: string | null
  productName?: string | null
  productCode?: string | null
  warehouseName?: string | null
  locationCode?: string | null
  batchNo?: string | null
  supplierCode?: string | null
  supplierName?: string | null
  unit?: string | null
}

export type StockRiskLevel = 'success' | 'warning' | 'danger'

export function toStockQueryNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function normalizeStockQueryStatus(value?: string | null) {
  return String(value || '').trim().toUpperCase()
}

export function normalizeStockDateOnly(value?: string | null) {
  const text = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  return Number.isNaN(new Date(`${text}T00:00:00`).getTime()) ? '' : text
}

export function getStockQty(row?: MobileStockRowLike | null) {
  return toStockQueryNumber(row?.qty)
}

export function getStockLockedQty(row?: MobileStockRowLike | null) {
  return toStockQueryNumber(row?.lockedQty ?? row?.locked_qty)
}

export function getStockAvailableQty(row?: MobileStockRowLike | null) {
  const explicit = row?.availableQty ?? row?.available_qty
  if (explicit !== undefined && explicit !== null && explicit !== '') return toStockQueryNumber(explicit)
  return getStockQty(row) - getStockLockedQty(row)
}

export function getStockSafeQty(row?: MobileStockRowLike | null) {
  return toStockQueryNumber(row?.safeStock ?? row?.safe_stock)
}

export function getStockRisk(row?: MobileStockRowLike | null, today = normalizeStockDateOnly(new Date().toISOString())) {
  const qty = getStockQty(row)
  const lockedQty = getStockLockedQty(row)
  const availableQty = getStockAvailableQty(row)
  const safeStock = getStockSafeQty(row)
  const batchStatus = normalizeStockQueryStatus(row?.batchStatus ?? row?.batch_status)
  const batchExpiryDate = normalizeStockDateOnly(row?.batchExpiryDate ?? row?.batch_expiry_date)

  if (lockedQty > qty) {
    return { level: 'danger' as StockRiskLevel, text: '锁定异常' }
  }
  if (['LOCKED', 'DISABLED', 'EXPIRED', 'DEPLETED'].includes(batchStatus)) {
    return { level: 'danger' as StockRiskLevel, text: batchStatus === 'EXPIRED' ? '批次过期' : '批次受限' }
  }
  if (batchExpiryDate && today && batchExpiryDate < today) {
    return { level: 'danger' as StockRiskLevel, text: '批次过期' }
  }
  if (availableQty <= 0) {
    return { level: 'danger' as StockRiskLevel, text: '无可用库存' }
  }
  if (batchStatus === 'EXPIRING') {
    return { level: 'warning' as StockRiskLevel, text: '批次临期' }
  }
  if (safeStock > 0 && availableQty < safeStock) {
    return { level: 'warning' as StockRiskLevel, text: '低于安全库存' }
  }
  return { level: 'success' as StockRiskLevel, text: '正常' }
}

export function formatStockQty(value: unknown, unit?: string | null) {
  const num = toStockQueryNumber(value)
  const normalized = Number.isInteger(num) ? String(num) : String(Number(num.toFixed(2)))
  return `${normalized}${unit || ''}`
}

export function formatStockQtyPair(row?: MobileStockRowLike | null) {
  const unit = row?.unit || ''
  return `${formatStockQty(getStockAvailableQty(row), unit)} / ${formatStockQty(getStockQty(row), unit)}`
}

export function stockSupplierText(row?: MobileStockRowLike | null) {
  const code = String(row?.supplierCode || '').trim()
  const name = String(row?.supplierName || '').trim()
  return [code, name].filter((item) => item && item !== '-').join(' - ') || '-'
}

export function stockTraceLabel(row?: MobileStockRowLike | null) {
  const batchNo = row?.batchNo && row.batchNo !== '-' ? `批次 ${row.batchNo}` : '无批次'
  const supplier = stockSupplierText(row)
  const supplierText = supplier === '-' ? '供应商 -' : `供应商 ${supplier}`
  return `${batchNo} · ${supplierText}`
}

export function stockSearchText(row?: MobileStockRowLike | null) {
  return [
    row?.productCode,
    row?.productName,
    row?.warehouseName,
    row?.locationCode,
    row?.batchNo,
    row?.supplierCode,
    row?.supplierName,
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
