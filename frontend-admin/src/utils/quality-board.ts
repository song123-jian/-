export type QualityBoardTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral'

export type QualityBoardRecord = {
  id?: number | string | null
  productId?: number | string | null
  productName?: string | null
  checkType?: string | null
  checkResult?: string | null
  defectType?: string | null
  defectQty?: number | string | null
  sampleQty?: number | string | null
  checkTime?: string | null
}

export type QualityBoardProductRow = {
  productId?: number | string | null
  productName: string
  inspectQty: number
  passQty: number
  defectQty: number
  passRate: number
  defectRate: number
  recordCount: number
  failCount: number
  abnormalCount: number
}

export type QualityBoardTrendRow = {
  date: string
  inspectQty: number
  passQty: number
  defectQty: number
  passRate: number
  defectRate: number
  recordCount: number
  failCount: number
}

export type QualityBoardDefectRow = {
  defectType: string
  qty: number
}

export type QualityBoardRiskItem = {
  type: string
  level: 'error' | 'warning' | 'info'
  title: string
  description: string
}

export type QualityBoardSummary = {
  periodMode?: string
  months?: number | string | null
  startDate?: string | null
  endDate?: string | null
  totalInspectQty?: number | string | null
  passQty?: number | string | null
  defectQty?: number | string | null
  passRate?: number | string | null
  defectRate?: number | string | null
  recordCount?: number | string | null
  failCount?: number | string | null
  productCount?: number | string | null
  abnormalCount?: number | string | null
  productRows?: QualityBoardProductRow[] | null
  trendData?: QualityBoardTrendRow[] | null
  topDefects?: QualityBoardDefectRow[] | null
  riskItems?: QualityBoardRiskItem[] | null
}

export type NormalizedQualityBoardSummary = {
  periodMode: string
  months: number
  startDate: string
  endDate: string
  totalInspectQty: number
  passQty: number
  defectQty: number
  passRate: number
  defectRate: number
  recordCount: number
  failCount: number
  productCount: number
  abnormalCount: number
  productRows: QualityBoardProductRow[]
  trendData: QualityBoardTrendRow[]
  topDefects: QualityBoardDefectRow[]
  riskItems: QualityBoardRiskItem[]
}

export type QualityBoardCard = {
  label: string
  value: number
  valueType: 'number' | 'percent'
  meta: string
  tone: QualityBoardTone
  icon: string
}

export function toQualityNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function roundQualityQty(value: unknown) {
  return Number(toQualityNumber(value).toFixed(2))
}

export function roundQualityRate(value: unknown) {
  return Number(toQualityNumber(value).toFixed(1))
}

export function qualityRatioPercent(numerator: unknown, denominator: unknown) {
  const base = toQualityNumber(denominator)
  if (base <= 0) return toQualityNumber(numerator) > 0 ? 100 : 0
  return roundQualityRate((toQualityNumber(numerator) / base) * 100)
}

export function clampQualityPercent(value: unknown) {
  return Math.min(Math.max(roundQualityRate(value), 0), 100)
}

export function normalizeQualityResult(value?: string | null) {
  const text = String(value || '').trim().toUpperCase()
  if (text === 'PASS' || value === '合格') return 'PASS'
  if (text === 'FAIL' || value === '不合格') return 'FAIL'
  return text
}

export function getQualityResultText(value?: string | null) {
  const result = normalizeQualityResult(value)
  if (result === 'PASS') return '合格'
  if (result === 'FAIL') return '不合格'
  return value || '-'
}

function asArray<T>(value?: T[] | null) {
  return Array.isArray(value) ? value : []
}

function normalizeCounter(value: unknown) {
  return Math.max(Math.trunc(toQualityNumber(value)), 0)
}

function dayKey(value?: string | null) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '未记日期'
}

function makeQualityTotals(rows: QualityBoardRecord[]) {
  return rows.reduce<{
    inspectQty: number
    passQty: number
    defectQty: number
    recordCount: number
    failCount: number
    abnormalCount: number
  }>(
    (total, item) => {
      const sampleQty = Math.max(roundQualityQty(item.sampleQty), 0)
      const defectQty = Math.max(roundQualityQty(item.defectQty), 0)
      const passQty = Math.max(sampleQty - defectQty, 0)
      const isFail = normalizeQualityResult(item.checkResult) === 'FAIL' || defectQty > 0
      total.inspectQty += sampleQty
      total.passQty += passQty
      total.defectQty += defectQty
      total.recordCount += 1
      total.failCount += isFail ? 1 : 0
      total.abnormalCount += defectQty > sampleQty || sampleQty <= 0 ? 1 : 0
      return total
    },
    { inspectQty: 0, passQty: 0, defectQty: 0, recordCount: 0, failCount: 0, abnormalCount: 0 },
  )
}

function buildProductRows(records: QualityBoardRecord[]) {
  const map = new Map<string, QualityBoardProductRow>()
  for (const item of records) {
    const productId = item.productId || ''
    const productName = item.productName || '未命名产品'
    const key = `${productId || productName}`
    const sampleQty = Math.max(roundQualityQty(item.sampleQty), 0)
    const defectQty = Math.max(roundQualityQty(item.defectQty), 0)
    const current =
      map.get(key) ||
      ({
        productId,
        productName,
        inspectQty: 0,
        passQty: 0,
        defectQty: 0,
        passRate: 0,
        defectRate: 0,
        recordCount: 0,
        failCount: 0,
        abnormalCount: 0,
      } satisfies QualityBoardProductRow)
    current.inspectQty = roundQualityQty(current.inspectQty + sampleQty)
    current.defectQty = roundQualityQty(current.defectQty + defectQty)
    current.passQty = roundQualityQty(current.passQty + Math.max(sampleQty - defectQty, 0))
    current.recordCount += 1
    current.failCount += normalizeQualityResult(item.checkResult) === 'FAIL' || defectQty > 0 ? 1 : 0
    current.abnormalCount += defectQty > sampleQty || sampleQty <= 0 ? 1 : 0
    current.passRate = qualityRatioPercent(current.passQty, current.inspectQty)
    current.defectRate = qualityRatioPercent(current.defectQty, current.inspectQty)
    map.set(key, current)
  }
  return Array.from(map.values()).sort((a, b) => b.defectRate - a.defectRate || b.inspectQty - a.inspectQty)
}

function buildTrendRows(records: QualityBoardRecord[]) {
  const map = new Map<string, QualityBoardTrendRow>()
  for (const item of records) {
    const date = dayKey(item.checkTime)
    const sampleQty = Math.max(roundQualityQty(item.sampleQty), 0)
    const defectQty = Math.max(roundQualityQty(item.defectQty), 0)
    const current =
      map.get(date) ||
      ({
        date,
        inspectQty: 0,
        passQty: 0,
        defectQty: 0,
        passRate: 0,
        defectRate: 0,
        recordCount: 0,
        failCount: 0,
      } satisfies QualityBoardTrendRow)
    current.inspectQty = roundQualityQty(current.inspectQty + sampleQty)
    current.defectQty = roundQualityQty(current.defectQty + defectQty)
    current.passQty = roundQualityQty(current.passQty + Math.max(sampleQty - defectQty, 0))
    current.recordCount += 1
    current.failCount += normalizeQualityResult(item.checkResult) === 'FAIL' || defectQty > 0 ? 1 : 0
    current.passRate = qualityRatioPercent(current.passQty, current.inspectQty)
    current.defectRate = qualityRatioPercent(current.defectQty, current.inspectQty)
    map.set(date, current)
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function buildTopDefects(records: QualityBoardRecord[]) {
  const map = new Map<string, number>()
  for (const item of records) {
    const defectQty = Math.max(roundQualityQty(item.defectQty), 0)
    if (defectQty <= 0) continue
    const defectType = item.defectType || '未分类'
    map.set(defectType, roundQualityQty((map.get(defectType) || 0) + defectQty))
  }
  return Array.from(map.entries())
    .map(([defectType, qty]) => ({ defectType, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8)
}

export function buildQualityBoardSummaryFromRecords(
  records?: QualityBoardRecord[] | null,
  context: Pick<QualityBoardSummary, 'periodMode' | 'months' | 'startDate' | 'endDate'> = {},
): NormalizedQualityBoardSummary {
  const rows = asArray(records)
  const totals = makeQualityTotals(rows)
  const productRows = buildProductRows(rows)
  const trendData = buildTrendRows(rows)
  const topDefects = buildTopDefects(rows)

  return normalizeQualityBoardSummary({
    ...context,
    totalInspectQty: totals.inspectQty,
    passQty: totals.passQty,
    defectQty: totals.defectQty,
    passRate: qualityRatioPercent(totals.passQty, totals.inspectQty),
    defectRate: qualityRatioPercent(totals.defectQty, totals.inspectQty),
    recordCount: totals.recordCount,
    failCount: totals.failCount,
    productCount: productRows.length,
    abnormalCount: totals.abnormalCount,
    productRows,
    trendData,
    topDefects,
  })
}

export function normalizeQualityBoardSummary(input?: QualityBoardSummary | null): NormalizedQualityBoardSummary {
  const data = input || {}
  const productRows = asArray(data.productRows)
  const trendData = asArray(data.trendData)
  const topDefects = asArray(data.topDefects).map((item) => ({
    defectType: item.defectType || '未分类',
    qty: roundQualityQty(item.qty),
  }))
  const totalInspectQty = roundQualityQty(data.totalInspectQty ?? productRows.reduce((sum, item) => sum + toQualityNumber(item.inspectQty), 0))
  const defectQty = roundQualityQty(data.defectQty ?? productRows.reduce((sum, item) => sum + toQualityNumber(item.defectQty), 0))
  const passQty = roundQualityQty(data.passQty ?? Math.max(totalInspectQty - defectQty, 0))

  return {
    periodMode: data.periodMode || '',
    months: normalizeCounter(data.months),
    startDate: data.startDate || '',
    endDate: data.endDate || '',
    totalInspectQty,
    passQty,
    defectQty,
    passRate: roundQualityRate(data.passRate ?? qualityRatioPercent(passQty, totalInspectQty)),
    defectRate: roundQualityRate(data.defectRate ?? qualityRatioPercent(defectQty, totalInspectQty)),
    recordCount: normalizeCounter(data.recordCount ?? productRows.reduce((sum, item) => sum + toQualityNumber(item.recordCount), 0)),
    failCount: normalizeCounter(data.failCount ?? productRows.reduce((sum, item) => sum + toQualityNumber(item.failCount), 0)),
    productCount: normalizeCounter(data.productCount ?? productRows.length),
    abnormalCount: normalizeCounter(data.abnormalCount ?? productRows.reduce((sum, item) => sum + toQualityNumber(item.abnormalCount), 0)),
    productRows,
    trendData,
    topDefects,
    riskItems: asArray(data.riskItems),
  }
}

export function buildQualityBoardCards(input?: QualityBoardSummary | null): QualityBoardCard[] {
  const data = normalizeQualityBoardSummary(input)
  return [
    {
      label: '整体合格率',
      value: data.passRate,
      valueType: 'percent',
      meta: `不良率 ${data.defectRate.toFixed(1)}%`,
      tone: data.totalInspectQty > 0 && data.passRate < 95 ? 'warning' : 'success',
      icon: 'CircleCheck',
    },
    {
      label: '检验数量',
      value: data.totalInspectQty,
      valueType: 'number',
      meta: `${data.recordCount} 条记录`,
      tone: data.totalInspectQty > 0 ? 'primary' : 'neutral',
      icon: 'DocumentChecked',
    },
    {
      label: '合格数量',
      value: data.passQty,
      valueType: 'number',
      meta: `${data.productCount} 个产品`,
      tone: 'success',
      icon: 'CircleCheck',
    },
    {
      label: '不良数量',
      value: data.defectQty,
      valueType: 'number',
      meta: `${data.topDefects.length} 类不良`,
      tone: data.defectQty > 0 ? 'warning' : 'success',
      icon: 'WarningFilled',
    },
    {
      label: '不良记录',
      value: data.failCount,
      valueType: 'number',
      meta: data.failCount > 0 ? '需追溯' : '无不良记录',
      tone: data.failCount > 0 ? 'warning' : 'success',
      icon: 'Bell',
    },
    {
      label: '异常记录',
      value: data.abnormalCount,
      valueType: 'number',
      meta: data.abnormalCount > 0 ? '样本/不良异常' : '数据正常',
      tone: data.abnormalCount > 0 ? 'danger' : 'success',
      icon: 'DataAnalysis',
    },
    {
      label: '产品覆盖',
      value: data.productCount,
      valueType: 'number',
      meta: '已检产品数',
      tone: data.productCount > 0 ? 'primary' : 'neutral',
      icon: 'Goods',
    },
    {
      label: '数据完整率',
      value: data.recordCount > 0 ? qualityRatioPercent(data.recordCount - data.abnormalCount, data.recordCount) : 100,
      valueType: 'percent',
      meta: `${data.abnormalCount}/${data.recordCount} 异常`,
      tone: data.abnormalCount > 0 ? 'warning' : 'success',
      icon: 'Odometer',
    },
  ]
}

export function buildQualityBoardRiskItems(input?: QualityBoardSummary | null): QualityBoardRiskItem[] {
  const data = normalizeQualityBoardSummary(input)
  const risks: QualityBoardRiskItem[] = [...data.riskItems]

  if (data.defectRate > 5) {
    risks.push({
      type: 'HIGH_DEFECT_RATE',
      level: 'error',
      title: '不良率超过控制线',
      description: `本期不良率 ${data.defectRate.toFixed(1)}%，不良数量 ${data.defectQty}，需启动质量追溯。`,
    })
  } else if (data.defectRate > 3) {
    risks.push({
      type: 'DEFECT_RATE_WARNING',
      level: 'warning',
      title: '不良率接近预警线',
      description: `本期不良率 ${data.defectRate.toFixed(1)}%，建议复核不良类型排行和产品批次。`,
    })
  }

  if (data.failCount > 0) {
    risks.push({
      type: 'FAIL_RECORDS',
      level: 'warning',
      title: '存在不合格质检记录',
      description: `${data.failCount} 条质检记录标记为不合格，需确认返工、报废或让步接收处理闭环。`,
    })
  }

  if (data.abnormalCount > 0) {
    risks.push({
      type: 'ABNORMAL_QC_DATA',
      level: 'error',
      title: '质检数量存在异常',
      description: `${data.abnormalCount} 条记录存在抽样数量为空、为 0 或不良数量大于抽样数量的问题。`,
    })
  }

  return risks.slice(0, 12)
}
