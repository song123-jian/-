import { normalizeSalaryProcessName } from './salary-price.ts'

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
