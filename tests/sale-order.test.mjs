import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  buildSaleOrderPayload,
  canApproveSaleOrder,
  canDeleteSaleOrder,
  canEditSaleOrder,
  getSaleOrderItemAmount,
  getSaleOrderPaymentStatusMeta,
  getSaleOrderStatusMeta,
  getSaleOrderTotalAmount,
  normalizeSaleOrderItems,
  validateSaleOrderInput,
} from '../frontend-admin/src/utils/sale-order.ts'

describe('sale order amount and display helpers', () => {
  it('normalizes order items and rounds amounts consistently', () => {
    const items = normalizeSaleOrderItems({
      items: [
        { productId: '10', qty: '3', unitPrice: '12.335', remark: '  A  ' },
        { product_id: 11, quantity: 2, unit_price: 5 },
      ],
    })

    assert.deepEqual(items, [
      { productId: 10, qty: 3, unitPrice: 12.34, amount: 37.02, remark: 'A' },
      { productId: 11, qty: 2, unitPrice: 5, amount: 10, remark: '' },
    ])
    assert.equal(getSaleOrderItemAmount({ qty: 3, unitPrice: 12.335 }), 37.02)
    assert.equal(getSaleOrderTotalAmount(items), 47.02)
  })

  it('maps order and payment statuses to stable labels and tag tones', () => {
    assert.deepEqual(getSaleOrderStatusMeta('APPROVED'), { label: '已审核', type: 'primary' })
    assert.deepEqual(getSaleOrderStatusMeta('shipped'), { label: '已出库', type: 'success' })
    assert.deepEqual(getSaleOrderPaymentStatusMeta('PARTIAL'), { label: '部分回款', type: 'warning' })
  })
})

describe('sale order validation and payload', () => {
  const validOrder = {
    customerId: 20,
    orderDate: '2026-07-04',
    deliveryDate: '2026-07-20',
    remark: '  加急订单  ',
    items: [
      { productId: 10, qty: 12, unitPrice: 8.5, remark: '  首批  ' },
      { productId: 11, qty: '5', unitPrice: '3.126' },
    ],
  }

  it('builds a normalized payload for create and update requests', () => {
    assert.equal(validateSaleOrderInput(validOrder), '')
    assert.deepEqual(buildSaleOrderPayload(validOrder), {
      customerId: 20,
      orderDate: '2026-07-04',
      deliveryDate: '2026-07-20',
      remark: '加急订单',
      items: [
        { productId: 10, qty: 12, unitPrice: 8.5, amount: 102, remark: '首批' },
        { productId: 11, qty: 5, unitPrice: 3.13, amount: 15.65, remark: '' },
      ],
    })
  })

  it('rejects missing required fields, duplicate products, invalid dates and negative prices', () => {
    assert.equal(validateSaleOrderInput({ ...validOrder, customerId: 0 }), '请选择客户')
    assert.equal(validateSaleOrderInput({ ...validOrder, orderDate: '' }), '请选择订单日期')
    assert.equal(validateSaleOrderInput({ ...validOrder, orderDate: '20260704' }), '订单日期格式不正确')
    assert.equal(validateSaleOrderInput({ ...validOrder, deliveryDate: '2026-06-30' }), '交货日期不能早于订单日期')
    assert.equal(validateSaleOrderInput({ ...validOrder, deliveryDate: 'not-date' }), '交货日期格式不正确')
    assert.equal(validateSaleOrderInput({ ...validOrder, items: [] }), '请至少添加一条销售订单明细')
    assert.equal(validateSaleOrderInput({ ...validOrder, items: [{ productId: 0, qty: 1, unitPrice: 1 }] }), '第 1 行请选择产品')
    assert.equal(
      validateSaleOrderInput({ ...validOrder, items: [{ productId: 10, qty: 1, unitPrice: 1 }, { productId: 10, qty: 2, unitPrice: 1 }] }),
      '第 2 行产品重复'
    )
    assert.equal(validateSaleOrderInput({ ...validOrder, items: [{ productId: 10, qty: 1.5, unitPrice: 1 }] }), '第 1 行数量必须是大于 0 的整数')
    assert.equal(validateSaleOrderInput({ ...validOrder, items: [{ productId: 10, qty: 1, unitPrice: -1 }] }), '第 1 行单价不能为负数')
    assert.throws(() => buildSaleOrderPayload({ ...validOrder, customerId: 0 }), /请选择客户/)
  })

  it('supports legacy single-product payloads for compatible callers', () => {
    const payload = buildSaleOrderPayload({
      customerId: 20,
      orderDate: '2026-07-04',
      productId: 10,
      qty: 6,
      unitPrice: 9.99,
      itemRemark: '兼容入口',
    })

    assert.equal(payload.items.length, 1)
    assert.deepEqual(payload.items[0], { productId: 10, qty: 6, unitPrice: 9.99, amount: 59.94, remark: '兼容入口' })
  })
})

describe('sale order operation guards', () => {
  it('keeps edit, approve and delete actions aligned with business state', () => {
    assert.equal(canEditSaleOrder({ status: 'DRAFT' }), true)
    assert.equal(canEditSaleOrder({ status: 'APPROVED' }), false)
    assert.equal(canApproveSaleOrder({ status: 'DRAFT', totalAmount: 0, items: [{ qty: 2, unitPrice: 5 }] }), true)
    assert.equal(canApproveSaleOrder({ status: 'DRAFT', totalAmount: 0 }), false)
    assert.equal(canApproveSaleOrder({ status: 'APPROVED', totalAmount: 100 }), false)

    assert.equal(canDeleteSaleOrder({ status: 'DRAFT', receivedAmount: 0, items: [{ deliveredQty: 0, producedQty: 0 }] }), true)
    assert.equal(canDeleteSaleOrder({ status: 'PARTIAL', receivedAmount: 0 }), false)
    assert.equal(canDeleteSaleOrder({ status: 'DRAFT', receivedAmount: 1 }), false)
    assert.equal(canDeleteSaleOrder({ status: 'DRAFT', items: [{ deliveredQty: 1 }] }), false)
    assert.equal(canDeleteSaleOrder({ status: 'DRAFT', items: [{ producedQty: 1 }] }), false)
  })
})

describe('sale order page and request integration', () => {
  it('uses shared sale order rules in the page and Supabase request adapter', () => {
    const pageSource = readFileSync(new URL('../frontend-admin/src/views/sale/orders.vue', import.meta.url), 'utf8')
    const requestSource = readFileSync(new URL('../frontend-admin/src/api/supabaseRequest.ts', import.meta.url), 'utf8')

    assert.match(pageSource, /buildSaleOrderPayload/)
    assert.match(pageSource, /validateSaleOrderInput/)
    assert.match(pageSource, /canApproveSaleOrder/)
    assert.match(pageSource, /canDeleteSaleOrder/)
    assert.match(requestSource, /import \{ buildSaleOrderPayload \} from '..\/utils\/sale-order'/)
    assert.match(requestSource, /const normalizedPayload = buildSaleOrderPayload/)
  })
})
