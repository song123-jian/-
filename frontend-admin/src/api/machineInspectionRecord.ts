import request from './index'

// 获取设备点检记录列表
export const getMachineInspectionRecordList = (params: any) => request.get('/machine-inspection-records', { params })
// 创建设备点检记录
export const createMachineInspectionRecord = (data: any) => request.post('/machine-inspection-records', data)
