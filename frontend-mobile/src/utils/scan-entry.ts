export type MobileScanTargetType = 'machine' | 'workOrder' | 'product' | 'location' | 'batch' | 'transfer' | 'unknown'

export type MobileScanPayload = {
  rawText: string
  type: MobileScanTargetType
  value: string
  valid: boolean
  error: string
}

const PREFIX_TYPE_MAP: Record<string, MobileScanTargetType> = {
  M: 'machine',
  MACHINE: 'machine',
  MC: 'machine',
  WO: 'workOrder',
  ORDER: 'workOrder',
  WORKORDER: 'workOrder',
  P: 'product',
  PRODUCT: 'product',
  SKU: 'product',
  L: 'location',
  LOC: 'location',
  LOCATION: 'location',
  B: 'batch',
  BATCH: 'batch',
  T: 'transfer',
  TRANSFER: 'transfer',
}

function normalizeScanText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, '')
}

export function normalizeMobileScanPayload(
  rawValue: unknown,
  expectedType: MobileScanTargetType = 'unknown',
): MobileScanPayload {
  const rawText = normalizeScanText(rawValue)
  if (!rawText) {
    return { rawText: '', type: expectedType, value: '', valid: false, error: '请先输入或扫描条码' }
  }

  const matched = /^([A-Za-z]+)[:：|-](.+)$/.exec(rawText)
  const prefix = matched?.[1]?.toUpperCase() || ''
  const inferredType = PREFIX_TYPE_MAP[prefix] || expectedType
  const value = normalizeScanText(matched?.[2] || rawText)
  const type = inferredType || 'unknown'

  if (!value) return { rawText, type, value: '', valid: false, error: '条码内容为空' }
  if (expectedType !== 'unknown' && type !== expectedType) {
    return { rawText, type, value, valid: false, error: '条码类型与当前入口不匹配' }
  }

  return { rawText, type, value, valid: true, error: '' }
}

export function buildMobileScanRoute(payload: MobileScanPayload) {
  if (!payload.valid) return ''
  const routes: Record<MobileScanTargetType, string> = {
    machine: '/m/report',
    workOrder: '/m/report',
    product: '/m/stock',
    location: '/m/inventory',
    batch: '/m/stock',
    transfer: '/m/transfer',
    unknown: '',
  }
  return routes[payload.type] || ''
}

export function getMobileScanTypeText(value: MobileScanTargetType) {
  const labels: Record<MobileScanTargetType, string> = {
    machine: '机台',
    workOrder: '工单',
    product: '产品',
    location: '库位',
    batch: '批次',
    transfer: '调拨单',
    unknown: '未知',
  }
  return labels[value] || value
}
