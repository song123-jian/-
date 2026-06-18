import request from './index'

/** 质检录入参数 */
export interface QcRecordParams {
  workOrderId: number
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
  return request.post('/qc-record/submit', data)
}

/** 获取待质检工单列表 */
export function getPendingQcOrders() {
  return request.get('/qc-record/pending-orders')
}

/** 上传质检照片 */
export function uploadQcImage(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return request.post('/qc-record/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

/** 获取质检记录列表 */
export function getQcRecords(params: { page: number; pageSize: number }) {
  return request.get('/qc-record/list', { params })
}
