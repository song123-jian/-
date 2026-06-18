import request from './index'

// 获取模具列表
export const getMoldList = (params: any) => request.get('/molds', { params })
// 创建模具
export const createMold = (data: any) => request.post('/molds', data)
// 更新模具
export const updateMold = (id: number, data: any) => request.put(`/molds/${id}`, data)
// 删除模具
export const deleteMold = (id: number) => request.delete(`/molds/${id}`)
