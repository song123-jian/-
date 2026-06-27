import request from './index'

// 获取上下模记录列表
export const getMoldMountRecordList = (params: any) => request.get('/mold-mount-records', { params })
// 创建上下模记录
export const createMoldMountRecord = (data: any) => request.post('/mold-mount-records', data)
