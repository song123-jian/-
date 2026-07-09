export type FinanceDashboardRiskLevel = 'error' | 'warning' | 'info' | 'success' | string

export type FinanceDashboardRiskItem = {
  type: string
  level: FinanceDashboardRiskLevel
  month?: string
  title: string
  description: string
}

export type FinanceDashboardMonthRow = {
  month: string
  orderAmount?: number | string | null
  paymentAmount?: number | string | null
  expenseTotal?: number | string | null
  salaryTotal?: number | string | null
  pendingSalaryTotal?: number | string | null
  materialCost?: number | string | null
  grossProfit?: number | string | null
  receivableBalance?: number | string | null
  collectionRate?: number | string | null
  profitRate?: number | string | null
  shipmentQty?: number | string | null
  shipmentCount?: number | string | null
  costGapCount?: number | string | null
  pendingSalaryCount?: number | string | null
  status?: string | null
}

export type FinanceDashboardStatementLike = {
  months?: number | string | null
  periodMode?: string | null
  startDate?: string | null
  endDate?: string | null
  monthOrderAmount?: number | string | null
  monthPaymentAmount?: number | string | null
  monthExpenseTotal?: number | string | null
  monthSalaryTotal?: number | string | null
  pendingSalaryTotal?: number | string | null
  monthMaterialCost?: number | string | null
  monthGrossProfit?: number | string | null
  receivableBalance?: number | string | null
  paymentRate?: number | string | null
  collectionRate?: number | string | null
  profitRate?: number | string | null
  orderCount?: number | string | null
  paymentCount?: number | string | null
  shipmentQty?: number | string | null
  shipmentCount?: number | string | null
  costGapCount?: number | string | null
  draftOrderCount?: number | string | null
  pendingSalaryCount?: number | string | null
  monthItems?: FinanceDashboardMonthRow[] | null
  riskItems?: FinanceDashboardRiskItem[] | null
}

export type FinanceDashboardReceivableSummaryLike = {
  totalAmount?: number | string | null
  receivedAmount?: number | string | null
  receivableAmount?: number | string | null
  overdueAmount?: number | string | null
  orderCount?: number | string | null
  openOrderCount?: number | string | null
  overdueOrderCount?: number | string | null
  maxOverdueDays?: number | string | null
}

export type FinanceDashboardSummary = {
  months: number
  periodMode: string
  startDate: string
  endDate: string
  orderAmount: number
  paymentAmount: number
  receivableAmount: number
  overdueAmount: number
  expenseTotal: number
  salaryTotal: number
  pendingSalaryTotal: number
  materialCost: number
  grossProfit: number
  collectionRate: number
  profitRate: number
  orderCount: number
  paymentCount: number
  shipmentQty: number
  shipmentCount: number
  costGapCount: number
  draftOrderCount: number
  pendingSalaryCount: number
  openOrderCount: number
  overdueOrderCount: number
  maxOverdueDays: number
  monthItems: FinanceDashboardMonthRow[]
  riskItems: FinanceDashboardRiskItem[]
}

export type FinanceDashboardCard = {
  label: string
  value: number
  valueType: 'money' | 'percent' | 'number'
  meta: string
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral'
  icon: string
}

export type FinanceDashboardDrilldown = {
  label: string
  description: string
  path: string
  tone: FinanceDashboardCard['tone']
}

function toFinanceNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function toFinanceCount(value: unknown) {
  return Math.max(Math.trunc(toFinanceNumber(value)), 0)
}

export function roundFinanceMoney(value: unknown) {
  return Number(toFinanceNumber(value).toFixed(2))
}

export function roundFinanceRate(value: unknown) {
  return Number(toFinanceNumber(value).toFixed(1))
}

export function financeRatioPercent(numerator: unknown, denominator: unknown) {
  const base = toFinanceNumber(denominator)
  if (base <= 0) return toFinanceNumber(numerator) > 0 ? 100 : 0
  return roundFinanceRate((toFinanceNumber(numerator) / base) * 100)
}

export function normalizeFinanceDashboardSummary(
  statement?: FinanceDashboardStatementLike | null,
  receivableSummary?: FinanceDashboardReceivableSummaryLike | null,
): FinanceDashboardSummary {
  const data = statement || {}
  const receivable = receivableSummary || {}
  const orderAmount = roundFinanceMoney(data.monthOrderAmount)
  const paymentAmount = roundFinanceMoney(data.monthPaymentAmount)
  const statementReceivable = roundFinanceMoney(data.receivableBalance)
  const receivableAmount = roundFinanceMoney(receivable.receivableAmount ?? statementReceivable)
  const collectionRate = data.collectionRate ?? data.paymentRate ?? financeRatioPercent(paymentAmount, orderAmount)
  const grossProfit = roundFinanceMoney(data.monthGrossProfit)

  return {
    months: toFinanceCount(data.months),
    periodMode: String(data.periodMode || ''),
    startDate: String(data.startDate || ''),
    endDate: String(data.endDate || ''),
    orderAmount,
    paymentAmount,
    receivableAmount,
    overdueAmount: roundFinanceMoney(receivable.overdueAmount),
    expenseTotal: roundFinanceMoney(data.monthExpenseTotal),
    salaryTotal: roundFinanceMoney(data.monthSalaryTotal),
    pendingSalaryTotal: roundFinanceMoney(data.pendingSalaryTotal),
    materialCost: roundFinanceMoney(data.monthMaterialCost),
    grossProfit,
    collectionRate: roundFinanceRate(collectionRate),
    profitRate: roundFinanceRate(data.profitRate ?? financeRatioPercent(grossProfit, orderAmount)),
    orderCount: toFinanceCount(data.orderCount),
    paymentCount: toFinanceCount(data.paymentCount),
    shipmentQty: roundFinanceMoney(data.shipmentQty),
    shipmentCount: toFinanceCount(data.shipmentCount),
    costGapCount: toFinanceCount(data.costGapCount),
    draftOrderCount: toFinanceCount(data.draftOrderCount),
    pendingSalaryCount: toFinanceCount(data.pendingSalaryCount),
    openOrderCount: toFinanceCount(receivable.openOrderCount),
    overdueOrderCount: toFinanceCount(receivable.overdueOrderCount),
    maxOverdueDays: toFinanceCount(receivable.maxOverdueDays),
    monthItems: data.monthItems || [],
    riskItems: data.riskItems || [],
  }
}

export function buildFinanceDashboardCards(
  statement?: FinanceDashboardStatementLike | null,
  receivableSummary?: FinanceDashboardReceivableSummaryLike | null,
): FinanceDashboardCard[] {
  const data = normalizeFinanceDashboardSummary(statement, receivableSummary)
  return [
    {
      label: '订单金额',
      value: data.orderAmount,
      valueType: 'money',
      meta: `${data.orderCount} 单`,
      tone: 'primary',
      icon: 'Coin',
    },
    {
      label: '回款金额',
      value: data.paymentAmount,
      valueType: 'money',
      meta: `${data.paymentCount} 笔，回款率 ${data.collectionRate.toFixed(1)}%`,
      tone: data.collectionRate >= 80 || data.orderAmount <= 0 ? 'success' : 'warning',
      icon: 'Money',
    },
    {
      label: '应收余额',
      value: data.receivableAmount,
      valueType: 'money',
      meta: `${data.openOrderCount} 单未结`,
      tone: data.receivableAmount > 0 ? 'warning' : 'success',
      icon: 'Document',
    },
    {
      label: '逾期应收',
      value: data.overdueAmount,
      valueType: 'money',
      meta: `${data.overdueOrderCount} 单，最长 ${data.maxOverdueDays} 天`,
      tone: data.overdueAmount > 0 ? 'danger' : 'success',
      icon: 'WarningFilled',
    },
    {
      label: '费用支出',
      value: data.expenseTotal,
      valueType: 'money',
      meta: '期间费用',
      tone: 'neutral',
      icon: 'Wallet',
    },
    {
      label: '工资总额',
      value: data.salaryTotal,
      valueType: 'money',
      meta: data.pendingSalaryCount > 0 ? `${data.pendingSalaryCount} 条待结` : '已结工资',
      tone: data.pendingSalaryCount > 0 ? 'warning' : 'neutral',
      icon: 'Wallet',
    },
    {
      label: '出库成本',
      value: data.materialCost,
      valueType: 'money',
      meta: `${data.costGapCount} 笔成本缺口`,
      tone: data.costGapCount > 0 ? 'warning' : 'neutral',
      icon: 'DataLine',
    },
    {
      label: '经营毛利',
      value: data.grossProfit,
      valueType: 'money',
      meta: `毛利率 ${data.profitRate.toFixed(1)}%`,
      tone: data.grossProfit < 0 ? 'danger' : 'success',
      icon: 'TrendCharts',
    },
    {
      label: '回款率',
      value: data.collectionRate,
      valueType: 'percent',
      meta: data.receivableAmount > 0 ? '仍有应收' : '回款闭环',
      tone: data.collectionRate >= 80 || data.orderAmount <= 0 ? 'success' : 'warning',
      icon: 'Odometer',
    },
    {
      label: '毛利率',
      value: data.profitRate,
      valueType: 'percent',
      meta: data.grossProfit < 0 ? '经营亏损' : '经营利润',
      tone: data.grossProfit < 0 ? 'danger' : 'success',
      icon: 'TrendCharts',
    },
  ]
}

export function buildFinanceDashboardRiskItems(
  statement?: FinanceDashboardStatementLike | null,
  receivableSummary?: FinanceDashboardReceivableSummaryLike | null,
) {
  const data = normalizeFinanceDashboardSummary(statement, receivableSummary)
  const risks: FinanceDashboardRiskItem[] = [...data.riskItems]

  if (data.overdueAmount > 0) {
    risks.push({
      type: 'OVERDUE_RECEIVABLE',
      level: data.maxOverdueDays >= 60 ? 'error' : 'warning',
      title: '存在逾期应收',
      description: `逾期金额 ${data.overdueAmount}，逾期订单 ${data.overdueOrderCount} 单，最长逾期 ${data.maxOverdueDays} 天。`,
    })
  }

  if (data.orderAmount > 0 && data.collectionRate < 80) {
    risks.push({
      type: 'LOW_COLLECTION',
      level: 'warning',
      title: '期间回款率低于目标',
      description: `回款率 ${data.collectionRate.toFixed(1)}%，应收余额 ${data.receivableAmount}，需联动销售回款登记。`,
    })
  }

  if (data.costGapCount > 0) {
    risks.push({
      type: 'COST_GAP',
      level: 'warning',
      title: '存在出库成本缺口',
      description: `${data.costGapCount} 笔销售出库缺少完整成本口径，毛利需复核。`,
    })
  }

  if (data.pendingSalaryCount > 0) {
    risks.push({
      type: 'PENDING_SALARY',
      level: 'info',
      title: '存在未结算工资',
      description: `${data.pendingSalaryCount} 条工资或奖惩待结，待结金额 ${data.pendingSalaryTotal} 未纳入正式工资总额。`,
    })
  }

  if (data.grossProfit < 0) {
    risks.push({
      type: 'LOSS',
      level: 'error',
      title: '经营毛利为负',
      description: `订单金额 ${data.orderAmount}，成本费用合计 ${roundFinanceMoney(data.materialCost + data.salaryTotal + data.expenseTotal)}。`,
    })
  }

  return risks.slice(0, 12)
}

export function buildFinanceDashboardDrilldowns(): FinanceDashboardDrilldown[] {
  return [
    { label: '查看对账单', description: '核对月度订单、回款、成本、费用和毛利', path: '/finance/statements', tone: 'primary' },
    { label: '应收催收', description: '打开对账单应收明细并登记回款', path: '/finance/statements', tone: 'warning' },
    { label: '登记回款', description: '进入销售回款登记，闭环客户应收', path: '/sale/payments', tone: 'success' },
    { label: '费用支出', description: '维护费用单据，影响经营毛利', path: '/finance/expenses', tone: 'neutral' },
    { label: '成本台账', description: '复核销售出库成本和成本缺口', path: '/stock/ledger', tone: 'warning' },
    { label: '老板驾驶舱', description: '联动经营、生产、质量与设备效率', path: '/report/boss-dashboard', tone: 'primary' },
  ]
}

export function financeDashboardStatusText(status?: string | null) {
  const labels: Record<string, string> = {
    LOSS: '亏损',
    COST_GAP: '缺成本',
    RECEIVABLE: '有应收',
    NORMAL: '正常',
  }
  const normalized = String(status || '').toUpperCase()
  return labels[normalized] || status || '正常'
}

export function financeDashboardStatusTag(status?: string | null) {
  const normalized = String(status || '').toUpperCase()
  if (normalized === 'LOSS') return 'danger'
  if (normalized === 'COST_GAP' || normalized === 'RECEIVABLE') return 'warning'
  return 'success'
}
