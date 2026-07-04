import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getExpenseMonthKey,
  getFinanceExpenseTypeText,
  isFinanceExpenseType,
  normalizeExpenseDate,
  normalizeExpenseKeyword,
  normalizeExpensePayee,
  roundExpenseAmount,
  validateExpenseAmount,
  validateExpenseDate,
  validateExpensePayee,
} from '../frontend-admin/src/utils/finance-expense.ts'

describe('finance expense types and amounts', () => {
  it('recognizes supported expense types and labels them', () => {
    assert.equal(isFinanceExpenseType('rent'), true)
    assert.equal(isFinanceExpenseType('BAD_TYPE'), false)
    assert.equal(getFinanceExpenseTypeText('MAINTENANCE'), '维修费')
    assert.equal(getFinanceExpenseTypeText(''), '-')
  })

  it('rounds and validates positive expense amounts', () => {
    assert.equal(roundExpenseAmount('12.345'), 12.35)
    assert.equal(validateExpenseAmount(0), '费用金额必须大于 0')
    assert.equal(validateExpenseAmount('100000000'), '费用金额不能超过 99,999,999.99')
    assert.equal(validateExpenseAmount(99.99), '')
  })
})

describe('finance expense dates', () => {
  it('normalizes valid dates and groups them by month', () => {
    assert.equal(normalizeExpenseDate('2026-07-03T12:30:00'), '2026-07-03')
    assert.equal(normalizeExpenseDate(new Date('2026-07-03T00:00:00Z')), '2026-07-03')
    assert.equal(getExpenseMonthKey('2026-07-03'), '2026-07')
    assert.equal(normalizeExpenseDate('bad-date'), '')
  })

  it('rejects blank and future expense dates', () => {
    assert.equal(validateExpenseDate('', '2026-07-03'), '请选择费用日期')
    assert.equal(validateExpenseDate('2026-07-04', '2026-07-03'), '费用日期不能晚于今天')
    assert.equal(validateExpenseDate('2026-07-03', '2026-07-03'), '')
  })
})

describe('finance expense payee and keyword safety', () => {
  it('requires a traceable payee', () => {
    assert.equal(normalizeExpensePayee('  物业公司  '), '物业公司')
    assert.equal(validateExpensePayee(''), '请输入收款人')
    assert.equal(validateExpensePayee('a'.repeat(101)), '收款人不能超过 100 个字符')
    assert.equal(validateExpensePayee('物业公司'), '')
  })

  it('normalizes special characters before PostgREST search filters', () => {
    assert.equal(normalizeExpenseKeyword(' 房租,维修%费_(测试)* '), '房租 维修 费 测试')
    assert.equal(normalizeExpenseKeyword('a'.repeat(100)).length, 80)
  })
})
