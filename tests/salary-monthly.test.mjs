import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildMonthlySalarySummary,
  buildSalaryDailyReportLine,
  createSalaryMonthScope,
  getSalaryDailyStatusText,
  getSalaryAdjustStatusText,
  getSalaryAdjustEffect,
  getSalaryAdjustTypeText,
  getSalaryMonthBounds,
  getSalaryReportGoodQty,
  getSalaryReportPieceAmount,
  getSalaryReportWorkDate,
  isSalaryDailySettled,
  isSalaryAdjustSettled,
  normalizeSalaryDailyStatus,
  normalizeSalaryAdjustInput,
  normalizeSalaryAdjustStatus,
  normalizeSalaryAdjustType,
  normalizeSalaryMonth,
  validateSalaryAdjustInput,
} from '../frontend-admin/src/utils/salary-monthly.ts'

describe('salary month parsing', () => {
  it('normalizes explicit, numeric and current-month inputs', () => {
    assert.equal(normalizeSalaryMonth('2026-7'), '2026-07')
    assert.equal(normalizeSalaryMonth('2026-07-15'), '2026-07')
    assert.equal(normalizeSalaryMonth(2, '2026-07-04'), '2026-02')

    const scope = createSalaryMonthScope({ year: 2025, month: 12 })
    assert.equal(scope.month, '2025-12')
    assert.equal(scope.startDate, '2025-12-01')
    assert.equal(scope.endDate, '2025-12-31')
  })

  it('rejects invalid salary months', () => {
    assert.equal(normalizeSalaryMonth('2026-13'), '')
    assert.throws(() => getSalaryMonthBounds('bad-month'), /工资月份格式不正确/)
    assert.throws(() => createSalaryMonthScope({ month: 0 }), /工资月份格式不正确/)
  })
})

describe('salary adjustments', () => {
  it('normalizes adjustment types and signed effects', () => {
    assert.equal(normalizeSalaryAdjustType('bonus'), 'BONUS')
    assert.equal(normalizeSalaryAdjustType('扣款'), 'PENALTY')
    assert.equal(getSalaryAdjustTypeText('BONUS'), '奖励')
    assert.equal(getSalaryAdjustTypeText('penalty'), '扣款')
    assert.equal(getSalaryAdjustEffect('BONUS', 20.125), 20.13)
    assert.equal(getSalaryAdjustEffect('penalty', 5), -5)
    assert.equal(getSalaryAdjustEffect('unknown', 5), 0)
  })

  it('normalizes adjustment statuses for lock decisions', () => {
    assert.equal(normalizeSalaryAdjustStatus('SETTLED'), 'SETTLED')
    assert.equal(normalizeSalaryAdjustStatus('已结算'), 'SETTLED')
    assert.equal(normalizeSalaryAdjustStatus('draft'), 'DRAFT')
    assert.equal(getSalaryAdjustStatusText('SETTLED'), '已结算')
    assert.equal(getSalaryAdjustStatusText('DRAFT'), '待结算')
    assert.equal(isSalaryAdjustSettled('SETTLED'), true)
    assert.equal(isSalaryAdjustSettled('DRAFT'), false)
  })

  it('maps page form fields to salary adjustment input shape', () => {
    assert.deepEqual(normalizeSalaryAdjustInput({
      workerId: '7',
      type: 'penalty',
      amount: '12.345',
      date: '2026-07-03T10:00:00',
      reason: '  迟到  ',
    }), {
      id: undefined,
      userId: 7,
      adjustType: 'PENALTY',
      amount: 12.35,
      adjustDate: '2026-07-03',
      reason: '迟到',
      status: 'DRAFT',
    })

    assert.equal(validateSalaryAdjustInput({ workerId: '', type: 'bonus', amount: 1, date: '2026-07-03', reason: '奖励' }), '请选择员工')
    assert.equal(validateSalaryAdjustInput({ workerId: 7, type: 'bad', amount: 1, date: '2026-07-03', reason: '奖励' }), '请选择奖惩类型')
    assert.equal(validateSalaryAdjustInput({ workerId: 7, type: 'bonus', amount: 0, date: '2026-07-03', reason: '奖励' }), '奖惩金额必须大于 0')
    assert.equal(validateSalaryAdjustInput({ workerId: 7, type: 'bonus', amount: 1, date: '', reason: '奖励' }), '请选择奖惩日期')
    assert.equal(validateSalaryAdjustInput({ workerId: 7, type: 'bonus', amount: 1, date: '2026-07-03', reason: '' }), '请输入奖惩原因')
  })
})

describe('daily salary report lines', () => {
  it('normalizes work date, good quantity, amount and status text', () => {
    const report = {
      id: 9,
      userId: 3,
      qty: 120,
      badQty: 7,
      startTime: '2026-07-03 23:30:00',
      reportType: 'OUTPUT',
    }

    assert.equal(getSalaryReportWorkDate(report), '2026-07-03')
    assert.equal(getSalaryReportGoodQty(report), 113)
    assert.equal(getSalaryReportPieceAmount(report, 0.336), 37.97)
    assert.equal(normalizeSalaryDailyStatus('已结算'), 'SETTLED')
    assert.equal(getSalaryDailyStatusText('DRAFT'), '待结算')
    assert.equal(isSalaryDailySettled('SETTLED'), true)

    assert.deepEqual(buildSalaryDailyReportLine(report, {
      workerName: '王五',
      productName: '外壳',
      processName: '注塑',
      unitPrice: 0.336,
      salaryDailyId: 12,
      status: 'SETTLED',
      confirmedAt: '2026-07-04T08:00:00.000Z',
    }), {
      id: 9,
      userId: 3,
      workerName: '王五',
      productName: '外壳',
      processName: '注塑',
      reportType: 'OUTPUT',
      qty: 120,
      badQty: 7,
      quantity: 113,
      unitPrice: 0.336,
      amount: 37.97,
      workDate: '2026-07-03',
      date: '2026-07-03',
      salaryDailyId: 12,
      status: 'SETTLED',
      statusText: '已结算',
      confirmedAt: '2026-07-04T08:00:00.000Z',
      remark: '',
    })
  })

  it('clamps negative qualified quantity to zero for abnormal report input', () => {
    assert.equal(getSalaryReportGoodQty({ qty: 5, badQty: 9 }), 0)
    assert.equal(getSalaryReportPieceAmount({ qty: 5, badQty: 9 }, 2), 0)
  })
})

describe('monthly salary summary', () => {
  const users = [
    { id: 1, realName: '张三', username: 'zhangsan' },
    { id: 2, realName: '李四', username: 'lisi' },
    { id: 3, realName: '王五', username: 'wangwu' },
  ]

  it('merges daily salary, subsidies, deductions and adjustments by worker', () => {
    const rows = buildMonthlySalarySummary(
      [
        { userId: 1, workDate: '2026-07-01', totalPieceAmount: 100, subsidy: 10, deduction: 2, status: 'SETTLED' },
        { userId: 1, workDate: '2026-07-02', totalPieceAmount: 120, subsidy: 0, deduction: 5, status: 'DRAFT' },
        { userId: 2, workDate: '2026-07-01', totalPieceAmount: 80, subsidy: 0, deduction: 0, status: 'SETTLED' },
      ],
      [
        { userId: 1, adjustType: 'bonus', amount: 30, adjustDate: '2026-07-03', status: 'SETTLED' },
        { userId: 1, adjustType: 'penalty', amount: 8, adjustDate: '2026-07-04', status: 'DRAFT' },
      ],
      users,
      '2026-07',
    )

    const zhang = rows.find((item) => item.userId === 1)
    assert.equal(zhang.workDays, 2)
    assert.equal(zhang.settledDays, 1)
    assert.equal(zhang.pendingDays, 1)
    assert.equal(zhang.pieceAmount, 220)
    assert.equal(zhang.bonus, 40)
    assert.equal(zhang.penalty, 15)
    assert.equal(zhang.adjustAmount, 25)
    assert.equal(zhang.payableAmount, 245)
    assert.equal(zhang.status, 'PENDING')

    const li = rows.find((item) => item.userId === 2)
    assert.equal(li.payableAmount, 80)
    assert.equal(li.status, 'SETTLED')
  })

  it('keeps workers with adjustments but no daily salary in the month', () => {
    const rows = buildMonthlySalarySummary(
      [],
      [{ userId: 3, adjustType: 'BONUS', amount: 200, adjustDate: '2026-07-15', status: 'DRAFT' }],
      users,
      '2026-07',
    )

    assert.equal(rows.length, 1)
    assert.equal(rows[0].workerName, '王五')
    assert.equal(rows[0].workDays, 0)
    assert.equal(rows[0].bonus, 200)
    assert.equal(rows[0].payableAmount, 200)
    assert.equal(rows[0].pendingAdjustCount, 1)
    assert.equal(rows[0].status, 'PENDING')
  })
})
