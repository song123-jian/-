import request from './index'

// 获取产品列表
export const getProductList = (params: any) => request.get('/products', { params })
// 创建产品
export const createProduct = (data: any) => request.post('/products', data)
// 更新产品
export const updateProduct = (id: number, data: any) => request.put(`/products/${id}`, data)
// 删除产品
export const deleteProduct = (id: number) => request.delete(`/products/${id}`)
