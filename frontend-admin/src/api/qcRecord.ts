import request from './index'

// 获取质检记录列表
export const getQcRecordList = (params: any) => request.get('/qc-records', { params })
// 创建质检记录
export const createQcRecord = (data: any) => request.post('/qc-records', data)
// 更新质检记录
export const updateQcRecord = (id: number, data: any) => request.put(`/qc-records/${id}`, data)
// 删除质检记录
export const deleteQcRecord = (id: number) => request.delete(`/qc-records/${id}`)
