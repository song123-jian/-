export const INBOUND_ORDER_STATUSES = ['RUNNING', 'PAUSED', 'FINISHED'] as const

export type ProductionInboundOrderStatus = (typeof INBOUND_ORDER_STATUSES)[number]

export type ProductionInboundOrderLike = {
  planQty?: number | string | null
  plan_qty?: number | string | null
  completedQty?: number | string | null
  completed_qty?: number | string | null
  qualifiedQty?: number | string | null
  qualified_qty?: number | string | null
  badQty?: number | string | null
  bad_qty?: number | string | null
  inboundedQty?: number | string | null
  inbounded_qty?: number | string | null
  inboundedAmount?: number | string | null
  inbounded_amount?: number | string | null
  pickedMaterialQty?: number | string | null
  picked_material_qty?: number | string | null
  pickedMaterialAmount?: number | string | null
  picked_material_amount?: number | string | null
  status?: string | null
}

export type ProductionInboundProductLike = {
  rawMaterialUsage?: number | string | null
  raw_material_usage?: number | string | null
  piecePrice?: number | string | null
  piece_price?: number | string | null
}

export function toProductionNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function normalizeProductionStatus(value?: string | null) {
  return String(value || '').toUpperCase()
}

export function isProductionInboundOrderStatus(value?: string | null) {
  return INBOUND_ORDER_STATUSES.includes(normalizeProductionStatus(value) as ProductionInboundOrderStatus)
}

export function roundProductionQty(value: unknown) {
  return Number(toProductionNumber(value).toFixed(2))
}

export function roundProductionMoney(value: unknown) {
  return Number(toProductionNumber(value).toFixed(2))
}

export function roundProductionUnitCost(value: unknown) {
  return Number(toProductionNumber(value).toFixed(4))
}

export function getQualifiedProductionQty(order?: ProductionInboundOrderLike | null) {
  const explicitQty = toProductionNumber(order?.qualifiedQty ?? order?.qualified_qty)
  if (explicitQty > 0) return roundProductionQty(explicitQty)
  const completedQty = toProductionNumber(order?.completedQty ?? order?.completed_qty)
  const badQty = toProductionNumber(order?.badQty ?? order?.bad_qty)
  return Math.max(roundProductionQty(completedQty - badQty), 0)
}

export function getInboundedProductionQty(order?: ProductionInboundOrderLike | null) {
  return roundProductionQty(order?.inboundedQty ?? order?.inbounded_qty)
}

export function getInboundedProductionAmount(order?: ProductionInboundOrderLike | null) {
  return roundProductionMoney(order?.inboundedAmount ?? order?.inbounded_amount)
}

export function getRemainingProductionInboundQty(order?: ProductionInboundOrderLike | null) {
  return Math.max(roundProductionQty(getQualifiedProductionQty(order) - getInboundedProductionQty(order)), 0)
}

export function getRequiredMaterialQtyForInbound(qty: unknown, product?: ProductionInboundProductLike | null) {
  const rawMaterialUsage = toProductionNumber(product?.rawMaterialUsage ?? product?.raw_material_usage)
  return rawMaterialUsage > 0 ? roundProductionQty(toProductionNumber(qty) * rawMaterialUsage) : 0
}

export function getProductionInboundUnitCost(
  order?: ProductionInboundOrderLike | null,
  product?: ProductionInboundProductLike | null
) {
  const qualifiedQty = getQualifiedProductionQty(order)
  const materialAmount = toProductionNumber(order?.pickedMaterialAmount ?? order?.picked_material_amount)
  if (qualifiedQty > 0 && materialAmount > 0) return roundProductionUnitCost(materialAmount / qualifiedQty)
  return roundProductionUnitCost(product?.piecePrice ?? product?.piece_price)
}

export function getProductionInboundAmount(
  qty: unknown,
  order?: ProductionInboundOrderLike | null,
  product?: ProductionInboundProductLike | null
) {
  return roundProductionMoney(toProductionNumber(qty) * getProductionInboundUnitCost(order, product))
}

export function getProductionInboundStatus(order?: ProductionInboundOrderLike | null) {
  const qualifiedQty = getQualifiedProductionQty(order)
  if (qualifiedQty <= 0) return 'NO_OUTPUT'
  const inboundedQty = getInboundedProductionQty(order)
  if (inboundedQty <= 0) return 'NONE'
  if (inboundedQty >= qualifiedQty) return 'DONE'
  return 'PARTIAL'
}
