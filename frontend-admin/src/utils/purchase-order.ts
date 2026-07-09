export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'ORDERED'
  | 'PARTIAL_RECEIVED'
  | 'RECEIVED'
  | 'CLOSED'
  | 'CANCELLED'

export type PurchaseRequisitionLike = {
  id?: number | string | null
  requisitionNo?: string | null
  requisition_no?: string | null
  materialId?: number | string | null
  material_id?: number | string | null
  productId?: number | string | null
  product_id?: number | string | null
  materialName?: string | null
  material_name?: string | null
  materialCode?: string | null
  material_code?: string | null
  shortageQty?: number | string | null
  shortage_qty?: number | string | null
  requestedQty?: number | string | null
  requested_qty?: number | string | null
  supplierId?: number | string | null
  supplier_id?: number | string | null
  supplierName?: string | null
  supplier_name?: string | null
  expectedDate?: string | null
  expected_date?: string | null
  sourceMrpNo?: string | null
  source_mrp_no?: string | null
  unitCost?: number | string | null
  unit_cost?: number | string | null
  purchaseUnitCost?: number | string | null
  purchase_unit_cost?: number | string | null
  remark?: string | null
  status?: string | null
  createdAt?: string | null
  created_at?: string | null
  updatedAt?: string | null
  updated_at?: string | null
}

export type PurchaseInboundLike = {
  productId?: number | string | null
  product_id?: number | string | null
  materialId?: number | string | null
  material_id?: number | string | null
  productName?: string | null
  product_name?: string | null
  productCode?: string | null
  product_code?: string | null
  supplierId?: number | string | null
  supplier_id?: number | string | null
  supplierName?: string | null
  supplier_name?: string | null
  qty?: number | string | null
  quantity?: number | string | null
  unitCost?: number | string | null
  unit_cost?: number | string | null
  purchaseUnitCost?: number | string | null
  purchase_unit_cost?: number | string | null
  purchaseUnitPrice?: number | string | null
  purchase_unit_price?: number | string | null
  amount?: number | string | null
  purchaseAmount?: number | string | null
  purchase_amount?: number | string | null
  createdAt?: string | null
  created_at?: string | null
  operateTime?: string | null
  operate_time?: string | null
}

export type PurchaseOrderRow = {
  id?: number | string | null
  orderNo: string
  sourceNo: string
  sourceStatus: string
  materialId: number
  materialCode: string
  materialName: string
  shortageQty: number
  requestedQty: number
  receivedQty: number
  remainingQty: number
  supplierId?: number | string | null
  supplierName: string
  expectedDate: string
  sourceMrpNo: string
  unitCost: number
  amount: number
  receivedAmount: number
  remainingAmount: number
  receiveProgress: number
  status: PurchaseOrderStatus
  statusText: string
  statusTag: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  noSupplier: boolean
  overdue: boolean
  canConvert: boolean
  canReceive: boolean
  riskText: string
  remark: string
  createdAt: string
}

function toNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && normalizeText(value) !== ''
}

function roundQty(value: unknown) {
  return Number(toNumber(value).toFixed(3))
}

function roundMoney(value: unknown) {
  return Number(toNumber(value).toFixed(2))
}

function getMaterialId(input?: PurchaseRequisitionLike | PurchaseInboundLike | null) {
  return Math.trunc(toNumber(input?.materialId ?? input?.material_id ?? input?.productId ?? input?.product_id))
}

function getSupplierId(input?: PurchaseRequisitionLike | PurchaseInboundLike | null) {
  const value = input?.supplierId ?? input?.supplier_id
  return hasValue(value) ? String(value) : ''
}

function normalizeDateOnly(value?: string | null) {
  const text = normalizeText(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  const [year, month, day] = text.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return ''
  return text
}

export function todayPurchaseOrderDate(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function getPurchaseOrderRequestedQty(input?: PurchaseRequisitionLike | null) {
  return roundQty(input?.requestedQty ?? input?.requested_qty)
}

export function getPurchaseOrderReceivedQty(order?: Partial<PurchaseOrderRow> | PurchaseRequisitionLike | null, inboundRows: PurchaseInboundLike[] = []) {
  const explicitQty = (order as Partial<PurchaseOrderRow> | null | undefined)?.receivedQty
  if (hasValue(explicitQty)) return roundQty(explicitQty)
  const materialId = getMaterialId(order as PurchaseRequisitionLike)
  const supplierId = getSupplierId(order as PurchaseRequisitionLike)
  if (!materialId || !supplierId) return 0
  return roundQty(
    inboundRows.reduce((total, item) => {
      if (getMaterialId(item) !== materialId) return total
      const inboundSupplierId = getSupplierId(item)
      if (inboundSupplierId && inboundSupplierId !== supplierId) return total
      return total + toNumber(item.qty ?? item.quantity)
    }, 0)
  )
}

export function getPurchaseOrderRemainingQty(order?: Partial<PurchaseOrderRow> | PurchaseRequisitionLike | null, inboundRows: PurchaseInboundLike[] = []) {
  const requestedQty = hasValue((order as Partial<PurchaseOrderRow>)?.requestedQty)
    ? toNumber((order as Partial<PurchaseOrderRow>)?.requestedQty)
    : getPurchaseOrderRequestedQty(order as PurchaseRequisitionLike)
  const receivedQty = getPurchaseOrderReceivedQty(order, inboundRows)
  return roundQty(Math.max(requestedQty - receivedQty, 0))
}

function getInboundQty(input: PurchaseInboundLike) {
  return roundQty(input.qty ?? input.quantity)
}

function getInboundUnitCost(input: PurchaseInboundLike) {
  return roundMoney(input.unitCost ?? input.unit_cost ?? input.purchaseUnitCost ?? input.purchase_unit_cost ?? input.purchaseUnitPrice ?? input.purchase_unit_price)
}

function getInboundAmount(input: PurchaseInboundLike) {
  const amount = input.amount ?? input.purchaseAmount ?? input.purchase_amount
  if (hasValue(amount)) return roundMoney(amount)
  return roundMoney(getInboundQty(input) * getInboundUnitCost(input))
}

export function getPurchaseOrderAmount(input?: Partial<PurchaseOrderRow> | PurchaseRequisitionLike | null) {
  const explicitAmount = (input as Partial<PurchaseOrderRow> | null | undefined)?.amount
  if (hasValue(explicitAmount)) return roundMoney(explicitAmount)
  const requestedQty = hasValue((input as Partial<PurchaseOrderRow> | null | undefined)?.requestedQty)
    ? toNumber((input as Partial<PurchaseOrderRow>).requestedQty)
    : getPurchaseOrderRequestedQty(input as PurchaseRequisitionLike)
  const unitCost = toNumber(
    (input as Partial<PurchaseOrderRow>)?.unitCost
      ?? (input as PurchaseRequisitionLike)?.unitCost
      ?? (input as PurchaseRequisitionLike)?.unit_cost
      ?? (input as PurchaseRequisitionLike)?.purchaseUnitCost
      ?? (input as PurchaseRequisitionLike)?.purchase_unit_cost
  )
  return roundMoney(requestedQty * unitCost)
}

export function normalizePurchaseOrderStatus(status?: string | null, requestedQty = 0, receivedQty = 0): PurchaseOrderStatus {
  const normalized = normalizeText(status).toUpperCase()
  if (['CLOSED', 'FINISHED'].includes(normalized)) return 'CLOSED'
  if (['CANCELLED', 'CANCELED', 'REJECTED'].includes(normalized)) return 'CANCELLED'
  if (normalized === 'RECEIVED') return 'RECEIVED'
  if (normalized === 'PARTIAL_RECEIVED') return 'PARTIAL_RECEIVED'
  if (requestedQty > 0 && receivedQty >= requestedQty) return 'RECEIVED'
  if (receivedQty > 0) return 'PARTIAL_RECEIVED'
  if (['CONVERTED', 'ORDERED', 'CONFIRMED'].includes(normalized)) return 'ORDERED'
  if (normalized === 'APPROVED') return 'APPROVED'
  if (normalized === 'SUBMITTED') return 'SUBMITTED'
  return 'DRAFT'
}

export function getPurchaseOrderStatusText(status?: string | null) {
  const map: Record<PurchaseOrderStatus, string> = {
    DRAFT: '草稿',
    SUBMITTED: '待审核',
    APPROVED: '待下单',
    ORDERED: '待到货',
    PARTIAL_RECEIVED: '部分到货',
    RECEIVED: '已到货',
    CLOSED: '已关闭',
    CANCELLED: '已取消',
  }
  return map[normalizePurchaseOrderStatus(status) as PurchaseOrderStatus] || normalizeText(status) || '-'
}

export function getPurchaseOrderStatusTag(status?: string | null): PurchaseOrderRow['statusTag'] {
  const normalized = normalizePurchaseOrderStatus(status)
  if (normalized === 'RECEIVED' || normalized === 'CLOSED') return 'success'
  if (normalized === 'ORDERED') return 'primary'
  if (normalized === 'APPROVED' || normalized === 'PARTIAL_RECEIVED' || normalized === 'SUBMITTED') return 'warning'
  if (normalized === 'CANCELLED') return 'danger'
  return 'info'
}

export function canReceivePurchaseOrder(order?: Partial<PurchaseOrderRow> | null) {
  if (!order) return false
  const status = normalizePurchaseOrderStatus(order.status, toNumber(order.requestedQty), toNumber(order.receivedQty))
  return Boolean(order.supplierId) && toNumber(order.remainingQty) > 0 && ['ORDERED', 'PARTIAL_RECEIVED'].includes(status)
}

export function validatePurchaseOrderInput(input?: Partial<PurchaseOrderRow> | PurchaseRequisitionLike | null, options: { requireSupplier?: boolean } = {}) {
  const materialId = getMaterialId(input as PurchaseRequisitionLike)
  if (!materialId) return '请选择采购物料'
  const requestedQty = hasValue((input as Partial<PurchaseOrderRow> | null | undefined)?.requestedQty)
    ? toNumber((input as Partial<PurchaseOrderRow>).requestedQty)
    : getPurchaseOrderRequestedQty(input as PurchaseRequisitionLike)
  if (!Number.isFinite(requestedQty) || requestedQty <= 0) return '采购数量必须大于 0'
  const expectedDate = normalizeText((input as PurchaseRequisitionLike)?.expectedDate ?? (input as PurchaseRequisitionLike)?.expected_date ?? (input as PurchaseOrderRow)?.expectedDate)
  if (expectedDate && !normalizeDateOnly(expectedDate)) return '期望到货日期格式不正确'
  if (options.requireSupplier && !getSupplierId(input as PurchaseRequisitionLike)) return '请选择供应商'
  return ''
}

export function validatePurchaseReceiveQty(order?: Partial<PurchaseOrderRow> | null, qty?: number | string | null) {
  if (!order) return '请选择采购订单'
  if (!order.supplierId) return '采购订单缺少供应商，不能入库'
  const receiveQty = toNumber(qty)
  if (!Number.isInteger(receiveQty) || receiveQty <= 0) return '入库数量必须是大于 0 的整数'
  const remainingQty = toNumber(order.remainingQty)
  if (remainingQty <= 0) return '采购订单已全部到货'
  if (receiveQty > remainingQty) return '入库数量不能超过订单剩余数量'
  if (!canReceivePurchaseOrder(order)) return '采购订单未到可入库状态'
  return ''
}

function buildOrderNo(row: PurchaseRequisitionLike) {
  const sourceNo = normalizeText(row.requisitionNo ?? row.requisition_no ?? row.id)
  const converted = sourceNo.replace(/^PR/i, 'PO')
  return converted || `PO-${normalizeText(row.id) || Date.now()}`
}

function consumeInbound(inboundRows: PurchaseInboundLike[], order: PurchaseRequisitionLike, requestedQty: number) {
  const materialId = getMaterialId(order)
  const supplierId = getSupplierId(order)
  let remaining = requestedQty
  let receivedQty = 0
  let receivedAmount = 0
  let sample: PurchaseInboundLike | undefined
  if (!materialId || !supplierId || requestedQty <= 0) return { receivedQty, receivedAmount, sample }

  for (const item of inboundRows) {
    if (remaining <= 0) break
    if (getMaterialId(item) !== materialId) continue
    const inboundSupplierId = getSupplierId(item)
    if (inboundSupplierId && inboundSupplierId !== supplierId) continue
    const availableQty = getInboundQty(item)
    if (availableQty <= 0) continue
    const usedQty = Math.min(availableQty, remaining)
    const unitCost = availableQty > 0 ? getInboundAmount(item) / availableQty : getInboundUnitCost(item)
    const remainingInboundQty = roundQty(availableQty - usedQty)
    const remainingInboundAmount = roundMoney(remainingInboundQty * unitCost)
    item.qty = remainingInboundQty
    item.amount = remainingInboundAmount
    item.purchaseAmount = remainingInboundAmount
    item.purchase_amount = remainingInboundAmount
    receivedQty = roundQty(receivedQty + usedQty)
    receivedAmount = roundMoney(receivedAmount + usedQty * unitCost)
    remaining = roundQty(remaining - usedQty)
    sample = sample || item
  }
  return { receivedQty, receivedAmount, sample }
}

export function buildPurchaseOrderFromRequisition(
  requisition: PurchaseRequisitionLike,
  inboundRows: PurchaseInboundLike[] = [],
  today = todayPurchaseOrderDate(),
  consumeInboundRows = false
): PurchaseOrderRow {
  const requestedQty = getPurchaseOrderRequestedQty(requisition)
  const shortageQty = roundQty(requisition.shortageQty ?? requisition.shortage_qty)
  const inbound = consumeInboundRows ? inboundRows : inboundRows.map((item) => ({ ...item }))
  const { receivedQty, receivedAmount, sample } = consumeInbound(inbound, requisition, requestedQty)
  const remainingQty = roundQty(Math.max(requestedQty - receivedQty, 0))
  const sourceStatus = normalizeText(requisition.status).toUpperCase() || 'DRAFT'
  const status = normalizePurchaseOrderStatus(sourceStatus, requestedQty, receivedQty)
  const unitCost = receivedQty > 0
    ? roundMoney(receivedAmount / receivedQty)
    : roundMoney(requisition.unitCost ?? requisition.unit_cost ?? requisition.purchaseUnitCost ?? requisition.purchase_unit_cost)
  const amount = unitCost > 0 ? roundMoney(requestedQty * unitCost) : 0
  const expectedDate = normalizeDateOnly(requisition.expectedDate ?? requisition.expected_date)
  const supplierId = requisition.supplierId ?? requisition.supplier_id ?? sample?.supplierId ?? sample?.supplier_id ?? null
  const noSupplier = !supplierId
  const overdue = Boolean(expectedDate && expectedDate < today && remainingQty > 0 && !['RECEIVED', 'CLOSED', 'CANCELLED'].includes(status))
  const riskText = noSupplier ? '缺供应商' : overdue ? '已逾期' : remainingQty > 0 ? '待跟进' : '正常'

  const row: PurchaseOrderRow = {
    id: requisition.id,
    orderNo: buildOrderNo(requisition),
    sourceNo: normalizeText(requisition.requisitionNo ?? requisition.requisition_no) || `PR-${normalizeText(requisition.id)}`,
    sourceStatus,
    materialId: getMaterialId(requisition),
    materialCode: normalizeText(requisition.materialCode ?? requisition.material_code ?? sample?.productCode ?? sample?.product_code),
    materialName: normalizeText(requisition.materialName ?? requisition.material_name ?? sample?.productName ?? sample?.product_name),
    shortageQty,
    requestedQty,
    receivedQty,
    remainingQty,
    supplierId,
    supplierName: normalizeText(requisition.supplierName ?? requisition.supplier_name ?? sample?.supplierName ?? sample?.supplier_name),
    expectedDate,
    sourceMrpNo: normalizeText(requisition.sourceMrpNo ?? requisition.source_mrp_no),
    unitCost,
    amount,
    receivedAmount,
    remainingAmount: roundMoney(Math.max(amount - receivedAmount, 0)),
    receiveProgress: requestedQty > 0 ? Math.min(100, Number(((receivedQty / requestedQty) * 100).toFixed(1))) : 0,
    status,
    statusText: getPurchaseOrderStatusText(status),
    statusTag: getPurchaseOrderStatusTag(status),
    noSupplier,
    overdue,
    canConvert: status === 'APPROVED' && !noSupplier,
    canReceive: false,
    riskText,
    remark: normalizeText(requisition.remark),
    createdAt: normalizeText(requisition.createdAt ?? requisition.created_at ?? requisition.updatedAt ?? requisition.updated_at),
  }
  row.canReceive = canReceivePurchaseOrder(row)
  return row
}

export function buildPurchaseOrderRows(requisitions: PurchaseRequisitionLike[] = [], inboundRows: PurchaseInboundLike[] = [], today = todayPurchaseOrderDate()) {
  const consumableInboundRows = inboundRows
    .map((item) => ({ ...item, qty: getInboundQty(item) }))
    .sort((a, b) => normalizeText(a.operateTime ?? a.operate_time ?? a.createdAt ?? a.created_at).localeCompare(normalizeText(b.operateTime ?? b.operate_time ?? b.createdAt ?? b.created_at)))
  const sortedRequisitions = requisitions
    .slice()
    .sort((a, b) => {
      const leftDate = normalizeDateOnly(a.expectedDate ?? a.expected_date) || normalizeText(a.createdAt ?? a.created_at)
      const rightDate = normalizeDateOnly(b.expectedDate ?? b.expected_date) || normalizeText(b.createdAt ?? b.created_at)
      return leftDate.localeCompare(rightDate) || toNumber(a.id) - toNumber(b.id)
    })
  return sortedRequisitions.map((item) => buildPurchaseOrderFromRequisition(item, consumableInboundRows, today, true))
}

export function summarizePurchaseOrders(rows: Array<Partial<PurchaseOrderRow>> = [], today = todayPurchaseOrderDate()) {
  return rows.reduce(
    (summary, row) => {
      const status = normalizePurchaseOrderStatus(row.status, toNumber(row.requestedQty), toNumber(row.receivedQty))
      const expectedDate = normalizeDateOnly(row.expectedDate)
      const noSupplier = !row.supplierId
      const remainingQty = toNumber(row.remainingQty)
      const overdue = Boolean(expectedDate && expectedDate < today && remainingQty > 0 && !['RECEIVED', 'CLOSED', 'CANCELLED'].includes(status))
      summary.total += 1
      summary.requestedQty = roundQty(summary.requestedQty + toNumber(row.requestedQty))
      summary.receivedQty = roundQty(summary.receivedQty + toNumber(row.receivedQty))
      summary.remainingQty = roundQty(summary.remainingQty + remainingQty)
      summary.purchaseAmount = roundMoney(summary.purchaseAmount + toNumber(row.amount))
      summary.receivedAmount = roundMoney(summary.receivedAmount + toNumber(row.receivedAmount))
      summary.remainingAmount = roundMoney(summary.remainingAmount + toNumber(row.remainingAmount))
      if (['DRAFT', 'SUBMITTED'].includes(status)) summary.draft += 1
      if (status === 'APPROVED') summary.pending += 1
      if (status === 'ORDERED') summary.ordered += 1
      if (status === 'PARTIAL_RECEIVED') summary.partial += 1
      if (status === 'RECEIVED') summary.received += 1
      if (status === 'CLOSED') summary.closed += 1
      if (status === 'CANCELLED') summary.cancelled += 1
      if (noSupplier) summary.noSupplier += 1
      if (overdue) summary.overdue += 1
      if (noSupplier || overdue) summary.risk += 1
      return summary
    },
    {
      total: 0,
      draft: 0,
      pending: 0,
      ordered: 0,
      partial: 0,
      received: 0,
      closed: 0,
      cancelled: 0,
      noSupplier: 0,
      overdue: 0,
      risk: 0,
      requestedQty: 0,
      receivedQty: 0,
      remainingQty: 0,
      purchaseAmount: 0,
      receivedAmount: 0,
      remainingAmount: 0,
    }
  )
}
