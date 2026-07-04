import { normalizeSalaryDate, normalizeSalaryUnitPrice, roundSalaryAmount } from './salary-monthly.ts'

export type SalaryPriceStatus = 'ACTIVE' | 'FUTURE' | 'EXPIRED'

export type SalaryPriceInput = {
  id?: number
  productId: number
  processName: string
  price: number
  effectiveDate: string
  expireDate: string
}

export function normalizeSalaryProcessName(value?: string | null) {
  return String(value || '').trim() || '注塑'
}

export function normalizeSalaryPriceInput(payload: Record<string, any>): SalaryPriceInput {
  const productId = Number(payload?.productId || payload?.product_id || 0)
  const price = normalizeSalaryUnitPrice(payload?.price ?? payload?.unitPrice ?? payload?.unit_price)
  return {
    id: Number(payload?.id || 0) || undefined,
    productId: Number.isFinite(productId) ? productId : 0,
    processName: normalizeSalaryProcessName(payload?.processName || payload?.process_name),
    price,
    effectiveDate: normalizeSalaryDate(payload?.effectiveDate || payload?.effective_date),
    expireDate: normalizeSalaryDate(payload?.expireDate || payload?.expire_date),
  }
}

export function validateSalaryPriceInput(payload: Record<string, any>) {
  const normalized = normalizeSalaryPriceInput(payload)
  if (!normalized.productId) return '请选择产品'
  if (!normalized.processName) return '请输入工序名称'
  if (!Number.isFinite(normalized.price) || normalized.price <= 0) return '计件单价必须大于 0'
  if (!normalized.effectiveDate) return '请选择生效日期'
  if (normalized.expireDate && normalized.expireDate < normalized.effectiveDate) return '失效日期不能早于生效日期'
  return ''
}

export function getSalaryPriceStatus(price: Record<string, any>, today?: string | Date): SalaryPriceStatus {
  const effectiveDate = normalizeSalaryDate(price?.effectiveDate || price?.effective_date)
  const expireDate = normalizeSalaryDate(price?.expireDate || price?.expire_date)
  const currentDate = normalizeSalaryDate(today || new Date())
  if (effectiveDate && currentDate < effectiveDate) return 'FUTURE'
  if (expireDate && currentDate > expireDate) return 'EXPIRED'
  return 'ACTIVE'
}

export function getSalaryPriceStatusText(status: string) {
  if (status === 'ACTIVE') return '生效中'
  if (status === 'FUTURE') return '待生效'
  if (status === 'EXPIRED') return '已失效'
  return status || '-'
}

export function isSalaryPriceIntervalOverlap(left: Record<string, any>, right: Record<string, any>) {
  const leftStart = normalizeSalaryDate(left?.effectiveDate || left?.effective_date)
  const rightStart = normalizeSalaryDate(right?.effectiveDate || right?.effective_date)
  if (!leftStart || !rightStart) return false

  const leftEnd = normalizeSalaryDate(left?.expireDate || left?.expire_date) || '9999-12-31'
  const rightEnd = normalizeSalaryDate(right?.expireDate || right?.expire_date) || '9999-12-31'
  return leftStart <= rightEnd && rightStart <= leftEnd
}

export function findOverlappedSalaryPrice(
  rows: Array<Record<string, any>>,
  candidate: Record<string, any>,
  ignoreId?: number,
) {
  const normalized = normalizeSalaryPriceInput(candidate)
  return rows.find((row) => {
    const rowId = Number(row?.id || 0)
    if (ignoreId && rowId === ignoreId) return false
    const rowProductId = Number(row?.productId || row?.product_id || 0)
    const rowProcessName = normalizeSalaryProcessName(row?.processName || row?.process_name)
    if (rowProductId !== normalized.productId || rowProcessName !== normalized.processName) return false
    return isSalaryPriceIntervalOverlap(row, normalized)
  })
}

export function chooseSalaryPiecePrice(rows: any[], productId?: number, processName?: string, date?: string | Date) {
  if (!productId) return undefined
  const normalizedProcessName = normalizeSalaryProcessName(processName)
  const normalizedDate = normalizeSalaryDate(date || new Date())
  return rows
    .filter((row) => Number(row.product_id || row.productId) === Number(productId))
    .filter((row) => normalizeSalaryProcessName(row.process_name || row.processName) === normalizedProcessName)
    .filter((row) => {
      if (!normalizedDate) return true
      const effectiveDate = normalizeSalaryDate(row.effective_date || row.effectiveDate)
      const expireDate = normalizeSalaryDate(row.expire_date || row.expireDate)
      const afterStart = !effectiveDate || effectiveDate <= normalizedDate
      const beforeEnd = !expireDate || expireDate >= normalizedDate
      return afterStart && beforeEnd
    })
    .sort((left, right) => {
      const rightDate = normalizeSalaryDate(right.effective_date || right.effectiveDate)
      const leftDate = normalizeSalaryDate(left.effective_date || left.effectiveDate)
      return rightDate.localeCompare(leftDate) || Number(right.id || 0) - Number(left.id || 0)
    })[0]
}

export function buildSalaryPriceRow(row: Record<string, any>, product?: Record<string, any>, today?: string | Date) {
  const price = normalizeSalaryUnitPrice(row?.price ?? row?.unitPrice ?? row?.unit_price)
  const status = getSalaryPriceStatus(row, today)
  return {
    id: Number(row?.id || 0),
    productId: Number(row?.productId || row?.product_id || 0),
    productName: product?.name || row?.productName || row?.product_name || '-',
    productCode: product?.code || row?.productCode || row?.product_code || '',
    processName: normalizeSalaryProcessName(row?.processName || row?.process_name),
    price,
    unitPrice: price,
    effectiveDate: normalizeSalaryDate(row?.effectiveDate || row?.effective_date),
    expireDate: normalizeSalaryDate(row?.expireDate || row?.expire_date),
    status,
    statusText: getSalaryPriceStatusText(status),
    amountPreview: roundSalaryAmount(price * 1000),
    createdAt: row?.createdAt || row?.created_at || '',
  }
}
