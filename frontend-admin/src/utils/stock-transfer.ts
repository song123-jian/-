export type StockTransferStockRowLike = {
  id?: number | string | null
  productId?: number | string | null
  warehouseId?: number | string | null
  locationId?: number | string | null
  batchId?: number | string | null
  qty?: number | string | null
  lockedQty?: number | string | null
  availableQty?: number | string | null
  unitCost?: number | string | null
  stockUnitCost?: number | string | null
  batchNo?: string | null
  batchStatus?: string | null
  batchExpiryDate?: string | null
}

export type StockTransferOptionLike = {
  id?: number | string | null
  isEnabled?: number | string | null
  status?: number | string | null
}

export type StockTransferInput = {
  moveNo?: string | null
  productId?: number | string | null
  warehouseId?: number | string | null
  toWarehouseId?: number | string | null
  locationId?: number | string | null
  batchId?: number | string | null
  toLocationId?: number | string | null
  toBatchId?: number | string | null
  qty?: number | string | null
  unitCost?: number | string | null
  amount?: number | string | null
  remark?: string | null
  sourceStock?: StockTransferStockRowLike | null
}

export function toStockTransferNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function toOptionalId(value: unknown) {
  const id = Math.trunc(toStockTransferNumber(value))
  return id > 0 ? id : undefined
}

function normalizeStatus(value: unknown) {
  return String(value ?? '').trim().toUpperCase()
}

function roundUnitCost(value: unknown) {
  return Number(toStockTransferNumber(value).toFixed(4))
}

function roundMoney(value: unknown) {
  return Number(toStockTransferNumber(value).toFixed(2))
}

function normalizeDateText(value: unknown) {
  const text = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

export function isTransferWarehouseEnabled(item?: StockTransferOptionLike | null) {
  if (!toOptionalId(item?.id)) return false
  if (item?.isEnabled === undefined || item?.isEnabled === null || item?.isEnabled === '') return true
  return Number(item.isEnabled) === 1
}

export function isTransferProductEnabled(item?: StockTransferOptionLike | null) {
  if (!toOptionalId(item?.id)) return false
  const status = normalizeStatus(item?.status)
  if (!status) return true
  return !['0', 'DISABLED', 'INACTIVE', 'STOPPED'].includes(status)
}

export function getTransferStockAvailableQty(row?: StockTransferStockRowLike | null) {
  if (!row) return 0
  if (row.availableQty !== undefined && row.availableQty !== null && row.availableQty !== '') {
    return Math.max(toStockTransferNumber(row.availableQty), 0)
  }
  return Math.max(toStockTransferNumber(row.qty) - toStockTransferNumber(row.lockedQty), 0)
}

export function getTransferStockUnitCost(row?: StockTransferStockRowLike | null) {
  const unitCost = toStockTransferNumber(row?.unitCost ?? row?.stockUnitCost)
  return unitCost > 0 ? roundUnitCost(unitCost) : 0
}

export function getTransferAmount(qty: unknown, unitCost: unknown) {
  return roundMoney(toStockTransferNumber(qty) * toStockTransferNumber(unitCost))
}

export function isTransferStockUsable(row?: StockTransferStockRowLike | null) {
  if (!row) return false
  const status = normalizeStatus(row.batchStatus)
  if (['DEPLETED', 'EXPIRED', 'LOCKED', 'DISABLED'].includes(status)) return false
  return getTransferStockAvailableQty(row) > 0
}

export function getTransferStockCandidates(
  rows: StockTransferStockRowLike[],
  productId?: number | string | null,
  warehouseId?: number | string | null,
) {
  const nextProductId = toOptionalId(productId)
  const nextWarehouseId = toOptionalId(warehouseId)
  if (!nextProductId || !nextWarehouseId) return []
  return (rows || [])
    .filter((row) =>
      Number(row.productId) === nextProductId &&
      Number(row.warehouseId) === nextWarehouseId &&
      isTransferStockUsable(row)
    )
    .sort((left, right) => {
      const leftDate = normalizeDateText(left.batchExpiryDate) || '9999-12-31'
      const rightDate = normalizeDateText(right.batchExpiryDate) || '9999-12-31'
      if (leftDate !== rightDate) return leftDate.localeCompare(rightDate)
      const leftBatch = String(left.batchNo || '')
      const rightBatch = String(right.batchNo || '')
      if (leftBatch !== rightBatch) return leftBatch.localeCompare(rightBatch)
      return toStockTransferNumber(left.id) - toStockTransferNumber(right.id)
    })
}

export function getTransferAvailableQty(rows: StockTransferStockRowLike[]) {
  return (rows || []).reduce((sum, row) => sum + getTransferStockAvailableQty(row), 0)
}

export function getMaxSingleTransferQty(rows: StockTransferStockRowLike[]) {
  return (rows || []).reduce((max, row) => Math.max(max, getTransferStockAvailableQty(row)), 0)
}

export function getSuggestedTransferStock(rows: StockTransferStockRowLike[], qty?: number | string | null) {
  const nextQty = Math.max(Math.trunc(toStockTransferNumber(qty)), 0)
  if (nextQty <= 0) return rows[0] || null
  return rows.find((row) => getTransferStockAvailableQty(row) >= nextQty) || null
}

export function validateStockTransferInput(input: StockTransferInput, stockRows?: StockTransferStockRowLike[]) {
  const productId = toOptionalId(input.productId)
  const warehouseId = toOptionalId(input.warehouseId)
  const toWarehouseId = toOptionalId(input.toWarehouseId)
  const qty = toStockTransferNumber(input.qty)
  const integerQty = Math.trunc(qty)

  if (!productId) return '请选择产品'
  if (!warehouseId) return '请选择调出仓库'
  if (!toWarehouseId) return '请选择调入仓库'
  if (warehouseId === toWarehouseId) return '调入仓库不能与调出仓库相同'
  if (!Number.isInteger(qty) || integerQty <= 0) return '调拨数量必须是大于 0 的整数'

  const shouldValidateStock = Array.isArray(stockRows)
  const candidates = shouldValidateStock ? stockRows || [] : []
  if (shouldValidateStock) {
    if (!candidates.length) return '当前产品在调出仓库无可用库存'
    if (integerQty > getTransferAvailableQty(candidates)) return '调拨数量不能超过可用库存'
    const selectedStock = input.sourceStock || getSuggestedTransferStock(candidates, integerQty)
    if (!selectedStock || integerQty > getTransferStockAvailableQty(selectedStock)) {
      return '单批次或库位可用库存不足，请拆分调拨'
    }
  }
  return ''
}

export function buildStockTransferPayload(input: StockTransferInput, stockRows?: StockTransferStockRowLike[]) {
  const candidates = Array.isArray(stockRows) ? stockRows : []
  const qty = Math.trunc(toStockTransferNumber(input.qty))
  const sourceStock = input.sourceStock || getSuggestedTransferStock(candidates, qty) || null
  const message = validateStockTransferInput({ ...input, sourceStock }, stockRows)
  if (message) throw new Error(message)

  const unitCost = roundUnitCost(input.unitCost ?? getTransferStockUnitCost(sourceStock))
  const amount = input.amount === undefined || input.amount === null || input.amount === ''
    ? getTransferAmount(qty, unitCost)
    : roundMoney(input.amount)
  const batchId = toOptionalId(input.batchId ?? sourceStock?.batchId)
  const locationId = toOptionalId(input.locationId ?? sourceStock?.locationId)
  const toBatchId = toOptionalId(input.toBatchId ?? batchId)

  return {
    ...(input.moveNo ? { moveNo: String(input.moveNo).trim() } : {}),
    productId: toOptionalId(input.productId)!,
    warehouseId: toOptionalId(input.warehouseId)!,
    toWarehouseId: toOptionalId(input.toWarehouseId)!,
    ...(locationId ? { locationId } : {}),
    ...(batchId ? { batchId } : {}),
    ...(toOptionalId(input.toLocationId) ? { toLocationId: toOptionalId(input.toLocationId) } : {}),
    ...(toBatchId ? { toBatchId } : {}),
    qty,
    ...(unitCost > 0 ? { unitCost, amount } : {}),
    relatedOrderType: 'STOCK_TRANSFER',
    ...(String(input.remark || '').trim() ? { remark: String(input.remark || '').trim() } : {}),
  }
}
