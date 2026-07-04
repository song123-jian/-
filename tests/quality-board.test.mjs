import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildQualityBoardCards,
  buildQualityBoardRiskItems,
  buildQualityBoardSummaryFromRecords,
  clampQualityPercent,
  getQualityResultText,
  normalizeQualityBoardSummary,
  normalizeQualityResult,
  qualityRatioPercent,
} from '../frontend-admin/src/utils/quality-board.ts'

const records = [
  {
    id: 1,
    productId: 10,
    productName: '外壳',
    checkResult: 'PASS',
    sampleQty: 100,
    defectQty: 2,
    defectType: '毛边',
    checkTime: '2026-07-01 08:00:00',
  },
  {
    id: 2,
    productId: 10,
    productName: '外壳',
    checkResult: 'FAIL',
    sampleQty: 50,
    defectQty: 5,
    defectType: '缩水',
    checkTime: '2026-07-01 10:00:00',
  },
  {
    id: 3,
    productId: 20,
    productName: '盖板',
    checkResult: '合格',
    sampleQty: 20,
    defectQty: 0,
    defectType: '',
    checkTime: '2026-07-02 09:00:00',
  },
]

describe('quality board summary', () => {
  it('builds product, trend and defect summaries from qc records', () => {
    const summary = buildQualityBoardSummaryFromRecords(records, {
      periodMode: 'ACCOUNTING_MONTHS',
      months: 1,
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    })

    assert.equal(summary.totalInspectQty, 170)
    assert.equal(summary.passQty, 163)
    assert.equal(summary.defectQty, 7)
    assert.equal(summary.passRate, 95.9)
    assert.equal(summary.defectRate, 4.1)
    assert.equal(summary.recordCount, 3)
    assert.equal(summary.failCount, 2)
    assert.equal(summary.productCount, 2)
    assert.equal(summary.productRows[0].productName, '外壳')
    assert.equal(summary.productRows[0].defectRate, 4.7)
    assert.deepEqual(summary.trendData.map((item) => [item.date, item.inspectQty, item.defectRate]), [
      ['2026-07-01', 150, 4.7],
      ['2026-07-02', 20, 0],
    ])
    assert.deepEqual(summary.topDefects.map((item) => [item.defectType, item.qty]), [
      ['缩水', 5],
      ['毛边', 2],
    ])
  })

  it('normalizes invalid and abnormal numeric data without leaking NaN', () => {
    const summary = buildQualityBoardSummaryFromRecords([
      { productName: '', checkResult: 'FAIL', sampleQty: 0, defectQty: 2, defectType: '', checkTime: '' },
      { productName: '异常件', checkResult: 'UNKNOWN', sampleQty: 'abc', defectQty: 'bad', checkTime: 'bad' },
    ])

    assert.equal(summary.totalInspectQty, 0)
    assert.equal(summary.passQty, 0)
    assert.equal(summary.defectQty, 2)
    assert.equal(summary.defectRate, 100)
    assert.equal(summary.abnormalCount, 2)
    assert.equal(summary.productRows[0].productName, '未命名产品')
    assert.equal(summary.trendData[0].date, '未记日期')
    assert.equal(summary.topDefects[0].defectType, '未分类')
  })

  it('normalizes backend summary fallbacks from product rows', () => {
    const summary = normalizeQualityBoardSummary({
      productRows: [
        { productName: 'A', inspectQty: 10, passQty: 9, defectQty: 1, passRate: 90, defectRate: 10, recordCount: 1, failCount: 1, abnormalCount: 0 },
      ],
      topDefects: [{ defectType: '', qty: '1.236' }],
      trendData: null,
      riskItems: null,
    })

    assert.equal(summary.totalInspectQty, 10)
    assert.equal(summary.passQty, 9)
    assert.equal(summary.defectQty, 1)
    assert.equal(summary.topDefects[0].defectType, '未分类')
    assert.equal(summary.topDefects[0].qty, 1.24)
    assert.deepEqual(summary.trendData, [])
    assert.deepEqual(summary.riskItems, [])
  })
})

describe('quality board cards and risks', () => {
  it('builds KPI cards with quality-aware tones', () => {
    const summary = buildQualityBoardSummaryFromRecords(records)
    const cards = buildQualityBoardCards(summary)

    assert.equal(cards.length, 8)
    assert.deepEqual(
      cards.map((item) => [item.label, item.tone]),
      [
        ['整体合格率', 'success'],
        ['检验数量', 'primary'],
        ['合格数量', 'success'],
        ['不良数量', 'warning'],
        ['不良记录', 'warning'],
        ['异常记录', 'success'],
        ['产品覆盖', 'primary'],
        ['数据完整率', 'success'],
      ],
    )
  })

  it('emits warning and error risks for defect rate, failures and abnormal records', () => {
    const warningRisks = buildQualityBoardRiskItems({ totalInspectQty: 100, passQty: 96, defectQty: 4, defectRate: 4 })
    const errorRisks = buildQualityBoardRiskItems({
      totalInspectQty: 100,
      passQty: 90,
      defectQty: 10,
      defectRate: 10,
      failCount: 2,
      abnormalCount: 1,
    })

    assert.equal(warningRisks.some((item) => item.type === 'DEFECT_RATE_WARNING'), true)
    assert.equal(errorRisks.some((item) => item.type === 'HIGH_DEFECT_RATE'), true)
    assert.equal(errorRisks.some((item) => item.type === 'FAIL_RECORDS'), true)
    assert.equal(errorRisks.some((item) => item.type === 'ABNORMAL_QC_DATA'), true)
  })
})

describe('quality board helpers', () => {
  it('normalizes result labels and percent boundaries safely', () => {
    assert.equal(normalizeQualityResult('合格'), 'PASS')
    assert.equal(normalizeQualityResult('fail'), 'FAIL')
    assert.equal(getQualityResultText('PASS'), '合格')
    assert.equal(getQualityResultText('UNKNOWN'), 'UNKNOWN')
    assert.equal(qualityRatioPercent(10, 0), 100)
    assert.equal(qualityRatioPercent(0, 0), 0)
    assert.equal(qualityRatioPercent(1, 3), 33.3)
    assert.equal(clampQualityPercent(-5), 0)
    assert.equal(clampQualityPercent(120), 100)
  })
})
