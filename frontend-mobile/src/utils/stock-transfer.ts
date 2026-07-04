export type StockTransferItemLike = {
  id?: number | string | null
  productCode?: string | null
  productName?: string | null
  fromLocationCode?: string | null
  toLocationCode?: string | null
  batchNo?: string | null
  supplierCode?: string | null
  supplierName?: string | null
  unit?: string | null
  qty?: number | string | null
  receivedQty?: number | string | null
  received_qty?: number | string | null
}

export type StockTransferLike = {
  id?: number | string | null
  status?: string | null
  receiveTime?: string | null
  receive_time?: string | null
  items?: StockTransferItemLike[] | null
}

export function toTransferNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function normalizeStockTransferStatus(value?: string | null) {
  return String(value || '').trim().toUpperCase()
}

export function getStockTransferStatusText(value?: string | null) {
  const status = normalizeStockTransferStatus(value)
  const statusMap: Record<string, string> = {
    DRAFT: '草稿',
    CONFIRMED: '已确认',
    SHIPPED: '已发出',
    RECEIVED: '已收货',
    CANCELLED: '已取消',
    REJECTED: '已驳回',
  }
  return statusMap[status] || value || '-'
}

export function isStockTransferReceivable(value?: string | null) {
  return normalizeStockTransferStatus(value) === 'SHIPPED'
}

export function getTransferItemQty(item?: StockTransferItemLike | null) {
  return Math.max(toTransferNumber(item?.qty), 0)
}

export function getTransferItemReceivedQty(item?: StockTransferItemLike | null) {
  return Math.max(toTransferNumber(item?.receivedQty ?? item?.received_qty), 0)
}

export function getTransferItemRemainingQty(item?: StockTransferItemLike | null) {
  return Math.max(getTransferItemQty(item) - getTransferItemReceivedQty(item), 0)
}

export function getTransferTotalQty(items?: StockTransferItemLike[] | null) {
  return (items || []).reduce((sum, item) => sum + getTransferItemQty(item), 0)
}

export function getTransferReceivedQty(items?: StockTransferItemLike[] | null) {
  return (items || []).reduce((sum, item) => sum + getTransferItemReceivedQty(item), 0)
}

export function getTransferRemainingQty(items?: StockTransferItemLike[] | null) {
  return (items || []).reduce((sum, item) => sum + getTransferItemRemainingQty(item), 0)
}

function normalizeTraceText(value?: string | number | null) {
  const text = String(value || '').trim()
  return text === '-' ? '' : text
}

export function transferSupplierText(item?: StockTransferItemLike | null) {
  const code = normalizeTraceText(item?.supplierCode)
  const name = normalizeTraceText(item?.supplierName)
  return [code, name].filter(Boolean).join(' - ') || '-'
}

export function transferItemTraceLabel(item?: StockTransferItemLike | null) {
  const fromLocation = normalizeTraceText(item?.fromLocationCode) || '-'
  const toLocation = normalizeTraceText(item?.toLocationCode) || '-'
  const batchNo = normalizeTraceText(item?.batchNo)
  const batch = batchNo ? `批次 ${batchNo}` : '无批次'
  const supplier = transferSupplierText(item)
  const supplierText = supplier === '-' ? '供应商 -' : `供应商 ${supplier}`
  const remaining = getTransferItemRemainingQty(item)
  return `${fromLocation} → ${toLocation} · ${batch} · ${supplierText} · 待收 ${remaining}${item?.unit || ''}`
}

export function validateStockTransferReceive(transfer?: StockTransferLike | null) {
  if (!transfer?.id) return '请选择调拨单'
  const status = normalizeStockTransferStatus(transfer.status)
  if (status === 'RECEIVED') return '调拨单已收货，不能重复确认'
  if (!isStockTransferReceivable(status)) return '仅已发出调拨单允许确认收货'

  const items = transfer.items || []
  if (!items.length) return '调拨单缺少明细，不能确认收货'
  if (items.some((item) => getTransferItemQty(item) <= 0)) return '调拨明细数量必须大于 0'
  if (items.some((item) => getTransferItemReceivedQty(item) > getTransferItemQty(item))) {
    return '已收数量不能大于调拨数量'
  }
  if (getTransferRemainingQty(items) <= 0) return '调拨单明细已全部收货，不能重复确认'
  return ''
}
