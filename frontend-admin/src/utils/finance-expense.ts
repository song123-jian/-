export const FINANCE_EXPENSE_TYPES = [
  { label: '房租', value: 'RENT' },
  { label: '水电费', value: 'ELECTRICITY' },
  { label: '水费', value: 'WATER' },
  { label: '物料费', value: 'MATERIAL' },
  { label: '维修费', value: 'MAINTENANCE' },
  { label: '工资', value: 'SALARY' },
  { label: '其他', value: 'OTHER' },
] as const

export type FinanceExpenseType = (typeof FINANCE_EXPENSE_TYPES)[number]['value']

const typeLabelMap = new Map(FINANCE_EXPENSE_TYPES.map((item) => [item.value, item.label]))

export function normalizeExpenseType(value?: string | null) {
  return String(value || '').trim().toUpperCase()
}

export function isFinanceExpenseType(value?: string | null) {
  return typeLabelMap.has(normalizeExpenseType(value) as FinanceExpenseType)
}

export function getFinanceExpenseTypeText(value?: string | null) {
  const normalized = normalizeExpenseType(value)
  return typeLabelMap.get(normalized as FinanceExpenseType) || value || '-'
}

export function roundExpenseAmount(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0
}

export function validateExpenseAmount(value: unknown) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return '费用金额必须大于 0'
  if (amount > 99999999.99) return '费用金额不能超过 99,999,999.99'
  if (!Number.isFinite(roundExpenseAmount(amount))) return '费用金额格式不正确'
  return ''
}

export function normalizeExpenseDate(value?: string | Date | null) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return value.toISOString().slice(0, 10)
  }
  const text = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  const date = new Date(`${text}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '' : text
}

export function validateExpenseDate(value?: string | Date | null, today?: string | Date) {
  const date = normalizeExpenseDate(value)
  if (!date) return '请选择费用日期'
  const todayText = normalizeExpenseDate(today || new Date())
  if (todayText && date > todayText) return '费用日期不能晚于今天'
  return ''
}

export function getExpenseMonthKey(value?: string | Date | null) {
  return normalizeExpenseDate(value).slice(0, 7)
}

export function normalizeExpensePayee(value?: string | null) {
  return String(value || '').trim()
}

export function validateExpensePayee(value?: string | null) {
  const payee = normalizeExpensePayee(value)
  if (!payee) return '请输入收款人'
  if (payee.length > 100) return '收款人不能超过 100 个字符'
  return ''
}

export function normalizeExpenseKeyword(value?: string | null) {
  return String(value || '')
    .trim()
    .replace(/[,%_*()"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}
