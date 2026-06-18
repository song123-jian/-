import request from './index'

// 获取回款列表
export const getPaymentList = (params: any) => request.get('/payments', { params })
// 创建回款
export const createPayment = (data: any) => request.post('/payments', data)
// 更新回款
export const updatePayment = (id: number, data: any) => request.put(`/payments/${id}`, data)
// 删除回款
export const deletePayment = (id: number) => request.delete(`/payments/${id}`)
