export type StockLedgerRowLike = {
  moveNo?: string | null
  moveType?: string | null
  moveReason?: string | null
  productCode?: string | null
  productName?: string | null
  productUnit?: string | null
  warehouseName?: string | null
  toWarehouseName?: string | null
  locationCode?: string | null
  supplierName?: string | null
  batchNo?: string | null
  qty?: number | string | null
  purchaseUnitCost?: number | string | null
  purchaseAmount?: number | string | null
  saleAmount?: number | string | null
  materialCost?: number | string | null
  grossProfit?: number | string | null
  costStatus?: string | null
  costGapReason?: string | null
  prodOrderNo?: string | null
  saleOrderNo?: string | null
  inventoryNo?: string | null
  transferNo?: string | null
  operatorName?: string | null
  createdAt?: string | null
  remark?: string | null
}

export type StockLedgerSummary = {
  recordCount: number
  inQty: number
  outQty: number
  transferQty: number
  netQty: number
  inventoryProfitQty: number
  inventoryLossQty: number
  purchaseAmount: number
  saleAmount: number
  materialCost: number
  grossProfit: number
  costGapCount: number
}

export type StockLedgerExportContext = {
  generatedAt?: string | Date | null
  scopeLabel?: string | null
  totalCount?: number | string | null
  page?: number | string | null
  pageSize?: number | string | null
  keyword?: string | null
  dateRange?: Array<string | null | undefined> | null
  moveTypeText?: string | null
  moveReasonText?: string | null
  warehouseText?: string | null
  supplierText?: string | null
  productText?: string | null
}

export type StockLedgerAuditRow = {
  导出项: string
  内容: string
}

export const STOCK_MOVE_REASON_LABELS: Record<string, string> = {
  IN_PURCHASE: '采购入库',
  OUT_PICKING: '生产领料',
  IN_PRODUCE: '成品入库',
  OUT_SALE: '销售出库',
  TRANSFER: '仓库调拨',
  INVENTORY_PROFIT: '盘盈入库',
  INVENTORY_LOSS: '盘亏出库',
}

export function toLedgerNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function roundLedgerQty(value: unknown) {
  return Number(toLedgerNumber(value).toFixed(2))
}

export function roundLedgerMoney(value: unknown) {
  return Number(toLedgerNumber(value).toFixed(2))
}

export function normalizeLedgerMoveType(value?: string | null) {
  return String(value || '').trim().toUpperCase()
}

export function normalizeLedgerMoveReason(value?: string | null) {
  return String(value || '').trim().toUpperCase()
}

export function getLedgerMoveReasonText(value?: string | null) {
  const reason = normalizeLedgerMoveReason(value)
  return STOCK_MOVE_REASON_LABELS[reason] || reason || '-'
}

export function getLedgerMoveTypeText(value?: string | null) {
  const map: Record<string, string> = {
    IN: '入库',
    OUT: '出库',
    TRANSFER: '调拨',
  }
  const type = normalizeLedgerMoveType(value)
  return map[type] || type || '-'
}

export function getLedgerRelatedOrderText(row?: StockLedgerRowLike | null) {
  return [row?.prodOrderNo, row?.saleOrderNo, row?.inventoryNo, row?.transferNo].find((value) => value && value !== '-') || '-'
}

export function getLedgerProductText(row?: StockLedgerRowLike | null) {
  return [row?.productCode, row?.productName].filter((item) => item && item !== '-').join(' - ') || '-'
}

function exportText(value: unknown, fallback = '全部') {
  const text = String(value ?? '').trim()
  return text && text !== '-' ? text : fallback
}

function exportCountText(value: unknown, fallback: number) {
  const num = Number(value)
  return Number.isFinite(num) ? String(Math.max(Math.trunc(num), 0)) : String(fallback)
}

function localDateTimeText(value: Date) {
  const pad = (num: number) => String(num).padStart(2, '0')
  return [
    value.getFullYear(),
    pad(value.getMonth() + 1),
    pad(value.getDate()),
  ].join('-') + ` ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

function formatLedgerExportTime(value?: string | Date | null) {
  if (!value) return '-'
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '-' : localDateTimeText(value)
  }
  const text = String(value).trim()
  if (!text) return '-'
  if (/^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}/.test(text)) {
    return text.slice(0, 19).replace('T', ' ')
  }
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 19).replace('T', ' ')
}

function dateRangeText(dateRange?: Array<string | null | undefined> | null) {
  if (!Array.isArray(dateRange) || dateRange.length < 2) return '全部'
  const [start, end] = dateRange.map((item) => String(item || '').trim())
  return start && end ? `${start} 至 ${end}` : '全部'
}

export function buildStockLedgerFilterText(context: StockLedgerExportContext = {}) {
  return [
    `日期:${dateRangeText(context.dateRange)}`,
    `关键字:${exportText(context.keyword)}`,
    `类型:${exportText(context.moveTypeText)}`,
    `原因:${exportText(context.moveReasonText)}`,
    `仓库:${exportText(context.warehouseText)}`,
    `供应商:${exportText(context.supplierText)}`,
    `产品:${exportText(context.productText)}`,
  ].join('；')
}

export function summarizeStockLedgerRows(rows: StockLedgerRowLike[] = []): StockLedgerSummary {
  return rows.reduce(
    (summary, row) => {
      const moveType = normalizeLedgerMoveType(row.moveType)
      const moveReason = normalizeLedgerMoveReason(row.moveReason)
      const qty = roundLedgerQty(row.qty)

      summary.recordCount += 1
      if (moveType === 'IN') {
        summary.inQty = roundLedgerQty(summary.inQty + qty)
        summary.netQty = roundLedgerQty(summary.netQty + qty)
      } else if (moveType === 'OUT') {
        summary.outQty = roundLedgerQty(summary.outQty + qty)
        summary.netQty = roundLedgerQty(summary.netQty - qty)
      } else if (moveType === 'TRANSFER') {
        summary.transferQty = roundLedgerQty(summary.transferQty + qty)
      }

      if (moveReason === 'INVENTORY_PROFIT') summary.inventoryProfitQty = roundLedgerQty(summary.inventoryProfitQty + qty)
      if (moveReason === 'INVENTORY_LOSS') summary.inventoryLossQty = roundLedgerQty(summary.inventoryLossQty + qty)

      summary.purchaseAmount = roundLedgerMoney(summary.purchaseAmount + toLedgerNumber(row.purchaseAmount))
      summary.saleAmount = roundLedgerMoney(summary.saleAmount + toLedgerNumber(row.saleAmount))
      summary.materialCost = roundLedgerMoney(summary.materialCost + toLedgerNumber(row.materialCost))
      summary.grossProfit = roundLedgerMoney(summary.grossProfit + toLedgerNumber(row.grossProfit))
      if (normalizeLedgerMoveReason(row.costStatus) === 'GAP') summary.costGapCount += 1
      return summary
    },
    {
      recordCount: 0,
      inQty: 0,
      outQty: 0,
      transferQty: 0,
      netQty: 0,
      inventoryProfitQty: 0,
      inventoryLossQty: 0,
      purchaseAmount: 0,
      saleAmount: 0,
      materialCost: 0,
      grossProfit: 0,
      costGapCount: 0,
    } as StockLedgerSummary
  )
}

export function escapeStockLedgerCsvValue(value: unknown) {
  const text = String(value ?? '')
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function buildStockLedgerExportRows(rows: StockLedgerRowLike[] = []) {
  return rows.map((row) => ({
    流水号: row.moveNo || '',
    类型: getLedgerMoveTypeText(row.moveType),
    原因: getLedgerMoveReasonText(row.moveReason),
    产品: getLedgerProductText(row),
    数量: roundLedgerQty(row.qty),
    单位: row.productUnit || '',
    采购单价: roundLedgerMoney(row.purchaseUnitCost),
    采购金额: roundLedgerMoney(row.purchaseAmount),
    销售金额: roundLedgerMoney(row.saleAmount),
    估算成本: roundLedgerMoney(row.materialCost),
    估算毛利: roundLedgerMoney(row.grossProfit),
    成本状态: row.costStatus || '',
    成本说明: row.costGapReason || '',
    仓库: row.warehouseName || '',
    调入仓库: row.toWarehouseName || '',
    库位: row.locationCode || '',
    供应商: row.supplierName || '',
    批次: row.batchNo || '',
    业务单号: getLedgerRelatedOrderText(row),
    操作人: row.operatorName || '',
    时间: row.createdAt || '',
    备注: row.remark || '',
  }))
}

export function buildStockLedgerAuditRows(rows: StockLedgerRowLike[] = [], context: StockLedgerExportContext = {}): StockLedgerAuditRow[] {
  const exportedCount = rows.length
  const totalCount = exportCountText(context.totalCount, exportedCount)
  const pageText = context.page ? `当前第 ${exportCountText(context.page, 1)} 页` : '当前页未记录'
  const pageSizeText = context.pageSize ? `每页 ${exportCountText(context.pageSize, exportedCount || 0)} 条` : '每页未记录'

  return [
    { 导出项: '导出范围', 内容: exportText(context.scopeLabel, '当前页') },
    { 导出项: '导出时间', 内容: formatLedgerExportTime(context.generatedAt) },
    { 导出项: '数据范围', 内容: `筛选 ${totalCount} 条；${pageText}；${pageSizeText}；导出 ${exportedCount} 条` },
    { 导出项: '筛选条件', 内容: buildStockLedgerFilterText(context) },
  ]
}

export function buildStockLedgerCsv(rows: StockLedgerRowLike[] = [], context?: StockLedgerExportContext) {
  const exportRows = buildStockLedgerExportRows(rows)
  const headers = Object.keys(exportRows[0] || {
    流水号: '',
    类型: '',
    原因: '',
    产品: '',
    数量: '',
    单位: '',
    采购单价: '',
    采购金额: '',
    销售金额: '',
    估算成本: '',
    估算毛利: '',
    成本状态: '',
    成本说明: '',
    仓库: '',
    调入仓库: '',
    库位: '',
    供应商: '',
    批次: '',
    业务单号: '',
    操作人: '',
    时间: '',
    备注: '',
  })
  const lines = [
    headers.map(escapeStockLedgerCsvValue).join(','),
    ...exportRows.map((row) => headers.map((header) => escapeStockLedgerCsvValue((row as Record<string, unknown>)[header])).join(',')),
  ]
  if (!context) return lines.join('\n')

  const auditRows = buildStockLedgerAuditRows(rows, context)
  const auditHeaders = ['导出项', '内容']
  return [
    auditHeaders.map(escapeStockLedgerCsvValue).join(','),
    ...auditRows.map((row) => auditHeaders.map((header) => escapeStockLedgerCsvValue((row as Record<string, unknown>)[header])).join(',')),
    '',
    ...lines,
  ].join('\n')
}
