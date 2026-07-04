export const FINANCE_STATEMENT_MAX_MONTHS = 24

export type FinanceStatementPeriodMode = 'RECENT_MONTHS' | 'ACCOUNTING_MONTHS' | 'DATE_RANGE'

export type FinanceStatementScope = {
  periodMode: FinanceStatementPeriodMode
  months: number
  monthKeys: string[]
  startDate: string
  endDate: string
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function parseDateOnly(value?: string | Date | null) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }

  const text = String(value || '').trim().slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

export function normalizeFinanceStatementDate(value?: string | Date | null) {
  const date = parseDateOnly(value)
  return date ? formatLocalDate(date) : ''
}

export function normalizeFinanceStatementMonth(value?: string | Date | null) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return monthKeyFromDate(value)
  }
  const text = String(value || '').trim().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(text)) return ''
  const date = parseDateOnly(`${text}-01`)
  return date ? monthKeyFromDate(date) : ''
}

function monthStartDate(month: string) {
  return `${month}-01`
}

function monthEndDate(month: string) {
  const normalized = normalizeFinanceStatementMonth(month)
  if (!normalized) return ''
  const [year, monthValue] = normalized.split('-').map(Number)
  return formatLocalDate(new Date(year, monthValue, 0))
}

function clampMonthCount(value: unknown) {
  const parsed = Number(value ?? 6)
  const count = Number.isFinite(parsed) ? Math.trunc(parsed) : 6
  return Math.min(Math.max(count, 1), FINANCE_STATEMENT_MAX_MONTHS)
}

function monthKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

function monthCountInclusive(startDate: string, endDate: string) {
  const start = parseDateOnly(startDate)
  const end = parseDateOnly(endDate)
  if (!start || !end) return 0
  return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1
}

export function getFinanceStatementMonthKey(value?: string | Date | null) {
  return normalizeFinanceStatementDate(value).slice(0, 7)
}

export function listFinanceStatementMonthKeys(startDate: string, endDate: string) {
  const start = parseDateOnly(startDate)
  const end = parseDateOnly(endDate)
  if (!start || !end || start > end) return []

  const keys: string[] = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cursor <= endMonth) {
    keys.push(monthKeyFromDate(cursor))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return keys
}

export function validateFinanceStatementRange(params?: Record<string, any>) {
  const hasStartMonth = params?.startMonth !== undefined && params?.startMonth !== null && String(params.startMonth).trim() !== ''
  const hasEndMonth = params?.endMonth !== undefined && params?.endMonth !== null && String(params.endMonth).trim() !== ''
  const hasStart = params?.startDate !== undefined && params?.startDate !== null && String(params.startDate).trim() !== ''
  const hasEnd = params?.endDate !== undefined && params?.endDate !== null && String(params.endDate).trim() !== ''

  if ((hasStartMonth || hasEndMonth) && (hasStart || hasEnd)) return '财务期间参数不能同时使用会计月份和日期范围'
  if (hasStartMonth !== hasEndMonth) return '请选择完整的会计月份'
  if (hasStartMonth && hasEndMonth) {
    const startMonth = normalizeFinanceStatementMonth(params?.startMonth)
    const endMonth = normalizeFinanceStatementMonth(params?.endMonth)
    if (!startMonth || !endMonth) return '会计月份格式不正确'
    if (startMonth > endMonth) return '会计期间开始月份不能晚于结束月份'
    if (monthCountInclusive(monthStartDate(startMonth), monthEndDate(endMonth)) > FINANCE_STATEMENT_MAX_MONTHS) {
      return `财务期间不能超过 ${FINANCE_STATEMENT_MAX_MONTHS} 个月`
    }
    return ''
  }

  if (hasStart !== hasEnd) return '请选择完整的财务期间'
  if (!hasStart && !hasEnd) return ''

  const startDate = normalizeFinanceStatementDate(params?.startDate)
  const endDate = normalizeFinanceStatementDate(params?.endDate)
  if (!startDate || !endDate) return '财务期间日期格式不正确'
  if (startDate > endDate) return '财务期间开始日期不能晚于结束日期'
  if (monthCountInclusive(startDate, endDate) > FINANCE_STATEMENT_MAX_MONTHS) {
    return `财务期间不能超过 ${FINANCE_STATEMENT_MAX_MONTHS} 个月`
  }
  return ''
}

export function createFinanceStatementScope(params?: Record<string, any>, today?: string | Date): FinanceStatementScope {
  const rangeError = validateFinanceStatementRange(params)
  if (rangeError) throw new Error(rangeError)

  const startMonth = normalizeFinanceStatementMonth(params?.startMonth)
  const endMonth = normalizeFinanceStatementMonth(params?.endMonth)
  if (startMonth && endMonth) {
    const startDate = monthStartDate(startMonth)
    const endDate = monthEndDate(endMonth)
    const monthKeys = listFinanceStatementMonthKeys(startDate, endDate)
    return {
      periodMode: 'ACCOUNTING_MONTHS',
      months: monthKeys.length,
      monthKeys,
      startDate,
      endDate,
    }
  }

  const startDate = normalizeFinanceStatementDate(params?.startDate)
  const endDate = normalizeFinanceStatementDate(params?.endDate)
  if (startDate && endDate) {
    const monthKeys = listFinanceStatementMonthKeys(startDate, endDate)
    return {
      periodMode: 'DATE_RANGE',
      months: monthKeys.length,
      monthKeys,
      startDate,
      endDate,
    }
  }

  const months = clampMonthCount(params?.months)
  const base = parseDateOnly(today) || new Date()
  const monthDates: Date[] = []
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    monthDates.push(new Date(base.getFullYear(), base.getMonth() - offset, 1))
  }
  const start = monthDates[0]
  const recentEndMonth = monthDates[monthDates.length - 1]
  const end = new Date(recentEndMonth.getFullYear(), recentEndMonth.getMonth() + 1, 0)
  const monthKeys = monthDates.map(monthKeyFromDate)
  return {
    periodMode: 'RECENT_MONTHS',
    months,
    monthKeys,
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(end),
  }
}
