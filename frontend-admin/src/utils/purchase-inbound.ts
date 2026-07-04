export type PurchaseInboundLike = {
  supplierId?: number | string | null
  supplier_id?: number | string | null
  productId?: number | string | null
  product_id?: number | string | null
  warehouseId?: number | string | null
  warehouse_id?: number | string | null
  qty?: number | string | null
  quantity?: number | string | null
  unitCost?: number | string | null
  unit_cost?: number | string | null
  purchaseUnitPrice?: number | string | null
  purchase_unit_price?: number | string | null
  amount?: number | string | null
  purchaseAmount?: number | string | null
  purchase_amount?: number | string | null
  inDate?: string | null
  in_date?: string | null
  operateTime?: string | null
  operate_time?: string | null
  batchId?: number | string | null
  batch_id?: number | string | null
  batchNo?: string | null
  batch_no?: string | null
  productionDate?: string | null
  production_date?: string | null
  expiryDate?: string | null
  expiry_date?: string | null
  remark?: string | null
}

export type PurchaseInboundPayload = {
  supplierId: number
  productId: number
  warehouseId: number
  qty: number
  unitCost: number
  amount: number
  inDate: string
  batchId?: number
  batchNo?: string
  productionDate?: string
  expiryDate?: string
  remark?: string
}

function toNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

export function normalizePurchaseDate(value?: string | null) {
  const text = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  const [year, month, day] = text.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return ''
  return text
}

export function todayPurchaseDate(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function roundPurchaseQty(value: unknown) {
  return Math.trunc(toNumber(value))
}

export function roundPurchaseUnitCost(value: unknown) {
  return Number(toNumber(value).toFixed(4))
}

export function roundPurchaseMoney(value: unknown) {
  return Number(toNumber(value).toFixed(2))
}

export function getPurchaseInboundQty(input?: PurchaseInboundLike | null) {
  return roundPurchaseQty(input?.qty ?? input?.quantity)
}

export function getPurchaseInboundUnitCost(input?: PurchaseInboundLike | null) {
  return roundPurchaseUnitCost(input?.unitCost ?? input?.unit_cost ?? input?.purchaseUnitPrice ?? input?.purchase_unit_price)
}

export function getPurchaseInboundAmount(input?: PurchaseInboundLike | null) {
  const explicitAmount = input?.amount ?? input?.purchaseAmount ?? input?.purchase_amount
  if (hasValue(explicitAmount)) return roundPurchaseMoney(explicitAmount)
  return roundPurchaseMoney(getPurchaseInboundQty(input) * getPurchaseInboundUnitCost(input))
}

export function validatePurchaseInboundInput(input?: PurchaseInboundLike | null, today = todayPurchaseDate()) {
  const supplierId = Math.trunc(toNumber(input?.supplierId ?? input?.supplier_id))
  if (!supplierId) return '请选择供应商'
  const productId = Math.trunc(toNumber(input?.productId ?? input?.product_id))
  if (!productId) return '请选择入库物料'
  const warehouseId = Math.trunc(toNumber(input?.warehouseId ?? input?.warehouse_id))
  if (!warehouseId) return '请选择入库仓库'

  const rawQty = toNumber(input?.qty ?? input?.quantity)
  if (!Number.isInteger(rawQty) || rawQty <= 0) return '入库数量必须是大于 0 的整数'
  const rawUnitCost = toNumber(input?.unitCost ?? input?.unit_cost ?? input?.purchaseUnitPrice ?? input?.purchase_unit_price)
  if (!Number.isFinite(rawUnitCost) || rawUnitCost <= 0) return '采购单价必须大于 0'

  const inDate = normalizePurchaseDate(input?.inDate ?? input?.in_date ?? input?.operateTime ?? input?.operate_time)
  const rawInDate = String(input?.inDate ?? input?.in_date ?? input?.operateTime ?? input?.operate_time ?? '').trim()
  if (!inDate) return rawInDate ? '入库日期格式不正确' : '请选择入库日期'
  if (today && inDate > today) return '入库日期不能晚于今天'

  const productionDate = normalizePurchaseDate(input?.productionDate ?? input?.production_date)
  const rawProductionDate = String(input?.productionDate ?? input?.production_date ?? '').trim()
  if (rawProductionDate && !productionDate) return '生产日期格式不正确'

  const expiryDate = normalizePurchaseDate(input?.expiryDate ?? input?.expiry_date)
  const rawExpiryDate = String(input?.expiryDate ?? input?.expiry_date ?? '').trim()
  if (rawExpiryDate && !expiryDate) return '有效期格式不正确'

  if (productionDate && productionDate > inDate) return '生产日期不能晚于入库日期'
  if (expiryDate && expiryDate < inDate) return '有效期不能早于入库日期'
  if (productionDate && expiryDate && productionDate > expiryDate) return '生产日期不能晚于有效期'
  return ''
}

export function buildPurchaseInboundPayload(input: PurchaseInboundLike, today = todayPurchaseDate()): PurchaseInboundPayload {
  const message = validatePurchaseInboundInput(input, today)
  if (message) throw new Error(message)
  const batchId = Math.trunc(toNumber(input.batchId ?? input.batch_id))
  const batchNo = String(input.batchNo ?? input.batch_no ?? '').trim()
  const productionDate = normalizePurchaseDate(input.productionDate ?? input.production_date)
  const expiryDate = normalizePurchaseDate(input.expiryDate ?? input.expiry_date)
  const remark = String(input.remark || '').trim()
  return {
    supplierId: Math.trunc(toNumber(input.supplierId ?? input.supplier_id)),
    productId: Math.trunc(toNumber(input.productId ?? input.product_id)),
    warehouseId: Math.trunc(toNumber(input.warehouseId ?? input.warehouse_id)),
    qty: getPurchaseInboundQty(input),
    unitCost: getPurchaseInboundUnitCost(input),
    amount: getPurchaseInboundAmount(input),
    inDate: normalizePurchaseDate(input.inDate ?? input.in_date ?? input.operateTime ?? input.operate_time),
    ...(batchId > 0 ? { batchId } : {}),
    ...(batchNo ? { batchNo } : {}),
    ...(productionDate ? { productionDate } : {}),
    ...(expiryDate ? { expiryDate } : {}),
    ...(remark ? { remark } : {}),
  }
}

export function isPurchaseInboundSupplierEnabled(item?: { status?: number | string | null } | null) {
  return !item || item.status === undefined || item.status === null || Number(item.status) === 1
}

export function isPurchaseInboundWarehouseEnabled(item?: { isEnabled?: number | string | null; is_enabled?: number | string | null } | null) {
  const value = item?.isEnabled ?? item?.is_enabled
  return !item || value === undefined || value === null || Number(value) === 1
}

export function isPurchaseInboundMaterial(item?: { type?: string | null } | null) {
  const type = String(item?.type || '').toUpperCase()
  return !type || ['RAW', 'MATERIAL', 'SEMI'].includes(type)
}
