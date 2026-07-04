export type BossDashboardRiskLevel = 'error' | 'warning' | 'info' | string

export type BossDashboardRiskItem = {
  type: string
  level: BossDashboardRiskLevel
  month?: string
  title: string
  description: string
}

export type BossDashboardMonthRow = {
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

export type BossDashboardSummary = {
  months?: number | string | null
  periodMode?: string
  startDate?: string
  endDate?: string
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
  monthCompletedQty?: number | string | null
  monthGoodQty?: number | string | null
  monthBadQty?: number | string | null
  monthBadRate?: number | string | null
  productionOrderCount?: number | string | null
  runningOrderCount?: number | string | null
  overdueOrderCount?: number | string | null
  machineCount?: number | string | null
  runningMachineCount?: number | string | null
  timeAvailability?: number | string | null
  performanceRate?: number | string | null
  qualityRate?: number | string | null
  oee?: number | string | null
  qcRecordCount?: number | string | null
  qcFailCount?: number | string | null
  defectQty?: number | string | null
  warningCount?: number | string | null
  monthItems?: BossDashboardMonthRow[] | null
  riskItems?: BossDashboardRiskItem[] | null
}

export type NormalizedBossDashboardSummary = {
  months: number
  periodMode: string
  startDate: string
  endDate: string
  monthOrderAmount: number
  monthPaymentAmount: number
  monthExpenseTotal: number
  monthSalaryTotal: number
  pendingSalaryTotal: number
  monthMaterialCost: number
  monthGrossProfit: number
  receivableBalance: number
  paymentRate: number
  collectionRate: number
  profitRate: number
  orderCount: number
  paymentCount: number
  shipmentQty: number
  shipmentCount: number
  costGapCount: number
  draftOrderCount: number
  pendingSalaryCount: number
  monthCompletedQty: number
  monthGoodQty: number
  monthBadQty: number
  monthBadRate: number
  productionOrderCount: number
  runningOrderCount: number
  overdueOrderCount: number
  machineCount: number
  runningMachineCount: number
  timeAvailability: number
  performanceRate: number
  qualityRate: number
  oee: number
  qcRecordCount: number
  qcFailCount: number
  defectQty: number
  warningCount: number
  monthItems: BossDashboardMonthRow[]
  riskItems: BossDashboardRiskItem[]
}

export type BossDashboardCard = {
  label: string
  value: number
  valueType: 'money' | 'percent' | 'number'
  meta: string
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral'
  icon: string
}

export type BossDashboardChartRow = {
  label: string
  value: number
  tone?: BossDashboardCard['tone']
}

export function toBossNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function roundBossMoney(value: unknown) {
  return Number(toBossNumber(value).toFixed(2))
}

export function roundBossRate(value: unknown) {
  return Number(toBossNumber(value).toFixed(1))
}

export function bossRatioPercent(numerator: unknown, denominator: unknown) {
  const base = toBossNumber(denominator)
  if (base <= 0) return toBossNumber(numerator) > 0 ? 100 : 0
  return roundBossRate((toBossNumber(numerator) / base) * 100)
}

export function normalizeBossDashboardSummary(input?: BossDashboardSummary | null): NormalizedBossDashboardSummary {
  const data = input || {}
  const collectionRate = data.collectionRate ?? data.paymentRate
  return {
    months: Math.max(Math.trunc(toBossNumber(data.months || 0)), 0),
    periodMode: data.periodMode || '',
    startDate: data.startDate || '',
    endDate: data.endDate || '',
    monthOrderAmount: roundBossMoney(data.monthOrderAmount),
    monthPaymentAmount: roundBossMoney(data.monthPaymentAmount),
    monthExpenseTotal: roundBossMoney(data.monthExpenseTotal),
    monthSalaryTotal: roundBossMoney(data.monthSalaryTotal),
    pendingSalaryTotal: roundBossMoney(data.pendingSalaryTotal),
    monthMaterialCost: roundBossMoney(data.monthMaterialCost),
    monthGrossProfit: roundBossMoney(data.monthGrossProfit),
    receivableBalance: roundBossMoney(data.receivableBalance),
    paymentRate: roundBossRate(data.paymentRate ?? collectionRate),
    collectionRate: roundBossRate(collectionRate),
    profitRate: roundBossRate(data.profitRate),
    orderCount: Math.max(Math.trunc(toBossNumber(data.orderCount)), 0),
    paymentCount: Math.max(Math.trunc(toBossNumber(data.paymentCount)), 0),
    shipmentQty: roundBossMoney(data.shipmentQty),
    shipmentCount: Math.max(Math.trunc(toBossNumber(data.shipmentCount)), 0),
    costGapCount: Math.max(Math.trunc(toBossNumber(data.costGapCount)), 0),
    draftOrderCount: Math.max(Math.trunc(toBossNumber(data.draftOrderCount)), 0),
    pendingSalaryCount: Math.max(Math.trunc(toBossNumber(data.pendingSalaryCount)), 0),
    monthCompletedQty: roundBossMoney(data.monthCompletedQty),
    monthGoodQty: roundBossMoney(data.monthGoodQty),
    monthBadQty: roundBossMoney(data.monthBadQty),
    monthBadRate: roundBossRate(data.monthBadRate),
    productionOrderCount: Math.max(Math.trunc(toBossNumber(data.productionOrderCount)), 0),
    runningOrderCount: Math.max(Math.trunc(toBossNumber(data.runningOrderCount)), 0),
    overdueOrderCount: Math.max(Math.trunc(toBossNumber(data.overdueOrderCount)), 0),
    machineCount: Math.max(Math.trunc(toBossNumber(data.machineCount)), 0),
    runningMachineCount: Math.max(Math.trunc(toBossNumber(data.runningMachineCount)), 0),
    timeAvailability: roundBossRate(data.timeAvailability),
    performanceRate: roundBossRate(data.performanceRate),
    qualityRate: roundBossRate(data.qualityRate),
    oee: roundBossRate(data.oee),
    qcRecordCount: Math.max(Math.trunc(toBossNumber(data.qcRecordCount)), 0),
    qcFailCount: Math.max(Math.trunc(toBossNumber(data.qcFailCount)), 0),
    defectQty: roundBossMoney(data.defectQty),
    warningCount: Math.max(Math.trunc(toBossNumber(data.warningCount)), 0),
    monthItems: data.monthItems || [],
    riskItems: data.riskItems || [],
  }
}

export function buildBossDashboardCards(input?: BossDashboardSummary | null): BossDashboardCard[] {
  const data = normalizeBossDashboardSummary(input)
  return [
    {
      label: '订单金额',
      value: data.monthOrderAmount,
      valueType: 'money',
      meta: `${data.orderCount} 单`,
      tone: 'primary',
      icon: 'Coin',
    },
    {
      label: '回款金额',
      value: data.monthPaymentAmount,
      valueType: 'money',
      meta: `回款率 ${data.collectionRate.toFixed(1)}%`,
      tone: data.collectionRate >= 80 || data.monthOrderAmount <= 0 ? 'success' : 'warning',
      icon: 'Money',
    },
    {
      label: '应收余额',
      value: data.receivableBalance,
      valueType: 'money',
      meta: data.receivableBalance > 0 ? '需跟进' : '已闭环',
      tone: data.receivableBalance > 0 ? 'warning' : 'success',
      icon: 'Document',
    },
    {
      label: '经营毛利',
      value: data.monthGrossProfit,
      valueType: 'money',
      meta: `毛利率 ${data.profitRate.toFixed(1)}%`,
      tone: data.monthGrossProfit < 0 ? 'danger' : 'success',
      icon: 'TrendCharts',
    },
    {
      label: '出库成本',
      value: data.monthMaterialCost,
      valueType: 'money',
      meta: `${data.costGapCount} 笔缺口`,
      tone: data.costGapCount > 0 ? 'warning' : 'neutral',
      icon: 'DataLine',
    },
    {
      label: '费用工资',
      value: roundBossMoney(data.monthExpenseTotal + data.monthSalaryTotal),
      valueType: 'money',
      meta: data.pendingSalaryCount > 0 ? `${data.pendingSalaryCount} 条工资待结` : '已结口径',
      tone: data.pendingSalaryCount > 0 ? 'warning' : 'neutral',
      icon: 'Wallet',
    },
    {
      label: '本期产量',
      value: data.monthCompletedQty,
      valueType: 'number',
      meta: `不良率 ${data.monthBadRate.toFixed(1)}%`,
      tone: data.monthBadRate > 3 ? 'warning' : 'primary',
      icon: 'SetUp',
    },
    {
      label: '综合效率',
      value: data.oee,
      valueType: 'percent',
      meta: `${data.runningMachineCount}/${data.machineCount} 台运行`,
      tone: data.oee < 60 && data.machineCount > 0 ? 'danger' : 'success',
      icon: 'Odometer',
    },
  ]
}

export function buildBossFinanceChartRows(input?: BossDashboardSummary | null): BossDashboardChartRow[] {
  const data = normalizeBossDashboardSummary(input)
  return [
    { label: '订单金额', value: data.monthOrderAmount, tone: 'primary' },
    { label: '回款金额', value: data.monthPaymentAmount, tone: 'success' },
    { label: '应收余额', value: data.receivableBalance, tone: 'warning' },
    { label: '出库成本', value: data.monthMaterialCost, tone: 'neutral' },
    { label: '费用工资', value: roundBossMoney(data.monthExpenseTotal + data.monthSalaryTotal), tone: 'neutral' },
    { label: '经营毛利', value: data.monthGrossProfit, tone: data.monthGrossProfit < 0 ? 'danger' : 'success' },
  ]
}

export function buildBossOperationGaugeRows(input?: BossDashboardSummary | null): BossDashboardChartRow[] {
  const data = normalizeBossDashboardSummary(input)
  return [
    { label: '稼动率', value: data.timeAvailability, tone: data.timeAvailability < 60 ? 'warning' : 'success' },
    { label: '达成率', value: data.performanceRate, tone: data.performanceRate < 80 ? 'warning' : 'success' },
    { label: '良品率', value: data.qualityRate, tone: data.qualityRate < 97 ? 'warning' : 'success' },
    { label: 'OEE', value: data.oee, tone: data.oee < 60 ? 'danger' : 'success' },
  ]
}

export function buildBossDashboardRiskItems(input?: BossDashboardSummary | null) {
  const data = normalizeBossDashboardSummary(input)
  const risks: BossDashboardRiskItem[] = [...data.riskItems]

  if (data.machineCount > 0 && data.oee < 60) {
    risks.push({
      type: 'LOW_OEE',
      level: 'warning',
      title: '综合效率低于目标',
      description: `OEE ${data.oee.toFixed(1)}%，稼动率 ${data.timeAvailability.toFixed(1)}%，达成率 ${data.performanceRate.toFixed(1)}%，良品率 ${data.qualityRate.toFixed(1)}%。`,
    })
  }

  if (data.monthCompletedQty > 0 && data.monthBadRate > 3) {
    risks.push({
      type: 'HIGH_BAD_RATE',
      level: 'warning',
      title: '本期不良率偏高',
      description: `不良率 ${data.monthBadRate.toFixed(1)}%，不良数量 ${data.monthBadQty}，需联动质检与生产排查。`,
    })
  }

  if (data.overdueOrderCount > 0) {
    risks.push({
      type: 'OVERDUE_PRODUCTION',
      level: 'warning',
      title: '存在逾期生产订单',
      description: `${data.overdueOrderCount} 张生产订单已超过计划完工日期，需复核排产和交付承诺。`,
    })
  }

  if (data.warningCount > 0) {
    risks.push({
      type: 'BUSINESS_WARNING',
      level: 'info',
      title: '存在业务预警',
      description: `当前库存、模具或系统配置预警 ${data.warningCount} 条，建议进入预警中心处理。`,
    })
  }

  return risks.slice(0, 12)
}
