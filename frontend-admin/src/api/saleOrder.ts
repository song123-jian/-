import request from './index'

// 获取销售订单列表
export const getSaleOrderList = (params: any) => request.get('/sale-orders', { params })
// 获取销售订单详情
export const getSaleOrderDetail = (id: number) => request.get(`/sale-orders/${id}`)
// 创建销售订单
export const createSaleOrder = (data: any) => request.post('/sale-orders', data)
// 更新销售订单
export const updateSaleOrder = (id: number, data: any) => request.put(`/sale-orders/${id}`, data)
// 删除销售订单
export const deleteSaleOrder = (id: number) => request.delete(`/sale-orders/${id}`)
// 审核销售订单
export const approveSaleOrder = (id: number) => request.put(`/sale-orders/${id}/approve`)
