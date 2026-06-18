import request from './index'

// 获取供应商列表
export const getSupplierList = (params: any) => request.get('/suppliers', { params })
// 创建供应商
export const createSupplier = (data: any) => request.post('/suppliers', data)
// 更新供应商
export const updateSupplier = (id: number, data: any) => request.put(`/suppliers/${id}`, data)
// 删除供应商
export const deleteSupplier = (id: number) => request.delete(`/suppliers/${id}`)
