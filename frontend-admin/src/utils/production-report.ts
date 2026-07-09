import { normalizeSalaryProcessName } from './salary-price.ts'

export const PROD_REPORT_ORDER_STATUSES = ['SCHEDULED', 'RUNNING', 'PAUSED'] as const

export type ProdReportOrderStatus = (typeof PROD_REPORT_ORDER_STATUSES)[number]

export function normalizeProdReportStatus(value?: string | null) {
  return String(value || '').toUpperCase()
}

export function isProdReportOrderStatus(value?: string | null) {
  return PROD_REPORT_ORDER_STATUSES.includes(normalizeProdReportStatus(value) as ProdReportOrderStatus)
}

export function toProdReportNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function getProdReportGoodQty(row?: Record<string, any> | null) {
  return Math.max(toProdReportNumber(row?.qty) - toProdReportNumber(row?.badQty ?? row?.bad_qty), 0)
}

export function getProdReportBadRate(row?: Record<string, any> | null) {
  const qty = toProdReportNumber(row?.qty)
  if (qty <= 0) return 0
  return Number(((toProdReportNumber(row?.badQty ?? row?.bad_qty) / qty) * 100).toFixed(1))
}

export function normalizeProdReportProcessName(value?: string | null) {
  return normalizeSalaryProcessName(value)
}

export function normalizeProdReportProcessFilter(value?: string | null) {
  return String(value || '').trim()
}

export function validateProdReportProcessName(value?: string | null) {
  const text = String(value || '').trim()
  if (!text) return '请输入工序名称'
  if (text.length > 50) return '工序名称不能超过 50 个字符'
  return ''
}

export function isProdReportProcessMatch(row: Record<string, any>, processName?: string | null) {
  const filter = normalizeProdReportProcessFilter(processName)
  if (!filter) return true
  return normalizeProdReportProcessName(row?.processName || row?.process_name).includes(filter)
}
