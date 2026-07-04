export const CUSTOMER_CREDIT_LEVELS = ['A', 'B', 'C', 'D', 'CASH'] as const
export type CustomerCreditLevel = (typeof CUSTOMER_CREDIT_LEVELS)[number]

export type CustomerMasterRecord = {
  id: number
  code: string
  name: string
  shortName: string
  contact: string
  phone: string
  address: string
  taxNo: string
  invoiceTitle: string
  creditLevel: CustomerCreditLevel
  paymentDays: number
  salesUserId: number | null
  status: string
}

export type CustomerMasterSummary = {
  total: number
  enabled: number
  disabled: number
  withTaxInfo: number
  withContact: number
  assignedSales: number
  cashCustomers: number
  longPaymentTerm: number
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

function positiveId(value: unknown) {
  const id = toInteger(value)
  return id > 0 ? id : null
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

export function normalizeCustomerStatus(value: unknown) {
  const text = trimText(value).toUpperCase()
  if (['0', '禁用', 'FALSE', 'DISABLED'].includes(text)) return '0'
  return '1'
}

export function normalizeCustomerCreditLevel(value: unknown): CustomerCreditLevel {
  const text = trimText(value).toUpperCase()
  return CUSTOMER_CREDIT_LEVELS.includes(text as CustomerCreditLevel)
    ? text as CustomerCreditLevel
    : 'B'
}

export function normalizeCustomerPhone(value: unknown) {
  return clampText(value, 20).replace(/\s+/g, '')
}

export function normalizeCustomerTaxNo(value: unknown) {
  return clampText(value, 50).replace(/\s+/g, '').toUpperCase()
}

export function isCustomerPhoneAllowed(value: unknown) {
  const phone = normalizeCustomerPhone(value)
  if (!phone) return true
  return /^[+\d][\d()-]{5,19}$/.test(phone)
}

export function isCustomerTaxNoAllowed(value: unknown) {
  const taxNo = normalizeCustomerTaxNo(value)
  if (!taxNo) return true
  return /^[A-Z0-9-]{6,50}$/.test(taxNo)
}

export function normalizeCustomerMaster(row: Record<string, unknown> = {}): CustomerMasterRecord {
  return {
    id: Math.max(0, toInteger(row.id)),
    code: clampText(row.code, 50),
    name: clampText(row.name, 100),
    shortName: clampText(row.shortName ?? row.short_name, 50),
    contact: clampText(row.contact, 50),
    phone: normalizeCustomerPhone(row.phone),
    address: clampText(row.address, 500),
    taxNo: normalizeCustomerTaxNo(row.taxNo ?? row.tax_no),
    invoiceTitle: clampText(row.invoiceTitle ?? row.invoice_title, 200),
    creditLevel: normalizeCustomerCreditLevel(row.creditLevel ?? row.credit_level),
    paymentDays: Math.max(0, toInteger(row.paymentDays ?? row.payment_days)),
    salesUserId: positiveId(row.salesUserId ?? row.sales_user_id),
    status: normalizeCustomerStatus(row.status),
  }
}

export function buildCustomerPayload(input: Record<string, unknown> = {}) {
  const row = normalizeCustomerMaster(input)
  const hasPaymentDays = hasOwnInput(input, 'paymentDays', 'payment_days')
  return {
    ...(hasOwnInput(input, 'code') ? { code: row.code } : {}),
    ...(hasOwnInput(input, 'name') ? { name: row.name } : {}),
    ...(hasOwnInput(input, 'shortName', 'short_name') ? { shortName: row.shortName } : {}),
    ...(hasOwnInput(input, 'contact') ? { contact: row.contact } : {}),
    ...(hasOwnInput(input, 'phone') ? { phone: row.phone } : {}),
    ...(hasOwnInput(input, 'address') ? { address: row.address } : {}),
    ...(hasOwnInput(input, 'taxNo', 'tax_no') ? { taxNo: row.taxNo } : {}),
    ...(hasOwnInput(input, 'invoiceTitle', 'invoice_title') ? { invoiceTitle: row.invoiceTitle } : {}),
    ...(hasOwnInput(input, 'creditLevel', 'credit_level') ? { creditLevel: row.creditLevel } : {}),
    ...(hasPaymentDays || row.creditLevel === 'CASH' ? { paymentDays: row.paymentDays } : {}),
    ...(hasOwnInput(input, 'salesUserId', 'sales_user_id') ? { salesUserId: row.salesUserId } : {}),
    ...(hasOwnInput(input, 'status') ? { status: row.status } : {}),
  }
}

export function validateCustomerMaster(input: Record<string, unknown> = {}, options: { isEditing?: boolean } = {}) {
  const row = normalizeCustomerMaster(input)
  const isPartialEdit = !!options.isEditing
  const shouldValidate = (camelKey: string, snakeKey = camelKey) => !isPartialEdit || hasOwnInput(input, camelKey, snakeKey)
  const rawCode = trimText(input.code)
  const rawName = trimText(input.name)
  const rawShortName = trimText(input.shortName ?? input.short_name)
  const rawContact = trimText(input.contact)
  const rawAddress = trimText(input.address)
  const rawInvoiceTitle = trimText(input.invoiceTitle ?? input.invoice_title)
  const rawCreditLevel = trimText(input.creditLevel ?? input.credit_level).toUpperCase()
  const rawPaymentDays = input.paymentDays ?? input.payment_days
  const rawSalesUserId = input.salesUserId ?? input.sales_user_id
  const rawStatus = trimText(input.status)

  if (!options.isEditing && !rawCode) return '请输入客户编号'
  if (shouldValidate('code') && hasInputValue(input.code) && !/^[A-Za-z0-9][A-Za-z0-9._-]{1,49}$/.test(rawCode)) return '客户编号需为 2-50 位字母、数字、点、下划线或短横线'
  if (shouldValidate('name') && !rawName) return '请输入客户名称'
  if (shouldValidate('name') && rawName.length > 100) return '客户名称不能超过 100 个字符'
  if (shouldValidate('shortName', 'short_name') && rawShortName.length > 50) return '客户简称不能超过 50 个字符'
  if (shouldValidate('contact') && rawContact.length > 50) return '联系人不能超过 50 个字符'
  if (shouldValidate('phone') && !isCustomerPhoneAllowed(input.phone)) return '联系电话需为 6-20 位数字、括号、短横线或加号'
  if (shouldValidate('address') && rawAddress.length > 500) return '客户地址不能超过 500 个字符'
  if (shouldValidate('taxNo', 'tax_no') && !isCustomerTaxNoAllowed(input.taxNo ?? input.tax_no)) return '客户税号需为 6-50 位大写字母、数字或短横线'
  if (shouldValidate('invoiceTitle', 'invoice_title') && rawInvoiceTitle.length > 200) return '发票抬头不能超过 200 个字符'
  if ((shouldValidate('taxNo', 'tax_no') || shouldValidate('invoiceTitle', 'invoice_title')) && row.taxNo && !row.invoiceTitle) return '填写税号时必须填写发票抬头'
  if ((shouldValidate('taxNo', 'tax_no') || shouldValidate('invoiceTitle', 'invoice_title')) && row.invoiceTitle && !row.taxNo) return '填写发票抬头时必须填写税号'
  if (shouldValidate('creditLevel', 'credit_level') && hasInputValue(input.creditLevel ?? input.credit_level) && !CUSTOMER_CREDIT_LEVELS.includes(rawCreditLevel as CustomerCreditLevel)) return '请选择有效信用等级'
  if (shouldValidate('paymentDays', 'payment_days') && (!isFiniteInput(rawPaymentDays) || !Number.isInteger(toNumber(rawPaymentDays)) || toNumber(rawPaymentDays) < 0 || toNumber(rawPaymentDays) > 365)) return '账期必须是 0-365 天的整数'
  if (shouldValidate('salesUserId', 'sales_user_id') && hasInputValue(rawSalesUserId) && (!isFiniteInput(rawSalesUserId) || !Number.isInteger(toNumber(rawSalesUserId)) || toNumber(rawSalesUserId) < 0)) return '销售员ID必须是非负整数'
  if (row.creditLevel === 'CASH' && row.paymentDays > 0) return '现结客户账期必须为 0 天'
  if (row.creditLevel === 'D' && row.paymentDays > 30) return 'D级客户账期不能超过 30 天'
  if (shouldValidate('status') && hasInputValue(input.status) && !['0', '1', '启用', '禁用', 'TRUE', 'FALSE', 'ENABLED', 'DISABLED'].includes(rawStatus.toUpperCase())) return '请选择有效状态'
  if (!['0', '1'].includes(row.status)) return '请选择有效状态'
  return ''
}

export function buildCustomerQuery(input: Record<string, unknown> = {}) {
  const page = Math.max(1, toInteger(input.page, 1))
  const pageSize = Math.min(Math.max(1, toInteger(input.pageSize, 20)), 200)
  const keyword = trimText(input.keyword).replace(/[,%()'"\\]/g, ' ').replace(/\s+/g, ' ').slice(0, 80).trim()
  const status = trimText(input.status)
  const creditLevel = trimText(input.creditLevel ?? input.credit_level).toUpperCase()
  return {
    page,
    pageSize,
    ...(keyword ? { keyword } : {}),
    ...(['0', '1'].includes(status) ? { status } : {}),
    ...(CUSTOMER_CREDIT_LEVELS.includes(creditLevel as CustomerCreditLevel) ? { creditLevel } : {}),
  }
}

export function getCustomerDataRisk(row: CustomerMasterRecord) {
  if (!row.code || !row.name) return '基础信息缺失'
  if (!row.contact && !row.phone) return '联系人待补全'
  if (!isCustomerPhoneAllowed(row.phone)) return '联系电话不合规'
  if (!isCustomerTaxNoAllowed(row.taxNo)) return '税号不合规'
  if (row.taxNo && !row.invoiceTitle) return '发票抬头缺失'
  if (row.invoiceTitle && !row.taxNo) return '税号缺失'
  if (row.creditLevel === 'CASH' && row.paymentDays > 0) return '现结账期异常'
  if (row.creditLevel === 'D' && row.paymentDays > 30) return '高风险账期过长'
  if (row.paymentDays > 180) return '账期过长'
  return ''
}

export function buildCustomerMasterSummary(rows: CustomerMasterRecord[]): CustomerMasterSummary {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1
      if (row.status === '1') summary.enabled += 1
      else summary.disabled += 1
      if (row.taxNo && row.invoiceTitle) summary.withTaxInfo += 1
      if (row.contact || row.phone) summary.withContact += 1
      if (row.salesUserId) summary.assignedSales += 1
      if (row.creditLevel === 'CASH' || row.paymentDays === 0) summary.cashCustomers += 1
      if (row.paymentDays > 180) summary.longPaymentTerm += 1
      if (getCustomerDataRisk(row)) summary.dataRisks += 1
      return summary
    },
    { total: 0, enabled: 0, disabled: 0, withTaxInfo: 0, withContact: 0, assignedSales: 0, cashCustomers: 0, longPaymentTerm: 0, dataRisks: 0 } as CustomerMasterSummary,
  )
}

export function getCustomerCreditLabel(value: unknown) {
  const labels: Record<CustomerCreditLevel, string> = {
    A: 'A级',
    B: 'B级',
    C: 'C级',
    D: 'D级',
    CASH: '现结',
  }
  return labels[normalizeCustomerCreditLevel(value)]
}
