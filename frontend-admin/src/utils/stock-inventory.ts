export const INVENTORY_EDITABLE_STATUSES = ['COUNTING'] as const
export const INVENTORY_APPROVABLE_STATUSES = ['PENDING_APPROVE', 'SUBMITTED'] as const

export type InventoryAction = 'start' | 'count' | 'submit' | 'approve' | 'reject'

export type InventoryDocLike = {
  id?: number | string | null
  status?: string | null
  inventoryNo?: string | null
  inventory_no?: string | null
}

export type InventoryItemLike = {
  id?: number | string | null
  productId?: number | string | null
  product_id?: number | string | null
  productCode?: string | null
  productName?: string | null
  locationId?: number | string | null
  location_id?: number | string | null
  locationCode?: string | null
  batchId?: number | string | null
  batch_id?: number | string | null
  batchNo?: string | null
  supplierId?: number | string | null
  supplier_id?: number | string | null
  supplierCode?: string | null
  supplierName?: string | null
  bookQty?: number | string | null
  book_qty?: number | string | null
  actualQty?: number | string | null
  actual_qty?: number | string | null
  diffQty?: number | string | null
  diff_qty?: number | string | null
  reason?: string | null
}

export type InventoryStockRowLike = {
  productId?: number | string | null
  product_id?: number | string | null
  warehouseId?: number | string | null
  warehouse_id?: number | string | null
  locationId?: number | string | null
  location_id?: number | string | null
  batchId?: number | string | null
  batch_id?: number | string | null
  qty?: number | string | null
  lockedQty?: number | string | null
  locked_qty?: number | string | null
}

export type InventorySummary = {
  itemCount: number
  diffItemCount: number
  profitItemCount: number
  lossItemCount: number
  profitQty: number
  lossQty: number
  netDiffQty: number
}

export type InventoryDetailExportDocLike = {
  inventoryNo?: string | null
  inventory_no?: string | null
  warehouseName?: string | null
}

export function toStockInventoryNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function normalizeInventoryStatus(value?: string | null) {
  return String(value || '').trim().toUpperCase()
}

export function normalizeInventoryId(value: unknown) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : 0
}

export function normalizeInventoryCountQty(value: unknown) {
  if (value === undefined || value === null || value === '') return Number.NaN
  const num = Number(value)
  return Number.isInteger(num) && num >= 0 ? num : Number.NaN
}

export function getInventoryItemId(item?: InventoryItemLike | null) {
  return normalizeInventoryId(item?.id)
}

export function getInventoryProductId(item?: InventoryItemLike | InventoryStockRowLike | null) {
  return normalizeInventoryId(item?.productId ?? item?.product_id)
}

export function getInventoryLocationId(item?: InventoryItemLike | InventoryStockRowLike | null) {
  return normalizeInventoryId(item?.locationId ?? item?.location_id)
}

export function getInventoryBatchId(item?: InventoryItemLike | InventoryStockRowLike | null) {
  return normalizeInventoryId(item?.batchId ?? item?.batch_id)
}

export function getInventorySupplierId(item?: InventoryItemLike | null) {
  return normalizeInventoryId(item?.supplierId ?? item?.supplier_id)
}

export function getInventoryBookQty(item?: InventoryItemLike | null) {
  return toStockInventoryNumber(item?.bookQty ?? item?.book_qty)
}

export function getInventoryActualQty(item?: InventoryItemLike | null) {
  return toStockInventoryNumber(item?.actualQty ?? item?.actual_qty)
}

export function getInventoryDiffQty(item?: InventoryItemLike | null) {
  if (!item) return 0
  const explicit = item.diffQty ?? item.diff_qty
  if (explicit !== undefined && explicit !== null && explicit !== '') return toStockInventoryNumber(explicit)
  return getInventoryActualQty(item) - getInventoryBookQty(item)
}

export function getInventoryReason(item?: InventoryItemLike | null) {
  return String(item?.reason || '').trim()
}

export function inventoryItemText(item?: InventoryItemLike | null) {
  const product = [item?.productCode, item?.productName].filter(Boolean).join(' - ') || `明细 #${item?.id || '-'}`
  const supplier = inventorySupplierText(item)
  return supplier === '-' ? product : `${product} / ${supplier}`
}

export function inventorySupplierText(item?: InventoryItemLike | null) {
  const code = String(item?.supplierCode || '').trim()
  const name = String(item?.supplierName || '').trim()
  return [code, name].filter((value) => value && value !== '-').join(' - ') || '-'
}

export function buildInventoryStockKey(item?: InventoryItemLike | InventoryStockRowLike | null) {
  return [
    getInventoryProductId(item),
    getInventoryLocationId(item) || 'NULL',
    getInventoryBatchId(item) || 'NULL',
  ].join('|')
}

export function getInventoryStockQty(row?: InventoryStockRowLike | null) {
  return toStockInventoryNumber(row?.qty)
}

export function getInventoryLockedQty(row?: InventoryStockRowLike | null) {
  return toStockInventoryNumber(row?.lockedQty ?? row?.locked_qty)
}

export function summarizeInventoryItems(items: InventoryItemLike[] = []): InventorySummary {
  return items.reduce(
    (summary, item) => {
      const diffQty = getInventoryDiffQty(item)
      summary.itemCount += 1
      summary.netDiffQty += diffQty
      if (diffQty > 0) {
        summary.diffItemCount += 1
        summary.profitItemCount += 1
        summary.profitQty += diffQty
      } else if (diffQty < 0) {
        summary.diffItemCount += 1
        summary.lossItemCount += 1
        summary.lossQty += Math.abs(diffQty)
      }
      return summary
    },
    {
      itemCount: 0,
      diffItemCount: 0,
      profitItemCount: 0,
      lossItemCount: 0,
      profitQty: 0,
      lossQty: 0,
      netDiffQty: 0,
    } as InventorySummary
  )
}

export function validateInventoryStatus(status: string | null | undefined, action: InventoryAction) {
  const normalized = normalizeInventoryStatus(status)
  const map: Record<InventoryAction, string[]> = {
    start: ['DRAFT'],
    count: ['COUNTING'],
    submit: ['COUNTING'],
    approve: [...INVENTORY_APPROVABLE_STATUSES],
    reject: [...INVENTORY_APPROVABLE_STATUSES],
  }
  if (!map[action].includes(normalized)) {
    const actionText: Record<InventoryAction, string> = {
      start: '开始盘点',
      count: '录入实盘',
      submit: '提交审核',
      approve: '审核通过',
      reject: '驳回',
    }
    return `当前状态不能${actionText[action]}`
  }
  return ''
}

export function validateInventoryCountItems(items: InventoryItemLike[] = []) {
  if (!items.length) return '请录入盘点明细'
  const seen = new Set<number>()
  for (const item of items) {
    const id = getInventoryItemId(item)
    if (!id) return '盘点明细不存在'
    if (seen.has(id)) return '盘点明细重复'
    seen.add(id)

    const actualQty = normalizeInventoryCountQty(item.actualQty ?? item.actual_qty)
    if (Number.isNaN(actualQty)) return '实盘数量必须是大于等于 0 的整数'

    const diffQty = actualQty - getInventoryBookQty(item)
    if (diffQty !== 0 && !getInventoryReason(item)) {
      return `${inventoryItemText(item)} 存在盘点差异，请填写原因`
    }
  }
  return ''
}

export function validateInventoryReviewSubmit(inventory: InventoryDocLike, items: InventoryItemLike[] = []) {
  const statusMessage = validateInventoryStatus(inventory.status, 'submit')
  if (statusMessage) return statusMessage
  return validateInventoryCountItems(items)
}

export function validateInventoryApproval(
  inventory: InventoryDocLike,
  items: InventoryItemLike[] = [],
  stockRows: InventoryStockRowLike[] = []
) {
  const statusMessage = validateInventoryStatus(inventory.status, 'approve')
  if (statusMessage) return statusMessage
  const countMessage = validateInventoryCountItems(items)
  if (countMessage) return countMessage

  const stockMap = new Map(stockRows.map((row) => [buildInventoryStockKey(row), row]))
  for (const item of items) {
    const diffQty = getInventoryDiffQty(item)
    if (diffQty >= 0) continue
    const stock = stockMap.get(buildInventoryStockKey(item))
    const currentQty = getInventoryStockQty(stock)
    const lockedQty = getInventoryLockedQty(stock)
    const nextQty = currentQty + diffQty
    if (!stock || nextQty < 0) {
      return `${inventoryItemText(item)} 盘亏后库存不能小于 0`
    }
    if (nextQty < lockedQty) {
      return `${inventoryItemText(item)} 盘亏后库存不能小于锁定量`
    }
  }
  return ''
}

export function getInventoryApprovalWarnings(items: InventoryItemLike[] = [], stockRows: InventoryStockRowLike[] = []) {
  const warnings: string[] = []
  const stockMap = new Map(stockRows.map((row) => [buildInventoryStockKey(row), row]))
  for (const item of items) {
    const diffQty = getInventoryDiffQty(item)
    if (diffQty >= 0) continue
    const stock = stockMap.get(buildInventoryStockKey(item))
    const currentQty = getInventoryStockQty(stock)
    const lockedQty = getInventoryLockedQty(stock)
    const nextQty = currentQty + diffQty
    if (!stock || nextQty < 0) {
      warnings.push(`${inventoryItemText(item)} 盘亏后库存不能小于 0`)
    } else if (nextQty < lockedQty) {
      warnings.push(`${inventoryItemText(item)} 盘亏后库存不能小于锁定量`)
    }
  }
  return warnings
}

export function buildInventoryApprovalSummary(items: InventoryItemLike[] = []) {
  const summary = summarizeInventoryItems(items)
  return `共 ${summary.itemCount} 项，差异 ${summary.diffItemCount} 项，盘盈 ${summary.profitQty}，盘亏 ${summary.lossQty}，净差异 ${summary.netDiffQty}`
}

export function escapeStockInventoryCsvValue(value: unknown) {
  const text = String(value ?? '')
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function buildStockInventoryDetailExportRows(
  inventory: InventoryDetailExportDocLike = {},
  items: InventoryItemLike[] = []
) {
  const inventoryNo = inventory.inventoryNo ?? inventory.inventory_no ?? ''
  return items.map((item) => ({
    盘点单号: inventoryNo,
    产品: [item.productCode, item.productName].filter(Boolean).join(' - ') || '',
    库位: item.locationCode || '',
    批次: item.batchNo || '',
    供应商: inventorySupplierText(item),
    账面数量: getInventoryBookQty(item),
    实盘数量: getInventoryActualQty(item),
    差异数量: getInventoryDiffQty(item),
    原因: getInventoryReason(item),
  }))
}

export function buildStockInventoryDetailCsv(inventory: InventoryDetailExportDocLike = {}, items: InventoryItemLike[] = []) {
  const exportRows = buildStockInventoryDetailExportRows(inventory, items)
  const headers = Object.keys(exportRows[0] || {
    盘点单号: '',
    产品: '',
    库位: '',
    批次: '',
    供应商: '',
    账面数量: '',
    实盘数量: '',
    差异数量: '',
    原因: '',
  })
  const lines = [
    headers.map(escapeStockInventoryCsvValue).join(','),
    ...exportRows.map((row) => headers.map((header) => escapeStockInventoryCsvValue((row as Record<string, unknown>)[header])).join(',')),
  ]
  return lines.join('\n')
}
