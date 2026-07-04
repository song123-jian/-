export type MobileInventoryCheckInput = {
  warehouseId?: number | string | null
  locationId?: number | string | null
  productId?: number | string | null
  actualQuantity?: number | string | null
  reason?: string | null
}

export type MobileInventoryStockLike = {
  id?: number | string | null
  productId?: number | string | null
  product_id?: number | string | null
  warehouseId?: number | string | null
  warehouse_id?: number | string | null
  locationId?: number | string | null
  location_id?: number | string | null
  batchId?: number | string | null
  batch_id?: number | string | null
  productCode?: string | null
  productName?: string | null
  warehouseName?: string | null
  locationCode?: string | null
  batchNo?: string | null
  supplierCode?: string | null
  supplierName?: string | null
  qty?: number | string | null
  quantity?: number | string | null
  bookQty?: number | string | null
  lockedQty?: number | string | null
  locked_qty?: number | string | null
  availableQty?: number | string | null
  available_qty?: number | string | null
  unit?: string | null
}

export type InventoryStockSelection =
  | { row: MobileInventoryStockLike; error?: undefined }
  | { row?: undefined; error: string }

export function toInventoryNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function normalizeInventoryId(value: unknown) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : 0
}

export function normalizeInventoryQuantity(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  const num = Number(value)
  return Number.isFinite(num) ? num : Number.NaN
}

export function getInventoryProductId(row?: MobileInventoryStockLike | null) {
  return normalizeInventoryId(row?.productId ?? row?.product_id)
}

export function getInventoryWarehouseId(row?: MobileInventoryStockLike | null) {
  return normalizeInventoryId(row?.warehouseId ?? row?.warehouse_id)
}

export function getInventoryLocationId(row?: MobileInventoryStockLike | null) {
  return normalizeInventoryId(row?.locationId ?? row?.location_id)
}

export function getInventoryBookQty(row?: MobileInventoryStockLike | null) {
  return toInventoryNumber(row?.bookQty ?? row?.qty ?? row?.quantity)
}

export function getInventoryLockedQty(row?: MobileInventoryStockLike | null) {
  return toInventoryNumber(row?.lockedQty ?? row?.locked_qty)
}

export function getInventoryAvailableQty(row?: MobileInventoryStockLike | null) {
  const explicit = row?.availableQty ?? row?.available_qty
  if (explicit !== undefined && explicit !== null && explicit !== '') return toInventoryNumber(explicit)
  return getInventoryBookQty(row) - getInventoryLockedQty(row)
}

export function getInventoryDiffQty(input: MobileInventoryCheckInput, stock?: MobileInventoryStockLike | null) {
  const actualQty = normalizeInventoryQuantity(input.actualQuantity)
  if (actualQty === undefined || Number.isNaN(actualQty)) return 0
  return actualQty - getInventoryBookQty(stock)
}

export function formatInventoryQty(value: unknown, unit?: string | null) {
  const num = toInventoryNumber(value)
  const normalized = Number.isInteger(num) ? String(num) : String(Number(num.toFixed(2)))
  return `${normalized}${unit || ''}`
}

export function inventorySupplierText(row?: MobileInventoryStockLike | null) {
  const normalize = (value?: string | null) => {
    const text = String(value || '').trim()
    return text === '-' ? '' : text
  }
  const code = normalize(row?.supplierCode)
  const name = normalize(row?.supplierName)
  return [code, name].filter(Boolean).join(' - ') || '-'
}

export function inventoryTraceLabel(
  row?: MobileInventoryStockLike | null,
  fallback: { warehouseName?: string | null; locationCode?: string | null } = {}
) {
  const warehouse = String(row?.warehouseName || fallback.warehouseName || '-').trim() || '-'
  const location = String(row?.locationCode || fallback.locationCode || '-').trim() || '-'
  const batchNo = String(row?.batchNo || '').trim()
  const batch = batchNo && batchNo !== '-' ? `批次 ${batchNo}` : '无批次'
  const supplier = inventorySupplierText(row)
  const supplierText = supplier === '-' ? '供应商 -' : `供应商 ${supplier}`
  return `${warehouse} / ${location} · ${batch} · ${supplierText}`
}

function normalizeInventorySearchText(value?: string | number | null) {
  return String(value || '').trim().toLowerCase()
}

function matchesStockScope(input: MobileInventoryCheckInput, row: MobileInventoryStockLike) {
  const warehouseId = normalizeInventoryId(input.warehouseId)
  const locationId = normalizeInventoryId(input.locationId)
  if (warehouseId && getInventoryWarehouseId(row) !== warehouseId) return false
  if (locationId && getInventoryLocationId(row) !== locationId) return false
  return true
}

export function chooseInventoryStockRow(
  rows: MobileInventoryStockLike[],
  productText: string | number | null | undefined,
  input: MobileInventoryCheckInput = {}
): InventoryStockSelection {
  const scopedRows = rows.filter((row) => matchesStockScope(input, row))
  if (!scopedRows.length) return { error: '未查询到账面库存，不能提交盘点' }

  const keyword = normalizeInventorySearchText(productText ?? input.productId)
  const productId = normalizeInventoryId(productText ?? input.productId)
  const exactRows = scopedRows.filter((row) => {
    if (productId && getInventoryProductId(row) === productId) return true
    return normalizeInventorySearchText(row.productCode) === keyword
  })

  if (exactRows.length === 1) return { row: exactRows[0] }
  if (exactRows.length > 1) return { error: '当前产品库位存在多个批次，请在管理端按批次盘点' }
  if (scopedRows.length === 1) return { row: scopedRows[0] }
  return { error: '匹配到多个库存，请输入准确产品编码或产品ID' }
}

export function validateMobileInventoryCheckInput(
  input: MobileInventoryCheckInput,
  stock?: MobileInventoryStockLike | null,
  options: { requireStock?: boolean } = {}
) {
  if (!normalizeInventoryId(input.warehouseId)) return '请选择仓库'
  if (!normalizeInventoryId(input.locationId)) return '请选择库位'
  if (!normalizeInventoryId(input.productId)) return '请输入有效产品编号'

  const actualQty = normalizeInventoryQuantity(input.actualQuantity)
  if (actualQty === undefined) return '请输入实盘数量'
  if (!Number.isInteger(actualQty) || actualQty < 0) return '实盘数量必须是大于等于 0 的整数'

  if (options.requireStock && !stock) return '请先查询账面库存'
  if (stock) {
    if (getInventoryWarehouseId(stock) !== normalizeInventoryId(input.warehouseId)) return '账面库存与所选仓库不一致'
    if (getInventoryLocationId(stock) !== normalizeInventoryId(input.locationId)) return '账面库存与所选库位不一致'
    if (getInventoryProductId(stock) !== normalizeInventoryId(input.productId)) return '账面库存与产品编号不一致'
    if (getInventoryDiffQty(input, stock) !== 0 && !String(input.reason || '').trim()) return '存在盘点差异时必须填写原因'
  }

  return ''
}

export function getInventorySubmitBlockedText(input: MobileInventoryCheckInput, stock?: MobileInventoryStockLike | null) {
  return validateMobileInventoryCheckInput(input, stock, { requireStock: true })
}

export function buildMobileInventoryCheckPayload(input: MobileInventoryCheckInput, stock: MobileInventoryStockLike) {
  const normalizedInput = {
    ...input,
    productId: getInventoryProductId(stock),
  }
  const validationMessage = validateMobileInventoryCheckInput(normalizedInput, stock, { requireStock: true })
  if (validationMessage) throw new Error(validationMessage)
  const actualQuantity = normalizeInventoryQuantity(input.actualQuantity) as number
  const payload = {
    warehouseId: normalizeInventoryId(input.warehouseId),
    locationId: normalizeInventoryId(input.locationId),
    productId: getInventoryProductId(stock),
    actualQuantity,
    bookQty: getInventoryBookQty(stock),
    diffQty: getInventoryDiffQty(input, stock),
    batchId: normalizeInventoryId(stock.batchId ?? stock.batch_id) || undefined,
    reason: String(input.reason || '').trim() || undefined,
  }
  return payload
}
