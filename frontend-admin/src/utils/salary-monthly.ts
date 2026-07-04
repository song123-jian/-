export type SalaryMonthScope = {
  month: string
  year: number
  monthNumber: number
  startDate: string
  endDate: string
}

export type SalaryMonthlyRow = {
  id: number
  userId: number
  workerName: string
  month: string
  workDays: number
  settledDays: number
  pendingDays: number
  adjustCount: number
  pendingAdjustCount: number
  pieceAmount: number
  baseSalary: number
  bonus: number
  penalty: number
  adjustAmount: number
  payableAmount: number
  totalAmount: number
  status: 'SETTLED' | 'PENDING'
}

export type SalaryDailyStatus = 'DRAFT' | 'SETTLED'

export type SalaryDailyReportLine = {
  id: number
  userId: number
  workerName: string
  productName: string
  processName: string
  reportType: string
  qty: number
  badQty: number
  quantity: number
  unitPrice: number
  amount: number
  priceMissing?: boolean
  priceMessage?: string
  workDate: string
  date: string
  salaryDailyId?: number
  status: SalaryDailyStatus
  statusText: string
  confirmedAt?: string
  remark: string
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function parseDateOnly(value?: string | Date | null) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }

  const text = String(value || '').trim().slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

function parseSalaryMonthParts(value: unknown, fallbackYear: number) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return { year: value.getFullYear(), monthNumber: value.getMonth() + 1 }
  }

  const raw = String(value ?? '').trim()
  if (!raw) return null

  const monthText = raw.slice(0, 7)
  const monthMatch = /^(\d{4})-(\d{1,2})$/.exec(monthText)
  if (monthMatch) {
    return { year: Number(monthMatch[1]), monthNumber: Number(monthMatch[2]) }
  }

  const numberMatch = /^(\d{1,2})$/.exec(raw)
  if (numberMatch) {
    return { year: fallbackYear, monthNumber: Number(numberMatch[1]) }
  }

  return null
}

export function normalizeSalaryMonth(value?: string | number | Date | null, today?: string | Date) {
  const base = parseDateOnly(today) || new Date()
  const parsed = parseSalaryMonthParts(value ?? base, base.getFullYear())
  if (!parsed || parsed.monthNumber < 1 || parsed.monthNumber > 12) return ''
  return `${parsed.year}-${pad2(parsed.monthNumber)}`
}

export function getSalaryMonthBounds(month: string): SalaryMonthScope {
  const normalized = normalizeSalaryMonth(month)
  if (!normalized) throw new Error('工资月份格式不正确')
  const [year, monthNumber] = normalized.split('-').map(Number)
  const start = new Date(year, monthNumber - 1, 1)
  const end = new Date(year, monthNumber, 0)
  return {
    month: normalized,
    year,
    monthNumber,
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(end),
  }
}

export function createSalaryMonthScope(params?: Record<string, any>, today?: string | Date): SalaryMonthScope {
  const base = parseDateOnly(today) || new Date()
  const fallbackYear = Number(params?.year || base.getFullYear())
  const monthValue = params?.month === undefined || params?.month === null || params?.month === '' ? base : params.month
  const parsed = parseSalaryMonthParts(monthValue, Number.isFinite(fallbackYear) ? fallbackYear : base.getFullYear())
  if (!parsed || parsed.monthNumber < 1 || parsed.monthNumber > 12) throw new Error('工资月份格式不正确')
  return getSalaryMonthBounds(`${parsed.year}-${pad2(parsed.monthNumber)}`)
}

export function normalizeSalaryDate(value?: string | Date | null) {
  const date = parseDateOnly(value)
  return date ? formatLocalDate(date) : ''
}

export function roundSalaryAmount(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0
}

export function normalizeSalaryUnitPrice(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? Number(amount.toFixed(4)) : 0
}

export function normalizeSalaryDailyStatus(value?: string | null): SalaryDailyStatus {
  const text = String(value || '').trim().toUpperCase()
  return text === 'SETTLED' || text === '已结算' ? 'SETTLED' : 'DRAFT'
}

export function getSalaryDailyStatusText(value?: string | null) {
  return normalizeSalaryDailyStatus(value) === 'SETTLED' ? '已结算' : '待结算'
}

export function isSalaryDailySettled(value?: string | null) {
  return normalizeSalaryDailyStatus(value) === 'SETTLED'
}

export function getSalaryReportGoodQty(row: Record<string, any>) {
  const qty = Number(row?.qty ?? row?.quantity ?? 0)
  const badQty = Number(row?.badQty ?? row?.bad_qty ?? row?.defectCount ?? 0)
  const safeQty = Number.isFinite(qty) ? qty : 0
  const safeBadQty = Number.isFinite(badQty) ? badQty : 0
  return Math.max(safeQty - safeBadQty, 0)
}

export function getSalaryReportWorkDate(row: Record<string, any>) {
  return normalizeSalaryDate(row?.startTime || row?.start_time || row?.workDate || row?.work_date || row?.date || row?.createdAt || row?.created_at)
}

export function getSalaryReportPieceAmount(row: Record<string, any>, unitPrice?: unknown) {
  const price = normalizeSalaryUnitPrice(unitPrice ?? row?.unitPrice ?? row?.unit_price ?? 0)
  return roundSalaryAmount(getSalaryReportGoodQty(row) * price)
}

export function buildSalaryDailyReportLine(row: Record<string, any>, context: Record<string, any> = {}): SalaryDailyReportLine {
  const unitPrice = normalizeSalaryUnitPrice(context.unitPrice ?? row?.unitPrice ?? row?.unit_price ?? 0)
  const qty = Number(row?.qty ?? row?.quantity ?? 0)
  const badQty = Number(row?.badQty ?? row?.bad_qty ?? row?.defectCount ?? 0)
  const quantity = getSalaryReportGoodQty({ ...row, qty, badQty })
  const status = normalizeSalaryDailyStatus(context.status ?? row?.status)
  const workDate = getSalaryReportWorkDate(row)
  return {
    id: Number(row?.id || 0),
    userId: Number(row?.userId || row?.user_id || context.userId || 0),
    workerName: context.workerName || row?.workerName || row?.worker_name || '-',
    productName: context.productName || row?.productName || row?.product_name || '-',
    processName: context.processName || row?.processName || row?.process_name || row?.reportType || row?.report_type || '注塑',
    reportType: row?.reportType || row?.report_type || '',
    qty: Number.isFinite(qty) ? qty : 0,
    badQty: Number.isFinite(badQty) ? badQty : 0,
    quantity,
    unitPrice,
    amount: roundSalaryAmount(quantity * unitPrice),
    ...(context.priceMissing ? { priceMissing: true, priceMessage: context.priceMessage || '缺少有效计件单价' } : {}),
    workDate,
    date: workDate,
    salaryDailyId: context.salaryDailyId ? Number(context.salaryDailyId) : undefined,
    status,
    statusText: getSalaryDailyStatusText(status),
    confirmedAt: context.confirmedAt || row?.confirmedAt || row?.confirmed_at || '',
    remark: row?.remark || '',
  }
}

export function normalizeSalaryAdjustType(value?: string | null) {
  const text = String(value || '').trim().toUpperCase()
  if (['BONUS', 'REWARD', 'SUBSIDY', 'ALLOWANCE', '奖励', '奖金', '补贴'].includes(text)) return 'BONUS'
  if (['PENALTY', 'DEDUCTION', 'FINE', '惩罚', '扣款', '罚款'].includes(text)) return 'PENALTY'
  return text
}

export function getSalaryAdjustTypeText(value?: string | null) {
  const normalized = normalizeSalaryAdjustType(value)
  if (normalized === 'BONUS') return '奖励'
  if (normalized === 'PENALTY') return '扣款'
  return value || '-'
}

export function normalizeSalaryAdjustStatus(value?: string | null) {
  const text = String(value || '').trim().toUpperCase()
  if (text === 'SETTLED' || text === '已结算') return 'SETTLED'
  return 'DRAFT'
}

export function getSalaryAdjustStatusText(value?: string | null) {
  return normalizeSalaryAdjustStatus(value) === 'SETTLED' ? '已结算' : '待结算'
}

export function isSalaryAdjustSettled(value?: string | null) {
  return normalizeSalaryAdjustStatus(value) === 'SETTLED'
}

export function getSalaryAdjustEffect(type: string | null | undefined, amount: unknown) {
  const normalizedType = normalizeSalaryAdjustType(type)
  const normalizedAmount = Math.abs(roundSalaryAmount(amount))
  if (normalizedType === 'BONUS') return normalizedAmount
  if (normalizedType === 'PENALTY') return -normalizedAmount
  return 0
}

export function normalizeSalaryAdjustInput(payload: Record<string, any>) {
  const userId = Number(payload?.userId || payload?.workerId || payload?.user_id || payload?.worker_id || 0)
  const adjustType = normalizeSalaryAdjustType(payload?.adjustType || payload?.type || payload?.adjust_type)
  const amount = roundSalaryAmount(payload?.amount)
  const adjustDate = normalizeSalaryDate(payload?.adjustDate || payload?.date || payload?.adjust_date)
  const reason = String(payload?.reason || '').trim()
  return {
    id: Number(payload?.id || 0) || undefined,
    userId: Number.isFinite(userId) ? userId : 0,
    adjustType,
    amount,
    adjustDate,
    reason,
    status: normalizeSalaryAdjustStatus(payload?.status),
  }
}

export function validateSalaryAdjustInput(payload: Record<string, any>) {
  const normalized = normalizeSalaryAdjustInput(payload)
  if (!normalized.userId) return '请选择员工'
  if (!['BONUS', 'PENALTY'].includes(normalized.adjustType)) return '请选择奖惩类型'
  if (!Number.isFinite(normalized.amount) || normalized.amount <= 0) return '奖惩金额必须大于 0'
  if (!normalized.adjustDate) return '请选择奖惩日期'
  if (!normalized.reason) return '请输入奖惩原因'
  return ''
}

function readUserId(row: Record<string, any>) {
  return Number(row?.userId || row?.user_id || row?.workerId || row?.worker_id || 0)
}

function readDate(row: Record<string, any>, camelKey: string, snakeKey: string) {
  return normalizeSalaryDate(row?.[camelKey] || row?.[snakeKey])
}

function readAmount(row: Record<string, any>, camelKey: string, snakeKey: string) {
  return roundSalaryAmount(row?.[camelKey] ?? row?.[snakeKey])
}

function readStatus(row: Record<string, any>) {
  return String(row?.status || 'DRAFT').trim().toUpperCase()
}

function buildUserNameMap(users: Array<Record<string, any>> | Map<number, Record<string, any>>) {
  if (users instanceof Map) return users
  return new Map(users.map((user) => [Number(user?.id), user]))
}

export function buildMonthlySalarySummary(
  dailyRows: Array<Record<string, any>>,
  adjustRows: Array<Record<string, any>>,
  users: Array<Record<string, any>> | Map<number, Record<string, any>>,
  month: string,
) {
  const userMap = buildUserNameMap(users)
  const grouped = new Map<number, any>()

  function ensure(userId: number) {
    const user = userMap.get(userId)
    const current = grouped.get(userId) || {
      userId,
      workerName: user?.realName || user?.real_name || user?.username || '-',
      month,
      workDays: new Set<string>(),
      settledDays: new Set<string>(),
      pieceAmount: 0,
      baseSalary: 0,
      bonus: 0,
      penalty: 0,
      adjustCount: 0,
      pendingAdjustCount: 0,
      hasPending: false,
    }
    grouped.set(userId, current)
    return current
  }

  for (const row of dailyRows) {
    const userId = readUserId(row)
    if (!userId) continue
    const current = ensure(userId)
    const workDate = readDate(row, 'workDate', 'work_date')
    if (workDate) current.workDays.add(workDate)
    current.pieceAmount += readAmount(row, 'totalPieceAmount', 'total_piece_amount')
    current.bonus += readAmount(row, 'subsidy', 'subsidy')
    current.penalty += readAmount(row, 'deduction', 'deduction')
    if (readStatus(row) === 'SETTLED') {
      if (workDate) current.settledDays.add(workDate)
    } else {
      current.hasPending = true
    }
  }

  for (const row of adjustRows) {
    const userId = readUserId(row)
    if (!userId) continue
    const current = ensure(userId)
    const effect = getSalaryAdjustEffect(row?.adjustType || row?.adjust_type || row?.type, row?.amount)
    if (effect > 0) current.bonus += effect
    if (effect < 0) current.penalty += Math.abs(effect)
    current.adjustCount += 1
    if (readStatus(row) !== 'SETTLED') {
      current.pendingAdjustCount += 1
      current.hasPending = true
    }
  }

  return Array.from(grouped.values())
    .sort((left, right) => left.workerName.localeCompare(right.workerName, 'zh-CN') || left.userId - right.userId)
    .map((item, index): SalaryMonthlyRow => {
      const pieceAmount = roundSalaryAmount(item.pieceAmount)
      const baseSalary = roundSalaryAmount(item.baseSalary)
      const bonus = roundSalaryAmount(item.bonus)
      const penalty = roundSalaryAmount(item.penalty)
      const adjustAmount = roundSalaryAmount(bonus - penalty)
      const payableAmount = roundSalaryAmount(pieceAmount + baseSalary + adjustAmount)
      const workDays = item.workDays.size
      const settledDays = item.settledDays.size
      const pendingDays = Math.max(workDays - settledDays, 0)
      const status = item.hasPending || pendingDays > 0 || item.pendingAdjustCount > 0 ? 'PENDING' : 'SETTLED'
      return {
        id: index + 1,
        userId: item.userId,
        workerName: item.workerName,
        month: item.month,
        workDays,
        settledDays,
        pendingDays,
        adjustCount: item.adjustCount,
        pendingAdjustCount: item.pendingAdjustCount,
        pieceAmount,
        baseSalary,
        bonus,
        penalty,
        adjustAmount,
        payableAmount,
        totalAmount: payableAmount,
        status,
      }
    })
}
