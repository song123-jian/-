import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bossRatioPercent,
  buildBossDashboardCards,
  buildBossDashboardRiskItems,
  buildBossFinanceChartRows,
  buildBossOperationGaugeRows,
  normalizeBossDashboardSummary,
} from '../frontend-admin/src/utils/boss-dashboard.ts'

const summary = {
  monthOrderAmount: 100000.126,
  monthPaymentAmount: 65000,
  monthExpenseTotal: 8000,
  monthSalaryTotal: 12000,
  pendingSalaryTotal: 1500,
  monthMaterialCost: 30000,
  monthGrossProfit: 50000.125,
  receivableBalance: 35000.126,
  collectionRate: 65.04,
  profitRate: 50.04,
  orderCount: 8,
  paymentCount: 5,
  shipmentQty: 1200,
  shipmentCount: 4,
  costGapCount: 2,
  pendingSalaryCount: 1,
  monthCompletedQty: 1000,
  monthGoodQty: 960,
  monthBadQty: 40,
  monthBadRate: 4,
  productionOrderCount: 10,
  runningOrderCount: 3,
  overdueOrderCount: 2,
  machineCount: 5,
  runningMachineCount: 2,
  timeAvailability: 40,
  performanceRate: 70,
  qualityRate: 96,
  oee: 26.88,
  warningCount: 3,
  riskItems: [
    {
      type: 'COST_GAP',
      level: 'warning',
      month: '2026-07',
      title: '2026-07 存在成本数据缺口',
      description: '成本缺口',
    },
  ],
}

describe('boss dashboard normalization', () => {
  it('rounds money, rates and counters into stable dashboard values', () => {
    const normalized = normalizeBossDashboardSummary(summary)

    assert.equal(normalized.monthOrderAmount, 100000.13)
    assert.equal(normalized.receivableBalance, 35000.13)
    assert.equal(normalized.collectionRate, 65)
    assert.equal(normalized.profitRate, 50)
    assert.equal(normalized.orderCount, 8)
    assert.equal(normalized.runningMachineCount, 2)
  })

  it('handles invalid numeric inputs without leaking NaN into charts', () => {
    const normalized = normalizeBossDashboardSummary({
      monthOrderAmount: 'abc',
      collectionRate: undefined,
      machineCount: -3,
      monthItems: null,
      riskItems: null,
    })

    assert.equal(normalized.monthOrderAmount, 0)
    assert.equal(normalized.collectionRate, 0)
    assert.equal(normalized.machineCount, 0)
    assert.deepEqual(normalized.monthItems, [])
    assert.deepEqual(normalized.riskItems, [])
  })
})

describe('boss dashboard cards and charts', () => {
  it('builds executive KPI cards with risk-aware tones', () => {
    const cards = buildBossDashboardCards(summary)

    assert.equal(cards.length, 8)
    assert.deepEqual(
      cards.map((item) => [item.label, item.tone]),
      [
        ['订单金额', 'primary'],
        ['回款金额', 'warning'],
        ['应收余额', 'warning'],
        ['经营毛利', 'success'],
        ['出库成本', 'warning'],
        ['费用工资', 'warning'],
        ['本期产量', 'warning'],
        ['综合效率', 'danger'],
      ],
    )
  })

  it('builds finance and operations chart rows using one accounting口径', () => {
    const financeRows = buildBossFinanceChartRows(summary)
    const gaugeRows = buildBossOperationGaugeRows(summary)

    assert.deepEqual(financeRows.map((item) => item.label), ['订单金额', '回款金额', '应收余额', '出库成本', '费用工资', '经营毛利'])
    assert.equal(financeRows.find((item) => item.label === '费用工资')?.value, 20000)
    assert.deepEqual(gaugeRows.map((item) => item.label), ['稼动率', '达成率', '良品率', 'OEE'])
    assert.equal(gaugeRows.find((item) => item.label === 'OEE')?.tone, 'danger')
  })
})

describe('boss dashboard risks', () => {
  it('combines finance risks with production, quality and warning risks', () => {
    const risks = buildBossDashboardRiskItems(summary)

    assert.equal(risks.some((item) => item.type === 'COST_GAP'), true)
    assert.equal(risks.some((item) => item.type === 'LOW_OEE'), true)
    assert.equal(risks.some((item) => item.type === 'HIGH_BAD_RATE'), true)
    assert.equal(risks.some((item) => item.type === 'OVERDUE_PRODUCTION'), true)
    assert.equal(risks.some((item) => item.type === 'BUSINESS_WARNING'), true)
  })

  it('calculates percent ratios with zero-denominator boundaries', () => {
    assert.equal(bossRatioPercent(10, 0), 100)
    assert.equal(bossRatioPercent(0, 0), 0)
    assert.equal(bossRatioPercent(1, 3), 33.3)
  })
})
