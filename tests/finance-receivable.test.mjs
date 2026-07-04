import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  buildFinanceReceivableRow,
  getReceivableDueDate,
  getReceivableOverdueDays,
  getReceivableRisk,
  normalizeReceivablePaymentDays,
  summarizeFinanceReceivables,
} from '../frontend-admin/src/utils/finance-receivable.ts'

describe('finance receivable due date and risk rules', () => {
  it('normalizes customer payment terms and calculates due dates', () => {
    assert.equal(normalizeReceivablePaymentDays(-1), 0)
    assert.equal(normalizeReceivablePaymentDays(999), 365)
    assert.equal(getReceivableDueDate('2026-07-04', 30), '2026-08-03')
    assert.equal(getReceivableDueDate('bad-date', 30), '')
  })

  it('calculates overdue days and risk labels from the statement end date', () => {
    assert.equal(getReceivableOverdueDays('2026-07-01', '2026-07-31'), 30)
    assert.equal(getReceivableOverdueDays('2026-08-01', '2026-07-31'), 0)
    assert.deepEqual(getReceivableRisk(0, 100), { riskLevel: 'info', riskText: '账期内' })
    assert.deepEqual(getReceivableRisk(10, 100), { riskLevel: 'warning', riskText: '已逾期' })
    assert.deepEqual(getReceivableRisk(35, 100), { riskLevel: 'warning', riskText: '逾期超30天' })
    assert.deepEqual(getReceivableRisk(65, 100), { riskLevel: 'error', riskText: '严重逾期' })
    assert.deepEqual(getReceivableRisk(65, 0), { riskLevel: 'success', riskText: '已结清' })
  })
})

describe('finance receivable row and summary', () => {
  it('builds auditable order-level receivable rows', () => {
    const row = buildFinanceReceivableRow(
      {
        id: 10,
        orderNo: 'SO-001',
        customerId: 20,
        orderDate: '2026-06-01',
        totalAmount: 1000,
        receivedAmount: 250.126,
        status: 'APPROVED',
      },
      {
        shortName: '华东客户',
        paymentDays: 15,
        creditLevel: 'A',
      },
      '2026-07-31',
    )

    assert.deepEqual(row, {
      saleOrderId: 10,
      orderNo: 'SO-001',
      customerId: 20,
      customerName: '华东客户',
      orderDate: '2026-06-01',
      dueDate: '2026-06-16',
      paymentDays: 15,
      totalAmount: 1000,
      receivedAmount: 250.13,
      receivableAmount: 749.87,
      overdueDays: 45,
      riskLevel: 'warning',
      riskText: '逾期超30天',
      status: 'APPROVED',
      creditLevel: 'A',
    })
  })

  it('summarizes open, overdue and total receivable exposure', () => {
    const rows = [
      buildFinanceReceivableRow({ id: 1, orderDate: '2026-06-01', totalAmount: 100, receivedAmount: 20 }, { paymentDays: 10 }, '2026-07-31'),
      buildFinanceReceivableRow({ id: 2, orderDate: '2026-07-20', totalAmount: 200, receivedAmount: 0 }, { paymentDays: 30 }, '2026-07-31'),
      buildFinanceReceivableRow({ id: 3, orderDate: '2026-07-01', totalAmount: 50, receivedAmount: 50 }, { paymentDays: 0 }, '2026-07-31'),
    ]

    assert.deepEqual(summarizeFinanceReceivables(rows), {
      totalAmount: 350,
      receivedAmount: 70,
      receivableAmount: 280,
      orderCount: 3,
      openOrderCount: 2,
      overdueOrderCount: 2,
      maxOverdueDays: 50,
    })
  })
})

describe('finance receivable page and API integration', () => {
  it('connects statements, receivable API and payment prefill route', () => {
    const financeApiSource = readFileSync(new URL('../frontend-admin/src/api/finance.ts', import.meta.url), 'utf8')
    const requestSource = readFileSync(new URL('../frontend-admin/src/api/supabaseRequest.ts', import.meta.url), 'utf8')
    const statementPageSource = readFileSync(new URL('../frontend-admin/src/views/finance/statements.vue', import.meta.url), 'utf8')
    const paymentPageSource = readFileSync(new URL('../frontend-admin/src/views/sale/payments.vue', import.meta.url), 'utf8')

    assert.match(financeApiSource, /getFinanceReceivables/)
    assert.match(requestSource, /finance\/receivables/)
    assert.match(requestSource, /buildFinanceReceivableRow/)
    assert.match(requestSource, /summarizeFinanceReceivables/)
    assert.match(statementPageSource, /应收订单明细/)
    assert.match(statementPageSource, /registerReceivablePayment/)
    assert.match(statementPageSource, /saleOrderId: String\(row\.saleOrderId\)/)
    assert.match(paymentPageSource, /useRoute/)
    assert.match(paymentPageSource, /applyRoutePrefill/)
    assert.match(paymentPageSource, /route\.query\.saleOrderId/)
  })
})
