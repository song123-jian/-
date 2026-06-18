import request from './index'

// 获取仓库列表
export const getWarehouseList = (params: any) => request.get('/warehouses', { params })
// 创建仓库
export const createWarehouse = (data: any) => request.post('/warehouses', data)
// 更新仓库
export const updateWarehouse = (id: number, data: any) => request.put(`/warehouses/${id}`, data)
// 删除仓库
export const deleteWarehouse = (id: number) => request.delete(`/warehouses/${id}`)
