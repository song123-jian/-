export const SHIPPABLE_SALE_ORDER_STATUSES = ['APPROVED', 'CONFIRMED', 'PARTIAL'] as const
export const COLLECTABLE_SALE_ORDER_STATUSES = ['APPROVED', 'CONFIRMED', 'PARTIAL', 'SHIPPED'] as const

export type SaleOrderStatus = (typeof SHIPPABLE_SALE_ORDER_STATUSES)[number]

export type SaleOrderItemLike = {
  qty?: number | string | null
  deliveredQty?: number | string | null
  delivered_qty?: number | string | null
  unitPrice?: number | string | null
  unit_price?: number | string | null
}

export type SaleShipmentProductLike = {
  piecePrice?: number | string | null
  piece_price?: number | string | null
}

export type SaleShipmentStockRowLike = {
  id?: number | string | null
  productId?: number | string | null
  warehouseId?: number | string | null
  locationId?: number | string | null
  batchId?: number | string | null
  qty?: number | string | null
  lockedQty?: number | string | null
  availableQty?: number | string | null
  batchStatus?: string | null
  batchProductionDate?: string | null
  batchExpiryDate?: string | null
  updateTime?: string | null
  unitCost?: number | string | null
  stockUnitCost?: number | string | null
  inventoryAmount?: number | string | null
  stockAmount?: number | string | null
}

export type SaleShipmentInput = {
  moveNo?: string | null
  saleOrderId?: number | string | null
  relatedOrderId?: number | string | null
  relatedOrderType?: string | null
  saleOrderItemId?: number | string | null
  itemId?: number | string | null
  productId?: number | string | null
  warehouseId?: number | string | null
  batchId?: number | string | null
  locationId?: number | string | null
  qty?: number | string | null
  unitCost?: number | string | null
  amount?: number | string | null
  deliveryDate?: string | null
  deliveryStatus?: string | null
  logisticsCompany?: string | null
  trackingNo?: string | null
  remark?: string | null
  sourceStock?: SaleShipmentStockRowLike | null
  selectedBatch?: SaleShipmentStockRowLike | null
  suggestedBatch?: SaleShipmentStockRowLike | null
}

export function toSaleNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function toOptionalSaleId(value: unknown) {
  const id = Math.trunc(toSaleNumber(value))
  return id > 0 ? id : undefined
}

function hasSaleValue(value: unknown) {
  return value !== undefined && value !== null && value !== ''
}

function trimmedText(value: unknown) {
  return String(value ?? '').trim()
}

export function normalizeSaleStatus(value?: string | null) {
  return String(value || '').toUpperCase()
}

export function isSaleOrderShippable(value?: string | null) {
  return SHIPPABLE_SALE_ORDER_STATUSES.includes(normalizeSaleStatus(value) as SaleOrderStatus)
}

export function isSaleOrderCollectable(value?: string | null) {
  return COLLECTABLE_SALE_ORDER_STATUSES.includes(normalizeSaleStatus(value) as any)
}

export function roundSaleQty(value: unknown) {
  return Number(toSaleNumber(value).toFixed(2))
}

export function roundSaleMoney(value: unknown) {
  return Number(toSaleNumber(value).toFixed(2))
}

export function roundSaleUnitCost(value: unknown) {
  return Number(toSaleNumber(value).toFixed(4))
}

export function getSaleOrderItemQty(item?: SaleOrderItemLike | null) {
  return roundSaleQty(item?.qty)
}

export function getDeliveredSaleQty(item?: SaleOrderItemLike | null) {
  return roundSaleQty(item?.deliveredQty ?? item?.delivered_qty)
}

export function getRemainingSaleShipmentQty(item?: SaleOrderItemLike | null) {
  return Math.max(roundSaleQty(getSaleOrderItemQty(item) - getDeliveredSaleQty(item)), 0)
}

export function getSaleShipmentSaleAmount(qty: unknown, item?: SaleOrderItemLike | null) {
  return roundSaleMoney(toSaleNumber(qty) * toSaleNumber(item?.unitPrice ?? item?.unit_price))
}

export function normalizeSaleDateOnly(value?: string | null) {
  const text = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

export function getSaleShipmentStockAvailableQty(row?: SaleShipmentStockRowLike | null) {
  if (!row) return 0
  if (hasSaleValue(row.availableQty)) return Math.max(toSaleNumber(row.availableQty), 0)
  return Math.max(toSaleNumber(row.qty) - toSaleNumber(row.lockedQty), 0)
}

export function isSaleShipmentBatchUsable(row: SaleShipmentStockRowLike, today = normalizeSaleDateOnly(new Date().toISOString())) {
  if (getSaleShipmentStockAvailableQty(row) <= 0) return false
  const status = normalizeSaleStatus(row.batchStatus)
  if (['DEPLETED', 'EXPIRED', 'LOCKED', 'DISABLED'].includes(status)) return false
  const expiryDate = normalizeSaleDateOnly(row.batchExpiryDate)
  if (expiryDate && today && expiryDate < today) return false
  return true
}

export function saleShipmentBatchSortKey(row: SaleShipmentStockRowLike) {
  return [
    normalizeSaleDateOnly(row.batchExpiryDate) || '9999-12-31',
    normalizeSaleDateOnly(row.batchProductionDate) || '9999-12-31',
    String(row.updateTime || ''),
    String(row.id || '').padStart(12, '0'),
  ].join('|')
}

export function getSaleShipmentBatchCandidates(
  rows: SaleShipmentStockRowLike[],
  productId?: number | string | null,
  warehouseId?: number | string | null,
  today?: string
) {
  const productKey = Number(productId || 0)
  const warehouseKey = Number(warehouseId || 0)
  if (!productKey || !warehouseKey) return []
  return rows
    .filter((item) => Number(item.productId) === productKey && Number(item.warehouseId) === warehouseKey)
    .filter((item) => isSaleShipmentBatchUsable(item, today))
    .sort((a, b) => saleShipmentBatchSortKey(a).localeCompare(saleShipmentBatchSortKey(b)))
}

export function getSuggestedSaleShipmentBatch(rows: SaleShipmentStockRowLike[], qty: number | string | null | undefined) {
  const requiredQty = toSaleNumber(qty)
  return rows.find((item) => getSaleShipmentStockAvailableQty(item) >= requiredQty) || rows[0] || null
}

export function getMaxSingleSaleShipmentBatchQty(rows: SaleShipmentStockRowLike[]) {
  return rows.reduce((max, item) => Math.max(max, getSaleShipmentStockAvailableQty(item)), 0)
}

export function getSaleShipmentStockOptionValue(row?: SaleShipmentStockRowLike | null) {
  if (!row) return ''
  return `${toOptionalSaleId(row.id) || 0}-${toOptionalSaleId(row.batchId) || 0}-${toOptionalSaleId(row.locationId) || 0}`
}

export function getSelectedSaleShipmentBatch(rows: SaleShipmentStockRowLike[], sourceStockId?: string | number | null) {
  const key = String(sourceStockId ?? '')
  if (!key) return null
  return rows.find((item) => getSaleShipmentStockOptionValue(item) === key) || null
}

export function getSaleShipmentUnitCost(
  row?: SaleShipmentStockRowLike | null,
  product?: SaleShipmentProductLike | null
) {
  const directCost = toSaleNumber(row?.unitCost ?? row?.stockUnitCost)
  if (directCost > 0) return roundSaleUnitCost(directCost)
  const rowQty = toSaleNumber(row?.availableQty)
  const rowAmount = toSaleNumber(row?.inventoryAmount ?? row?.stockAmount)
  if (rowQty > 0 && rowAmount > 0) return roundSaleUnitCost(rowAmount / rowQty)
  return roundSaleUnitCost(product?.piecePrice ?? product?.piece_price)
}

export function getSaleShipmentCostAmount(qty: unknown, unitCost: unknown) {
  return roundSaleMoney(toSaleNumber(qty) * toSaleNumber(unitCost))
}

export function validateSaleShipmentInput(input: SaleShipmentInput, stockRows?: SaleShipmentStockRowLike[]) {
  const saleOrderId = toOptionalSaleId(input.relatedOrderId ?? input.saleOrderId)
  const saleOrderItemId = toOptionalSaleId(input.saleOrderItemId ?? input.itemId)
  const productId = toOptionalSaleId(input.productId)
  const warehouseId = toOptionalSaleId(input.warehouseId)
  const qty = toSaleNumber(input.qty)
  const integerQty = Math.trunc(qty)

  if (!saleOrderId) return '请选择销售订单'
  if (!saleOrderItemId) return '请选择订单产品'
  if (!productId) return '请选择产品'
  if (!warehouseId) return '请选择出库仓库'
  if (!Number.isInteger(qty) || integerQty <= 0) return '出库数量必须是大于 0 的整数'

  if (Array.isArray(stockRows)) {
    const candidates = stockRows || []
    if (!candidates.length) return '当前产品在出库仓库无可用库存'
    const totalAvailable = candidates.reduce((sum, row) => sum + getSaleShipmentStockAvailableQty(row), 0)
    if (integerQty > totalAvailable) return '出库数量不能超过可用库存'
    const sourceStock = input.sourceStock || input.selectedBatch || input.suggestedBatch || getSuggestedSaleShipmentBatch(candidates, integerQty)
    if (!sourceStock || integerQty > getSaleShipmentStockAvailableQty(sourceStock)) {
      return '单批次或库位可用库存不足，请拆分出库'
    }
  }
  return ''
}

export function buildSaleShipmentPayload(input: SaleShipmentInput, stockRows?: SaleShipmentStockRowLike[]) {
  const candidates = Array.isArray(stockRows) ? stockRows : []
  const qty = Math.trunc(toSaleNumber(input.qty))
  const sourceStock = input.sourceStock || input.selectedBatch || input.suggestedBatch || getSuggestedSaleShipmentBatch(candidates, qty) || null
  const message = validateSaleShipmentInput({ ...input, sourceStock }, stockRows)
  if (message) throw new Error(message)

  const unitCost = roundSaleUnitCost(hasSaleValue(input.unitCost) ? input.unitCost : getSaleShipmentUnitCost(sourceStock))
  const amount = hasSaleValue(input.amount) ? roundSaleMoney(input.amount) : getSaleShipmentCostAmount(qty, unitCost)
  const batchId = toOptionalSaleId(input.batchId ?? sourceStock?.batchId)
  const locationId = toOptionalSaleId(input.locationId ?? sourceStock?.locationId)
  const relatedOrderId = toOptionalSaleId(input.relatedOrderId ?? input.saleOrderId)!
  const saleOrderItemId = toOptionalSaleId(input.saleOrderItemId ?? input.itemId)!

  return {
    ...(trimmedText(input.moveNo) ? { moveNo: trimmedText(input.moveNo) } : {}),
    saleOrderItemId,
    productId: toOptionalSaleId(input.productId)!,
    warehouseId: toOptionalSaleId(input.warehouseId)!,
    qty,
    relatedOrderId,
    relatedOrderType: 'SALE_ORDER',
    ...(batchId ? { batchId } : {}),
    ...(locationId ? { locationId } : {}),
    ...(unitCost > 0 ? { unitCost, amount } : {}),
    ...(trimmedText(input.deliveryDate) ? { deliveryDate: trimmedText(input.deliveryDate) } : {}),
    ...(trimmedText(input.deliveryStatus) ? { deliveryStatus: trimmedText(input.deliveryStatus) } : {}),
    ...(trimmedText(input.logisticsCompany) ? { logisticsCompany: trimmedText(input.logisticsCompany) } : {}),
    ...(trimmedText(input.trackingNo) ? { trackingNo: trimmedText(input.trackingNo) } : {}),
    ...(trimmedText(input.remark) ? { remark: trimmedText(input.remark) } : {}),
  }
}
