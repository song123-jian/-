export const QC_INSPECTION_TYPES = ['FAI', 'IPQC', 'FQC', 'IQC'] as const

export type QcInspectionType = (typeof QC_INSPECTION_TYPES)[number]

export type MobileQcRecordInput = {
  workOrderId?: number | string | null
  productId?: number | string | null
  inspectionType?: string | null
  checkType?: string | null
  result?: string | null
  checkResult?: string | null
  defectType?: string | null
  defectDesc?: string | null
  sampleCount?: number | string | null
  sampleQty?: number | string | null
  images?: string[] | string | null
  imageUrls?: string[] | string | null
}

export type QcUploadFileLike = {
  status?: string
  url?: string
}

export function toQcNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function normalizeQcInspectionType(value?: string | null) {
  const type = String(value || '').trim().toUpperCase()
  return QC_INSPECTION_TYPES.includes(type as QcInspectionType) ? type : ''
}

export function normalizeQcResult(value?: string | null) {
  const result = String(value || '').trim().toUpperCase()
  if (result === 'PASS' || value === '合格') return 'PASS'
  if (result === 'FAIL' || value === '不合格') return 'FAIL'
  return ''
}

export function getQcResultText(value?: string | null) {
  const result = normalizeQcResult(value)
  if (result === 'PASS') return '合格'
  if (result === 'FAIL') return '不合格'
  return value || '-'
}

export function normalizeQcImageUrls(images?: string[] | string | null) {
  if (Array.isArray(images)) {
    return images.map((item) => String(item || '').trim()).filter(Boolean)
  }
  return String(images || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function getQcUploadBlockingMessage(files?: QcUploadFileLike[] | null) {
  const rows = files || []
  if (rows.some((file) => file.status === 'uploading')) return '质检照片仍在上传，请稍后提交'
  if (rows.some((file) => file.status === 'failed')) return '存在上传失败的质检照片，请删除或重新上传'
  return ''
}

export function validateMobileQcRecordInput(input: MobileQcRecordInput) {
  const workOrderId = toQcNumber(input.workOrderId)
  const productId = toQcNumber(input.productId)
  const inspectionType = normalizeQcInspectionType(input.inspectionType || input.checkType)
  const result = normalizeQcResult(input.result || input.checkResult)
  const sampleQty = toQcNumber(input.sampleCount ?? input.sampleQty)
  const defectType = String(input.defectType || '').trim()
  const defectDesc = String(input.defectDesc || '').trim()
  const images = normalizeQcImageUrls(input.images ?? input.imageUrls)

  if (!workOrderId) return '请选择待质检工单'
  if (!productId) return '请选择有效的产品'
  if (!inspectionType) return '请选择有效的检验类型'
  if (!result) return '请选择检验结果'
  if (!Number.isInteger(sampleQty) || sampleQty <= 0) return '抽样数量必须是大于 0 的整数'
  if (result === 'FAIL' && !defectType) return '不合格质检必须填写缺陷类型'
  if (result === 'FAIL' && !defectDesc) return '不合格质检必须填写缺陷描述'
  if (defectType.length > 50) return '缺陷类型不能超过 50 个字符'
  if (defectDesc.length > 500) return '缺陷描述不能超过 500 个字符'
  if (images.length > 4) return '质检照片最多上传 4 张'
  if (images.join(',').length > 1000) return '质检照片地址过长'
  return ''
}
