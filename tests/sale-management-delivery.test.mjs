import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  buildSaleDeliveryMetricCards,
  buildSaleOrderMetricCards,
  buildSalePaymentMetricCards,
} from '../frontend-admin/src/utils/sale-management.ts'

function read(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

const routeSource = read('../frontend-admin/src/router/route-config.ts')
const orderPageSource = read('../frontend-admin/src/views/sale/orders.vue')
const deliveryPageSource = read('../frontend-admin/src/views/sale/deliveries.vue')
const paymentPageSource = read('../frontend-admin/src/views/sale/payments.vue')
const metricComponentSource = read('../frontend-admin/src/components/SalesMetricStrip.vue')
const requestSource = read('../frontend-admin/src/api/supabaseRequest.ts')
const packageSource = read('../package.json')

function assertIncludesAll(source, values, label) {
  for (const value of values) {
    assert.ok(source.includes(value), `${label} should include ${value}`)
  }
}

describe('sale management delivery target', () => {
  it('keeps the sales menu focused on order, delivery and payment pages', () => {
    const saleStart = routeSource.indexOf("path: '/sale'")
    const nextGroup = routeSource.indexOf("path: '/prod'", saleStart)
    const saleBlock = routeSource.slice(saleStart, nextGroup)

    assertIncludesAll(saleBlock, [
      "title: '销售管理'",
      "view: 'sale/orders.vue'",
      "view: 'sale/deliveries.vue'",
      "view: 'sale/payments.vue'",
    ], 'sale route group')
  })

  it('renders business metric cards on all three sales pages', () => {
    assertIncludesAll(metricComponentSource, ['data-testid="sales-metric-strip"', 'formatMoney', 'SalesMetricCard'], 'SalesMetricStrip')
    assertIncludesAll(orderPageSource, ['SalesMetricStrip', 'buildSaleOrderMetricCards', ':metrics="metricCards"'], 'sales order page')
    assertIncludesAll(deliveryPageSource, ['SalesMetricStrip', 'buildSaleDeliveryMetricCards', ':metrics="metricCards"'], 'sales delivery page')
    assertIncludesAll(paymentPageSource, ['SalesMetricStrip', 'buildSalePaymentMetricCards', ':metrics="metricCards"'], 'sales payment page')
  })

  it('keeps table scanability standards for key sales pages', () => {
    assertIncludesAll(orderPageSource, [
      'fixed="left"',
      'align="right"',
      'show-overflow-tooltip',
      'v-loading="loading"',
      'el-pagination',
      'empty-text="暂无销售订单"',
    ], 'sales order table')
    assertIncludesAll(deliveryPageSource, [
      'fixed="left"',
      'align="right"',
      'show-overflow-tooltip',
      'v-loading="loading"',
      'el-pagination',
      'empty-text="暂无发货记录"',
    ], 'sales delivery table')
    assertIncludesAll(paymentPageSource, [
      'fixed="left"',
      'align="right"',
      'show-overflow-tooltip',
      'v-loading="loading"',
      'el-pagination',
      'empty-text="暂无回款记录"',
    ], 'sales payment table')
  })

  it('keeps sales workflow actions aligned with delivery target', () => {
    assertIncludesAll(orderPageSource, ['新增订单', 'handleApprove', 'handleDelete', 'buildSaleOrderPayload'], 'sales order workflow')
    assertIncludesAll(deliveryPageSource, ['销售出库', 'goStockOut', 'updateDelivery', 'isSaleDeliveryStatus'], 'sales delivery workflow')
    assertIncludesAll(paymentPageSource, ['新增回款', 'handleDelete', 'buildSalePaymentPayload', 'applyRoutePrefill'], 'sales payment workflow')
    assert.match(requestSource, /syncWorkflowByBusiness\('payment_record'[\s\S]*?'create'/)
  })
})

describe('sale management metric rules', () => {
  it('summarizes sales order operating risks', () => {
    const metrics = buildSaleOrderMetricCards([
      { status: 'DRAFT', totalAmount: 100, receivedAmount: 0, deliveryDate: '2026-07-01', qty: 10, deliveredQty: 0 },
      { status: 'PARTIAL', totalAmount: 200, receivedAmount: 50, deliveryDate: '2026-07-20', qty: 10, deliveredQty: 4 },
      { status: 'SHIPPED', totalAmount: 300, receivedAmount: 300, deliveryDate: '2026-07-01', qty: 10, deliveredQty: 10 },
    ], '2026-07-05')

    assert.deepEqual(metrics.map((item) => item.label), ['订单总额', '待审核订单', '逾期交付', '未回款金额', '部分出库'])
    assert.equal(metrics.find((item) => item.label === '订单总额')?.value, 600)
    assert.equal(metrics.find((item) => item.label === '待审核订单')?.value, 1)
    assert.equal(metrics.find((item) => item.label === '逾期交付')?.value, 1)
    assert.equal(metrics.find((item) => item.label === '未回款金额')?.value, 250)
    assert.equal(metrics.find((item) => item.label === '部分出库')?.value, 1)
  })

  it('summarizes delivery status and logistics risks', () => {
    const metrics = buildSaleDeliveryMetricCards([
      { deliveryDate: '2026-07-05', totalQty: 8, status: 'SHIPPED', logisticsCompany: '', trackingNo: '' },
      { deliveryDate: '2026-07-05', totalQty: 2, status: 'IN_TRANSIT', logisticsCompany: '顺丰', trackingNo: 'SF1' },
      { deliveryDate: '2026-07-04', totalQty: 3, status: 'RECEIVED', logisticsCompany: '德邦', trackingNo: 'DB1' },
      { deliveryDate: '2026-07-04', totalQty: 1, status: 'CANCELLED' },
    ], '2026-07-05')

    assert.equal(metrics.find((item) => item.label === '今日发货')?.value, 10)
    assert.equal(metrics.find((item) => item.label === '运输中')?.value, 1)
    assert.equal(metrics.find((item) => item.label === '已签收')?.value, 1)
    assert.equal(metrics.find((item) => item.label === '物流缺失')?.value, 1)
    assert.equal(metrics.find((item) => item.label === '异常/取消')?.value, 1)
  })

  it('summarizes payment exposure and over-payment risk intercepts', () => {
    const metrics = buildSalePaymentMetricCards([
      { paymentDate: '2026-07-05', amount: 80 },
      { payDate: '2026-07-04', payAmount: 20 },
    ], [
      { totalAmount: 100, receivedAmount: 50, paymentStatus: 'PARTIAL', dueDate: '2026-07-01', status: 'APPROVED' },
      { totalAmount: 200, receivedAmount: 0, paymentStatus: 'UNPAID', dueDate: '2026-07-20', status: 'APPROVED' },
      { totalAmount: 300, receivedAmount: 300, paymentStatus: 'PAID', dueDate: '2026-07-01', status: 'SHIPPED' },
    ], '2026-07-05', 2)

    assert.equal(metrics.find((item) => item.label === '今日回款')?.value, 80)
    assert.equal(metrics.find((item) => item.label === '未收余额')?.value, 250)
    assert.equal(metrics.find((item) => item.label === '逾期应收')?.value, 50)
    assert.equal(metrics.find((item) => item.label === '部分回款')?.value, 1)
    assert.equal(metrics.find((item) => item.label === '超额风险拦截')?.value, 2)
  })

  it('is included in the root test script', () => {
    assert.match(packageSource, /tests\/sale-management-delivery\.test\.mjs/)
  })
})
