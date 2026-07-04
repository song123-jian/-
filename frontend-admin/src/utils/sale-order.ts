export const SALE_ORDER_STATUSES = ['DRAFT', 'APPROVED', 'CONFIRMED', 'PARTIAL', 'SHIPPED', 'CANCELLED'] as const
export const SALE_ORDER_PAYMENT_STATUSES = ['UNPAID', 'PARTIAL', 'PAID'] as const

export type SaleOrderStatus = (typeof SALE_ORDER_STATUSES)[number]
export type SaleOrderPaymentStatus = (typeof SALE_ORDER_PAYMENT_STATUSES)[number]
export type SaleOrderTagType = 'success' | 'info' | 'warning' | 'danger' | 'primary'

export type SaleOrderItemLike = {
  id?: number | string | null
  productId?: number | string | null
  product_id?: number | string | null
  qty?: number | string | null
  quantity?: number | string | null
  unitPrice?: number | string | null
  unit_price?: number | string | null
  deliveredQty?: number | string | null
  delivered_qty?: number | string | null
  producedQty?: number | string | null
  produced_qty?: number | string | null
  remark?: string | null
}

export type SaleOrderLike = {
  id?: number | string | null
  customerId?: number | string | null
  customer_id?: number | string | null
  productId?: number | string | null
  product_id?: number | string | null
  qty?: number | string | null
  quantity?: number | string | null
  unitPrice?: number | string | null
  unit_price?: number | string | null
  orderDate?: string | null
  order_date?: string | null
  deliveryDate?: string | null
  delivery_date?: string | null
  status?: string | null
  totalAmount?: number | string | null
  total_amount?: number | string | null
  receivedAmount?: number | string | null
  received_amount?: number | string | null
  deliveredQty?: number | string | null
  delivered_qty?: number | string | null
  producedQty?: number | string | null
  produced_qty?: number | string | null
  remark?: string | null
  itemRemark?: string | null
  items?: SaleOrderItemLike[] | null
}

export type NormalizedSaleOrderItem = {
  productId: number
  qty: number
  unitPrice: number
  amount: number
  remark: string
}

export type SaleOrderPayload = {
  customerId: number
  orderDate: string
  deliveryDate?: string
  remark?: string
  items: NormalizedSaleOrderItem[]
}

function toNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

function normalizeDateOnly(value: unknown) {
  const text = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

export function roundSaleOrderQty(value: unknown) {
  return Number(toNumber(value).toFixed(2))
}

export function roundSaleOrderMoney(value: unknown) {
  return Number(toNumber(value).toFixed(2))
}

export function normalizeSaleOrderStatus(value?: string | null) {
  return String(value || '').trim().toUpperCase()
}

export function getSaleOrderStatusMeta(value?: string | null) {
  const map: Record<string, { label: string; type: SaleOrderTagType }> = {
    DRAFT: { label: '草稿', type: 'info' },
    APPROVED: { label: '已审核', type: 'primary' },
    CONFIRMED: { label: '已确认', type: 'primary' },
    PARTIAL: { label: '部分出库', type: 'warning' },
    SHIPPED: { label: '已出库', type: 'success' },
    CANCELLED: { label: '已取消', type: 'info' },
  }
  return map[normalizeSaleOrderStatus(value)] || { label: value || '-', type: 'info' }
}

export function getSaleOrderPaymentStatusMeta(value?: string | null) {
  const map: Record<string, { label: string; type: SaleOrderTagType }> = {
    UNPAID: { label: '未回款', type: 'info' },
    PARTIAL: { label: '部分回款', type: 'warning' },
    PAID: { label: '已回款', type: 'success' },
  }
  return map[normalizeSaleOrderStatus(value)] || { label: value || '-', type: 'info' }
}

export function getSaleOrderItemQty(item?: SaleOrderItemLike | null) {
  return Math.max(roundSaleOrderQty(item?.qty ?? item?.quantity), 0)
}

export function getSaleOrderItemUnitPrice(item?: SaleOrderItemLike | null) {
  return Math.max(roundSaleOrderMoney(item?.unitPrice ?? item?.unit_price), 0)
}

export function getSaleOrderItemAmount(item?: SaleOrderItemLike | null) {
  return roundSaleOrderMoney(getSaleOrderItemQty(item) * getSaleOrderItemUnitPrice(item))
}

export function getSaleOrderDeliveredQty(order?: SaleOrderLike | null) {
  if (hasValue(order?.deliveredQty ?? order?.delivered_qty)) return roundSaleOrderQty(order?.deliveredQty ?? order?.delivered_qty)
  return roundSaleOrderQty((order?.items || []).reduce((sum, item) => sum + toNumber(item.deliveredQty ?? item.delivered_qty), 0))
}

export function getSaleOrderProducedQty(order?: SaleOrderLike | null) {
  if (hasValue(order?.producedQty ?? order?.produced_qty)) return roundSaleOrderQty(order?.producedQty ?? order?.produced_qty)
  return roundSaleOrderQty((order?.items || []).reduce((sum, item) => sum + toNumber(item.producedQty ?? item.produced_qty), 0))
}

export function normalizeSaleOrderItems(input?: SaleOrderLike | SaleOrderItemLike[] | null) {
  const source = Array.isArray(input)
    ? input
    : Array.isArray(input?.items) && input.items.length
      ? input.items
      : hasValue(input?.productId ?? input?.product_id)
        ? [
            {
              productId: input?.productId ?? input?.product_id,
              qty: input?.qty ?? input?.quantity,
              unitPrice: input?.unitPrice ?? input?.unit_price,
              remark: input?.itemRemark || input?.remark,
            },
          ]
        : []

  return source.map((row) => {
    const productId = Math.trunc(toNumber(row.productId ?? row.product_id))
    const qty = getSaleOrderItemQty(row)
    const unitPrice = getSaleOrderItemUnitPrice(row)
    return {
      productId,
      qty,
      unitPrice,
      amount: roundSaleOrderMoney(qty * unitPrice),
      remark: String(row.remark || '').trim(),
    }
  })
}

export function getSaleOrderTotalAmount(items?: SaleOrderItemLike[] | null) {
  return roundSaleOrderMoney((items || []).reduce((sum, item) => sum + getSaleOrderItemAmount(item), 0))
}

export function validateSaleOrderInput(input?: SaleOrderLike | null) {
  const customerId = Math.trunc(toNumber(input?.customerId ?? input?.customer_id))
  if (!customerId) return '请选择客户'
  const items = normalizeSaleOrderItems(input)
  if (!items.length) return '请至少添加一条销售订单明细'
  const productIds = new Set<number>()
  for (let index = 0; index < items.length; index += 1) {
    const lineNo = index + 1
    const row = items[index]
    const rawRow = Array.isArray(input?.items) ? input.items[index] : null
    const rawProductId = rawRow ? toNumber(rawRow.productId ?? rawRow.product_id) : row.productId
    const rawQty = rawRow ? toNumber(rawRow.qty ?? rawRow.quantity) : row.qty
    const rawUnitPrice = rawRow ? toNumber(rawRow.unitPrice ?? rawRow.unit_price) : row.unitPrice
    if (!row.productId || !Number.isInteger(rawProductId) || rawProductId <= 0) return `第 ${lineNo} 行请选择产品`
    if (productIds.has(row.productId)) return `第 ${lineNo} 行产品重复`
    productIds.add(row.productId)
    if (!Number.isInteger(rawQty) || row.qty <= 0) return `第 ${lineNo} 行数量必须是大于 0 的整数`
    if (!Number.isFinite(rawUnitPrice) || rawUnitPrice < 0) return `第 ${lineNo} 行单价不能为负数`
  }
  const orderDate = normalizeDateOnly(input?.orderDate ?? input?.order_date)
  const rawOrderDate = String(input?.orderDate ?? input?.order_date ?? '').trim()
  if (!orderDate) return rawOrderDate ? '订单日期格式不正确' : '请选择订单日期'
  const deliveryDate = normalizeDateOnly(input?.deliveryDate ?? input?.delivery_date)
  const rawDeliveryDate = String(input?.deliveryDate ?? input?.delivery_date ?? '').trim()
  if (rawDeliveryDate && !deliveryDate) return '交货日期格式不正确'
  if (deliveryDate && orderDate && deliveryDate < orderDate) return '交货日期不能早于订单日期'
  return ''
}

export function buildSaleOrderPayload(input: SaleOrderLike): SaleOrderPayload {
  const message = validateSaleOrderInput(input)
  if (message) throw new Error(message)
  const orderDate = normalizeDateOnly(input.orderDate ?? input.order_date)
  const deliveryDate = normalizeDateOnly(input.deliveryDate ?? input.delivery_date)
  return {
    customerId: Math.trunc(toNumber(input.customerId ?? input.customer_id)),
    orderDate,
    ...(deliveryDate ? { deliveryDate } : {}),
    ...(String(input.remark || '').trim() ? { remark: String(input.remark || '').trim() } : {}),
    items: normalizeSaleOrderItems(input),
  }
}

export function canEditSaleOrder(row?: SaleOrderLike | null) {
  return normalizeSaleOrderStatus(row?.status) === 'DRAFT'
}

export function canApproveSaleOrder(row?: SaleOrderLike | null) {
  const explicitAmount = row?.totalAmount ?? row?.total_amount
  const totalAmount = roundSaleOrderMoney(explicitAmount) || getSaleOrderTotalAmount(row?.items)
  return normalizeSaleOrderStatus(row?.status) === 'DRAFT' && totalAmount > 0
}

export function canDeleteSaleOrder(row?: SaleOrderLike | null) {
  const status = normalizeSaleOrderStatus(row?.status)
  const receivedAmount = roundSaleOrderMoney(row?.receivedAmount ?? row?.received_amount)
  return !['PARTIAL', 'SHIPPED'].includes(status)
    && receivedAmount <= 0
    && getSaleOrderDeliveredQty(row) <= 0
    && getSaleOrderProducedQty(row) <= 0
}
