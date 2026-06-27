import request from './index'

// 获取停机记录列表
export const getDowntimeRecordList = (params: any) => request.get('/downtime-records', { params })
// 创建停机记录
export const createDowntimeRecord = (data: any) => request.post('/downtime-records', data)
// 更新停机记录
export const updateDowntimeRecord = (id: number, data: any) => request.put(`/downtime-records/${id}`, data)
// 删除停机记录
export const deleteDowntimeRecord = (id: number) => request.delete(`/downtime-records/${id}`)
