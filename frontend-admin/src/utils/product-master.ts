export const PRODUCT_TYPES = ['RAW', 'SEMI', 'FINISH'] as const
export type ProductType = (typeof PRODUCT_TYPES)[number]

export type ProductMasterRecord = {
  id: number
  code: string
  name: string
  type: ProductType
  spec: string
  unit: string
  piecePrice: number
  cavityYield: number
  cycleTimeSec: number
  safeStock: number
  weightG: number
  rawMaterialId: number | null
  rawMaterialUsage: number
  color: string
  customerId: number | null
  imageUrl: string
  status: string
}

export type ProductMasterSummary = {
  total: number
  raw: number
  semi: number
  finish: number
  enabled: number
  disabled: number
  withImage: number
  withSafeStock: number
  withProcessParams: number
  withMaterialRule: number
  dataRisks: number
}

function trimText(value: unknown) {
  return String(value ?? '').trim()
}

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function toInteger(value: unknown, fallback = 0) {
  return Math.trunc(toNumber(value, fallback))
}

function roundNumber(value: unknown, precision = 2) {
  const factor = 10 ** precision
  return Math.round(toNumber(value) * factor) / factor
}

function positiveId(value: unknown) {
  const id = toInteger(value)
  return id > 0 ? id : null
}

function clampText(value: unknown, maxLength: number) {
  return trimText(value).slice(0, maxLength)
}

function hasInputValue(value: unknown) {
  return value !== undefined && value !== null && trimText(value) !== ''
}

function hasOwnInput(input: Record<string, unknown>, camelKey: string, snakeKey = camelKey) {
  return Object.prototype.hasOwnProperty.call(input, camelKey) || Object.prototype.hasOwnProperty.call(input, snakeKey)
}

function isFiniteInput(value: unknown) {
  return !hasInputValue(value) || Number.isFinite(Number(value))
}

export function normalizeProductType(value: unknown): ProductType {
  const type = trimText(value).toUpperCase()
  return PRODUCT_TYPES.includes(type as ProductType) ? type as ProductType : 'FINISH'
}

export function normalizeProductStatus(value: unknown) {
  const text = trimText(value).toUpperCase()
  if (['0', '禁用', 'FALSE', 'DISABLED'].includes(text)) return '0'
  return '1'
}

export function normalizeProductImageUrl(value: unknown) {
  return clampText(value, 500)
}

export function isProductImageUrlAllowed(value: unknown) {
  const rawUrl = trimText(value)
  if (rawUrl.length > 500) return false
  const url = normalizeProductImageUrl(rawUrl)
  if (!url) return true
  return /^https:\/\/[^\s<>"]{3,}$/i.test(url) || /^\/[^\s<>"]+$/.test(url)
}

export function normalizeProductMaster(row: Record<string, unknown> = {}): ProductMasterRecord {
  return {
    id: Math.max(0, toInteger(row.id)),
    code: clampText(row.code, 50),
    name: clampText(row.name, 100),
    type: normalizeProductType(row.type),
    spec: clampText(row.spec, 200),
    unit: clampText(row.unit, 20) || '个',
    piecePrice: Math.max(0, roundNumber(row.piecePrice ?? row.piece_price, 4)),
    cavityYield: Math.max(0, toInteger(row.cavityYield ?? row.cavity_yield)),
    cycleTimeSec: Math.max(0, toInteger(row.cycleTimeSec ?? row.cycle_time_sec)),
    safeStock: Math.max(0, toInteger(row.safeStock ?? row.safe_stock)),
    weightG: Math.max(0, roundNumber(row.weightG ?? row.weight_g, 2)),
    rawMaterialId: positiveId(row.rawMaterialId ?? row.raw_material_id),
    rawMaterialUsage: Math.max(0, roundNumber(row.rawMaterialUsage ?? row.raw_material_usage, 4)),
    color: clampText(row.color, 50),
    customerId: positiveId(row.customerId ?? row.customer_id),
    imageUrl: normalizeProductImageUrl(row.imageUrl ?? row.image_url),
    status: normalizeProductStatus(row.status),
  }
}

export function buildProductPayload(input: Record<string, unknown> = {}) {
  const row = normalizeProductMaster(input)
  return {
    ...(hasOwnInput(input, 'code') ? { code: row.code } : {}),
    ...(hasOwnInput(input, 'name') ? { name: row.name } : {}),
    ...(hasOwnInput(input, 'type') ? { type: row.type } : {}),
    ...(hasOwnInput(input, 'spec') ? { spec: row.spec } : {}),
    ...(hasOwnInput(input, 'unit') ? { unit: row.unit } : {}),
    ...(hasOwnInput(input, 'piecePrice', 'piece_price') ? { piecePrice: row.piecePrice } : {}),
    ...(hasOwnInput(input, 'cavityYield', 'cavity_yield') ? { cavityYield: row.cavityYield } : {}),
    ...(hasOwnInput(input, 'cycleTimeSec', 'cycle_time_sec') ? { cycleTimeSec: row.cycleTimeSec } : {}),
    ...(hasOwnInput(input, 'safeStock', 'safe_stock') ? { safeStock: row.safeStock } : {}),
    ...(hasOwnInput(input, 'weightG', 'weight_g') ? { weightG: row.weightG } : {}),
    ...(hasOwnInput(input, 'rawMaterialId', 'raw_material_id') ? { rawMaterialId: row.rawMaterialId } : {}),
    ...(hasOwnInput(input, 'rawMaterialUsage', 'raw_material_usage') ? { rawMaterialUsage: row.rawMaterialUsage } : {}),
    ...(hasOwnInput(input, 'color') ? { color: row.color } : {}),
    ...(hasOwnInput(input, 'customerId', 'customer_id') ? { customerId: row.customerId } : {}),
    ...(hasOwnInput(input, 'imageUrl', 'image_url') ? { imageUrl: row.imageUrl } : {}),
    ...(hasOwnInput(input, 'status') ? { status: row.status } : {}),
  }
}

export function validateProductMaster(input: Record<string, unknown> = {}, options: { isEditing?: boolean } = {}) {
  const row = normalizeProductMaster(input)
  const isPartialEdit = !!options.isEditing
  const shouldValidate = (camelKey: string, snakeKey = camelKey) => !isPartialEdit || hasOwnInput(input, camelKey, snakeKey)
  const rawCode = trimText(input.code)
  const rawName = trimText(input.name)
  const rawUnit = trimText(input.unit)
  const rawSpec = trimText(input.spec)
  const rawColor = trimText(input.color)
  const rawStatus = trimText(input.status)
  const rawType = trimText(input.type).toUpperCase()
  const piecePrice = input.piecePrice ?? input.piece_price
  const safeStock = input.safeStock ?? input.safe_stock
  const cavityYield = input.cavityYield ?? input.cavity_yield
  const cycleTimeSec = input.cycleTimeSec ?? input.cycle_time_sec
  const weightG = input.weightG ?? input.weight_g
  const rawMaterialId = input.rawMaterialId ?? input.raw_material_id
  const rawMaterialUsage = input.rawMaterialUsage ?? input.raw_material_usage
  const customerId = input.customerId ?? input.customer_id
  if (!options.isEditing && !rawCode) return '请输入产品编码'
  if (shouldValidate('code') && hasInputValue(input.code) && !/^[A-Za-z0-9][A-Za-z0-9._-]{1,49}$/.test(rawCode)) return '产品编码需为 2-50 位字母、数字、点、下划线或短横线'
  if (shouldValidate('name') && !rawName) return '请输入产品名称'
  if (shouldValidate('name') && rawName.length > 100) return '产品名称不能超过 100 个字符'
  if (shouldValidate('spec') && rawSpec.length > 200) return '产品规格不能超过 200 个字符'
  if (shouldValidate('type') && !PRODUCT_TYPES.includes(rawType as ProductType)) return '请选择有效产品类型'
  if (shouldValidate('unit') && !rawUnit) return '请输入产品单位'
  if (shouldValidate('unit') && rawUnit.length > 20) return '产品单位不能超过 20 个字符'
  if (shouldValidate('color') && rawColor.length > 50) return '产品颜色不能超过 50 个字符'
  if (shouldValidate('piecePrice', 'piece_price') && (!isFiniteInput(piecePrice) || toNumber(piecePrice) < 0 || toNumber(piecePrice) > 9999999)) return '产品单价必须在 0-9999999 之间'
  if (shouldValidate('safeStock', 'safe_stock') && (!isFiniteInput(safeStock) || !Number.isInteger(toNumber(safeStock)) || toNumber(safeStock) < 0 || toNumber(safeStock) > 99999999)) return '安全库存必须是 0-99999999 的整数'
  if (shouldValidate('cavityYield', 'cavity_yield') && (!isFiniteInput(cavityYield) || !Number.isInteger(toNumber(cavityYield)) || toNumber(cavityYield) < 0 || toNumber(cavityYield) > 9999)) return '单模产出必须在 0-9999 之间'
  if (shouldValidate('cycleTimeSec', 'cycle_time_sec') && (!isFiniteInput(cycleTimeSec) || !Number.isInteger(toNumber(cycleTimeSec)) || toNumber(cycleTimeSec) < 0 || toNumber(cycleTimeSec) > 86400)) return '成型周期必须在 0-86400 秒之间'
  if (shouldValidate('weightG', 'weight_g') && (!isFiniteInput(weightG) || toNumber(weightG) < 0 || toNumber(weightG) > 999999)) return '产品重量必须在 0-999999 克之间'
  if (shouldValidate('rawMaterialId', 'raw_material_id') && hasInputValue(rawMaterialId) && (!isFiniteInput(rawMaterialId) || !Number.isInteger(toNumber(rawMaterialId)) || toNumber(rawMaterialId) < 0)) return '原料产品ID必须是非负整数'
  if (shouldValidate('rawMaterialUsage', 'raw_material_usage') && (!isFiniteInput(rawMaterialUsage) || toNumber(rawMaterialUsage) < 0 || toNumber(rawMaterialUsage) > 999999)) return '原料用量必须在 0-999999 之间'
  if (shouldValidate('customerId', 'customer_id') && hasInputValue(customerId) && (!isFiniteInput(customerId) || !Number.isInteger(toNumber(customerId)) || toNumber(customerId) < 0)) return '客户ID必须是非负整数'
  if (shouldValidate('rawMaterialId', 'raw_material_id') && row.rawMaterialId && row.rawMaterialId === row.id) return '产品不能把自身设置为原料'
  if ((shouldValidate('rawMaterialUsage', 'raw_material_usage') || shouldValidate('rawMaterialId', 'raw_material_id')) && row.rawMaterialUsage > 0 && !row.rawMaterialId) return '填写原料用量时必须填写原料产品ID'
  if ((shouldValidate('rawMaterialUsage', 'raw_material_usage') || shouldValidate('rawMaterialId', 'raw_material_id')) && row.rawMaterialId && row.rawMaterialUsage <= 0) return '填写原料产品ID时必须填写原料用量'
  if (shouldValidate('imageUrl', 'image_url') && !isProductImageUrlAllowed(row.imageUrl)) return '产品图片地址必须是 HTTPS 地址或站内路径，且不超过 500 个字符'
  if (shouldValidate('status') && hasInputValue(input.status) && !['0', '1', '启用', '禁用', 'TRUE', 'FALSE', 'ENABLED', 'DISABLED'].includes(rawStatus.toUpperCase())) return '请选择有效状态'
  if (!['0', '1'].includes(row.status)) return '请选择有效状态'
  return ''
}

export function buildProductQuery(input: Record<string, unknown> = {}) {
  const page = Math.max(1, toInteger(input.page, 1))
  const pageSize = Math.min(Math.max(1, toInteger(input.pageSize, 20)), 200)
  const keyword = trimText(input.keyword).replace(/[,%()'"\\]/g, ' ').replace(/\s+/g, ' ').slice(0, 80).trim()
  const type = trimText(input.type).toUpperCase()
  const status = trimText(input.status)
  return {
    page,
    pageSize,
    ...(keyword ? { keyword } : {}),
    ...(PRODUCT_TYPES.includes(type as ProductType) ? { type } : {}),
    ...(['0', '1'].includes(status) ? { status } : {}),
  }
}

export function getProductDataRisk(row: ProductMasterRecord) {
  if (!row.code || !row.name || !row.unit) return '基础信息缺失'
  if (!isProductImageUrlAllowed(row.imageUrl)) return '图片地址不合规'
  if (row.rawMaterialId && row.rawMaterialUsage <= 0) return '原料用量缺失'
  if (row.rawMaterialUsage > 0 && !row.rawMaterialId) return '原料ID缺失'
  if ((row.type === 'FINISH' || row.type === 'SEMI') && (!row.cavityYield || !row.cycleTimeSec)) return '工艺参数待补全'
  return ''
}

export function buildProductMasterSummary(rows: ProductMasterRecord[]): ProductMasterSummary {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1
      if (row.type === 'RAW') summary.raw += 1
      if (row.type === 'SEMI') summary.semi += 1
      if (row.type === 'FINISH') summary.finish += 1
      if (row.status === '1') summary.enabled += 1
      else summary.disabled += 1
      if (row.imageUrl) summary.withImage += 1
      if (row.safeStock > 0) summary.withSafeStock += 1
      if (row.cavityYield > 0 && row.cycleTimeSec > 0) summary.withProcessParams += 1
      if (row.rawMaterialId && row.rawMaterialUsage > 0) summary.withMaterialRule += 1
      if (getProductDataRisk(row)) summary.dataRisks += 1
      return summary
    },
    { total: 0, raw: 0, semi: 0, finish: 0, enabled: 0, disabled: 0, withImage: 0, withSafeStock: 0, withProcessParams: 0, withMaterialRule: 0, dataRisks: 0 } as ProductMasterSummary,
  )
}

export function productImageAlt(row: Pick<ProductMasterRecord, 'code' | 'name'>) {
  return `${row.code || '产品'} ${row.name || '图片'}`.trim()
}
