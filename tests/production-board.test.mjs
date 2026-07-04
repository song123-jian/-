import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildProductionBoardSummary,
  buildProductionBoardCards,
  buildProductionBoardRiskItems,
  buildProductionMachineChartRows,
  buildProductionShiftChartRows,
  clampProductionPercent,
  getProductionStatusTagType,
  getProductionStatusText,
  isActiveProductionOrderStatus,
  isDoneProductionOrderStatus,
  normalizeProductionBoardSummary,
  productionRatioPercent,
} from '../frontend-admin/src/utils/production-board.ts'

const summary = {
  periodMode: 'ACCOUNTING_MONTHS',
  months: 1,
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  machineStatuses: [
    { machineId: 1, machineName: 'A-01', status: 'RUNNING', orderNo: 'MO-001', productName: '外壳' },
    { machineId: 2, machineName: 'A-02', status: 'IDLE', orderNo: '-', productName: '-' },
    { machineId: 3, machineName: 'A-03', status: 'STOPPED', orderNo: '-', productName: '-' },
  ],
  orderProgresses: [
    { orderId: 1, orderNo: 'MO-001', productName: '外壳', planQty: 200, completedQty: 80, status: 'RUNNING', overdue: true },
    { orderId: 2, orderNo: 'MO-002', productName: '盖板', planQty: 100, completedQty: 100, status: 'COMPLETED' },
  ],
  shiftOutputs: [
    { shift: '白班', qty: 100, badQty: 6, reportCount: 2, workMinutes: 480 },
    { shift: '夜班', qty: 10, badQty: 1, reportCount: 1, workMinutes: 60 },
  ],
  topDefects: [
    { defectType: '缩水', qty: 5 },
    { defectType: '毛边', qty: 2 },
  ],
}

describe('production board normalization', () => {
  it('builds one production口径 from machines, orders, shifts and defects', () => {
    const normalized = buildProductionBoardSummary(summary)

    assert.equal(normalized.totalQty, 110)
    assert.equal(normalized.goodQty, 103)
    assert.equal(normalized.badQty, 7)
    assert.equal(normalized.badRate, 6.4)
    assert.equal(normalized.machineCount, 3)
    assert.equal(normalized.runningMachineCount, 1)
    assert.equal(normalized.utilizationRate, 33.3)
    assert.equal(normalized.orderCount, 2)
    assert.equal(normalized.runningOrderCount, 1)
    assert.equal(normalized.completedOrderCount, 1)
    assert.equal(normalized.overdueOrderCount, 1)
    assert.equal(normalized.totalPlanQty, 300)
    assert.equal(normalized.totalCompletedQty, 180)
    assert.equal(normalized.completionRate, 60)
    assert.equal(normalized.defectQty, 7)
  })

  it('handles invalid numeric inputs without leaking NaN into the dashboard', () => {
    const normalized = normalizeProductionBoardSummary({
      totalQty: 'abc',
      badQty: 'bad',
      machineCount: -2,
      shiftOutputs: [{ shift: '', qty: '12.345', badQty: '2.345', reportCount: 'x' }],
      orderProgresses: [{ planQty: '0', completedQty: '8', status: 'WAITING' }],
      topDefects: [{ defectType: '', qty: '3.333' }],
    })

    assert.equal(normalized.totalQty, 0)
    assert.equal(normalized.badQty, 0)
    assert.equal(normalized.machineCount, 0)
    assert.equal(normalized.shiftOutputs[0].shift, '未分班')
    assert.equal(normalized.shiftOutputs[0].qty, 12.35)
    assert.equal(normalized.shiftOutputs[0].goodQty, 10)
    assert.equal(normalized.orderProgresses[0].completionRate, 100)
    assert.equal(normalized.topDefects[0].defectType, '未分类')
    assert.equal(normalized.topDefects[0].qty, 3.33)
  })
})

describe('production board cards and charts', () => {
  it('builds KPI cards with production risk-aware tones', () => {
    const cards = buildProductionBoardCards(summary)

    assert.equal(cards.length, 8)
    assert.deepEqual(
      cards.map((item) => [item.label, item.tone]),
      [
        ['本期总产量', 'primary'],
        ['良品数量', 'warning'],
        ['不良率', 'danger'],
        ['运行机台', 'success'],
        ['工单达成', 'warning'],
        ['在制工单', 'primary'],
        ['逾期工单', 'danger'],
        ['不良数量', 'warning'],
      ],
    )
  })

  it('builds shift and machine chart rows from the same normalized口径', () => {
    const shiftRows = buildProductionShiftChartRows(summary)
    const machineRows = buildProductionMachineChartRows(summary)

    assert.deepEqual(shiftRows.map((item) => item.label), ['白班', '夜班'])
    assert.equal(shiftRows[0].goodQty, 94)
    assert.equal(shiftRows[0].badRate, 6)
    assert.deepEqual(machineRows.map((item) => [item.label, item.value, item.tone]), [
      ['运行中', 1, 'success'],
      ['空闲', 1, 'warning'],
      ['停机', 1, 'danger'],
    ])
  })
})

describe('production board risks and status helpers', () => {
  it('combines output, quality, equipment, completion and overdue risks', () => {
    const risks = buildProductionBoardRiskItems({
      ...summary,
      totalQty: 0,
      badRate: 6,
      machineStatuses: [{ machineId: 1, machineName: 'A-01', status: 'IDLE' }],
    })

    assert.equal(risks.some((item) => item.type === 'NO_OUTPUT_WITH_ACTIVE_ORDER'), true)
    assert.equal(risks.some((item) => item.type === 'HIGH_BAD_RATE'), true)
    assert.equal(risks.some((item) => item.type === 'NO_RUNNING_MACHINE'), true)
    assert.equal(risks.some((item) => item.type === 'LOW_COMPLETION_RATE'), true)
    assert.equal(risks.some((item) => item.type === 'OVERDUE_ORDER'), true)
  })

  it('emits a warning before defect rate reaches the hard control line', () => {
    const risks = buildProductionBoardRiskItems({
      totalQty: 100,
      badQty: 4,
      badRate: 4,
      totalPlanQty: 100,
      totalCompletedQty: 95,
    })

    assert.equal(risks.some((item) => item.type === 'BAD_RATE_WARNING'), true)
    assert.equal(risks.some((item) => item.type === 'HIGH_BAD_RATE'), false)
  })

  it('maps compatible production and machine statuses', () => {
    assert.equal(isActiveProductionOrderStatus('paused'), true)
    assert.equal(isDoneProductionOrderStatus('FINISHED'), true)
    assert.equal(getProductionStatusText('SCHEDULED'), '已排产')
    assert.equal(getProductionStatusText('UNKNOWN'), 'UNKNOWN')
    assert.equal(getProductionStatusTagType('RUNNING'), 'success')
    assert.equal(getProductionStatusTagType('MAINTENANCE'), 'danger')
    assert.equal(getProductionStatusTagType('WAITING'), 'warning')
    assert.equal(getProductionStatusTagType('UNKNOWN'), 'info')
  })

  it('calculates percent boundaries safely', () => {
    assert.equal(productionRatioPercent(10, 0), 100)
    assert.equal(productionRatioPercent(0, 0), 0)
    assert.equal(productionRatioPercent(1, 3), 33.3)
    assert.equal(clampProductionPercent(-1), 0)
    assert.equal(clampProductionPercent(120.55), 100)
  })
})
