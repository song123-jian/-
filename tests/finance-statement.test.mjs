import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createFinanceStatementScope,
  getFinanceStatementMonthKey,
  listFinanceStatementMonthKeys,
  normalizeFinanceStatementDate,
  normalizeFinanceStatementMonth,
  validateFinanceStatementRange,
} from '../frontend-admin/src/utils/finance-statement.ts'

describe('finance statement scope', () => {
  it('builds a deterministic recent-month scope with full month bounds', () => {
    const scope = createFinanceStatementScope({ months: 6 }, '2026-07-03')

    assert.equal(scope.periodMode, 'RECENT_MONTHS')
    assert.equal(scope.months, 6)
    assert.equal(scope.startDate, '2026-02-01')
    assert.equal(scope.endDate, '2026-07-31')
    assert.deepEqual(scope.monthKeys, ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'])
  })

  it('supports an explicit cross-year finance period', () => {
    const scope = createFinanceStatementScope({
      startDate: '2025-11-15',
      endDate: '2026-01-20',
    })

    assert.equal(scope.periodMode, 'DATE_RANGE')
    assert.equal(scope.months, 3)
    assert.equal(scope.startDate, '2025-11-15')
    assert.equal(scope.endDate, '2026-01-20')
    assert.deepEqual(scope.monthKeys, ['2025-11', '2025-12', '2026-01'])
  })

  it('supports accounting month closed intervals', () => {
    const scope = createFinanceStatementScope({
      startMonth: '2025-11',
      endMonth: '2026-02',
    })

    assert.equal(scope.periodMode, 'ACCOUNTING_MONTHS')
    assert.equal(scope.months, 4)
    assert.equal(scope.startDate, '2025-11-01')
    assert.equal(scope.endDate, '2026-02-28')
    assert.deepEqual(scope.monthKeys, ['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('normalizes dates and month keys safely', () => {
    assert.equal(normalizeFinanceStatementDate('2026-02-29'), '')
    assert.equal(normalizeFinanceStatementDate('2024-02-29T08:30:00'), '2024-02-29')
    assert.equal(normalizeFinanceStatementMonth('2026-13'), '')
    assert.equal(normalizeFinanceStatementMonth('2026-07-31'), '2026-07')
    assert.equal(getFinanceStatementMonthKey('2026-07-03T12:00:00'), '2026-07')
    assert.deepEqual(listFinanceStatementMonthKeys('2026-01-31', '2026-03-01'), ['2026-01', '2026-02', '2026-03'])
  })

  it('validates missing, reversed and oversized periods', () => {
    assert.equal(validateFinanceStatementRange({ startDate: '2026-01-01' }), '请选择完整的财务期间')
    assert.equal(
      validateFinanceStatementRange({ startDate: '2026-03-01', endDate: '2026-02-28' }),
      '财务期间开始日期不能晚于结束日期',
    )
    assert.equal(
      validateFinanceStatementRange({ startDate: '2024-01-01', endDate: '2026-01-31' }),
      '财务期间不能超过 24 个月',
    )
    assert.equal(
      validateFinanceStatementRange({ startMonth: '2026-01', endMonth: '2026-02', startDate: '2026-01-01', endDate: '2026-02-28' }),
      '财务期间参数不能同时使用会计月份和日期范围',
    )
  })

  it('caps quick recent-month scope for query performance', () => {
    const scope = createFinanceStatementScope({ months: 99 }, '2026-07-03')

    assert.equal(scope.months, 24)
    assert.equal(scope.monthKeys.length, 24)
    assert.equal(scope.startDate, '2024-08-01')
    assert.equal(scope.endDate, '2026-07-31')
  })
})
