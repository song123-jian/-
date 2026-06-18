import request from './index'

// 获取发货列表
export const getDeliveryList = (params: any) => request.get('/deliveries', { params })
// 创建发货
export const createDelivery = (data: any) => request.post('/deliveries', data)
// 更新发货
export const updateDelivery = (id: number, data: any) => request.put(`/deliveries/${id}`, data)
// 删除发货
export const deleteDelivery = (id: number) => request.delete(`/deliveries/${id}`)
