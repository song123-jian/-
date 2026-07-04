export const COLLECTABLE_PAYMENT_ORDER_STATUSES = ['APPROVED', 'CONFIRMED', 'PARTIAL', 'SHIPPED'] as const
export const SALE_PAYMENT_METHOD_OPTIONS = [
  { label: '银行转账', value: 'BANK_TRANSFER' },
  { label: '现金', value: 'CASH' },
  { label: '支票', value: 'CHECK' },
  { label: '支付宝', value: 'ALIPAY' },
  { label: '微信', value: 'WECHAT' },
  { label: '其他', value: 'OTHER' },
] as const

export type CollectablePaymentOrderStatus = (typeof COLLECTABLE_PAYMENT_ORDER_STATUSES)[number]
export type SalePaymentMethod = (typeof SALE_PAYMENT_METHOD_OPTIONS)[number]['value']

export type SalePaymentOrderLike = {
  id?: number | string | null
  totalAmount?: number | string | null
  total_amount?: number | string | null
  receivedAmount?: number | string | null
  received_amount?: number | string | null
  receivedOpeningAmount?: number | string | null
  received_opening_amount?: number | string | null
  status?: string | null
}

export type SalePaymentRecordLike = {
  id?: number | string | null
  saleOrderId?: number | string | null
  sale_order_id?: number | string | null
  payAmount?: number | string | null
  pay_amount?: number | string | null
  amount?: number | string | null
  paymentDate?: string | null
  payDate?: string | null
  pay_date?: string | null
  paymentMethod?: string | null
  payMethod?: string | null
  pay_method?: string | null
  invoiceNo?: string | null
  invoice_no?: string | null
  remark?: string | null
}

export type SalePaymentSummaryLike = {
  amount?: number | string | null
  count?: number | string | null
}

export type SalePaymentPayload = {
  saleOrderId: number
  amount: number
  paymentDate: string
  paymentMethod: SalePaymentMethod
  invoiceNo?: string
  remark?: string
}

export function toPaymentNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function roundPaymentMoney(value: unknown) {
  return Number(toPaymentNumber(value).toFixed(2))
}

export function normalizePaymentStatus(value?: string | null) {
  return String(value || '').toUpperCase()
}

export function normalizePaymentDate(value: unknown) {
  const text = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

export function normalizePaymentMethod(value?: string | null) {
  return String(value || '').trim().toUpperCase()
}

export function isSalePaymentMethod(value?: string | null): value is SalePaymentMethod {
  return SALE_PAYMENT_METHOD_OPTIONS.some((item) => item.value === normalizePaymentMethod(value))
}

export function getPaymentMethodLabel(value?: string | null) {
  const method = normalizePaymentMethod(value)
  return SALE_PAYMENT_METHOD_OPTIONS.find((item) => item.value === method)?.label || value || '-'
}

export function isSaleOrderCollectableForPayment(status?: string | null) {
  return COLLECTABLE_PAYMENT_ORDER_STATUSES.includes(
    normalizePaymentStatus(status) as CollectablePaymentOrderStatus
  )
}

export function getSaleOrderTotalAmount(order?: SalePaymentOrderLike | null) {
  return roundPaymentMoney(order?.totalAmount ?? order?.total_amount)
}

export function getStoredReceivedAmount(order?: SalePaymentOrderLike | null) {
  return roundPaymentMoney(order?.receivedAmount ?? order?.received_amount)
}

export function getStoredReceivedOpeningAmount(order?: SalePaymentOrderLike | null) {
  const value = order?.receivedOpeningAmount ?? order?.received_opening_amount
  if (value === undefined || value === null || value === '') return undefined
  return Math.max(roundPaymentMoney(value), 0)
}

export function getPaymentSummaryAmount(summary?: SalePaymentSummaryLike | null) {
  return roundPaymentMoney(summary?.amount)
}

export function getPaymentSummaryCount(summary?: SalePaymentSummaryLike | null) {
  const count = Number(summary?.count || 0)
  return Number.isFinite(count) ? Math.max(Math.trunc(count), 0) : 0
}

export function getPaymentRecordAmount(record?: SalePaymentRecordLike | null) {
  return roundPaymentMoney(record?.payAmount ?? record?.pay_amount ?? record?.amount)
}

export function sumSalePaymentRecords(records: SalePaymentRecordLike[], saleOrderId?: number | string | null) {
  const orderKey = Number(saleOrderId || 0)
  return roundPaymentMoney(
    records
      .filter((item) => !orderKey || Number(item.saleOrderId ?? item.sale_order_id) === orderKey)
      .reduce((sum, item) => sum + getPaymentRecordAmount(item), 0)
  )
}

export function getEffectiveReceivedAmount(
  order?: SalePaymentOrderLike | null,
  records?: SalePaymentRecordLike[] | null
) {
  if (records?.length) return sumSalePaymentRecords(records, order?.id)
  return getStoredReceivedAmount(order)
}

export function getSaleOrderPaymentBaseAmount(
  order?: SalePaymentOrderLike | null,
  fullSummary?: SalePaymentSummaryLike | null
) {
  const openingAmount = getStoredReceivedOpeningAmount(order)
  if (openingAmount !== undefined) return openingAmount

  const storedReceivedAmount = getStoredReceivedAmount(order)
  if (!getPaymentSummaryCount(fullSummary)) return storedReceivedAmount
  return Math.max(roundPaymentMoney(storedReceivedAmount - getPaymentSummaryAmount(fullSummary)), 0)
}

export function getSaleOrderReceivedAmountFromSummary(
  order?: SalePaymentOrderLike | null,
  fullSummary?: SalePaymentSummaryLike | null
) {
  if (!getPaymentSummaryCount(fullSummary) && getStoredReceivedOpeningAmount(order) === undefined) {
    return getStoredReceivedAmount(order)
  }
  return roundPaymentMoney(getSaleOrderPaymentBaseAmount(order, fullSummary) + getPaymentSummaryAmount(fullSummary))
}

export function getSaleOrderReceivedAmountAsOf(
  order?: SalePaymentOrderLike | null,
  fullSummary?: SalePaymentSummaryLike | null,
  asOfSummary?: SalePaymentSummaryLike | null
) {
  if (!getPaymentSummaryCount(fullSummary) && getStoredReceivedOpeningAmount(order) === undefined) {
    return getStoredReceivedAmount(order)
  }
  return roundPaymentMoney(getSaleOrderPaymentBaseAmount(order, fullSummary) + getPaymentSummaryAmount(asOfSummary))
}

export function getSaleOrderReceivableAmount(
  order?: SalePaymentOrderLike | null,
  records?: SalePaymentRecordLike[] | null
) {
  return Math.max(roundPaymentMoney(getSaleOrderTotalAmount(order) - getEffectiveReceivedAmount(order, records)), 0)
}

export function getEditablePaymentLimit(
  order?: SalePaymentOrderLike | null,
  records?: SalePaymentRecordLike[] | null,
  editingRecord?: SalePaymentRecordLike | null
) {
  const baseReceivable = getSaleOrderReceivableAmount(order, records)
  const editingOrderId = editingRecord?.saleOrderId ?? editingRecord?.sale_order_id ?? 0
  const isSameOrder = Number(editingOrderId) === Number(order?.id || 0)
  return roundPaymentMoney(baseReceivable + (isSameOrder ? getPaymentRecordAmount(editingRecord) : 0))
}

export function getPaymentStatus(totalAmount: unknown, receivedAmount: unknown) {
  const total = roundPaymentMoney(totalAmount)
  const received = roundPaymentMoney(receivedAmount)
  if (received <= 0) return 'UNPAID'
  if (total > 0 && received >= total) return 'PAID'
  return 'PARTIAL'
}

export function validatePaymentAmount(amount: unknown, limit: unknown) {
  const payAmount = roundPaymentMoney(amount)
  const maxAmount = roundPaymentMoney(limit)
  if (!Number.isFinite(Number(amount)) || payAmount <= 0) return '回款金额必须大于 0'
  if (payAmount > maxAmount) return '回款金额不能超过可回款金额'
  return ''
}

export function validateSalePaymentInput(input?: SalePaymentRecordLike | null, limit?: unknown) {
  const saleOrderId = Math.trunc(toPaymentNumber(input?.saleOrderId ?? input?.sale_order_id))
  if (!saleOrderId) return '请选择销售订单'

  const amountMessage = validatePaymentAmount(input?.payAmount ?? input?.pay_amount ?? input?.amount, limit ?? Number.MAX_SAFE_INTEGER)
  if (amountMessage) return amountMessage

  const rawPaymentDate = String(input?.paymentDate ?? input?.payDate ?? input?.pay_date ?? '').trim()
  if (!rawPaymentDate) return '请选择回款日期'
  if (!normalizePaymentDate(rawPaymentDate)) return '回款日期格式不正确'

  const method = normalizePaymentMethod(input?.paymentMethod ?? input?.payMethod ?? input?.pay_method)
  if (!method) return '请选择付款方式'
  if (!isSalePaymentMethod(method)) return '付款方式不在允许范围内'

  return ''
}

export function buildSalePaymentPayload(input: SalePaymentRecordLike, limit?: unknown): SalePaymentPayload {
  const message = validateSalePaymentInput(input, limit)
  if (message) throw new Error(message)

  const invoiceNo = String(input.invoiceNo ?? input.invoice_no ?? '').trim()
  const remark = String(input.remark || '').trim()

  return {
    saleOrderId: Math.trunc(toPaymentNumber(input.saleOrderId ?? input.sale_order_id)),
    amount: roundPaymentMoney(input.payAmount ?? input.pay_amount ?? input.amount),
    paymentDate: normalizePaymentDate(input.paymentDate ?? input.payDate ?? input.pay_date),
    paymentMethod: normalizePaymentMethod(input.paymentMethod ?? input.payMethod ?? input.pay_method) as SalePaymentMethod,
    ...(invoiceNo ? { invoiceNo } : {}),
    ...(remark ? { remark } : {}),
  }
}
