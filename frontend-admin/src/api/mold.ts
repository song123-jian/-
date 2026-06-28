import request from './index'

// 获取模具列表
export const getMoldList = (params: any) => request.get('/molds', { params })
// 获取模具详情
export const getMoldDetail = (id: number) => request.get(`/molds/${id}`)
// 获取模具模次统计
export const getMoldShotsStats = (id: number) => request.get(`/molds/${id}/shots`)
// 创建模具
export const createMold = (data: any) => request.post('/molds', data)
// 更新模具
export const updateMold = (id: number, data: any) => request.put(`/molds/${id}`, data)
// 删除模具
export const deleteMold = (id: number) => request.delete(`/molds/${id}`)
// 模具保养
export const maintainMold = (id: number) => request.post(`/molds/${id}/maintenance`)
