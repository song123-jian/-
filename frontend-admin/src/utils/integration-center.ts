export const INTEGRATION_CODE_TYPES = ['MACHINE', 'MOLD', 'PRODUCT', 'BATCH'] as const
export const INTEGRATION_MACHINE_STATUSES = ['RUNNING', 'IDLE', 'STOPPED', 'MAINTENANCE'] as const
export const INTEGRATION_REPORT_TYPES = ['OUTPUT', 'BAD', 'DOWNTIME'] as const
export const INTEGRATION_SHIFTS = ['DAY', 'NIGHT'] as const
export const INTEGRATION_PUSH_TYPES = ['INFO', 'WARNING', 'ERROR'] as const

export type IntegrationCodeType = (typeof INTEGRATION_CODE_TYPES)[number]
export type IntegrationMachineStatus = (typeof INTEGRATION_MACHINE_STATUSES)[number]
export type IntegrationReportType = (typeof INTEGRATION_REPORT_TYPES)[number]
export type IntegrationShift = (typeof INTEGRATION_SHIFTS)[number]
export type IntegrationPushType = (typeof INTEGRATION_PUSH_TYPES)[number]
export type IntegrationResultState = 'success' | 'warning' | 'error' | 'info'

export type IntegrationTelemetryInput = {
  machineId?: number | string | null
  machineCode?: string | null
  status?: string | null
  prodOrderId?: number | string | null
  orderNo?: string | null
  moldId?: number | string | null
  qty?: number | string | null
  badQty?: number | string | null
  shots?: number | string | null
  reportType?: string | null
  shift?: string | null
  startTime?: string | null
  endTime?: string | null
  source?: string | null
  remark?: string | null
}

export type NormalizedIntegrationTelemetry = {
  machineId?: number
  machineCode?: string
  status?: IntegrationMachineStatus
  prodOrderId?: number
  orderNo?: string
  moldId?: number
  qty: number
  badQty: number
  shots: number
  reportType: IntegrationReportType
  shift: IntegrationShift
  startTime?: string
  endTime?: string
  source: string
  remark?: string
}

export type IntegrationScanInput = {
  code?: string | null
  codeType?: string | null
}

export type NormalizedIntegrationScan = {
  rawCode: string
  code: string
  codeType: IntegrationCodeType
}

export type IntegrationLabelInput = {
  targetType?: string | null
  targetId?: number | string | null
}

export type NormalizedIntegrationLabel = {
  targetType: IntegrationCodeType
  targetId: number
}

export type IntegrationScaleInput = {
  productId?: number | string | null
  grossWeight?: number | string | null
  tareWeight?: number | string | null
  unitWeight?: number | string | null
}

export type IntegrationScaleResult = {
  productId?: number
  grossWeight: number
  tareWeight: number
  netWeight: number
  unitWeight: number
  quantity: number
}

export type IntegrationPushInput = {
  title?: string | null
  content?: string | null
  type?: string | null
}

export type NormalizedIntegrationPush = {
  title: string
  content: string
  type: IntegrationPushType
}

export type IntegrationResult = {
  accepted: boolean
  state: IntegrationResultState
  stateText: string
  summary: string
  payload: Record<string, unknown>
}

export function toIntegrationNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function toIntegrationInteger(value: unknown) {
  return Math.trunc(toIntegrationNumber(value))
}

function positiveId(value: unknown) {
  const id = toIntegrationInteger(value)
  return id > 0 ? id : undefined
}

function trimText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeEnum<T extends readonly string[]>(value: unknown, allowed: T, fallback = '') {
  const text = trimText(value).toUpperCase()
  return allowed.includes(text) ? (text as T[number]) : fallback
}

export function normalizeIntegrationCodeType(value?: string | null) {
  return normalizeEnum(value, INTEGRATION_CODE_TYPES)
}

export function inferIntegrationCodeType(code?: string | null) {
  const raw = trimText(code)
  const prefix = raw.includes(':') ? raw.split(':', 1)[0] : ''
  return normalizeIntegrationCodeType(prefix)
}

export function normalizeIntegrationScan(input: IntegrationScanInput): NormalizedIntegrationScan {
  const rawCode = trimText(input.code)
  const explicitType = normalizeIntegrationCodeType(input.codeType)
  const inferredType = inferIntegrationCodeType(rawCode)
  const codeType = (explicitType || inferredType || '') as IntegrationCodeType
  const code = rawCode.includes(':') ? rawCode.slice(rawCode.indexOf(':') + 1).trim() : rawCode
  return { rawCode, code, codeType }
}

export function validateIntegrationScan(input: IntegrationScanInput) {
  const scan = normalizeIntegrationScan(input)
  if (!scan.rawCode) return '请输入扫码内容'
  if (!scan.code) return '扫码内容缺少业务编码'
  if (!scan.codeType) return '无法识别扫码类型，请选择机台、模具、产品或批次'
  if (scan.code.length > 100) return '业务编码不能超过 100 个字符'
  return ''
}

export function normalizeIntegrationTelemetry(input: IntegrationTelemetryInput): NormalizedIntegrationTelemetry {
  const machineId = positiveId(input.machineId)
  const prodOrderId = positiveId(input.prodOrderId)
  const moldId = positiveId(input.moldId)
  const qty = Math.max(toIntegrationInteger(input.qty), 0)
  const badQty = Math.max(toIntegrationInteger(input.badQty), 0)
  const shots = Math.max(toIntegrationInteger(input.shots), 0)
  const status = normalizeEnum(input.status, INTEGRATION_MACHINE_STATUSES) as IntegrationMachineStatus | ''
  const reportType = (normalizeEnum(input.reportType, INTEGRATION_REPORT_TYPES, 'OUTPUT') || 'OUTPUT') as IntegrationReportType
  const shift = (normalizeEnum(input.shift, INTEGRATION_SHIFTS, 'DAY') || 'DAY') as IntegrationShift

  return {
    ...(machineId ? { machineId } : {}),
    ...(trimText(input.machineCode) ? { machineCode: trimText(input.machineCode) } : {}),
    ...(status ? { status } : {}),
    ...(prodOrderId ? { prodOrderId } : {}),
    ...(trimText(input.orderNo) ? { orderNo: trimText(input.orderNo) } : {}),
    ...(moldId ? { moldId } : {}),
    qty,
    badQty,
    shots,
    reportType,
    shift,
    ...(trimText(input.startTime) ? { startTime: trimText(input.startTime) } : {}),
    ...(trimText(input.endTime) ? { endTime: trimText(input.endTime) } : {}),
    source: trimText(input.source) || 'WEB',
    ...(trimText(input.remark) ? { remark: trimText(input.remark) } : {}),
  }
}

export function validateIntegrationTelemetry(input: IntegrationTelemetryInput) {
  const data = normalizeIntegrationTelemetry(input)
  if (!data.machineId && !data.machineCode) return '机台编号或机台编码至少填写一个'
  if (input.status && !data.status) return '机台状态不在允许范围内'
  if (input.reportType && !normalizeEnum(input.reportType, INTEGRATION_REPORT_TYPES)) return '报工类型不在允许范围内'
  if (input.shift && !normalizeEnum(input.shift, INTEGRATION_SHIFTS)) return '班次不在允许范围内'
  if (data.badQty > data.qty) return '不良数不能超过产量'
  if (data.qty <= 0 && data.badQty > 0) return '存在不良数时产量必须大于 0'
  if (data.endTime && data.startTime && data.endTime < data.startTime) return '结束时间不能早于开始时间'
  if (data.remark && data.remark.length > 200) return '备注不能超过 200 个字符'
  return ''
}

export function normalizeIntegrationLabel(input: IntegrationLabelInput): NormalizedIntegrationLabel {
  return {
    targetType: normalizeIntegrationCodeType(input.targetType) as IntegrationCodeType,
    targetId: positiveId(input.targetId) || 0,
  }
}

export function validateIntegrationLabel(input: IntegrationLabelInput) {
  const data = normalizeIntegrationLabel(input)
  if (!data.targetType) return '请选择目标类型'
  if (!data.targetId) return '请输入有效的目标编号'
  return ''
}

export function convertIntegrationScale(input: IntegrationScaleInput): IntegrationScaleResult {
  const productId = positiveId(input.productId)
  const grossWeight = Number(toIntegrationNumber(input.grossWeight).toFixed(3))
  const tareWeight = Number(Math.max(toIntegrationNumber(input.tareWeight), 0).toFixed(3))
  const unitWeight = Number(Math.max(toIntegrationNumber(input.unitWeight), 0).toFixed(3))
  const netWeight = Number(Math.max(grossWeight - tareWeight, 0).toFixed(3))
  const quantity = unitWeight > 0 ? Math.floor(netWeight / unitWeight) : 0
  return {
    ...(productId ? { productId } : {}),
    grossWeight,
    tareWeight,
    netWeight,
    unitWeight,
    quantity,
  }
}

export function validateIntegrationScale(input: IntegrationScaleInput) {
  const data = convertIntegrationScale(input)
  if (data.grossWeight <= 0) return '毛重必须大于 0'
  if (data.tareWeight > data.grossWeight) return '皮重不能大于毛重'
  if (input.unitWeight !== undefined && input.unitWeight !== null && input.unitWeight !== '' && data.unitWeight <= 0) {
    return '单件重必须大于 0'
  }
  return ''
}

export function normalizeIntegrationPush(input: IntegrationPushInput): NormalizedIntegrationPush {
  return {
    title: trimText(input.title),
    content: trimText(input.content),
    type: (normalizeEnum(input.type, INTEGRATION_PUSH_TYPES, 'INFO') || 'INFO') as IntegrationPushType,
  }
}

export function validateIntegrationPush(input: IntegrationPushInput) {
  const data = normalizeIntegrationPush(input)
  if (!data.title) return '请输入标题'
  if (!data.content) return '请输入内容'
  if (data.title.length > 80) return '标题不能超过 80 个字符'
  if (data.content.length > 500) return '内容不能超过 500 个字符'
  if (input.type && !normalizeEnum(input.type, INTEGRATION_PUSH_TYPES)) return '消息类型不在允许范围内'
  return ''
}

export function buildIntegrationResult(
  state: IntegrationResultState,
  summary: string,
  payload: Record<string, unknown> = {},
): IntegrationResult {
  const labels: Record<IntegrationResultState, string> = {
    success: '成功',
    warning: '提示',
    error: '失败',
    info: '信息',
  }
  return {
    accepted: state === 'success' || state === 'warning' || state === 'info',
    state,
    stateText: labels[state],
    summary,
    payload,
  }
}
