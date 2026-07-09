import {
  normalizeFinanceStatementDate,
} from './finance-statement.ts'

export type FinanceReceivableOrderLike = {
  id?: number | string | null
  orderNo?: string | null
  order_no?: string | null
  customerId?: number | string | null
  customer_id?: number | string | null
  customerName?: string | null
  customer_name?: string | null
  orderDate?: string | null
  order_date?: string | null
  deliveryDate?: string | null
  delivery_date?: string | null
  totalAmount?: number | string | null
  total_amount?: number | string | null
  receivedAmount?: number | string | null
  received_amount?: number | string | null
  status?: string | null
}

export type FinanceReceivableCustomerLike = {
  id?: number | string | null
  name?: string | null
  shortName?: string | null
  short_name?: string | null
  paymentDays?: number | string | null
  payment_days?: number | string | null
  creditLevel?: string | null
  credit_level?: string | null
}

export type FinanceReceivableRow = {
  saleOrderId: number
  orderNo: string
  customerId: number
  customerName: string
  orderDate: string
  dueDate: string
  paymentDays: number
  totalAmount: number
  receivedAmount: number
  receivableAmount: number
  overdueDays: number
  riskLevel: 'error' | 'warning' | 'info' | 'success'
  riskText: string
  status: string
  creditLevel: string
}

function toNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function roundMoney(value: unknown) {
  return Number(toNumber(value).toFixed(2))
}

function parseDateOnly(value?: string | null) {
  const normalized = normalizeFinanceStatementDate(value)
  if (!normalized) return null
  const [year, month, day] = normalized.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function normalizeReceivablePaymentDays(value: unknown) {
  const days = Math.trunc(toNumber(value))
  if (!Number.isFinite(days) || days < 0) return 0
  return Math.min(days, 365)
}

export function getReceivableDueDate(orderDate?: string | null, paymentDays?: unknown) {
  const base = parseDateOnly(orderDate)
  if (!base) return ''
  const due = new Date(base)
  due.setDate(due.getDate() + normalizeReceivablePaymentDays(paymentDays))
  return formatDateOnly(due)
}

export function getReceivableOverdueDays(dueDate?: string | null, asOfDate?: string | null) {
  const due = parseDateOnly(dueDate)
  const asOf = parseDateOnly(asOfDate)
  if (!due || !asOf || due >= asOf) return 0
  return Math.floor((asOf.getTime() - due.getTime()) / 86400000)
}

export function getReceivableRisk(overdueDays: unknown, receivableAmount: unknown) {
  const days = Math.max(0, Math.trunc(toNumber(overdueDays)))
  const amount = roundMoney(receivableAmount)
  if (amount <= 0) return { riskLevel: 'success' as const, riskText: '已结清' }
  if (days >= 60) return { riskLevel: 'error' as const, riskText: '严重逾期' }
  if (days >= 30) return { riskLevel: 'warning' as const, riskText: '逾期超30天' }
  if (days > 0) return { riskLevel: 'warning' as const, riskText: '已逾期' }
  return { riskLevel: 'info' as const, riskText: '账期内' }
}

export function buildFinanceReceivableRow(
  order: FinanceReceivableOrderLike,
  customer?: FinanceReceivableCustomerLike | null,
  asOfDate?: string | null,
): FinanceReceivableRow {
  const customerName = String(
    order.customerName
      ?? order.customer_name
      ?? customer?.shortName
      ?? customer?.short_name
      ?? customer?.name
      ?? '-',
  ).trim() || '-'
  const orderDate = normalizeFinanceStatementDate(order.orderDate ?? order.order_date)
  const paymentDays = normalizeReceivablePaymentDays(customer?.paymentDays ?? customer?.payment_days)
  const dueDate = getReceivableDueDate(orderDate, paymentDays)
  const totalAmount = roundMoney(order.totalAmount ?? order.total_amount)
  const receivedAmount = roundMoney(order.receivedAmount ?? order.received_amount)
  const receivableAmount = Math.max(roundMoney(totalAmount - receivedAmount), 0)
  const overdueDays = getReceivableOverdueDays(dueDate, asOfDate)
  const risk = getReceivableRisk(overdueDays, receivableAmount)

  return {
    saleOrderId: Math.trunc(toNumber(order.id)),
    orderNo: String(order.orderNo ?? order.order_no ?? '').trim() || `#${order.id || '-'}`,
    customerId: Math.trunc(toNumber(order.customerId ?? order.customer_id)),
    customerName,
    orderDate,
    dueDate,
    paymentDays,
    totalAmount,
    receivedAmount,
    receivableAmount,
    overdueDays,
    riskLevel: risk.riskLevel,
    riskText: risk.riskText,
    status: String(order.status || '').toUpperCase(),
    creditLevel: String(customer?.creditLevel ?? customer?.credit_level ?? '').trim(),
  }
}

export function summarizeFinanceReceivables(rows: FinanceReceivableRow[]) {
  return rows.reduce(
    (summary, row) => {
      summary.totalAmount = roundMoney(summary.totalAmount + row.totalAmount)
      summary.receivedAmount = roundMoney(summary.receivedAmount + row.receivedAmount)
      summary.receivableAmount = roundMoney(summary.receivableAmount + row.receivableAmount)
      summary.orderCount += 1
      if (row.receivableAmount > 0) summary.openOrderCount += 1
      if (row.overdueDays > 0) {
        summary.overdueOrderCount += 1
        summary.overdueAmount = roundMoney(summary.overdueAmount + row.receivableAmount)
      }
      summary.maxOverdueDays = Math.max(summary.maxOverdueDays, row.overdueDays)
      return summary
    },
    {
      totalAmount: 0,
      receivedAmount: 0,
      receivableAmount: 0,
      overdueAmount: 0,
      orderCount: 0,
      openOrderCount: 0,
      overdueOrderCount: 0,
      maxOverdueDays: 0,
    },
  )
}
