import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getRemainingSaleDeliveryQty,
  getSaleDeliveryStatusTag,
  getSaleDeliveryStatusText,
  isFinalSaleDeliveryStatus,
  isSaleDeliveryStatus,
  sumSaleDeliveryQty,
  validateSaleDeliveryQty,
} from '../frontend-admin/src/utils/sale-delivery.ts'

describe('sale delivery status helpers', () => {
  it('normalizes known delivery statuses', () => {
    assert.equal(isSaleDeliveryStatus('SHIPPED'), true)
    assert.equal(isSaleDeliveryStatus('in_transit'), true)
    assert.equal(isSaleDeliveryStatus('UNKNOWN'), false)
    assert.equal(isFinalSaleDeliveryStatus('RECEIVED'), true)
    assert.equal(isFinalSaleDeliveryStatus('SHIPPED'), false)
  })

  it('maps delivery statuses to labels and tag tones', () => {
    assert.equal(getSaleDeliveryStatusText('SHIPPED'), '已发货')
    assert.equal(getSaleDeliveryStatusText('IN_TRANSIT'), '运输中')
    assert.equal(getSaleDeliveryStatusTag('RECEIVED'), 'success')
    assert.equal(getSaleDeliveryStatusTag('CANCELLED'), 'danger')
  })
})

describe('sale delivery quantities', () => {
  it('calculates remaining and aggregate delivery quantities', () => {
    assert.equal(getRemainingSaleDeliveryQty({ qty: 120, deliveredQty: 35 }), 85)
    assert.equal(sumSaleDeliveryQty([{ deliveryQty: 8 }, { qty: 7.25 }]), 15.25)
  })

  it('validates integer delivery quantity against remaining quantity', () => {
    assert.equal(validateSaleDeliveryQty(0, 10), '发货数量必须是大于 0 的整数')
    assert.equal(validateSaleDeliveryQty(1.5, 10), '发货数量必须是大于 0 的整数')
    assert.equal(validateSaleDeliveryQty(11, 10), '发货数量不能超过订单可发数量')
    assert.equal(validateSaleDeliveryQty(10, 10), '')
  })
})
