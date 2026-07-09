import { buildMrpRequirementRows } from './bom-mrp.ts'
import { buildPurchaseRequisitionSuggestion } from './injection-professional.ts'

export type SaleOrderRiskLevel = 'GREEN' | 'YELLOW' | 'RED'

export type SaleOrderRiskIssueType =
  | 'delivery_overdue'
  | 'delivery_due_soon'
  | 'approval_pending'
  | 'stock_shortage'
  | 'production_missing'
  | 'production_lagging'
  | 'material_shortage'
  | 'quality_failed'
  | 'logistics_missing'
  | 'payment_overdue'
  | 'normal'

export type SaleOrderRiskIssue = {
  type: SaleOrderRiskIssueType
  level: SaleOrderRiskLevel
  title: string
  message: string
  action: string
  route: string
}

export type SaleOrderRiskMaterialShortage = {
  materialId: number
  materialCode: string
  materialName: string
  unit: string
  requiredQty: number
  availableQty: number
  incomingQty: number
  safetyStock: number
  shortageQty: number
  requestedQty: number
  coverageRate: number
  sourceMrpNo: string
}

export type SaleOrderRiskRow = {
  orderId: number
  orderNo: string
  customerName: string
  productName: string
  status: string
  deliveryDate: string
  daysToDelivery: number | null
  orderQty: number
  deliveredQty: number
  remainingQty: number
  availableQty: number
  producedQty: number
  materialShortageCount: number
  materialShortageQty: number
  purchaseSuggestionQty: number
  materialShortages: SaleOrderRiskMaterialShortage[]
  receivableAmount: number
  riskLevel: SaleOrderRiskLevel
  riskText: string
  primaryRisk: string
  issueCount: number
  issues: SaleOrderRiskIssue[]
}

export type SaleOrderRiskSummary = {
  total: number
  red: number
  yellow: number
  green: number
  overdue: number
  dueSoon: number
  stockShortage: number
  materialShortage: number
  materialShortageQty: number
  purchaseSuggestionQty: number
  productionRisk: number
  qualityRisk: number
  paymentRisk: number
  receivableAmount: number
}

export type SaleOrderRiskInput = {
  orders?: Record<string, any>[]
  productionOrders?: Record<string, any>[]
  stockRows?: Record<string, any>[]
  productRows?: Record<string, any>[]
  qcRecords?: Record<string, any>[]
  deliveryRows?: Record<string, any>[]
  paymentRows?: Record<string, any>[]
  today?: string | Date
  dueSoonDays?: number
  paymentGraceDays?: number
}

export type SaleOrderPurchaseRequisitionQuery = Record<string, string>

export type SaleOrderPurchaseRequisitionPrefillItem = {
  materialId: number
  materialCode: string
  materialName: string
  unit: string
  shortageQty: number
  requestedQty: number
  sourceMrpNo: string
}

const CLOSED_ORDER_STATUSES = new Set(['SHIPPED', 'CANCELLED', 'CLOSED'])
const ACTIVE_PRODUCTION_STATUSES = new Set(['WAITING', 'SCHEDULED', 'RUNNING', 'PAUSED', 'PROCESSING'])
const FAILED_QC_RESULTS = new Set(['FAIL', 'FAILED', 'NG', 'REJECTED', 'UNQUALIFIED', '不合格'])
const CLOSED_QC_DISPOSAL = new Set(['CLOSED', 'DONE', 'FINISHED'])

function toNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function roundQty(value: unknown) {
  return Number(toNumber(value).toFixed(2))
}

function roundMoney(value: unknown) {
  return Number(toNumber(value).toFixed(2))
}

function normalizeText(value: unknown, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizeStatus(value: unknown) {
  return normalizeText(value).toUpperCase()
}

function normalizeDateOnly(value?: string | Date | null) {
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const text = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function dateDiffDays(left: string, right: string) {
  const leftTime = new Date(`${left}T00:00:00`).getTime()
  const rightTime = new Date(`${right}T00:00:00`).getTime()
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return null
  return Math.ceil((leftTime - rightTime) / 86400000)
}

function sameId(left: unknown, right: unknown) {
  const leftId = toNumber(left)
  const rightId = toNumber(right)
  return leftId > 0 && rightId > 0 && leftId === rightId
}

function riskRank(level: SaleOrderRiskLevel) {
  if (level === 'RED') return 0
  if (level === 'YELLOW') return 1
  return 2
}

function riskText(level: SaleOrderRiskLevel) {
  if (level === 'RED') return '高风险'
  if (level === 'YELLOW') return '需关注'
  return '正常'
}

export function getSaleOrderRiskLevelText(level: SaleOrderRiskLevel | string) {
  return riskText(level as SaleOrderRiskLevel)
}

function issue(
  type: SaleOrderRiskIssueType,
  level: SaleOrderRiskLevel,
  title: string,
  message: string,
  action: string,
  route: string,
): SaleOrderRiskIssue {
  return { type, level, title, message, action, route }
}

function orderItems(order: Record<string, any>) {
  const items = Array.isArray(order.items) && order.items.length
    ? order.items
    : order.productId || order.product_id
      ? [{
          id: order.saleOrderItemId ?? order.sale_order_item_id,
          productId: order.productId ?? order.product_id,
          productName: order.productName ?? order.product_name,
          qty: order.qty ?? order.quantity,
          deliveredQty: order.deliveredQty ?? order.delivered_qty,
          producedQty: order.producedQty ?? order.produced_qty,
        }]
      : []

  return items.map((item: any) => ({
    id: toNumber(item.id),
    productId: toNumber(item.productId ?? item.product_id),
    productName: normalizeText(item.productName ?? item.product_name ?? item.productCode ?? item.product_code, '-'),
    qty: Math.max(roundQty(item.qty ?? item.quantity), 0),
    deliveredQty: Math.max(roundQty(item.deliveredQty ?? item.delivered_qty), 0),
    producedQty: Math.max(roundQty(item.producedQty ?? item.produced_qty), 0),
  }))
}

function stockAvailableByProduct(rows: Record<string, any>[]): Map<number, number> {
  return rows.reduce<Map<number, number>>((map, row) => {
    const productId = toNumber(row.productId ?? row.product_id)
    if (!productId) return map
    const explicit = row.availableQty ?? row.available_qty
    const qty = explicit === undefined || explicit === null
      ? Math.max(toNumber(row.qty) - toNumber(row.lockedQty ?? row.locked_qty), 0)
      : Math.max(toNumber(explicit), 0)
    map.set(productId, roundQty((map.get(productId) || 0) + qty))
    return map
  }, new Map<number, number>())
}

function productRowsById(rows: Record<string, any>[] = []): Map<number, Record<string, any>> {
  return rows.reduce<Map<number, Record<string, any>>>((map, row) => {
    const id = toNumber(row.id)
    if (id) map.set(id, row)
    return map
  }, new Map<number, Record<string, any>>())
}

function productionRowsForOrder(rows: Record<string, any>[], order: Record<string, any>, itemIds: number[]) {
  return rows.filter((row) => {
    if (sameId(row.saleOrderId ?? row.sale_order_id, order.id)) return true
    const saleOrderItemId = toNumber(row.saleOrderItemId ?? row.sale_order_item_id)
    return saleOrderItemId > 0 && itemIds.includes(saleOrderItemId)
  })
}

function qcRowsForProduction(rows: Record<string, any>[], productionRows: Record<string, any>[]) {
  const prodIds = new Set(productionRows.map((row) => toNumber(row.id)).filter(Boolean))
  return rows.filter((row) => prodIds.has(toNumber(row.prodOrderId ?? row.prod_order_id)))
}

function deliveryRowsForOrder(rows: Record<string, any>[], orderId: number) {
  return rows.filter((row) => sameId(row.saleOrderId ?? row.sale_order_id, orderId))
}

function paymentRowsForOrder(rows: Record<string, any>[], orderId: number) {
  return rows.filter((row) => sameId(row.saleOrderId ?? row.sale_order_id, orderId))
}

function producedQtyOf(row: Record<string, any>) {
  return Math.max(roundQty(
    toNumber(row.qualifiedQty ?? row.qualified_qty)
      || toNumber(row.completedQty ?? row.completed_qty)
      || toNumber(row.inboundedQty ?? row.inbounded_qty),
  ), 0)
}

function stockCoverageDetailsForItems(items: ReturnType<typeof orderItems>, stockMap: Map<number, number>) {
  const leftByProduct = new Map(stockMap)
  return items.map((item) => {
    const remaining = Math.max(item.qty - item.deliveredQty, 0)
    const available = leftByProduct.get(item.productId) || 0
    const coverage = Math.min(available, remaining)
    leftByProduct.set(item.productId, Math.max(roundQty(available - coverage), 0))
    return roundQty(coverage)
  })
}

function stockCoverageForItems(items: ReturnType<typeof orderItems>, stockMap: Map<number, number>) {
  return roundQty(stockCoverageDetailsForItems(items, stockMap).reduce((sum, qty) => sum + qty, 0))
}

function itemProducedCoverage(items: ReturnType<typeof orderItems>) {
  return roundQty(items.reduce((sum, item) => {
    const remaining = Math.max(item.qty - item.deliveredQty, 0)
    return sum + Math.min(Math.max(item.producedQty, 0), remaining)
  }, 0))
}

function productionCoverageDetailsForItems(items: ReturnType<typeof orderItems>, rows: Record<string, any>[]) {
  const byItem = new Map<number, number>()
  const byProduct = new Map<number, number>()

  rows.forEach((row) => {
    const qty = producedQtyOf(row)
    if (qty <= 0) return
    const saleOrderItemId = toNumber(row.saleOrderItemId ?? row.sale_order_item_id)
    if (saleOrderItemId > 0) {
      byItem.set(saleOrderItemId, roundQty((byItem.get(saleOrderItemId) || 0) + qty))
      return
    }
    const productId = toNumber(row.productId ?? row.product_id)
    if (productId > 0) byProduct.set(productId, roundQty((byProduct.get(productId) || 0) + qty))
  })

  return items.map((item) => {
    const remaining = Math.max(item.qty - item.deliveredQty, 0)
    const itemProduced = item.id ? Math.min(byItem.get(item.id) || 0, remaining) : 0
    const productLeft = byProduct.get(item.productId) || 0
    const productProduced = Math.min(productLeft, Math.max(remaining - itemProduced, 0))
    byProduct.set(item.productId, Math.max(roundQty(productLeft - productProduced), 0))
    return Math.min(Math.max(item.producedQty, itemProduced + productProduced), remaining)
  })
}

function productionCoverageForItems(items: ReturnType<typeof orderItems>, rows: Record<string, any>[]) {
  return roundQty(productionCoverageDetailsForItems(items, rows).reduce((sum, qty) => sum + qty, 0))
}

function finishedShortageRows(
  items: ReturnType<typeof orderItems>,
  stockMap: Map<number, number>,
  productionRows: Record<string, any>[],
) {
  const stockCoverage = stockCoverageDetailsForItems(items, stockMap)
  const productionCoverage = productionCoverageDetailsForItems(items, productionRows)
  return items.map((item, index) => {
    const remainingQty = Math.max(roundQty(item.qty - item.deliveredQty), 0)
    const coveredQty = Math.min(roundQty(stockCoverage[index] + productionCoverage[index]), remainingQty)
    return {
      ...item,
      remainingQty,
      availableQty: stockCoverage[index],
      producedQty: productionCoverage[index],
      shortageQty: Math.max(roundQty(remainingQty - coveredQty), 0),
    }
  }).filter((item) => item.shortageQty > 0)
}

function productCode(row?: Record<string, any>) {
  return normalizeText(row?.code ?? row?.productCode ?? row?.product_code)
}

function productName(row?: Record<string, any>, fallback = '-') {
  return normalizeText(row?.name ?? row?.productName ?? row?.product_name ?? row?.shortName ?? row?.short_name, fallback)
}

function sourceMrpNo(orderNo: string, materialId: number) {
  const normalized = normalizeText(orderNo, 'SO').replace(/\s+/g, '')
  return `SO-MRP-${normalized}-${materialId || 'NA'}`
}

function expectedDateTime(value?: string | Date | null) {
  const date = normalizeDateOnly(value)
  return date ? `${date} 00:00:00` : ''
}

function joinedUniqueText(values: string[]) {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean))).join('、')
}

export function buildSaleOrderPurchaseRequisitionItems(row: SaleOrderRiskRow): SaleOrderPurchaseRequisitionPrefillItem[] {
  const grouped = new Map<string, SaleOrderPurchaseRequisitionPrefillItem>()
  for (const shortage of row.materialShortages) {
    const key = String(shortage.materialId || shortage.materialCode || shortage.materialName)
    const current = grouped.get(key)
    if (!current) {
      grouped.set(key, {
        materialId: shortage.materialId,
        materialCode: shortage.materialCode,
        materialName: shortage.materialName,
        unit: shortage.unit,
        shortageQty: roundQty(shortage.shortageQty),
        requestedQty: roundQty(shortage.requestedQty),
        sourceMrpNo: shortage.sourceMrpNo,
      })
      continue
    }
    current.shortageQty = roundQty(current.shortageQty + shortage.shortageQty)
    current.requestedQty = roundQty(current.requestedQty + shortage.requestedQty)
    current.sourceMrpNo = joinedUniqueText([current.sourceMrpNo, shortage.sourceMrpNo])
  }

  return Array.from(grouped.values()).sort((left, right) => {
    return right.requestedQty - left.requestedQty
      || left.materialName.localeCompare(right.materialName, 'zh-CN')
  })
}

function buildPurchaseRequisitionRemark(row: SaleOrderRiskRow, items: SaleOrderPurchaseRequisitionPrefillItem[]) {
  const materialSummary = items.map((item) => {
    const code = item.materialCode ? `(${item.materialCode})` : ''
    return `${item.materialName}${code}缺口${item.shortageQty}${item.unit || ''}，建议请购${item.requestedQty}${item.unit || ''}`
  }).join('；')
  return [
    `来源订单：${row.orderNo}`,
    `客户：${row.customerName}`,
    `产品：${row.productName}`,
    items.length > 1 ? `合并物料：${items.length}项` : '',
    materialSummary,
    `MRP：${joinedUniqueText(items.map((item) => item.sourceMrpNo))}`,
  ].filter(Boolean).join('；')
}

export function buildSaleOrderPurchaseRequisitionQuery(row: SaleOrderRiskRow): SaleOrderPurchaseRequisitionQuery | null {
  const items = buildSaleOrderPurchaseRequisitionItems(row)
  const shortage = items[0]
  if (!shortage) return null

  const query: SaleOrderPurchaseRequisitionQuery = {
    action: 'create',
    open: '1',
    batch: items.length > 1 ? '1' : '0',
    itemCount: String(items.length),
    materialId: String(shortage.materialId),
    shortageQty: String(roundQty(shortage.shortageQty)),
    requestedQty: String(roundQty(shortage.requestedQty)),
    totalRequestedQty: String(roundQty(items.reduce((sum, item) => sum + item.requestedQty, 0))),
    sourceMrpNo: shortage.sourceMrpNo,
    items: JSON.stringify(items),
    remark: buildPurchaseRequisitionRemark(row, items),
  }
  const expectedDate = expectedDateTime(row.deliveryDate)
  if (expectedDate) query.expectedDate = expectedDate
  return query
}

function materialStockRows(
  rows: Record<string, any>[],
  materialIds: number[],
  productMap: Map<number, Record<string, any>>,
) {
  const usedIds = new Set<number>()
  const stockRows = rows.map((row) => {
    const materialId = toNumber(row.materialId ?? row.material_id ?? row.productId ?? row.product_id)
    if (materialId) usedIds.add(materialId)
    const product = productMap.get(materialId)
    return {
      materialId,
      productId: materialId,
      materialCode: productCode(product),
      productCode: productCode(product),
      availableQty: row.availableQty ?? row.available_qty,
      qty: row.qty,
      lockedQty: row.lockedQty ?? row.locked_qty,
      incomingQty: row.incomingQty ?? row.incoming_qty,
      safetyStock: product?.safeStock ?? product?.safe_stock,
    }
  })

  for (const materialId of materialIds) {
    if (usedIds.has(materialId)) continue
    const product = productMap.get(materialId)
    stockRows.push({
      materialId,
      productId: materialId,
      materialCode: productCode(product),
      productCode: productCode(product),
      availableQty: 0,
      qty: 0,
      lockedQty: 0,
      incomingQty: 0,
      safetyStock: product?.safeStock ?? product?.safe_stock,
    })
  }

  return stockRows
}

function buildMaterialShortages(input: {
  order: Record<string, any>
  items: ReturnType<typeof orderItems>
  productionRows: Record<string, any>[]
  stockRows: Record<string, any>[]
  stockMap: Map<number, number>
  productMap: Map<number, Record<string, any>>
  deliveryDate: string
}): SaleOrderRiskMaterialShortage[] {
  const shortages = finishedShortageRows(input.items, input.stockMap, input.productionRows)
  if (!shortages.length || !input.productMap.size) return []

  const bomRows: Record<string, any>[] = []
  const demandRows: Record<string, any>[] = []
  const orderNo = normalizeText(input.order.orderNo ?? input.order.order_no, `#${toNumber(input.order.id) || '-'}`)

  for (const item of shortages) {
    const product = input.productMap.get(item.productId)
    const rawMaterialId = toNumber(product?.rawMaterialId ?? product?.raw_material_id)
    const rawMaterialUsage = toNumber(product?.rawMaterialUsage ?? product?.raw_material_usage)
    if (!rawMaterialId || rawMaterialUsage <= 0) continue
    const material = input.productMap.get(rawMaterialId)
    bomRows.push({
      parentProductId: item.productId,
      productName: item.productName,
      materialId: rawMaterialId,
      materialCode: productCode(material) || `M-${rawMaterialId}`,
      materialName: productName(material, `原料#${rawMaterialId}`),
      unit: normalizeText(material?.unit, ''),
      qtyPerParent: rawMaterialUsage,
    })
    demandRows.push({
      orderId: input.order.id,
      orderNo,
      productId: item.productId,
      productName: item.productName,
      demandQty: item.shortageQty,
      dueDate: input.deliveryDate,
      status: 'RUNNING',
    })
  }

  if (!bomRows.length) return []
  const materialIds = Array.from(new Set(bomRows.map((row) => toNumber(row.materialId)).filter(Boolean)))
  return buildMrpRequirementRows({
    bomRows,
    demandRows,
    stockRows: materialStockRows(input.stockRows, materialIds, input.productMap),
  })
    .filter((row) => row.shortageQty > 0)
    .map((row) => {
      const suggestion = buildPurchaseRequisitionSuggestion({
        materialId: row.materialId,
        shortageQty: row.shortageQty,
        safetyQty: 0,
        sourceMrpNo: sourceMrpNo(orderNo, row.materialId),
      })
      return {
        materialId: row.materialId,
        materialCode: row.materialCode,
        materialName: row.materialName,
        unit: row.unit,
        requiredQty: row.requiredQty,
        availableQty: row.availableQty,
        incomingQty: row.incomingQty,
        safetyStock: row.safetyStock,
        shortageQty: row.shortageQty,
        requestedQty: suggestion.requestedQty,
        coverageRate: row.coverageRate,
        sourceMrpNo: suggestion.sourceMrpNo,
      }
    })
}

function orderReceivableAmount(order: Record<string, any>, payments: Record<string, any>[]) {
  const total = roundMoney(order.totalAmount ?? order.total_amount)
  const explicit = order.receivableAmount ?? order.receivable_amount
  if (explicit !== undefined && explicit !== null && explicit !== '') return Math.max(roundMoney(explicit), 0)
  const received = payments.length
    ? payments.reduce((sum, row) => sum + roundMoney(row.payAmount ?? row.pay_amount ?? row.amount), 0)
    : roundMoney(order.receivedAmount ?? order.received_amount)
  return Math.max(roundMoney(total - received), 0)
}

function highestRiskLevel(issues: SaleOrderRiskIssue[]): SaleOrderRiskLevel {
  if (issues.some((item) => item.level === 'RED')) return 'RED'
  if (issues.some((item) => item.level === 'YELLOW')) return 'YELLOW'
  return 'GREEN'
}

export function buildSaleOrderRisks(input: SaleOrderRiskInput = {}): SaleOrderRiskRow[] {
  const today = normalizeDateOnly(input.today || new Date())
  const dueSoonDays = Math.max(Math.trunc(toNumber(input.dueSoonDays) || 3), 1)
  const paymentGraceDays = Math.max(Math.trunc(toNumber(input.paymentGraceDays) || 7), 0)
  const stockByProduct = stockAvailableByProduct(input.stockRows || [])
  const productMap = productRowsById(input.productRows || [])

  return (input.orders || []).map((order) => {
    const orderId = toNumber(order.id)
    const status = normalizeStatus(order.status)
    const items = orderItems(order)
    const itemIds = items.map((item) => item.id).filter(Boolean)
    const productionRows = productionRowsForOrder(input.productionOrders || [], order, itemIds)
    const qcRows = qcRowsForProduction(input.qcRecords || [], productionRows)
    const deliveries = deliveryRowsForOrder(input.deliveryRows || [], orderId)
    const payments = paymentRowsForOrder(input.paymentRows || [], orderId)
    const deliveryDate = normalizeDateOnly(order.deliveryDate ?? order.delivery_date)
    const daysToDelivery = deliveryDate && today ? dateDiffDays(deliveryDate, today) : null
    const orderQty = roundQty(items.reduce((sum, item) => sum + item.qty, 0) || order.quantity || order.qty)
    const deliveredQty = roundQty(items.reduce((sum, item) => sum + item.deliveredQty, 0) || order.deliveredQty || order.delivered_qty)
    const remainingQty = Math.max(roundQty(orderQty - deliveredQty), 0)
    const producedQty = Math.max(itemProducedCoverage(items), productionCoverageForItems(items, productionRows))
    const availableQty = stockCoverageForItems(items, stockByProduct)
    const materialShortages = buildMaterialShortages({
      order,
      items,
      productionRows,
      stockRows: input.stockRows || [],
      stockMap: stockByProduct,
      productMap,
      deliveryDate,
    })
    const materialShortageQty = roundQty(materialShortages.reduce((sum, item) => sum + item.shortageQty, 0))
    const purchaseSuggestionQty = roundQty(materialShortages.reduce((sum, item) => sum + item.requestedQty, 0))
    const receivableAmount = orderReceivableAmount(order, payments)
    const issues: SaleOrderRiskIssue[] = []

    if (remainingQty > 0 && deliveryDate && daysToDelivery !== null && daysToDelivery < 0 && !CLOSED_ORDER_STATUSES.has(status)) {
      issues.push(issue(
        'delivery_overdue',
        'RED',
        '交期已逾期',
        `交货日期 ${deliveryDate} 已逾期 ${Math.abs(daysToDelivery)} 天，仍有 ${remainingQty} 未交付。`,
        '调整交付计划或拆分补发',
        '/sale/orders',
      ))
    } else if (remainingQty > 0 && daysToDelivery !== null && daysToDelivery <= dueSoonDays && !CLOSED_ORDER_STATUSES.has(status)) {
      issues.push(issue(
        'delivery_due_soon',
        'YELLOW',
        '临近交期',
        `距离交货日期 ${deliveryDate || '-'} 还有 ${Math.max(daysToDelivery, 0)} 天，仍有 ${remainingQty} 未交付。`,
        '确认库存、生产和发货安排',
        '/sale/orders',
      ))
    }

    if (status === 'DRAFT' && remainingQty > 0) {
      issues.push(issue(
        'approval_pending',
        daysToDelivery !== null && daysToDelivery < 0 ? 'RED' : 'YELLOW',
        '订单未审核',
        '销售订单仍是草稿状态，后续生产和发货计划可能无法及时启动。',
        '尽快审核或驳回订单',
        '/sale/orders',
      ))
    }

    if (remainingQty > 0 && availableQty + producedQty < remainingQty) {
      const shortage = roundQty(remainingQty - availableQty - producedQty)
      issues.push(issue(
        'stock_shortage',
        daysToDelivery !== null && daysToDelivery <= dueSoonDays ? 'RED' : 'YELLOW',
        '可交付库存不足',
        `剩余交付 ${remainingQty}，可用库存与已产合计 ${roundQty(availableQty + producedQty)}，缺口 ${shortage}。`,
        '补生产、调拨或调整承诺交期',
        '/stock/query',
      ))
    }

    if (materialShortages.length) {
      const firstMaterial = materialShortages[0]
      issues.push(issue(
        'material_shortage',
        daysToDelivery !== null && daysToDelivery <= dueSoonDays ? 'RED' : 'YELLOW',
        '原料缺口需请购',
        `成品缺口联动原料需求，${firstMaterial.materialName} 缺 ${firstMaterial.shortageQty}${firstMaterial.unit || ''}，建议请购 ${firstMaterial.requestedQty}${firstMaterial.unit || ''}。`,
        '生成采购请购并跟进入库',
        '/injection/purchase-requisition',
      ))
    }

    const hasActiveProduction = productionRows.some((row) => ACTIVE_PRODUCTION_STATUSES.has(normalizeStatus(row.status)))
    if (remainingQty > 0 && !productionRows.length && availableQty < remainingQty) {
      issues.push(issue(
        'production_missing',
        daysToDelivery !== null && daysToDelivery <= dueSoonDays ? 'RED' : 'YELLOW',
        '未找到生产工单',
        '订单剩余数量尚未被库存覆盖，也没有关联生产工单。',
        '创建或关联生产工单',
        '/prod/orders',
      ))
    } else if (remainingQty > 0 && productionRows.length && hasActiveProduction && producedQty + availableQty < remainingQty) {
      issues.push(issue(
        'production_lagging',
        daysToDelivery !== null && daysToDelivery < 0 ? 'RED' : 'YELLOW',
        '生产进度滞后',
        `关联生产工单 ${productionRows.length} 张，已产 ${producedQty}，仍不足覆盖剩余交付。`,
        '跟进报工、领料和入库闭环',
        '/prod/orders',
      ))
    }

    const failedQcRows = qcRows.filter((row) => {
      const result = normalizeStatus(row.checkResult ?? row.check_result)
      const disposalStatus = normalizeStatus(row.disposalStatus ?? row.disposal_status)
      return FAILED_QC_RESULTS.has(result) && !CLOSED_QC_DISPOSAL.has(disposalStatus)
    })
    if (failedQcRows.length) {
      issues.push(issue(
        'quality_failed',
        'RED',
        '质量不良未闭环',
        `关联生产存在 ${failedQcRows.length} 条不良记录未关闭，可能影响发货。`,
        '完成不良处置和复检确认',
        '/qc/defect-disposal',
      ))
    }

    const logisticsMissing = deliveries.some((row) => {
      const deliveryStatus = normalizeStatus(row.status)
      return ['SHIPPED', 'IN_TRANSIT'].includes(deliveryStatus)
        && (!normalizeText(row.logisticsCompany ?? row.logistics_company) || !normalizeText(row.trackingNo ?? row.tracking_no))
    })
    if (logisticsMissing) {
      issues.push(issue(
        'logistics_missing',
        'YELLOW',
        '物流信息缺失',
        '订单已有发货记录，但物流公司或运单号未完整维护。',
        '补充物流信息',
        '/sale/deliveries',
      ))
    }

    if (receivableAmount > 0 && ['SHIPPED', 'PARTIAL'].includes(status)) {
      const overdueDays = daysToDelivery !== null && daysToDelivery < 0 ? Math.abs(daysToDelivery) : 0
      issues.push(issue(
        'payment_overdue',
        overdueDays > paymentGraceDays ? 'RED' : 'YELLOW',
        '发货后仍有应收',
        `当前应收余额 ${receivableAmount.toFixed(2)}，需跟进回款计划。`,
        '登记回款或更新对账状态',
        '/sale/payments',
      ))
    }

    if (!issues.length) {
      issues.push(issue('normal', 'GREEN', '暂无风险', '交付、生产、库存、质量和回款未发现明显风险。', '持续跟踪', '/sale/orders'))
    }

    const riskLevel = highestRiskLevel(issues)
    const activeIssues = issues.filter((item) => item.type !== 'normal')
    return {
      orderId,
      orderNo: normalizeText(order.orderNo ?? order.order_no, `#${orderId || '-'}`),
      customerName: normalizeText(order.customerName ?? order.customer_name, '-'),
      productName: normalizeText(order.productName ?? order.product_name ?? items.map((item) => item.productName).filter(Boolean).join('、'), '-'),
      status,
      deliveryDate,
      daysToDelivery,
      orderQty,
      deliveredQty,
      remainingQty,
      availableQty,
      producedQty,
      materialShortageCount: materialShortages.length,
      materialShortageQty,
      purchaseSuggestionQty,
      materialShortages,
      receivableAmount,
      riskLevel,
      riskText: riskText(riskLevel),
      primaryRisk: issues[0]?.title || '暂无风险',
      issueCount: activeIssues.length,
      issues,
    }
  }).sort((left, right) => {
    return riskRank(left.riskLevel) - riskRank(right.riskLevel)
      || (left.daysToDelivery ?? 9999) - (right.daysToDelivery ?? 9999)
      || left.orderNo.localeCompare(right.orderNo, 'zh-CN')
  })
}

export function summarizeSaleOrderRisks(rows: SaleOrderRiskRow[]): SaleOrderRiskSummary {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1
      if (row.riskLevel === 'RED') summary.red += 1
      if (row.riskLevel === 'YELLOW') summary.yellow += 1
      if (row.riskLevel === 'GREEN') summary.green += 1
      if (row.issues.some((item) => item.type === 'delivery_overdue')) summary.overdue += 1
      if (row.issues.some((item) => item.type === 'delivery_due_soon')) summary.dueSoon += 1
      if (row.issues.some((item) => item.type === 'stock_shortage')) summary.stockShortage += 1
      if (row.issues.some((item) => item.type === 'material_shortage')) summary.materialShortage += 1
      summary.materialShortageQty = roundQty(summary.materialShortageQty + row.materialShortageQty)
      summary.purchaseSuggestionQty = roundQty(summary.purchaseSuggestionQty + row.purchaseSuggestionQty)
      if (row.issues.some((item) => item.type === 'production_missing' || item.type === 'production_lagging')) summary.productionRisk += 1
      if (row.issues.some((item) => item.type === 'quality_failed')) summary.qualityRisk += 1
      if (row.issues.some((item) => item.type === 'payment_overdue')) summary.paymentRisk += 1
      summary.receivableAmount = roundMoney(summary.receivableAmount + row.receivableAmount)
      return summary
    },
    {
      total: 0,
      red: 0,
      yellow: 0,
      green: 0,
      overdue: 0,
      dueSoon: 0,
      stockShortage: 0,
      materialShortage: 0,
      materialShortageQty: 0,
      purchaseSuggestionQty: 0,
      productionRisk: 0,
      qualityRisk: 0,
      paymentRisk: 0,
      receivableAmount: 0,
    },
  )
}
