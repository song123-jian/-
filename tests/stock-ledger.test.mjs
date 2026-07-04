import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  buildStockLedgerAuditRows,
  buildStockLedgerCsv,
  buildStockLedgerExportRows,
  buildStockLedgerFilterText,
  getLedgerMoveReasonText,
  getLedgerMoveTypeText,
  getLedgerRelatedOrderText,
  summarizeStockLedgerRows,
} from '../frontend-admin/src/utils/stock-ledger.ts'

const rows = [
  {
    moveNo: 'IN-001',
    moveType: 'IN',
    moveReason: 'IN_PURCHASE',
    productCode: 'P-001',
    productName: '透明外壳',
    productUnit: '件',
    warehouseName: '原料仓',
    qty: 100,
    purchaseUnitCost: 2.5,
    purchaseAmount: 250,
    createdAt: '2026-07-04 08:00:00',
  },
  {
    moveNo: 'OUT-001',
    moveType: 'OUT',
    moveReason: 'OUT_SALE',
    productCode: 'P-001',
    productName: '透明外壳',
    warehouseName: '成品仓',
    qty: 30,
    saleOrderNo: 'SO-001',
    saleAmount: 300,
    materialCost: 180,
    grossProfit: 120,
    costStatus: 'ESTIMATED',
  },
  {
    moveNo: 'PDY-001',
    moveType: 'OUT',
    moveReason: 'INVENTORY_LOSS',
    productCode: 'P-002',
    productName: '底座',
    warehouseName: '成品仓',
    locationCode: 'A-01',
    qty: 4,
    inventoryNo: 'PD-001',
    costStatus: 'GAP',
    costGapReason: '缺成本',
    remark: '盘亏,复核',
  },
  {
    moveNo: 'PDY-002',
    moveType: 'IN',
    moveReason: 'INVENTORY_PROFIT',
    productCode: 'P-003',
    productName: '卡扣',
    warehouseName: '成品仓',
    qty: 6,
    inventoryNo: 'PD-001',
  },
  {
    moveNo: 'TR-001',
    moveType: 'TRANSFER',
    moveReason: 'TRANSFER',
    productCode: 'P-004',
    productName: '色母',
    warehouseName: '原料仓',
    toWarehouseName: '车间仓',
    qty: 10,
  },
]

describe('stock ledger summaries', () => {
  it('summarizes movement quantities, financial amounts and inventory differences', () => {
    assert.deepEqual(summarizeStockLedgerRows(rows), {
      recordCount: 5,
      inQty: 106,
      outQty: 34,
      transferQty: 10,
      netQty: 72,
      inventoryProfitQty: 6,
      inventoryLossQty: 4,
      purchaseAmount: 250,
      saleAmount: 300,
      materialCost: 180,
      grossProfit: 120,
      costGapCount: 1,
    })
  })

  it('keeps transfer quantity outside net stock movement', () => {
    const summary = summarizeStockLedgerRows([{ moveType: 'TRANSFER', qty: 99 }])

    assert.equal(summary.transferQty, 99)
    assert.equal(summary.netQty, 0)
  })
})

describe('stock ledger labels and related orders', () => {
  it('maps move types, reasons and business order numbers', () => {
    assert.equal(getLedgerMoveTypeText('IN'), '入库')
    assert.equal(getLedgerMoveReasonText('INVENTORY_LOSS'), '盘亏出库')
    assert.equal(getLedgerRelatedOrderText(rows[1]), 'SO-001')
    assert.equal(getLedgerRelatedOrderText(rows[2]), 'PD-001')
  })
})

describe('stock ledger csv export', () => {
  it('builds export rows with readable Chinese headers', () => {
    const [row] = buildStockLedgerExportRows([rows[2]])

    assert.equal(row.类型, '出库')
    assert.equal(row.原因, '盘亏出库')
    assert.equal(row.产品, 'P-002 - 底座')
    assert.equal(row.库位, 'A-01')
    assert.equal(row.业务单号, 'PD-001')
  })

  it('escapes commas and keeps a deterministic header row', () => {
    const csv = buildStockLedgerCsv([rows[2]])

    assert.equal(csv.startsWith('流水号,类型,原因,产品,数量'), true)
    assert.equal(csv.includes('"盘亏,复核"'), true)
  })

  it('keeps the same csv header when the current page has no rows', () => {
    const csv = buildStockLedgerCsv([])

    assert.equal(csv, '流水号,类型,原因,产品,数量,单位,采购单价,采购金额,销售金额,估算成本,估算毛利,成本状态,成本说明,仓库,调入仓库,库位,供应商,批次,业务单号,操作人,时间,备注')
  })

  it('adds audit context when exporting the current ledger page', () => {
    const context = {
      generatedAt: '2026-07-04T09:30:00.000Z',
      scopeLabel: '当前页',
      totalCount: 42,
      page: 2,
      pageSize: 20,
      keyword: '透明',
      dateRange: ['2026-07-01', '2026-07-04'],
      moveTypeText: '出库',
      moveReasonText: '盘亏出库',
      warehouseText: 'CK-01 - 成品仓',
      supplierText: 'GYS-01 - 华东原料',
      productText: 'P-002 - 底座',
    }
    const auditRows = buildStockLedgerAuditRows([rows[2]], context)
    const csv = buildStockLedgerCsv([rows[2]], context)

    assert.equal(buildStockLedgerFilterText(context), '日期:2026-07-01 至 2026-07-04；关键字:透明；类型:出库；原因:盘亏出库；仓库:CK-01 - 成品仓；供应商:GYS-01 - 华东原料；产品:P-002 - 底座')
    assert.deepEqual(auditRows, [
      { 导出项: '导出范围', 内容: '当前页' },
      { 导出项: '导出时间', 内容: '2026-07-04 09:30:00' },
      { 导出项: '数据范围', 内容: '筛选 42 条；当前第 2 页；每页 20 条；导出 1 条' },
      { 导出项: '筛选条件', 内容: '日期:2026-07-01 至 2026-07-04；关键字:透明；类型:出库；原因:盘亏出库；仓库:CK-01 - 成品仓；供应商:GYS-01 - 华东原料；产品:P-002 - 底座' },
    ])
    assert.equal(csv.startsWith('导出项,内容\n导出范围,当前页'), true)
    assert.equal(csv.includes('\n\n流水号,类型,原因,产品,数量'), true)
    assert.equal(csv.includes('筛选 42 条；当前第 2 页；每页 20 条；导出 1 条'), true)
  })

  it('keeps audit context readable for date objects and empty filters', () => {
    const auditRows = buildStockLedgerAuditRows([], {
      generatedAt: new Date(2026, 6, 4, 17, 45, 6),
      totalCount: -3,
      pageSize: 'bad',
      dateRange: [],
    })

    assert.deepEqual(auditRows, [
      { 导出项: '导出范围', 内容: '当前页' },
      { 导出项: '导出时间', 内容: '2026-07-04 17:45:06' },
      { 导出项: '数据范围', 内容: '筛选 0 条；当前页未记录；每页 0 条；导出 0 条' },
      { 导出项: '筛选条件', 内容: '日期:全部；关键字:全部；类型:全部；原因:全部；仓库:全部；供应商:全部；产品:全部' },
    ])
  })
})

describe('stock ledger page export integration', () => {
  it('keeps table traceability and current-page export context visible in the page', () => {
    const pageSource = readFileSync(new URL('../frontend-admin/src/views/stock/ledger.vue', import.meta.url), 'utf8')

    assert.equal(pageSource.includes('label="库位"'), true)
    assert.match(pageSource, /导出当前页CSV/)
    assert.match(pageSource, /function createExportContext\(\): StockLedgerExportContext/)
    assert.match(pageSource, /buildStockLedgerCsv\(tableData\.value, createExportContext\(\)\)/)
    assert.match(pageSource, /当前页 \$\{tableData\.value\.length\} 条，可导出当前页/)
  })
})
