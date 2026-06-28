import request from './index'

// 获取机台列表
export const getMachineList = (params: any) => request.get('/machines', { params })
// 获取机台详情
export const getMachineDetail = (id: number) => request.get(`/machines/${id}`)
// 创建机台
export const createMachine = (data: any) => request.post('/machines', data)
// 更新机台
export const updateMachine = (id: number, data: any) => request.put(`/machines/${id}`, data)
// 删除机台
export const deleteMachine = (id: number) => request.delete(`/machines/${id}`)
// 生成机台二维码
export const getMachineQrCode = (id: number) => request.get(`/machines/${id}/qrcode`)
