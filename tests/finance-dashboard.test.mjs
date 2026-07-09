import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  buildFinanceDashboardCards,
  buildFinanceDashboardDrilldowns,
  buildFinanceDashboardRiskItems,
  financeDashboardStatusTag,
  financeDashboardStatusText,
  financeRatioPercent,
  normalizeFinanceDashboardSummary,
} from '../frontend-admin/src/utils/finance-dashboard.ts'

const statement = {
  months: 6,
  startDate: '2026-02-01',
  endDate: '2026-07-31',
  monthOrderAmount: 100000.126,
  monthPaymentAmount: 65000,
  monthExpenseTotal: 8000,
  monthSalaryTotal: 12000,
  pendingSalaryTotal: 1500,
  monthMaterialCost: 30000,
  monthGrossProfit: 50000.125,
  receivableBalance: 35000,
  collectionRate: 65.04,
  profitRate: 50.04,
  orderCount: 8,
  paymentCount: 5,
  shipmentQty: 1200,
  shipmentCount: 4,
  costGapCount: 2,
  pendingSalaryCount: 1,
  monthItems: [
    {
      month: '2026-07',
      orderAmount: 100000,
      paymentAmount: 65000,
      receivableBalance: 35000,
      expenseTotal: 8000,
      salaryTotal: 12000,
      materialCost: 30000,
      grossProfit: 50000,
      collectionRate: 65,
      profitRate: 50,
      costGapCount: 2,
      status: 'COST_GAP',
    },
  ],
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

const receivableSummary = {
  receivableAmount: 35000.126,
  overdueAmount: 12000.5,
  openOrderCount: 3,
  overdueOrderCount: 1,
  maxOverdueDays: 45,
}

describe('finance dashboard normalization and cards', () => {
  it('normalizes finance operation metrics from statement and receivable summaries', () => {
    const normalized = normalizeFinanceDashboardSummary(statement, receivableSummary)

    assert.equal(normalized.orderAmount, 100000.13)
    assert.equal(normalized.receivableAmount, 35000.13)
    assert.equal(normalized.overdueAmount, 12000.5)
    assert.equal(normalized.collectionRate, 65)
    assert.equal(normalized.profitRate, 50)
    assert.equal(normalized.openOrderCount, 3)
    assert.equal(normalized.monthItems.length, 1)
  })

  it('builds the required one-screen finance delivery KPI cards', () => {
    const cards = buildFinanceDashboardCards(statement, receivableSummary)

    assert.deepEqual(
      cards.map((item) => item.label),
      ['订单金额', '回款金额', '应收余额', '逾期应收', '费用支出', '工资总额', '出库成本', '经营毛利', '回款率', '毛利率'],
    )
    assert.equal(cards.find((item) => item.label === '逾期应收')?.tone, 'danger')
    assert.equal(cards.find((item) => item.label === '回款金额')?.tone, 'warning')
    assert.equal(cards.find((item) => item.label === '经营毛利')?.tone, 'success')
  })

  it('keeps ratio and status helpers bounded and readable', () => {
    assert.equal(financeRatioPercent(10, 0), 100)
    assert.equal(financeRatioPercent(0, 0), 0)
    assert.equal(financeRatioPercent(1, 3), 33.3)
    assert.equal(financeDashboardStatusText('COST_GAP'), '缺成本')
    assert.equal(financeDashboardStatusTag('LOSS'), 'danger')
  })
})

describe('finance dashboard risks and drilldowns', () => {
  it('combines receivable, collection, cost and salary risks', () => {
    const risks = buildFinanceDashboardRiskItems(statement, receivableSummary)

    assert.equal(risks.some((item) => item.type === 'OVERDUE_RECEIVABLE'), true)
    assert.equal(risks.some((item) => item.type === 'LOW_COLLECTION'), true)
    assert.equal(risks.some((item) => item.type === 'COST_GAP'), true)
    assert.equal(risks.some((item) => item.type === 'PENDING_SALARY'), true)
  })

  it('provides closed-loop drilldown targets for finance and reports', () => {
    const drilldowns = buildFinanceDashboardDrilldowns()

    assert.deepEqual(
      drilldowns.map((item) => item.path),
      ['/finance/statements', '/finance/statements', '/sale/payments', '/finance/expenses', '/stock/ledger', '/report/boss-dashboard'],
    )
  })
})

describe('finance dashboard page and route integration', () => {
  it('is mounted under finance management and report center', () => {
    const routes = readFileSync(new URL('../frontend-admin/src/router/route-config.ts', import.meta.url), 'utf8')
    const page = readFileSync(new URL('../frontend-admin/src/views/finance/dashboard.vue', import.meta.url), 'utf8')
    const boss = readFileSync(new URL('../frontend-admin/src/views/report/boss-dashboard.vue', import.meta.url), 'utf8')
    const requestSource = readFileSync(new URL('../frontend-admin/src/api/supabaseRequest.ts', import.meta.url), 'utf8')

    assert.match(routes, /name: 'FinanceDashboard'[\s\S]*view: 'finance\/dashboard\.vue'/)
    assert.match(routes, /name: 'ReportFinanceDashboard'[\s\S]*view: 'finance\/dashboard\.vue'/)
    assert.match(page, /buildFinanceDashboardCards/)
    assert.match(page, /getFinanceReceivables/)
    assert.match(page, /逾期应收/)
    assert.match(boss, /goFinanceDashboard/)
    assert.match(boss, /path: '\/finance\/dashboard'/)
    assert.match(requestSource, /syncWorkflowByBusiness\('expense_record'[\s\S]*?'create'/)
  })
})
