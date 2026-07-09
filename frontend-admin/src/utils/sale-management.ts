export type SalesMetricValueType = 'money' | 'number'
export type SalesMetricTone = 'default' | 'success' | 'warning' | 'danger'

export type SalesMetricCard = {
  label: string
  value: number
  valueType?: SalesMetricValueType
  tone?: SalesMetricTone
  meta?: string
}

function toNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function roundMoney(value: unknown) {
  return Number(toNumber(value).toFixed(2))
}

function normalizeDateOnly(value: unknown) {
  const text = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10)
}

function normalizeStatus(value: unknown) {
  return String(value || '').trim().toUpperCase()
}

function hasText(value: unknown) {
  return String(value ?? '').trim() !== ''
}

function orderTotalAmount(row: Record<string, any>) {
  return roundMoney(row.totalAmount ?? row.total_amount ?? row.amount)
}

function orderReceivedAmount(row: Record<string, any>) {
  return roundMoney(row.receivedAmount ?? row.received_amount)
}

function orderReceivableAmount(row: Record<string, any>) {
  const explicit = row.receivableAmount ?? row.receivable_amount
  if (explicit !== undefined && explicit !== null && explicit !== '') return Math.max(roundMoney(explicit), 0)
  return Math.max(roundMoney(orderTotalAmount(row) - orderReceivedAmount(row)), 0)
}

function orderQty(row: Record<string, any>) {
  return Math.max(toNumber(row.quantity ?? row.qty), 0)
}

function orderDeliveredQty(row: Record<string, any>) {
  return Math.max(toNumber(row.deliveredQty ?? row.delivered_qty), 0)
}

function isPartialShipment(row: Record<string, any>) {
  const status = normalizeStatus(row.status)
  const qty = orderQty(row)
  const delivered = orderDeliveredQty(row)
  return status === 'PARTIAL' || (qty > 0 && delivered > 0 && delivered < qty)
}

function isOverdueDelivery(row: Record<string, any>, today: string) {
  const deliveryDate = normalizeDateOnly(row.deliveryDate ?? row.delivery_date)
  const status = normalizeStatus(row.status)
  return Boolean(deliveryDate && today && deliveryDate < today && !['SHIPPED', 'CANCELLED'].includes(status))
}

function paymentAmount(row: Record<string, any>) {
  return roundMoney(row.amount ?? row.payAmount ?? row.pay_amount)
}

function paymentDate(row: Record<string, any>) {
  return normalizeDateOnly(row.paymentDate ?? row.payDate ?? row.pay_date)
}

function orderDueDate(row: Record<string, any>) {
  return normalizeDateOnly(row.dueDate ?? row.due_date ?? row.receivableDueDate ?? row.receivable_due_date ?? row.deliveryDate ?? row.delivery_date)
}

export function buildSaleOrderMetricCards(rows: Record<string, any>[], today = todayDateOnly()): SalesMetricCard[] {
  const totalAmount = rows.reduce((sum, row) => sum + orderTotalAmount(row), 0)
  const pendingApproval = rows.filter((row) => normalizeStatus(row.status) === 'DRAFT').length
  const overdueDelivery = rows.filter((row) => isOverdueDelivery(row, today)).length
  const unreceivedAmount = rows.reduce((sum, row) => sum + orderReceivableAmount(row), 0)
  const partialShipment = rows.filter(isPartialShipment).length

  return [
    { label: '订单总额', value: roundMoney(totalAmount), valueType: 'money', tone: 'success' },
    { label: '待审核订单', value: pendingApproval, tone: pendingApproval ? 'warning' : 'default' },
    { label: '逾期交付', value: overdueDelivery, tone: overdueDelivery ? 'danger' : 'default' },
    { label: '未回款金额', value: roundMoney(unreceivedAmount), valueType: 'money', tone: unreceivedAmount ? 'warning' : 'default' },
    { label: '部分出库', value: partialShipment, tone: partialShipment ? 'warning' : 'default' },
  ]
}

export function buildSaleDeliveryMetricCards(rows: Record<string, any>[], today = todayDateOnly()): SalesMetricCard[] {
  const todayShipmentQty = rows
    .filter((row) => normalizeDateOnly(row.deliveryDate ?? row.delivery_date) === today)
    .reduce((sum, row) => sum + toNumber(row.totalQty ?? row.total_qty ?? row.qty), 0)
  const inTransit = rows.filter((row) => normalizeStatus(row.status) === 'IN_TRANSIT').length
  const received = rows.filter((row) => normalizeStatus(row.status) === 'RECEIVED').length
  const missingLogistics = rows.filter((row) => {
    const status = normalizeStatus(row.status)
    return status !== 'CANCELLED' && (!hasText(row.logisticsCompany ?? row.logistics_company) || !hasText(row.trackingNo ?? row.tracking_no))
  }).length
  const exceptionCount = rows.filter((row) => normalizeStatus(row.status) === 'CANCELLED').length

  return [
    { label: '今日发货', value: Number(todayShipmentQty.toFixed(2)), tone: 'success' },
    { label: '运输中', value: inTransit, tone: inTransit ? 'warning' : 'default' },
    { label: '已签收', value: received, tone: 'success' },
    { label: '物流缺失', value: missingLogistics, tone: missingLogistics ? 'warning' : 'default' },
    { label: '异常/取消', value: exceptionCount, tone: exceptionCount ? 'danger' : 'default' },
  ]
}

export function buildSalePaymentMetricCards(
  paymentRows: Record<string, any>[],
  orderRows: Record<string, any>[],
  today = todayDateOnly(),
  overPaymentRiskCount = 0
): SalesMetricCard[] {
  const todayPayment = paymentRows
    .filter((row) => paymentDate(row) === today)
    .reduce((sum, row) => sum + paymentAmount(row), 0)
  const openReceivable = orderRows.reduce((sum, row) => sum + orderReceivableAmount(row), 0)
  const overdueReceivable = orderRows
    .filter((row) => {
      const dueDate = orderDueDate(row)
      return dueDate && today && dueDate < today && orderReceivableAmount(row) > 0 && normalizeStatus(row.status) !== 'CANCELLED'
    })
    .reduce((sum, row) => sum + orderReceivableAmount(row), 0)
  const partialPaid = orderRows.filter((row) => {
    const paymentStatus = normalizeStatus(row.paymentStatus ?? row.payment_status)
    return paymentStatus === 'PARTIAL' || (orderReceivedAmount(row) > 0 && orderReceivableAmount(row) > 0)
  }).length

  return [
    { label: '今日回款', value: roundMoney(todayPayment), valueType: 'money', tone: 'success' },
    { label: '未收余额', value: roundMoney(openReceivable), valueType: 'money', tone: openReceivable ? 'warning' : 'default' },
    { label: '逾期应收', value: roundMoney(overdueReceivable), valueType: 'money', tone: overdueReceivable ? 'danger' : 'default' },
    { label: '部分回款', value: partialPaid, tone: partialPaid ? 'warning' : 'default' },
    { label: '超额风险拦截', value: Math.max(Math.trunc(toNumber(overPaymentRiskCount)), 0), tone: overPaymentRiskCount ? 'danger' : 'default' },
  ]
}
