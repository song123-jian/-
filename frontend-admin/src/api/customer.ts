import request from './index'

// 获取客户列表
export const getCustomerList = (params: any) => request.get('/customers', { params })
// 创建客户
export const createCustomer = (data: any) => request.post('/customers', data)
// 更新客户
export const updateCustomer = (id: number, data: any) => request.put(`/customers/${id}`, data)
// 删除客户
export const deleteCustomer = (id: number) => request.delete(`/customers/${id}`)
