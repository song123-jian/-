import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import {
  buildDailySalaryAuditCards,
  buildSalaryAdjustAuditCards,
  buildSalaryAuditSummary,
  canSettleSalary,
  getSalaryAuditBlockMessage,
} from '../frontend-admin/src/utils/salary-audit.ts'

describe('salary management delivery audit rules', () => {
  it('blocks monthly settlement when daily salary misses piece price', () => {
    const summary = buildSalaryAuditSummary(
      [{ id: 1, userId: 7, workerName: '张三', workDate: '2026-07-03', quantity: 20, amount: 0, priceMissing: true, status: 'DRAFT' }],
      [{ userId: 7, workerName: '张三', month: '2026-07', payableAmount: 0, status: 'PENDING' }],
      [],
    )

    assert.equal(summary.missingPriceCount, 1)
    assert.equal(summary.blockingCount, 1)
    assert.equal(canSettleSalary(summary), false)
    assert.match(getSalaryAuditBlockMessage(summary), /缺单价 1/)
  })

  it('blocks qualified quantity with zero amount and negative payable amount', () => {
    const summary = buildSalaryAuditSummary(
      [{ id: 2, userId: 8, workerName: '李四', workDate: '2026-07-04', quantity: 15, amount: 0, unitPrice: 0, status: 'SETTLED' }],
      [{ userId: 8, workerName: '李四', month: '2026-07', payableAmount: -12, status: 'SETTLED' }],
      [],
    )

    assert.equal(summary.zeroAmountCount, 1)
    assert.equal(summary.negativePayableCount, 1)
    assert.equal(summary.blockingCount, 2)
    assert.equal(summary.canSettle, false)
  })

  it('treats pending daily salary and adjustments as warnings, not blockers', () => {
    const summary = buildSalaryAuditSummary(
      [{ id: 3, userId: 9, workerName: '王五', workDate: '2026-07-05', quantity: 10, amount: 8, status: 'DRAFT' }],
      [{ userId: 9, workerName: '王五', month: '2026-07', payableAmount: 18, status: 'PENDING' }],
      [{ id: 4, userId: 9, workerName: '王五', adjustType: 'BONUS', amount: 10, adjustDate: '2026-07-06', status: 'DRAFT' }],
    )

    assert.equal(summary.pendingDailyCount, 1)
    assert.equal(summary.pendingAdjustCount, 1)
    assert.equal(summary.warningCount, 2)
    assert.equal(summary.blockingCount, 0)
    assert.equal(summary.canSettle, true)
  })

  it('builds daily and adjustment audit cards for page summaries', () => {
    const dailyCards = buildDailySalaryAuditCards([
      { userId: 1, workerName: '张三', workDate: '2026-07-01', quantity: 12, amount: 6, status: 'SETTLED' },
      { userId: 2, workerName: '李四', workDate: '2026-07-01', quantity: 8, amount: 0, priceMissing: true, status: 'DRAFT' },
    ])
    const adjustCards = buildSalaryAdjustAuditCards([
      { userId: 1, workerName: '张三', adjustType: 'BONUS', amount: 30, adjustDate: '2026-07-02', status: 'SETTLED' },
      { userId: 2, workerName: '李四', adjustType: 'PENALTY', amount: 12, adjustDate: '2026-07-02', status: 'DRAFT' },
    ])

    assert.equal(dailyCards.find((item) => item.label === '缺单价')?.value, 1)
    assert.equal(dailyCards.find((item) => item.label === '待结算')?.value, 1)
    assert.equal(adjustCards.find((item) => item.label === '奖励合计')?.value, '¥30.00')
    assert.equal(adjustCards.find((item) => item.label === '扣款合计')?.value, '¥12.00')
    assert.equal(adjustCards.find((item) => item.label === '待结数量')?.value, 1)
  })
})

describe('salary management delivery page wiring', () => {
  it('wires monthly salary page to settlement audit dependencies', () => {
    const source = readFileSync(resolve('frontend-admin/src/views/salary/monthly.vue'), 'utf8')

    assert.match(source, /buildSalaryAuditSummary/)
    assert.match(source, /getDailySalaryList/)
    assert.match(source, /getSalaryAdjustList/)
    assert.match(source, /getSalaryAuditBlockMessage/)
    assert.match(source, /canSettleSalary/)
    assert.match(source, /salaryAudit\.canSettle/)
    assert.match(source, /testid="salary-monthly-audit"/)
  })

  it('wires daily salary page to exception filtering and audit summary', () => {
    const source = readFileSync(resolve('frontend-admin/src/views/salary/daily.vue'), 'utf8')

    assert.match(source, /searchAuditType/)
    assert.match(source, /MISSING_PRICE/)
    assert.match(source, /ZERO_AMOUNT_WITH_QTY/)
    assert.match(source, /buildDailySalaryAuditCards/)
    assert.match(source, /MetricStrip/)
    assert.match(source, /testid="salary-daily-audit"/)
  })

  it('wires salary adjustment page to current-month default and amount summaries', () => {
    const source = readFileSync(resolve('frontend-admin/src/views/salary/adjust.vue'), 'utf8')

    assert.match(source, /currentMonthRange/)
    assert.match(source, /buildSalaryAdjustAuditCards/)
    assert.match(source, /MetricStrip/)
    assert.match(source, /adjustSummaryMethod/)
    assert.match(source, /testid="salary-adjust-audit"/)
  })
})
