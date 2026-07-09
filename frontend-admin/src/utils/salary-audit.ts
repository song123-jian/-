import {
  normalizeSalaryAdjustType,
  normalizeSalaryDailyStatus,
  normalizeSalaryDate,
  roundSalaryAmount,
} from './salary-monthly.ts'

export type SalaryAuditIssueLevel = 'blocking' | 'warning' | 'info'

export type SalaryAuditIssueType =
  | 'MISSING_PRICE'
  | 'PENDING_DAILY'
  | 'PENDING_ADJUST'
  | 'ZERO_AMOUNT_WITH_QTY'
  | 'NEGATIVE_PAYABLE'
  | 'NO_WORKER'
  | 'NO_WORK_DATE'

export type SalaryAuditSource = 'daily' | 'monthly' | 'adjust'

export type SalaryAuditIssue = {
  type: SalaryAuditIssueType
  level: SalaryAuditIssueLevel
  source: SalaryAuditSource
  rowId: number
  workerName: string
  date: string
  message: string
}

export type SalaryAuditSummary = {
  dailyCount: number
  monthlyWorkerCount: number
  adjustCount: number
  workerCount: number
  pendingWorkerCount: number
  pendingDailyCount: number
  pendingAdjustCount: number
  missingPriceCount: number
  zeroAmountCount: number
  negativePayableCount: number
  noWorkerCount: number
  noWorkDateCount: number
  blockingCount: number
  warningCount: number
  issueCount: number
  payableAmount: number
  pieceAmount: number
  bonusAmount: number
  penaltyAmount: number
  adjustAmount: number
  issues: SalaryAuditIssue[]
  blockingIssues: SalaryAuditIssue[]
  warningIssues: SalaryAuditIssue[]
  canSettle: boolean
}

export type SalaryAuditCard = {
  label: string
  value: string | number
  hint: string
  className: string
  meta?: string
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'default'
}

function readNumber(row: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') {
      const value = Number(row[key])
      return Number.isFinite(value) ? value : 0
    }
  }
  return 0
}

function readText(row: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = String(row?.[key] ?? '').trim()
    if (value) return value
  }
  return ''
}

function readWorkerId(row: Record<string, any>) {
  return readNumber(row, ['userId', 'workerId', 'user_id', 'worker_id'])
}

function readWorkerName(row: Record<string, any>) {
  return readText(row, ['workerName', 'worker_name', 'realName', 'real_name', 'username']) || '-'
}

function readDailyDate(row: Record<string, any>) {
  return normalizeSalaryDate(readText(row, ['workDate', 'work_date', 'date']))
}

function readAdjustDate(row: Record<string, any>) {
  return normalizeSalaryDate(readText(row, ['adjustDate', 'adjust_date', 'date']))
}

function hasWorker(row: Record<string, any>) {
  const workerName = readWorkerName(row)
  return Boolean(readWorkerId(row) || (workerName && workerName !== '-'))
}

function readQualifiedQty(row: Record<string, any>) {
  const quantity = readNumber(row, ['quantity', 'qualifiedQty', 'qualified_qty', 'totalQualifiedQty', 'total_qualified_qty'])
  if (quantity) return quantity
  const qty = readNumber(row, ['qty'])
  const badQty = readNumber(row, ['badQty', 'bad_qty', 'defectCount'])
  return Math.max(qty - badQty, 0)
}

function readDailyAmount(row: Record<string, any>) {
  return roundSalaryAmount(readNumber(row, ['amount', 'totalPieceAmount', 'total_piece_amount', 'totalAmount', 'total_amount']))
}

function issue(
  row: Record<string, any>,
  source: SalaryAuditSource,
  type: SalaryAuditIssueType,
  level: SalaryAuditIssueLevel,
  message: string,
): SalaryAuditIssue {
  return {
    type,
    level,
    source,
    rowId: readNumber(row, ['id']),
    workerName: readWorkerName(row),
    date: source === 'adjust' ? readAdjustDate(row) : readDailyDate(row),
    message,
  }
}

export function buildSalaryAuditIssues(row: Record<string, any>, source: SalaryAuditSource): SalaryAuditIssue[] {
  const issues: SalaryAuditIssue[] = []

  if (source === 'daily') {
    if (!hasWorker(row)) issues.push(issue(row, source, 'NO_WORKER', 'blocking', '缺少员工信息，不能进入工资结算'))
    if (!readDailyDate(row)) issues.push(issue(row, source, 'NO_WORK_DATE', 'blocking', '缺少归属日期，不能进入工资结算'))

    const qualifiedQty = readQualifiedQty(row)
    if (row?.priceMissing === true) {
      issues.push(issue(row, source, 'MISSING_PRICE', 'blocking', row.priceMessage || '存在合格产量但缺少有效计件单价'))
    } else if (qualifiedQty > 0 && readDailyAmount(row) <= 0) {
      issues.push(issue(row, source, 'ZERO_AMOUNT_WITH_QTY', 'blocking', '存在合格产量但计件金额为 0 或负数'))
    }

    if (normalizeSalaryDailyStatus(row?.status) !== 'SETTLED') {
      issues.push(issue(row, source, 'PENDING_DAILY', 'warning', '日工资仍为待结算状态'))
    }
  }

  if (source === 'monthly') {
    if (!hasWorker(row)) issues.push(issue(row, source, 'NO_WORKER', 'blocking', '缺少员工信息，不能进入工资结算'))
    const payableAmount = roundSalaryAmount(row?.payableAmount ?? row?.totalAmount ?? 0)
    if (payableAmount < 0) {
      issues.push(issue(row, source, 'NEGATIVE_PAYABLE', 'blocking', '应发工资为负数，请复核扣款和调整记录'))
    }
  }

  if (source === 'adjust') {
    if (!hasWorker(row)) issues.push(issue(row, source, 'NO_WORKER', 'blocking', '缺少员工信息，不能进入工资结算'))
    if (!readAdjustDate(row)) issues.push(issue(row, source, 'NO_WORK_DATE', 'blocking', '缺少奖惩日期，不能进入工资结算'))
    const status = String(row?.status || '').trim().toUpperCase()
    if (status !== 'SETTLED') {
      issues.push(issue(row, source, 'PENDING_ADJUST', 'warning', '奖惩记录仍为待结算状态'))
    }
  }

  return issues
}

export function buildSalaryAuditIssue(row: Record<string, any>, source: SalaryAuditSource) {
  return buildSalaryAuditIssues(row, source)[0]
}

function uniqueWorkerCount(rows: Array<Record<string, any>>) {
  const keys = new Set<string>()
  for (const row of rows) {
    const workerId = readWorkerId(row)
    keys.add(workerId ? String(workerId) : readWorkerName(row))
  }
  keys.delete('-')
  return keys.size
}

function sumAmount(rows: Array<Record<string, any>>, keys: string[]) {
  return roundSalaryAmount(rows.reduce((sum, row) => sum + readNumber(row, keys), 0))
}

function countIssues(issues: SalaryAuditIssue[], type: SalaryAuditIssueType) {
  return issues.filter((item) => item.type === type).length
}

export function buildSalaryAuditSummary(
  dailyRows: Array<Record<string, any>> = [],
  monthlyRows: Array<Record<string, any>> = [],
  adjustRows: Array<Record<string, any>> = [],
): SalaryAuditSummary {
  const issues = [
    ...dailyRows.flatMap((row) => buildSalaryAuditIssues(row, 'daily')),
    ...monthlyRows.flatMap((row) => buildSalaryAuditIssues(row, 'monthly')),
    ...adjustRows.flatMap((row) => buildSalaryAuditIssues(row, 'adjust')),
  ]
  const blockingIssues = issues.filter((item) => item.level === 'blocking')
  const warningIssues = issues.filter((item) => item.level === 'warning')
  const workerRows = [...dailyRows, ...monthlyRows, ...adjustRows]
  const pendingWorkerIds = new Set<string>()
  for (const row of monthlyRows) {
    if (String(row?.status || '').trim().toUpperCase() !== 'SETTLED') {
      const workerId = readWorkerId(row)
      pendingWorkerIds.add(workerId ? String(workerId) : readWorkerName(row))
    }
  }
  pendingWorkerIds.delete('-')

  const summary: SalaryAuditSummary = {
    dailyCount: dailyRows.length,
    monthlyWorkerCount: monthlyRows.length,
    adjustCount: adjustRows.length,
    workerCount: uniqueWorkerCount(workerRows),
    pendingWorkerCount: pendingWorkerIds.size,
    pendingDailyCount: countIssues(issues, 'PENDING_DAILY'),
    pendingAdjustCount: countIssues(issues, 'PENDING_ADJUST'),
    missingPriceCount: countIssues(issues, 'MISSING_PRICE'),
    zeroAmountCount: countIssues(issues, 'ZERO_AMOUNT_WITH_QTY'),
    negativePayableCount: countIssues(issues, 'NEGATIVE_PAYABLE'),
    noWorkerCount: countIssues(issues, 'NO_WORKER'),
    noWorkDateCount: countIssues(issues, 'NO_WORK_DATE'),
    blockingCount: blockingIssues.length,
    warningCount: warningIssues.length,
    issueCount: issues.length,
    payableAmount: sumAmount(monthlyRows, ['payableAmount', 'totalAmount', 'total_amount']),
    pieceAmount: sumAmount(monthlyRows, ['pieceAmount', 'totalPieceAmount', 'total_piece_amount']),
    bonusAmount: sumAmount(monthlyRows, ['bonus', 'subsidy']),
    penaltyAmount: sumAmount(monthlyRows, ['penalty', 'deduction']),
    adjustAmount: sumAmount(monthlyRows, ['adjustAmount']),
    issues,
    blockingIssues,
    warningIssues,
    canSettle: false,
  }
  summary.canSettle = canSettleSalary(summary)
  return summary
}

export function canSettleSalary(summary: Pick<SalaryAuditSummary, 'blockingCount' | 'dailyCount' | 'adjustCount' | 'monthlyWorkerCount'>) {
  return summary.blockingCount === 0 && (summary.dailyCount > 0 || summary.adjustCount > 0 || summary.monthlyWorkerCount > 0)
}

export function getSalaryAuditBlockMessage(summary: SalaryAuditSummary) {
  if (canSettleSalary(summary)) return ''
  if (summary.blockingCount <= 0) return '当前月份暂无可结算工资明细'
  const parts = [
    summary.missingPriceCount ? `缺单价 ${summary.missingPriceCount}` : '',
    summary.zeroAmountCount ? `异常金额 ${summary.zeroAmountCount}` : '',
    summary.negativePayableCount ? `负应发 ${summary.negativePayableCount}` : '',
    summary.noWorkerCount ? `缺员工 ${summary.noWorkerCount}` : '',
    summary.noWorkDateCount ? `缺日期 ${summary.noWorkDateCount}` : '',
  ].filter(Boolean)
  return `存在 ${summary.blockingCount} 个工资阻断项：${parts.join('，')}，请先处理后再结算`
}

export function buildDailySalaryAuditCards(rows: Array<Record<string, any>> = []): SalaryAuditCard[] {
  const summary = buildSalaryAuditSummary(rows, [], [])
  const settledCount = rows.filter((row) => normalizeSalaryDailyStatus(row?.status) === 'SETTLED').length
  const pieceAmount = sumAmount(rows, ['amount', 'totalPieceAmount', 'total_piece_amount'])
  const workerCount = uniqueWorkerCount(rows)
  return [
    { label: '明细数', value: rows.length, hint: `计件金额 ¥${pieceAmount}`, meta: `计件金额 ¥${pieceAmount}`, className: 'kpi-card--primary', tone: 'primary' },
    { label: '待结算', value: summary.pendingDailyCount, hint: `已结算 ${settledCount}`, meta: `已结算 ${settledCount}`, className: 'kpi-card--warning', tone: 'warning' },
    { label: '缺单价', value: summary.missingPriceCount, hint: '阻断月结', meta: '阻断月结', className: summary.missingPriceCount ? 'kpi-card--danger' : 'kpi-card--success', tone: summary.missingPriceCount ? 'danger' : 'success' },
    { label: '异常金额', value: summary.zeroAmountCount, hint: '有产量无金额', meta: '有产量无金额', className: summary.zeroAmountCount ? 'kpi-card--danger' : 'kpi-card--success', tone: summary.zeroAmountCount ? 'danger' : 'success' },
    { label: '合格数', value: rows.reduce((sum, row) => sum + readQualifiedQty(row), 0), hint: `员工 ${workerCount}`, meta: `员工 ${workerCount}`, className: 'kpi-card--success', tone: 'success' },
  ]
}

export function buildSalaryAdjustAuditCards(rows: Array<Record<string, any>> = []): SalaryAuditCard[] {
  const bonusAmount = roundSalaryAmount(rows.reduce((sum, row) => {
    const type = normalizeSalaryAdjustType(row?.adjustType || row?.adjust_type || row?.type)
    return sum + (type === 'BONUS' ? Math.abs(readNumber(row, ['amount'])) : 0)
  }, 0))
  const penaltyAmount = roundSalaryAmount(rows.reduce((sum, row) => {
    const type = normalizeSalaryAdjustType(row?.adjustType || row?.adjust_type || row?.type)
    return sum + (type === 'PENALTY' ? Math.abs(readNumber(row, ['amount'])) : 0)
  }, 0))
  const pendingCount = rows.filter((row) => String(row?.status || '').trim().toUpperCase() !== 'SETTLED').length
  const netAmount = roundSalaryAmount(bonusAmount - penaltyAmount)
  const workerCount = uniqueWorkerCount(rows)
  return [
    { label: '奖励合计', value: `¥${bonusAmount.toFixed(2)}`, hint: `记录 ${rows.length}`, meta: `记录 ${rows.length}`, className: 'kpi-card--success', tone: 'success' },
    { label: '扣款合计', value: `¥${penaltyAmount.toFixed(2)}`, hint: `净调整 ¥${netAmount.toFixed(2)}`, meta: `净调整 ¥${netAmount.toFixed(2)}`, className: 'kpi-card--danger', tone: 'danger' },
    { label: '待结数量', value: pendingCount, hint: '随月工资锁定', meta: '随月工资锁定', className: pendingCount ? 'kpi-card--warning' : 'kpi-card--success', tone: pendingCount ? 'warning' : 'success' },
    { label: '已结数量', value: rows.length - pendingCount, hint: `员工 ${workerCount}`, meta: `员工 ${workerCount}`, className: 'kpi-card--primary', tone: 'primary' },
  ]
}
