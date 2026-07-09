import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { buildRoutePath, routeGroups } from '../frontend-admin/src/router/route-config.ts'
import {
  buildSaleOrderPurchaseRequisitionItems,
  buildSaleOrderPurchaseRequisitionQuery,
  buildSaleOrderRisks,
  getSaleOrderRiskLevelText,
  summarizeSaleOrderRisks,
} from '../frontend-admin/src/utils/sale-risk.ts'

function issueTypes(row) {
  return row.issues.map((item) => item.type)
}

function read(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('sale order risk rules', () => {
  it('识别逾期交付、库存缺口和未建生产工单', () => {
    const [row] = buildSaleOrderRisks({
      today: '2026-07-08',
      orders: [
        {
          id: 1,
          orderNo: 'SO-OVER',
          customerName: '华东客户',
          status: 'APPROVED',
          deliveryDate: '2026-07-05',
          items: [{ id: 101, productId: 10, productName: '透明外壳', qty: 100, deliveredQty: 20 }],
        },
      ],
      stockRows: [{ productId: 10, qty: 10, lockedQty: 0 }],
    })

    assert.equal(row.riskLevel, 'RED')
    assert.equal(row.riskText, '高风险')
    assert.equal(row.remainingQty, 80)
    assert.equal(row.availableQty, 10)
    assert.deepEqual(issueTypes(row), ['delivery_overdue', 'stock_shortage', 'production_missing'])

    const summary = summarizeSaleOrderRisks([row])
    assert.equal(summary.red, 1)
    assert.equal(summary.overdue, 1)
    assert.equal(summary.stockShortage, 1)
    assert.equal(summary.productionRisk, 1)
  })

  it('对临近交期但库存可覆盖的订单给出黄色关注', () => {
    const [row] = buildSaleOrderRisks({
      today: '2026-07-08',
      dueSoonDays: 3,
      orders: [
        {
          id: 2,
          orderNo: 'SO-SOON',
          status: 'APPROVED',
          deliveryDate: '2026-07-10',
          items: [{ id: 201, productId: 20, productName: '蓝色面板', qty: 50, deliveredQty: 0 }],
        },
      ],
      stockRows: [{ productId: 20, availableQty: 50 }],
    })

    assert.equal(row.riskLevel, 'YELLOW')
    assert.equal(row.daysToDelivery, 2)
    assert.equal(row.availableQty, 50)
    assert.deepEqual(issueTypes(row), ['delivery_due_soon'])
    assert.equal(getSaleOrderRiskLevelText(row.riskLevel), '需关注')
  })

  it('同一产品多明细不会重复占用同一批可用库存', () => {
    const [row] = buildSaleOrderRisks({
      today: '2026-07-08',
      orders: [
        {
          id: 3,
          orderNo: 'SO-STOCK',
          status: 'APPROVED',
          deliveryDate: '2026-07-20',
          items: [
            { id: 301, productId: 30, productName: '卡扣', qty: 6, deliveredQty: 0 },
            { id: 302, productId: 30, productName: '卡扣', qty: 6, deliveredQty: 0 },
          ],
        },
      ],
      stockRows: [{ productId: 30, availableQty: 10 }],
    })

    assert.equal(row.remainingQty, 12)
    assert.equal(row.availableQty, 10)
    assert.ok(issueTypes(row).includes('stock_shortage'))
    assert.ok(issueTypes(row).includes('production_missing'))
  })

  it('把成品缺口联动到原料缺口并生成采购请购建议', () => {
    const [row] = buildSaleOrderRisks({
      today: '2026-07-08',
      orders: [
        {
          id: 6,
          orderNo: 'SO-MRP',
          status: 'APPROVED',
          deliveryDate: '2026-07-10',
          items: [{ id: 601, productId: 60, productName: '透明壳', qty: 10, deliveredQty: 0 }],
        },
      ],
      productRows: [
        { id: 60, code: 'P-60', name: '透明壳', rawMaterialId: 600, rawMaterialUsage: 2 },
        { id: 600, code: 'M-ABS', name: 'ABS原料', unit: 'kg' },
      ],
      stockRows: [
        { productId: 60, availableQty: 0 },
        { productId: 600, availableQty: 12 },
      ],
    })

    assert.equal(row.riskLevel, 'RED')
    assert.ok(issueTypes(row).includes('material_shortage'))
    assert.equal(row.materialShortageCount, 1)
    assert.equal(row.materialShortageQty, 8)
    assert.equal(row.purchaseSuggestionQty, 8)
    assert.deepEqual(row.materialShortages[0], {
      materialId: 600,
      materialCode: 'M-ABS',
      materialName: 'ABS原料',
      unit: 'kg',
      requiredQty: 20,
      availableQty: 12,
      incomingQty: 0,
      safetyStock: 0,
      shortageQty: 8,
      requestedQty: 8,
      coverageRate: 60,
      sourceMrpNo: 'SO-MRP-SO-MRP-600',
    })

    const summary = summarizeSaleOrderRisks([row])
    assert.equal(summary.materialShortage, 1)
    assert.equal(summary.materialShortageQty, 8)
    assert.equal(summary.purchaseSuggestionQty, 8)

    const query = buildSaleOrderPurchaseRequisitionQuery(row)
    assert.equal(query.action, 'create')
    assert.equal(query.open, '1')
    assert.equal(query.batch, '0')
    assert.equal(query.itemCount, '1')
    assert.equal(query.materialId, '600')
    assert.equal(query.shortageQty, '8')
    assert.equal(query.requestedQty, '8')
    assert.equal(query.totalRequestedQty, '8')
    assert.equal(query.sourceMrpNo, 'SO-MRP-SO-MRP-600')
    assert.equal(query.expectedDate, '2026-07-10 00:00:00')
    assert.equal(JSON.parse(query.items).length, 1)
    assert.match(query.remark, /SO-MRP/)
    assert.match(query.remark, /ABS/)
    assert.match(query.remark, /SO-MRP-SO-MRP-600/)
    assert.equal(buildSaleOrderPurchaseRequisitionQuery({ ...row, materialShortages: [] }), null)
  })

  it('按物料合并多条原料缺口后生成批量请购预填清单', () => {
    const baseShortage = {
      materialId: 600,
      materialCode: 'M-ABS',
      materialName: 'ABS原料',
      unit: 'kg',
      requiredQty: 20,
      availableQty: 0,
      incomingQty: 0,
      safetyStock: 0,
      shortageQty: 8,
      requestedQty: 8,
      coverageRate: 0,
      sourceMrpNo: 'MRP-ABS-1',
    }
    const row = {
      orderId: 8,
      orderNo: 'SO-BATCH',
      customerName: '华东客户',
      productName: '组合件',
      status: 'APPROVED',
      deliveryDate: '2026-07-12',
      daysToDelivery: 4,
      orderQty: 10,
      deliveredQty: 0,
      remainingQty: 10,
      availableQty: 0,
      producedQty: 0,
      materialShortageCount: 3,
      materialShortageQty: 17,
      purchaseSuggestionQty: 17,
      materialShortages: [
        baseShortage,
        { ...baseShortage, shortageQty: 2, requestedQty: 2, sourceMrpNo: 'MRP-ABS-2' },
        { ...baseShortage, materialId: 601, materialCode: 'M-PC', materialName: 'PC原料', shortageQty: 7, requestedQty: 7, sourceMrpNo: 'MRP-PC-1' },
      ],
      receivableAmount: 0,
      riskLevel: 'RED',
      riskText: '高风险',
      primaryRisk: '原料缺口需要请购',
      issueCount: 1,
      issues: [],
    }

    const items = buildSaleOrderPurchaseRequisitionItems(row)
    assert.equal(items.length, 2)
    assert.equal(items[0].materialId, 600)
    assert.equal(items[0].shortageQty, 10)
    assert.equal(items[0].requestedQty, 10)
    assert.equal(items[0].sourceMrpNo, 'MRP-ABS-1、MRP-ABS-2')

    const query = buildSaleOrderPurchaseRequisitionQuery(row)
    assert.equal(query.batch, '1')
    assert.equal(query.itemCount, '2')
    assert.equal(query.totalRequestedQty, '17')
    assert.equal(JSON.parse(query.items).length, 2)
    assert.match(query.remark, /合并物料：2项/)
  })

  it('联动生产进度和质检不良未闭环生成红色风险', () => {
    const [row] = buildSaleOrderRisks({
      today: '2026-07-08',
      orders: [
        {
          id: 4,
          orderNo: 'SO-QC',
          status: 'APPROVED',
          deliveryDate: '2026-07-20',
          items: [{ id: 401, productId: 40, productName: '装饰条', qty: 100, deliveredQty: 0 }],
        },
      ],
      productionOrders: [{ id: 4001, saleOrderId: 4, productId: 40, qualifiedQty: 30, status: 'RUNNING' }],
      qcRecords: [{ id: 9001, prodOrderId: 4001, checkResult: 'FAIL', disposalStatus: 'OPEN' }],
    })

    assert.equal(row.riskLevel, 'RED')
    assert.equal(row.producedQty, 30)
    assert.ok(issueTypes(row).includes('production_lagging'))
    assert.ok(issueTypes(row).includes('quality_failed'))
  })

  it('识别已发货订单的物流缺失和逾期应收', () => {
    const [row] = buildSaleOrderRisks({
      today: '2026-07-08',
      paymentGraceDays: 7,
      orders: [
        {
          id: 5,
          orderNo: 'SO-PAY',
          status: 'SHIPPED',
          deliveryDate: '2026-06-20',
          totalAmount: 100,
          items: [{ id: 501, productId: 50, productName: '盖板', qty: 10, deliveredQty: 10 }],
        },
      ],
      deliveryRows: [{ saleOrderId: 5, status: 'SHIPPED', logisticsCompany: '', trackingNo: '' }],
      paymentRows: [{ saleOrderId: 5, payAmount: 30 }],
    })

    assert.equal(row.riskLevel, 'RED')
    assert.equal(row.receivableAmount, 70)
    assert.deepEqual(issueTypes(row), ['logistics_missing', 'payment_overdue'])

    const summary = summarizeSaleOrderRisks([row])
    assert.equal(summary.paymentRisk, 1)
    assert.equal(summary.receivableAmount, 70)
  })

  it('无明显交付风险时返回绿色正常状态并按风险优先排序', () => {
    const rows = buildSaleOrderRisks({
      today: '2026-07-08',
      orders: [
        {
          id: 11,
          orderNo: 'SO-GREEN',
          status: 'APPROVED',
          deliveryDate: '2026-08-01',
          items: [{ id: 1101, productId: 11, productName: '绿灯件', qty: 10, deliveredQty: 0 }],
        },
        {
          id: 12,
          orderNo: 'SO-YELLOW',
          status: 'APPROVED',
          deliveryDate: '2026-07-10',
          items: [{ id: 1201, productId: 12, productName: '黄灯件', qty: 10, deliveredQty: 0 }],
        },
        {
          id: 13,
          orderNo: 'SO-RED',
          status: 'APPROVED',
          deliveryDate: '2026-07-01',
          items: [{ id: 1301, productId: 13, productName: '红灯件', qty: 10, deliveredQty: 0 }],
        },
      ],
      stockRows: [
        { productId: 11, availableQty: 10 },
        { productId: 12, availableQty: 10 },
        { productId: 13, availableQty: 10 },
      ],
    })

    assert.deepEqual(rows.map((row) => row.orderNo), ['SO-RED', 'SO-YELLOW', 'SO-GREEN'])
    assert.equal(rows[2].riskLevel, 'GREEN')
    assert.deepEqual(issueTypes(rows[2]), ['normal'])

    const summary = summarizeSaleOrderRisks(rows)
    assert.equal(summary.total, 3)
    assert.equal(summary.red, 1)
    assert.equal(summary.yellow, 1)
    assert.equal(summary.green, 1)
  })
})

describe('sale order risk page integration', () => {
  it('管理端提供交期风险菜单、销售订单入口和数据源聚合页面', () => {
    const leafRoutes = routeGroups.flatMap((group) => group.children.map((item) => ({
      ...item,
      fullPath: buildRoutePath(group.path, item.path),
    })))
    const riskRoute = leafRoutes.find((item) => item.fullPath === '/sale/order-risks')
    assert.equal(riskRoute?.title, '交期风险')
    assert.equal(riskRoute?.view, 'sale/order-risks.vue')
    assert.equal(existsSync('frontend-admin/src/views/sale/order-risks.vue'), true)

    const riskPage = read('../frontend-admin/src/views/sale/order-risks.vue')
    const orderPage = read('../frontend-admin/src/views/sale/orders.vue')
    const packageSource = read('../package.json')
    assert.match(riskPage, /buildSaleOrderRisks/)
    assert.match(riskPage, /getSaleOrderList/)
    assert.match(riskPage, /getProdOrderList/)
    assert.match(riskPage, /getProductList/)
    assert.match(riskPage, /getStockList/)
    assert.match(riskPage, /getQcRecordList/)
    assert.match(riskPage, /getDeliveryList/)
    assert.match(riskPage, /getPaymentList/)
    assert.match(riskPage, /sale-risk-metrics/)
    assert.match(riskPage, /原料缺口/)
    assert.match(riskPage, /\/injection\/purchase-requisition/)
    assert.match(riskPage, /buildSaleOrderPurchaseRequisitionQuery/)
    assert.match(riskPage, /handleIssueAction\(row, item\.route\)/)
    assert.match(riskPage, /router\.push\(\{ path, query \}\)/)
    assert.match(orderPage, /goRiskCenter/)
    assert.match(orderPage, /\/sale\/order-risks/)
    assert.match(packageSource, /tests\/sale-risk\.test\.mjs/)
  })
})
