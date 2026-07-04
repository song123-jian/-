export const PICKING_ORDER_STATUSES = ['SCHEDULED', 'RUNNING', 'PAUSED'] as const

export type PickingOrderStatus = (typeof PICKING_ORDER_STATUSES)[number]

export type PickingOrderLike = {
  planQty?: number | string | null
  plan_qty?: number | string | null
  rawMaterialQty?: number | string | null
  raw_material_qty?: number | string | null
  pickedMaterialQty?: number | string | null
  picked_material_qty?: number | string | null
  pickedMaterialAmount?: number | string | null
  picked_material_amount?: number | string | null
  status?: string | null
}

export type PickingProductLike = {
  rawMaterialUsage?: number | string | null
  raw_material_usage?: number | string | null
}

export type PickingStockRowLike = {
  id?: number | string | null
  productId?: number | string | null
  warehouseId?: number | string | null
  locationId?: number | string | null
  batchId?: number | string | null
  availableQty?: number | string | null
  batchStatus?: string | null
  batchProductionDate?: string | null
  batchExpiryDate?: string | null
  updateTime?: string | null
}

export function toPickingNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function normalizePickingStatus(value?: string | null) {
  return String(value || '').toUpperCase()
}

export function isPickingOrderStatus(value?: string | null) {
  return PICKING_ORDER_STATUSES.includes(normalizePickingStatus(value) as PickingOrderStatus)
}

export function roundPickingQty(value: unknown) {
  return Number(toPickingNumber(value).toFixed(2))
}

export function getPlannedMaterialQty(order?: PickingOrderLike | null, finishedProduct?: PickingProductLike | null) {
  const explicitQty = toPickingNumber(order?.rawMaterialQty ?? order?.raw_material_qty)
  if (explicitQty > 0) return roundPickingQty(explicitQty)
  const planQty = toPickingNumber(order?.planQty ?? order?.plan_qty)
  const rawMaterialUsage = toPickingNumber(finishedProduct?.rawMaterialUsage ?? finishedProduct?.raw_material_usage)
  return rawMaterialUsage > 0 ? roundPickingQty(planQty * rawMaterialUsage) : 0
}

export function getPickedMaterialQty(order?: PickingOrderLike | null) {
  return roundPickingQty(order?.pickedMaterialQty ?? order?.picked_material_qty)
}

export function getPickedMaterialAmount(order?: PickingOrderLike | null) {
  return Number(toPickingNumber(order?.pickedMaterialAmount ?? order?.picked_material_amount).toFixed(2))
}

export function getRemainingMaterialQty(order?: PickingOrderLike | null, finishedProduct?: PickingProductLike | null) {
  const plannedQty = getPlannedMaterialQty(order, finishedProduct)
  if (plannedQty <= 0) return 0
  return Math.max(roundPickingQty(plannedQty - getPickedMaterialQty(order)), 0)
}

export function normalizeDateOnly(value?: string | null) {
  const text = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

export function isPickingBatchUsable(row: PickingStockRowLike, today = normalizeDateOnly(new Date().toISOString())) {
  if (toPickingNumber(row.availableQty) <= 0) return false
  const status = normalizePickingStatus(row.batchStatus)
  if (['DEPLETED', 'EXPIRED', 'LOCKED', 'DISABLED'].includes(status)) return false
  const expiryDate = normalizeDateOnly(row.batchExpiryDate)
  if (expiryDate && today && expiryDate < today) return false
  return true
}

export function pickingBatchSortKey(row: PickingStockRowLike) {
  return [
    normalizeDateOnly(row.batchExpiryDate) || '9999-12-31',
    normalizeDateOnly(row.batchProductionDate) || '9999-12-31',
    String(row.updateTime || ''),
    String(row.id || '').padStart(12, '0'),
  ].join('|')
}

export function getPickingBatchCandidates(
  rows: PickingStockRowLike[],
  productId?: number | string | null,
  warehouseId?: number | string | null,
  today?: string
) {
  const productKey = Number(productId || 0)
  const warehouseKey = Number(warehouseId || 0)
  if (!productKey || !warehouseKey) return []
  return rows
    .filter((item) => Number(item.productId) === productKey && Number(item.warehouseId) === warehouseKey)
    .filter((item) => isPickingBatchUsable(item, today))
    .sort((a, b) => pickingBatchSortKey(a).localeCompare(pickingBatchSortKey(b)))
}

export function getSuggestedPickingBatch(rows: PickingStockRowLike[], qty: number | string | null | undefined) {
  const requiredQty = toPickingNumber(qty)
  return rows.find((item) => toPickingNumber(item.availableQty) >= requiredQty) || rows[0] || null
}

export function getMaxSingleBatchQty(rows: PickingStockRowLike[]) {
  return rows.reduce((max, item) => Math.max(max, toPickingNumber(item.availableQty)), 0)
}
