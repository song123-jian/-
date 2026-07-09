import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  buildPurchaseOrderFromRequisition,
  buildPurchaseOrderRows,
  getPurchaseOrderAmount,
  getPurchaseOrderRemainingQty,
  getPurchaseOrderStatusTag,
  getPurchaseOrderStatusText,
  normalizePurchaseOrderStatus,
  summarizePurchaseOrders,
  validatePurchaseOrderInput,
  validatePurchaseReceiveQty,
} from '../frontend-admin/src/utils/purchase-order.ts'

describe('purchase order lifecycle rules', () => {
  it('normalizes lifecycle statuses and status display values', () => {
    assert.equal(normalizePurchaseOrderStatus('DRAFT'), 'DRAFT')
    assert.equal(normalizePurchaseOrderStatus('APPROVED'), 'APPROVED')
    assert.equal(normalizePurchaseOrderStatus('CONVERTED', 10, 0), 'ORDERED')
    assert.equal(normalizePurchaseOrderStatus('CONVERTED', 10, 4), 'PARTIAL_RECEIVED')
    assert.equal(normalizePurchaseOrderStatus('CONVERTED', 10, 10), 'RECEIVED')
    assert.equal(normalizePurchaseOrderStatus('REJECTED'), 'CANCELLED')
    assert.equal(getPurchaseOrderStatusText('CONVERTED'), '待到货')
    assert.equal(getPurchaseOrderStatusText('PARTIAL_RECEIVED'), '部分到货')
    assert.equal(getPurchaseOrderStatusTag('RECEIVED'), 'success')
  })

  it('validates order creation and receive quantity boundaries', () => {
    const order = buildPurchaseOrderFromRequisition(
      { id: 2, requisitionNo: 'PR-2', materialId: 20, requestedQty: 10, supplierId: 7, expectedDate: '2026-07-01', status: 'CONVERTED' },
      [{ productId: 20, supplierId: 7, qty: 4, purchaseUnitCost: 3, purchaseAmount: 12 }],
      '2026-07-05'
    )

    assert.equal(validatePurchaseOrderInput({ materialId: 20, requestedQty: 10, expectedDate: '2026-07-01' }), '')
    assert.equal(validatePurchaseOrderInput({ materialId: 0, requestedQty: 10 }), '请选择采购物料')
    assert.equal(validatePurchaseOrderInput({ materialId: 20, requestedQty: 0 }), '采购数量必须大于 0')
    assert.equal(validatePurchaseOrderInput({ materialId: 20, requestedQty: 10, expectedDate: '20260701' }), '期望到货日期格式不正确')
    assert.equal(validatePurchaseOrderInput({ materialId: 20, requestedQty: 10 }, { requireSupplier: true }), '请选择供应商')
    assert.equal(validatePurchaseReceiveQty(order, 6), '')
    assert.equal(validatePurchaseReceiveQty(order, 7), '入库数量不能超过订单剩余数量')
    assert.equal(validatePurchaseReceiveQty({ ...order, supplierId: null }, 1), '采购订单缺少供应商，不能入库')
    assert.equal(validatePurchaseReceiveQty({ ...order, remainingQty: 0, status: 'RECEIVED' }, 1), '采购订单已全部到货')
  })
})

describe('purchase requisition to purchase order workbench rows', () => {
  const requisitions = [
    { id: 1, requisitionNo: 'PR-1', materialId: 10, materialName: 'PA66', requestedQty: 10, supplierId: 7, supplierName: '华东供应', expectedDate: '2026-07-10', status: 'APPROVED' },
    { id: 2, requisitionNo: 'PR-2', materialId: 20, materialName: 'ABS', requestedQty: 10, supplierId: 7, supplierName: '华东供应', expectedDate: '2026-07-01', status: 'CONVERTED' },
    { id: 3, requisitionNo: 'PR-3', materialId: 30, materialName: '色粉', requestedQty: 5, supplierId: 8, supplierName: '南方供应', expectedDate: '2026-07-04', status: 'CONVERTED' },
    { id: 4, requisitionNo: 'PR-4', materialId: 40, materialName: '包装袋', requestedQty: 2, expectedDate: '2026-07-04', status: 'APPROVED' },
  ]

  const inboundRows = [
    { productId: 20, productName: 'ABS', supplierId: 7, supplierName: '华东供应', qty: 4, purchaseUnitCost: 3, purchaseAmount: 12, operateTime: '2026-07-02T08:00:00' },
    { productId: 30, productName: '色粉', supplierId: 8, supplierName: '南方供应', qty: 5, purchaseUnitCost: 5, purchaseAmount: 25, operateTime: '2026-07-03T08:00:00' },
  ]

  it('builds order rows with pending, partial, received and supplier-risk states', () => {
    const rows = buildPurchaseOrderRows(requisitions, inboundRows, '2026-07-05')
    const pending = rows.find((row) => row.orderNo === 'PO-1')
    const partial = rows.find((row) => row.orderNo === 'PO-2')
    const received = rows.find((row) => row.orderNo === 'PO-3')
    const noSupplier = rows.find((row) => row.orderNo === 'PO-4')

    assert.equal(pending?.status, 'APPROVED')
    assert.equal(pending?.canConvert, true)
    assert.equal(pending?.canReceive, false)
    assert.equal(partial?.status, 'PARTIAL_RECEIVED')
    assert.equal(partial?.receivedQty, 4)
    assert.equal(partial?.remainingQty, 6)
    assert.equal(partial?.receiveProgress, 40)
    assert.equal(partial?.unitCost, 3)
    assert.equal(partial?.amount, 30)
    assert.equal(partial?.receivedAmount, 12)
    assert.equal(partial?.remainingAmount, 18)
    assert.equal(partial?.overdue, true)
    assert.equal(partial?.canReceive, true)
    assert.equal(received?.status, 'RECEIVED')
    assert.equal(received?.remainingQty, 0)
    assert.equal(noSupplier?.noSupplier, true)
    assert.equal(noSupplier?.riskText, '缺供应商')
  })

  it('summarizes workbench KPI counts and quantities', () => {
    const rows = buildPurchaseOrderRows(requisitions, inboundRows, '2026-07-05')
    const summary = summarizePurchaseOrders(rows, '2026-07-05')

    assert.equal(summary.total, 4)
    assert.equal(summary.pending, 2)
    assert.equal(summary.partial, 1)
    assert.equal(summary.received, 1)
    assert.equal(summary.noSupplier, 1)
    assert.equal(summary.overdue, 2)
    assert.equal(summary.risk, 2)
    assert.equal(summary.requestedQty, 27)
    assert.equal(summary.receivedQty, 9)
    assert.equal(summary.remainingQty, 18)
  })

  it('does not double consume one inbound row across multiple purchase orders', () => {
    const rows = buildPurchaseOrderRows(
      [
        { id: 11, requisitionNo: 'PR-11', materialId: 50, requestedQty: 5, supplierId: 9, expectedDate: '2026-07-01', status: 'CONVERTED' },
        { id: 12, requisitionNo: 'PR-12', materialId: 50, requestedQty: 5, supplierId: 9, expectedDate: '2026-07-02', status: 'CONVERTED' },
      ],
      [{ productId: 50, supplierId: 9, qty: 6, purchaseUnitCost: 2, purchaseAmount: 12 }],
      '2026-07-05'
    )

    assert.equal(rows[0].status, 'RECEIVED')
    assert.equal(rows[0].receivedQty, 5)
    assert.equal(rows[1].status, 'PARTIAL_RECEIVED')
    assert.equal(rows[1].receivedQty, 1)
    assert.equal(rows[1].remainingQty, 4)
    assert.equal(getPurchaseOrderRemainingQty(rows[1]), 4)
    assert.equal(getPurchaseOrderAmount(rows[1]), 10)
  })
})

describe('purchase order page integration', () => {
  it('uses shared purchase order rules and real requisition state transition action', () => {
    const pageSource = readFileSync(new URL('../frontend-admin/src/views/purchase/orders.vue', import.meta.url), 'utf8')
    const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')

    assert.match(pageSource, /buildPurchaseOrderRows/)
    assert.match(pageSource, /summarizePurchaseOrders/)
    assert.match(pageSource, /validatePurchaseReceiveQty/)
    assert.match(pageSource, /runInjectionAction\('purchase-requisitions', Number\(row\.id\), 'generate'\)/)
    assert.match(pageSource, /订单闭环工作台/)
    assert.match(pageSource, /剩余/)
    assert.match(pageSource, /风险/)
    assert.match(packageSource, /tests\/purchase-order\.test\.mjs/)
  })
})
