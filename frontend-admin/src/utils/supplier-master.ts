export type SupplierMasterRecord = {
  id: number
  code: string
  name: string
  contact: string
  phone: string
  address: string
  mainMaterial: string
  status: string
}

export type SupplierMasterSummary = {
  total: number
  enabled: number
  disabled: number
  withContact: number
  withPhone: number
  withMainMaterial: number
  dataRisks: number
}

function trimText(value: unknown) {
  return String(value ?? '').trim()
}

function clampText(value: unknown, maxLength: number) {
  return trimText(value).slice(0, maxLength)
}

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function toInteger(value: unknown, fallback = 0) {
  return Math.trunc(toNumber(value, fallback))
}

function hasInputValue(value: unknown) {
  return value !== undefined && value !== null && trimText(value) !== ''
}

function hasOwnInput(input: Record<string, unknown>, camelKey: string, snakeKey = camelKey) {
  return Object.prototype.hasOwnProperty.call(input, camelKey) || Object.prototype.hasOwnProperty.call(input, snakeKey)
}

export function normalizeSupplierStatus(value: unknown) {
  const text = trimText(value).toUpperCase()
  if (['0', '禁用', 'FALSE', 'DISABLED'].includes(text)) return '0'
  return '1'
}

export function normalizeSupplierPhone(value: unknown) {
  return clampText(value, 20).replace(/\s+/g, '')
}

export function isSupplierPhoneAllowed(value: unknown) {
  const phone = normalizeSupplierPhone(value)
  if (!phone) return true
  return /^[+\d][\d()-]{5,19}$/.test(phone)
}

export function normalizeSupplierMaster(row: Record<string, unknown> = {}): SupplierMasterRecord {
  return {
    id: Math.max(0, toInteger(row.id)),
    code: clampText(row.code, 50),
    name: clampText(row.name, 100),
    contact: clampText(row.contact, 50),
    phone: normalizeSupplierPhone(row.phone),
    address: clampText(row.address, 500),
    mainMaterial: clampText(row.mainMaterial ?? row.main_material, 200),
    status: normalizeSupplierStatus(row.status),
  }
}

export function buildSupplierPayload(input: Record<string, unknown> = {}) {
  const row = normalizeSupplierMaster(input)
  return {
    ...(hasOwnInput(input, 'code') ? { code: row.code } : {}),
    ...(hasOwnInput(input, 'name') ? { name: row.name } : {}),
    ...(hasOwnInput(input, 'contact') ? { contact: row.contact } : {}),
    ...(hasOwnInput(input, 'phone') ? { phone: row.phone } : {}),
    ...(hasOwnInput(input, 'address') ? { address: row.address } : {}),
    ...(hasOwnInput(input, 'mainMaterial', 'main_material') ? { mainMaterial: row.mainMaterial } : {}),
    ...(hasOwnInput(input, 'status') ? { status: row.status } : {}),
  }
}

export function validateSupplierMaster(input: Record<string, unknown> = {}, options: { isEditing?: boolean } = {}) {
  const row = normalizeSupplierMaster(input)
  const isPartialEdit = !!options.isEditing
  const shouldValidate = (camelKey: string, snakeKey = camelKey) => !isPartialEdit || hasOwnInput(input, camelKey, snakeKey)
  const rawCode = trimText(input.code)
  const rawName = trimText(input.name)
  const rawContact = trimText(input.contact)
  const rawAddress = trimText(input.address)
  const rawMainMaterial = trimText(input.mainMaterial ?? input.main_material)
  const rawStatus = trimText(input.status)

  if (shouldValidate('code') && !rawCode) return '请输入供应商编号'
  if (shouldValidate('code') && !/^[A-Za-z0-9][A-Za-z0-9._-]{1,49}$/.test(rawCode)) return '供应商编号需为 2-50 位字母、数字、点、下划线或短横线'
  if (shouldValidate('name') && !rawName) return '请输入供应商名称'
  if (shouldValidate('name') && rawName.length > 100) return '供应商名称不能超过 100 个字符'
  if (shouldValidate('contact') && rawContact.length > 50) return '联系人不能超过 50 个字符'
  if (shouldValidate('phone') && !isSupplierPhoneAllowed(input.phone)) return '联系电话需为 6-20 位数字、括号、短横线或加号'
  if (shouldValidate('address') && rawAddress.length > 500) return '供应商地址不能超过 500 个字符'
  if (shouldValidate('mainMaterial', 'main_material') && rawMainMaterial.length > 200) return '主营材料不能超过 200 个字符'
  if (shouldValidate('status') && hasInputValue(input.status) && !['0', '1', '启用', '禁用', 'TRUE', 'FALSE', 'ENABLED', 'DISABLED'].includes(rawStatus.toUpperCase())) return '请选择有效状态'
  if (!['0', '1'].includes(row.status)) return '请选择有效状态'
  return ''
}

export function buildSupplierQuery(input: Record<string, unknown> = {}) {
  const page = Math.max(1, toInteger(input.page, 1))
  const pageSize = Math.min(Math.max(1, toInteger(input.pageSize, 20)), 200)
  const keyword = trimText(input.keyword).replace(/[,%()'"\\]/g, ' ').replace(/\s+/g, ' ').slice(0, 80).trim()
  const status = trimText(input.status)
  return {
    page,
    pageSize,
    ...(keyword ? { keyword } : {}),
    ...(['0', '1'].includes(status) ? { status } : {}),
  }
}

export function getSupplierDataRisk(row: SupplierMasterRecord) {
  if (!row.code || !row.name) return '基础信息缺失'
  if (row.phone && !isSupplierPhoneAllowed(row.phone)) return '联系电话不合规'
  if (!row.contact && !row.phone) return '联系方式待补全'
  if (!row.mainMaterial) return '主营材料待补全'
  return ''
}

export function buildSupplierMasterSummary(rows: SupplierMasterRecord[]): SupplierMasterSummary {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1
      if (row.status === '1') summary.enabled += 1
      else summary.disabled += 1
      if (row.contact || row.phone) summary.withContact += 1
      if (row.phone) summary.withPhone += 1
      if (row.mainMaterial) summary.withMainMaterial += 1
      if (getSupplierDataRisk(row)) summary.dataRisks += 1
      return summary
    },
    { total: 0, enabled: 0, disabled: 0, withContact: 0, withPhone: 0, withMainMaterial: 0, dataRisks: 0 } as SupplierMasterSummary,
  )
}
