import request from './index'

/** 质检录入参数 */
export interface QcRecordParams {
  workOrderId: number
  productId?: number
  inspectionType: string
  result: string
  defectType?: string
  defectDesc?: string
  sampleCount: number
  images?: string[]
}

/** 质检记录 */
export interface QcRecord {
  id: number
  workOrderId: number
  workOrderNo: string
  productName: string
  inspectionType: string
  result: string
  defectType: string
  defectDesc: string
  sampleCount: number
  images: string[]
  inspectorName: string
  inspectTime: string
}

/** 提交质检记录 */
export function submitQcRecord(data: QcRecordParams) {
  if (!data.productId) {
    throw new Error('请选择有效的产品')
  }
  return request.post('/qc-records', {
    prodOrderId: data.workOrderId,
    productId: data.productId,
    checkType: data.inspectionType,
    checkResult: data.result === '合格' ? 'PASS' : 'FAIL',
    defectType: data.defectType,
    defectDesc: data.defectDesc,
    sampleQty: data.sampleCount,
    imageUrls: (data.images || []).join(','),
  })
}

/** 获取待质检工单列表 */
export function getPendingQcOrders() {
  return request.get('/qc-records/pending-orders')
}

/** 上传质检照片 */
export function uploadQcImage(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return request.post('/qc-records/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

/** 获取质检记录列表 */
export function getQcRecords(params: { page: number; pageSize: number }) {
  return request.get('/qc-records', { params })
}
