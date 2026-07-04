import request from './index'

// 获取生产工单列表
export const getProdOrderList = (params: any) => request.get('/prod-orders', { params })
// 获取生产工单详情
export const getProdOrderDetail = (id: number) => request.get(`/prod-orders/${id}`)
// 创建生产工单
export const createProdOrder = (data: any) => request.post('/prod-orders', data)
// 更新生产工单
export const updateProdOrder = (id: number, data: any) => request.put(`/prod-orders/${id}`, data)
// 删除生产工单
export const deleteProdOrder = (id: number) => request.delete(`/prod-orders/${id}`)
// 下发生产工单
export const dispatchProdOrder = (id: number) => request.put(`/prod-orders/${id}/dispatch`)
// 开始生产
export const startProdOrder = (id: number) => request.put(`/prod-orders/${id}/start`)
// 暂停生产
export const pauseProdOrder = (id: number) => request.put(`/prod-orders/${id}/pause`)
// 恢复生产
export const resumeProdOrder = (id: number) => request.put(`/prod-orders/${id}/resume`)
// 完工
export const finishProdOrder = (id: number) => request.put(`/prod-orders/${id}/finish`)
// 取消工单
export const cancelProdOrder = (id: number) => request.put(`/prod-orders/${id}/cancel`)
