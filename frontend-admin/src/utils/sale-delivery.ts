export const SALE_DELIVERY_STATUSES = ['PENDING', 'SHIPPED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'] as const

export type SaleDeliveryStatus = (typeof SALE_DELIVERY_STATUSES)[number]

export type SaleDeliveryItemLike = {
  qty?: number | string | null
  deliveredQty?: number | string | null
  delivered_qty?: number | string | null
  deliveryQty?: number | string | null
}

export function toDeliveryNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function normalizeDeliveryStatus(value?: string | null) {
  return String(value || '').toUpperCase()
}

export function isSaleDeliveryStatus(value?: string | null) {
  return SALE_DELIVERY_STATUSES.includes(normalizeDeliveryStatus(value) as SaleDeliveryStatus)
}

export function isFinalSaleDeliveryStatus(value?: string | null) {
  return ['RECEIVED', 'CANCELLED'].includes(normalizeDeliveryStatus(value))
}

export function getSaleDeliveryStatusText(value?: string | null) {
  const map: Record<string, string> = {
    PENDING: '待发货',
    SHIPPED: '已发货',
    IN_TRANSIT: '运输中',
    RECEIVED: '已签收',
    CANCELLED: '已取消',
  }
  return map[normalizeDeliveryStatus(value)] || value || '-'
}

export function getSaleDeliveryStatusTag(value?: string | null) {
  const map: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'primary'> = {
    PENDING: 'info',
    SHIPPED: 'primary',
    IN_TRANSIT: 'warning',
    RECEIVED: 'success',
    CANCELLED: 'danger',
  }
  return map[normalizeDeliveryStatus(value)] || 'info'
}

export function getSaleDeliveryItemQty(item?: SaleDeliveryItemLike | null) {
  return Math.max(Number(toDeliveryNumber(item?.qty).toFixed(2)), 0)
}

export function getSaleDeliveryDeliveredQty(item?: SaleDeliveryItemLike | null) {
  return Math.max(Number(toDeliveryNumber(item?.deliveredQty ?? item?.delivered_qty).toFixed(2)), 0)
}

export function getRemainingSaleDeliveryQty(item?: SaleDeliveryItemLike | null) {
  return Math.max(Number((getSaleDeliveryItemQty(item) - getSaleDeliveryDeliveredQty(item)).toFixed(2)), 0)
}

export function sumSaleDeliveryQty(items: SaleDeliveryItemLike[]) {
  return Number(items.reduce((sum, item) => sum + toDeliveryNumber(item.deliveryQty ?? item.qty), 0).toFixed(2))
}

export function validateSaleDeliveryQty(qty: unknown, remainingQty: unknown) {
  const deliveryQty = toDeliveryNumber(qty)
  const remaining = toDeliveryNumber(remainingQty)
  if (!Number.isInteger(deliveryQty) || deliveryQty <= 0) return '发货数量必须是大于 0 的整数'
  if (deliveryQty > remaining) return '发货数量不能超过订单可发数量'
  return ''
}
