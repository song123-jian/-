import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  SALE_PAYMENT_METHOD_OPTIONS,
  buildSalePaymentPayload,
  getEditablePaymentLimit,
  getEffectiveReceivedAmount,
  getPaymentMethodLabel,
  getPaymentStatus,
  getSaleOrderPaymentBaseAmount,
  getSaleOrderReceivableAmount,
  getSaleOrderReceivedAmountAsOf,
  getSaleOrderReceivedAmountFromSummary,
  isSaleOrderCollectableForPayment,
  normalizePaymentMethod,
  sumSalePaymentRecords,
  validatePaymentAmount,
  validateSalePaymentInput,
} from '../frontend-admin/src/utils/sale-payment.ts'

describe('sale payment amount calculations', () => {
  const order = { id: 10, totalAmount: 1000, receivedAmount: 200 }
  const records = [
    { id: 1, saleOrderId: 10, payAmount: 120.126 },
    { id: 2, saleOrderId: 10, amount: 80.875 },
    { id: 3, saleOrderId: 11, payAmount: 999 },
  ]

  it('uses payment records as the authoritative received amount when available', () => {
    assert.equal(sumSalePaymentRecords(records, 10), 201.01)
    assert.equal(getEffectiveReceivedAmount(order, records), 201.01)
    assert.equal(getSaleOrderReceivableAmount(order, records), 798.99)
  })

  it('falls back to stored order received amount for legacy orders without records', () => {
    assert.equal(getEffectiveReceivedAmount(order, []), 200)
    assert.equal(getSaleOrderReceivableAmount(order, []), 800)
  })

  it('adds the original payment back to the editable limit for the same order only', () => {
    assert.equal(getEditablePaymentLimit(order, records, { id: 2, saleOrderId: 10, payAmount: 80 }), 878.99)
    assert.equal(getEditablePaymentLimit(order, records, { id: 4, saleOrderId: 12, payAmount: 80 }), 798.99)
  })

  it('keeps historical receivables from being reduced by later payments', () => {
    const orderWithOpening = { id: 10, totalAmount: 1000, receivedOpeningAmount: 100, receivedAmount: 700 }
    const fullSummary = { amount: 600, count: 3 }
    const asOfSummary = { amount: 200, count: 1 }

    assert.equal(getSaleOrderPaymentBaseAmount(orderWithOpening, fullSummary), 100)
    assert.equal(getSaleOrderReceivedAmountFromSummary(orderWithOpening, fullSummary), 700)
    assert.equal(getSaleOrderReceivedAmountAsOf(orderWithOpening, fullSummary, asOfSummary), 300)
  })

  it('derives a legacy payment base from stored received amount and full records', () => {
    const legacyOrder = { id: 10, totalAmount: 1000, receivedAmount: 700 }
    const fullSummary = { amount: 600, count: 3 }
    const asOfSummary = { amount: 200, count: 1 }

    assert.equal(getSaleOrderPaymentBaseAmount(legacyOrder, fullSummary), 100)
    assert.equal(getSaleOrderReceivedAmountAsOf(legacyOrder, fullSummary, asOfSummary), 300)
    assert.equal(getSaleOrderReceivedAmountAsOf(legacyOrder, undefined, asOfSummary), 700)
  })
})

describe('sale payment statuses and validation', () => {
  it('recognizes collectable order statuses', () => {
    assert.equal(isSaleOrderCollectableForPayment('APPROVED'), true)
    assert.equal(isSaleOrderCollectableForPayment('shipped'), true)
    assert.equal(isSaleOrderCollectableForPayment('DRAFT'), false)
    assert.equal(isSaleOrderCollectableForPayment('CANCELLED'), false)
  })

  it('labels unpaid, partial and paid orders', () => {
    assert.equal(getPaymentStatus(1000, 0), 'UNPAID')
    assert.equal(getPaymentStatus(1000, 999.99), 'PARTIAL')
    assert.equal(getPaymentStatus(1000, 1000), 'PAID')
  })

  it('validates positive amount and upper receivable limit', () => {
    assert.equal(validatePaymentAmount(0, 100), '回款金额必须大于 0')
    assert.equal(validatePaymentAmount(120, 100), '回款金额不能超过可回款金额')
    assert.equal(validatePaymentAmount(99.99, 100), '')
  })
})

describe('sale payment payload and data standardization', () => {
  const validPayment = {
    saleOrderId: 20,
    amount: '888.126',
    paymentDate: '2026-07-04',
    paymentMethod: 'bank_transfer',
    invoiceNo: '  INV-001  ',
    remark: '  首款  ',
  }

  it('normalizes payload fields for page and Supabase requests', () => {
    assert.equal(SALE_PAYMENT_METHOD_OPTIONS.length >= 6, true)
    assert.equal(normalizePaymentMethod('wechat'), 'WECHAT')
    assert.equal(getPaymentMethodLabel('ALIPAY'), '支付宝')
    assert.equal(validateSalePaymentInput(validPayment, 900), '')
    assert.deepEqual(buildSalePaymentPayload(validPayment, 900), {
      saleOrderId: 20,
      amount: 888.13,
      paymentDate: '2026-07-04',
      paymentMethod: 'BANK_TRANSFER',
      invoiceNo: 'INV-001',
      remark: '首款',
    })
  })

  it('rejects missing orders, invalid dates, invalid methods and over-payment', () => {
    assert.equal(validateSalePaymentInput({ ...validPayment, saleOrderId: 0 }, 900), '请选择销售订单')
    assert.equal(validateSalePaymentInput({ ...validPayment, amount: 901 }, 900), '回款金额不能超过可回款金额')
    assert.equal(validateSalePaymentInput({ ...validPayment, paymentDate: '' }, 900), '请选择回款日期')
    assert.equal(validateSalePaymentInput({ ...validPayment, paymentDate: '20260704' }, 900), '回款日期格式不正确')
    assert.equal(validateSalePaymentInput({ ...validPayment, paymentMethod: '' }, 900), '请选择付款方式')
    assert.equal(validateSalePaymentInput({ ...validPayment, paymentMethod: 'CARD' }, 900), '付款方式不在允许范围内')
    assert.throws(() => buildSalePaymentPayload({ ...validPayment, amount: 901 }, 900), /回款金额不能超过可回款金额/)
  })
})

describe('sale payment page and request integration', () => {
  it('uses shared payment rules in the page and Supabase request adapter', () => {
    const pageSource = readFileSync(new URL('../frontend-admin/src/views/sale/payments.vue', import.meta.url), 'utf8')
    const requestSource = readFileSync(new URL('../frontend-admin/src/api/supabaseRequest.ts', import.meta.url), 'utf8')

    assert.match(pageSource, /SALE_PAYMENT_METHOD_OPTIONS/)
    assert.match(pageSource, /buildSalePaymentPayload/)
    assert.match(pageSource, /getPaymentMethodLabel/)
    assert.match(requestSource, /import \{\s*buildSalePaymentPayload,/)
    assert.match(requestSource, /const normalizedPayload = buildSalePaymentPayload/)
  })
})
